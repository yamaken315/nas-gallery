// Pure JS runtime DB module for scan script (no TypeScript import required)
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(process.cwd())
const dbDir = path.join(projectRoot, 'data')
fs.mkdirSync(dbDir, { recursive: true })
const dbPath = path.join(dbDir, 'meta.db')
const db = new Database(dbPath)

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
  deleted INTEGER DEFAULT 0
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
`)

export function upsertImage(meta) {
  db.prepare(`
    INSERT INTO images (rel_path, filename, ext, mtime, size, width, height, deleted)
    VALUES (@rel_path,@filename,@ext,@mtime,@size,@width,@height,0)
    ON CONFLICT(rel_path) DO UPDATE SET
      mtime=excluded.mtime,
      size=excluded.size,
      width=excluded.width,
      height=excluded.height,
      deleted=0
  `).run(meta)
}

export function loadImagesMap() {
  const rows = db.prepare('SELECT id, rel_path, mtime, size FROM images WHERE deleted=0').all()
  const map = {}
  for (const r of rows) map[r.rel_path] = { id: r.id, mtime: r.mtime, size: r.size }
  return map
}

export function markDeleted(relPaths) {
  if (!relPaths.length) return
  const stmt = db.prepare('UPDATE images SET deleted=1 WHERE rel_path = ?')
  const tx = db.transaction(arr => { for (const p of arr) stmt.run(p) })
  tx(relPaths)
}

export function setMeta(key, value) {
  db.prepare('INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
}
