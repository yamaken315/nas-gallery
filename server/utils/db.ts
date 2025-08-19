import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

const dbPath = path.join(process.cwd(), "data", "meta.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// スキーマ初期化/追加 (idempotent)
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
  height INTEGER
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
CREATE TRIGGER IF NOT EXISTS update_images_updated_at
  AFTER UPDATE ON images
  FOR EACH ROW
  BEGIN
    UPDATE images SET updated_at = DATETIME('now', 'localtime') WHERE id = OLD.id;
  END;
`);

// サムネイルキャッシュを削除するヘルパー関数
function deleteThumbnailCache(id: number) {
  const cacheDir = path.join(process.cwd(), ".cache", "thumbs");
  const thumbPath = path.join(cacheDir, id + ".jpg");
  if (fs.existsSync(thumbPath)) {
    try {
      fs.unlinkSync(thumbPath);
      console.log(`[db] Deleted old thumbnail cache for id: ${id}`);
    } catch (e) {
      console.error(`[db] Failed to delete thumbnail cache for id: ${id}`, e);
    }
  }
}

// 画像情報を挿入または更新
const upsertImageStmt = {
  select: db.prepare(
    "SELECT id, size, mtime, deleted FROM images WHERE rel_path = ?"
  ),
  insert: db.prepare(
    "INSERT INTO images (rel_path, size, mtime) VALUES (?, ?, ?)"
  ),
  update: db.prepare(
    "UPDATE images SET size = ?, mtime = ?, deleted = 0 WHERE id = ?"
  ),
};
export function upsertImage(relPath: string, size: number, mtime: number) {
  const existing = upsertImageStmt.select.get(relPath) as
    | { id: number; size: number; mtime: number; deleted: number }
    | undefined;

  if (existing) {
    // 既存レコードがあり、ファイルが更新されているか、削除済みフラグが立っている場合
    if (
      existing.size !== size ||
      existing.mtime !== mtime ||
      existing.deleted === 1
    ) {
      // 古いサムネイルキャッシュを削除
      deleteThumbnailCache(existing.id);
      upsertImageStmt.update.run(size, mtime, existing.id);
      console.log(`[db] Updated image: ${relPath}`);
    }
    // 変更がない場合は何もしない
  } else {
    // 新規レコード
    upsertImageStmt.insert.run(relPath, size, mtime);
    console.log(`[db] Inserted new image: ${relPath}`);
  }
}

// 画像を削除済みにする
const markDeletedStmt = db.prepare(
  "UPDATE images SET deleted = 1 WHERE id = ?"
);
export function markDeleted(id: number) {
  // 先にサムネイルを削除
  deleteThumbnailCache(id);
  markDeletedStmt.run(id);
  console.log(`[db] Marked as deleted: id=${id}`);
}

// 画像一覧をロードしてマップで返す
const loadImagesMapStmt = db.prepare(
  "SELECT id, rel_path FROM images WHERE deleted = 0"
);
export function loadImagesMap(): Map<string, number> {
  const rows = loadImagesMapStmt.all() as { id: number; rel_path: string }[];
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.rel_path, row.id);
  }
  return map;
}

// 画像のメタデータを設定
export function setMeta(key: string, value: string) {
  db.prepare(
    `INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(key, value);
}
// ... existing code ...
export function getMeta(key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM meta WHERE key=?`).get(key) as any;
  return row?.value;
}

// 画像IDから画像情報を取得する関数を追加
const getImageByIdStmt = db.prepare(
  "SELECT * FROM images WHERE id = ? AND deleted = 0"
);
export function getImageById(id: number) {
  return getImageByIdStmt.get(id) as
    | { id: number; rel_path: string }
    | undefined;
}

export function getDb() {
  return db;
}
// ... existing code ...

export function getTagsForImage(imageId: number) {
  return getDb()
    .prepare(
      `SELECT t.id, t.name FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=?`
    )
    .all(imageId);
}
export function listAllTags() {
  return getDb()
    .prepare(
      `SELECT id, name, (SELECT COUNT(*) FROM image_tags it WHERE it.tag_id=tags.id) AS usage_count FROM tags ORDER BY name`
    )
    .all();
}
export function ensureTag(name: string) {
  const stmt = getDb().prepare(
    `INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING`
  );
  try {
    stmt.run(name);
  } catch {}
  return getDb().prepare(`SELECT id FROM tags WHERE name=?`).get(name) as {
    id: number;
  };
}
export function setTagsForImage(imageId: number, tagNames: string[]) {
  const db = getDb();
  const ids = tagNames.map((n) => ensureTag(n.trim()).id);
  const tx = db.transaction((newIds: number[]) => {
    db.prepare(`DELETE FROM image_tags WHERE image_id=?`).run(imageId);
    const ins = db.prepare(
      `INSERT INTO image_tags (image_id, tag_id) VALUES (?,?)`
    );
    for (const id of newIds) ins.run(imageId, id);
  });
  tx(ids);
}
