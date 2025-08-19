import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

const dbPath = path.join(process.cwd(), "data", "meta.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// --- スキーマ定義 ---
// データベースの構造を定義し、不足しているカラムがあれば追加します。
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY,
    rel_path TEXT UNIQUE,
    filename TEXT,
    ext TEXT,
    mtime INTEGER,
    size INTEGER,
    width INTEGER,
    height INTEGER,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS image_tags (
    image_id INTEGER,
    tag_id INTEGER,
    PRIMARY KEY(image_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// 既存のテーブルに 'deleted' カラムがなければ追加する
const imagesTableInfo = db.prepare("PRAGMA table_info(images)").all();
if (!imagesTableInfo.some((col: any) => col.name === "deleted")) {
  db.exec("ALTER TABLE images ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0");
}

// --- 画像操作 ---

// 画像情報を挿入または更新する
const upsertImageStmt = db.prepare(`
  INSERT INTO images (rel_path, filename, ext, mtime, size, width, height, deleted)
  VALUES (@rel_path, @filename, @ext, @mtime, @size, @width, @height, 0)
  ON CONFLICT(rel_path) DO UPDATE SET
    mtime=excluded.mtime,
    size=excluded.size,
    width=excluded.width,
    height=excluded.height,
    deleted=0
`);
export function upsertImage(meta: {
  rel_path: string;
  filename: string;
  ext: string;
  mtime: number;
  size: number;
  width?: number;
  height?: number;
}) {
  upsertImageStmt.run(meta);
}

// 【修正】欠落していた listImages 関数を追加
const listImagesStmt = db.prepare(`
  SELECT id, rel_path, filename, width, height
  FROM images
  WHERE deleted = 0
  ORDER BY id DESC
  LIMIT ? OFFSET ?
`);
export function listImages(limit: number, offset: number) {
  return listImagesStmt.all(limit, offset);
}

const getImageByIdStmt = db.prepare(
  "SELECT * FROM images WHERE id = ? AND deleted = 0"
);
export function getImageById(id: number) {
  return getImageByIdStmt.get(id);
}

const loadImagesMapStmt = db.prepare(
  "SELECT id, rel_path, mtime, size FROM images WHERE deleted = 0"
);
export function loadImagesMap() {
  const rows = loadImagesMapStmt.all() as {
    id: number;
    rel_path: string;
    mtime: number;
    size: number;
  }[];
  const map = new Map<string, { id: number; mtime: number; size: number }>();
  for (const r of rows) {
    map.set(r.rel_path, { id: r.id, mtime: r.mtime, size: r.size });
  }
  return map;
}

const markDeletedStmt = db.prepare(
  "UPDATE images SET deleted = 1 WHERE rel_path = ?"
);
export function markDeleted(relPaths: string[]) {
  if (!relPaths.length) return;
  const tx = db.transaction((paths) => {
    for (const p of paths) {
      markDeletedStmt.run(p);
    }
  });
  tx(relPaths);
}

// --- メタデータ操作 ---

const setMetaStmt = db.prepare(
  "INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
);
export function setMeta(key: string, value: string) {
  setMetaStmt.run(key, value);
}

const getMetaStmt = db.prepare("SELECT value FROM meta WHERE key=?");
export function getMeta(key: string): string | undefined {
  const row = getMetaStmt.get(key) as { value: string } | undefined;
  return row?.value;
}

// --- タグ操作 ---

const getTagsForImageStmt = db.prepare(
  "SELECT t.id, t.name FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=?"
);
export function getTagsForImage(imageId: number) {
  return getTagsForImageStmt.all(imageId);
}

const listAllTagsStmt = db.prepare(
  "SELECT id, name, (SELECT COUNT(*) FROM image_tags it WHERE it.tag_id=tags.id) AS usage_count FROM tags ORDER BY name"
);
export function listAllTags() {
  return listAllTagsStmt.all();
}

const ensureTagInsertStmt = db.prepare(
  "INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING"
);
const ensureTagSelectStmt = db.prepare("SELECT id FROM tags WHERE name=?");
export function ensureTag(name: string): { id: number } {
  ensureTagInsertStmt.run(name);
  return ensureTagSelectStmt.get(name) as { id: number };
}

export function setTagsForImage(imageId: number, tagNames: string[]) {
  const ids = tagNames.map((n) => ensureTag(n.trim())?.id).filter(Boolean);
  const tx = db.transaction((newIds: number[]) => {
    db.prepare("DELETE FROM image_tags WHERE image_id=?").run(imageId);
    const ins = db.prepare(
      "INSERT INTO image_tags (image_id, tag_id) VALUES (?,?)"
    );
    for (const id of newIds) {
      ins.run(imageId, id);
    }
  });
  tx(ids);
}

// --- DBインスタンス ---

export function getDb() {
  return db;
}
