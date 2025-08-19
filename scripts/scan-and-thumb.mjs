import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import os from "node:os";

// --- Configuration ---
const root = process.env.IMAGE_ROOT || "/mnt/nas/photos";
const exts = [".jpg", ".jpeg", ".png", ".webp"];
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY || os.cpus().length);

// TypeScript の db.ts はそのままでは Node が解釈できないため、純 JS 版を利用
let dbMod;
try {
  dbMod = await import("../server/utils/db-runtime.js");
} catch (e) {
  console.error("[scan] FATAL: cannot load db-runtime.js. Did you create it?", e);
  process.exit(1);
}
const { upsertImage, loadImagesMap, markDeleted, setMeta } = dbMod;

const start = Date.now();
console.log(`[scan] start root=${root}`);

// パス存在確認
if (!fs.existsSync(root)) {
  console.error(`[scan] ERROR: IMAGE_ROOT path not found: ${root}`);
  process.exit(2);
}

// 既存マップ
const existing = loadImagesMap(); // rel_path -> {id,mtime,size}

// ファイル列挙
const diskFiles = [];
function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    console.error(`\n[walk] read error: ${dir} ${e.message}`);
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.includes(ext)) diskFiles.push(full);
    }
  }
}
walk(root);

let inserted = 0,
  updated = 0,
  skipped = 0,
  thumbGen = 0;

// サムネイル出力パス
const cacheDir = path.join(process.cwd(), ".cache", "thumbs");
fs.mkdirSync(cacheDir, { recursive: true });

// 並列キュー (シンプルな index 方式)
const jobs = [];
for (const abs of diskFiles) {
  const rel = path.relative(root, abs);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    continue;
  }
  const prev = existing[rel];

  // サムネイルの存在チェックを追加
  const thumbPath = prev ? path.join(cacheDir, prev.id + ".jpg") : null;
  const thumbExists = thumbPath ? fs.existsSync(thumbPath) : false;

  const changed =
    !prev ||
    prev.mtime !== Math.floor(stat.mtimeMs) ||
    prev.size !== stat.size ||
    !thumbExists; // サムネイルが存在しない場合も変更とみなす

  if (!changed) {
    skipped++;
    continue;
  }
  jobs.push(async () => {
    try {
      const meta = await sharp(abs).metadata();
      upsertImage({
        rel_path: rel,
        filename: path.basename(abs),
        ext: path.extname(abs).slice(1),
        mtime: Math.floor(stat.mtimeMs),
        size: stat.size,
        width: meta.width || 0,
        height: meta.height || 0,
      });
      if (!prev) inserted++;
      else updated++;
      const idForName = prev?.id;
      if (idForName) {
        const thumbPath = path.join(cacheDir, idForName + ".jpg");
        if (!fs.existsSync(thumbPath)) {
          try {
            await sharp(abs)
              .resize(320)
              .jpeg({ quality: 80 })
              .toFile(thumbPath);
            thumbGen++;
          } catch (e) {
            console.error("\n[thumb] fail", rel, e.message);
          }
        }
      }
      process.stdout.write(".");
    } catch (e) {
      console.error("\nERR", rel, e.message);
    }
  });
}

async function runPool(limit) {
  let idx = 0;
  const active = [];
  while (idx < jobs.length) {
    while (active.length < limit && idx < jobs.length) {
      const p = jobs[idx++]().finally(() => {
        const i = active.indexOf(p);
        if (i >= 0) active.splice(i, 1);
      });
      active.push(p);
    }
    await Promise.race(active);
  }
  await Promise.all(active);
}

// 削除検出
const diskSet = new Set(diskFiles.map((f) => path.relative(root, f)));
const toDelete = Object.keys(existing).filter((rel) => !diskSet.has(rel));
if (toDelete.length) {
  markDeleted(toDelete);
  console.log(`\n[delete] marked ${toDelete.length} records as deleted`);
}

await runPool(CONCURRENCY);
setMeta("last_scan_finished", new Date().toISOString());

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(
  `\n[scan] done in ${elapsed}s files=${diskFiles.length} inserted=${inserted} updated=${updated} skipped=${skipped} deleted=${toDelete.length} thumbs=${thumbGen}`
);
