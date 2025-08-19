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
`);

// 既存 DB に deleted カラムが無ければ追加
const cols = db.prepare("PRAGMA table_info(images)").all() as {
  name: string;
}[];
if (!cols.find((c) => c.name === "deleted")) {
  db.exec(`ALTER TABLE images ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0`);
}

// インデックス (存在しない場合エラーにならない書式ないため例外握り)
try {
  db.exec(`CREATE INDEX images_rel_path_idx ON images(rel_path)`);
} catch {}
try {
  db.exec(`CREATE INDEX images_mtime_idx ON images(mtime)`);
} catch {}
try {
  db.exec(`CREATE INDEX images_deleted_idx ON images(deleted)`);
} catch {}

export function upsertImage(meta: {
  rel_path: string;
  filename: string;
  ext: string;
  mtime: number;
  size: number;
  width?: number;
  height?: number;
}) {
  db.prepare(
    `
    INSERT INTO images (rel_path, filename, ext, mtime, size, width, height, deleted)
    VALUES (@rel_path,@filename,@ext,@mtime,@size,@width,@height,0)
    ON CONFLICT(rel_path) DO UPDATE SET
      mtime=excluded.mtime,
      size=excluded.size,
      width=excluded.width,
      height=excluded.height,
      deleted=0
  `
  ).run(meta);
}

export function listImages(offset: number, limit: number) {
  return db
    .prepare(
      `
    SELECT id, rel_path, filename, width, height
    FROM images
    WHERE deleted=0
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(limit, offset);
}

export function getImageById(id: number) {
  return db.prepare(`SELECT * FROM images WHERE id=? AND deleted=0`).get(id);
}

export function loadImagesMap(): Record<
  string,
  { id: number; mtime: number; size: number }
> {
  const rows = db
    .prepare(`SELECT id, rel_path, mtime, size FROM images`)
    .all() as any[];
  const map: Record<string, any> = {};
  for (const r of rows)
    map[r.rel_path] = { id: r.id, mtime: r.mtime, size: r.size };
  return map;
}

export function markDeleted(relPaths: string[]) {
  if (!relPaths.length) return;
  const stmt = db.prepare(`UPDATE images SET deleted=1 WHERE rel_path = ?`);
  const tx = db.transaction((arr: string[]) => {
    for (const p of arr) stmt.run(p);
  });
  tx(relPaths);
}

export function setMeta(key: string, value: string) {
  db.prepare(
    `INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(key, value);
}
export function getMeta(key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM meta WHERE key=?`).get(key) as any;
  return row?.value;
}

export function getDb() {
  return db;
}

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
