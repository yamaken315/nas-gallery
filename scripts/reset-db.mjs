#!/usr/bin/env node
// DBリセット用スクリプト
// 使用例:
//   npm run reset:db           -> ソフトリセット (各テーブルのデータ削除 + VACUUM)
//   npm run reset:db -- --hard -> ハードリセット (meta.db ファイル削除後スキーマ再作成)
//   npm run reset:db -- --images-only -> images / image_tags のみ削除
//   npm run reset:db -- --force -> 確認プロンプト省略

import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const args = process.argv.slice(2)
const HARD = args.includes('--hard')
const IMAGES_ONLY = args.includes('--images-only')
const FORCE = args.includes('--force')

const projectRoot = path.resolve(process.cwd())
const dataDir = path.join(projectRoot, 'data')
const dbPath = path.join(dataDir, 'meta.db')
fs.mkdirSync(dataDir, { recursive: true })

function confirmOrExit(message) {
  if (FORCE) return
  process.stdout.write(message + ' (y/N): ')
  try {
    const buf = fs.readFileSync(0, 'utf-8').trim().toLowerCase()
    if (buf !== 'y' && buf !== 'yes') {
      console.log('キャンセルしました')
      process.exit(0)
    }
  } catch {
    console.log('対話入力不可のため中断 (--force で強制)')
    process.exit(1)
  }
}

if (HARD) {
  if (fs.existsSync(dbPath)) {
    confirmOrExit(`ハードリセットで ${dbPath} を削除します。本当に実行しますか?`)
    fs.rmSync(dbPath)
    console.log('[reset-db] removed meta.db')
  } else {
    console.log('[reset-db] meta.db は存在しません (新規作成されます)')
  }
}

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
`)

if (IMAGES_ONLY) {
  confirmOrExit('images / image_tags テーブルのみをクリアしますか?')
  db.exec('DELETE FROM image_tags; DELETE FROM images; VACUUM;')
  console.log('[reset-db] images / image_tags をクリアしました')
  process.exit(0)
}

if (!HARD) {
  confirmOrExit('全テーブル (images, image_tags, tags, meta) のデータを削除しますか?')
  db.exec('DELETE FROM image_tags; DELETE FROM images; DELETE FROM tags; DELETE FROM meta; VACUUM;')
  console.log('[reset-db] ソフトリセット完了')
} else {
  console.log('[reset-db] ハードリセット後、スキーマ再初期化完了')
}

db.close()
