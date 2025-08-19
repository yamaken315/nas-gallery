import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import os from "node:os";

const root = process.env.IMAGE_ROOT || "/mnt/nas/photos";
const exts = [".jpg", ".jpeg", ".png", ".webp"];
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY || os.cpus().length); // 並列リサイズ

// db util を直接 ESM import
const { upsertImage, loadImagesMap, markDeleted, setMeta } = await import(
  "../server/utils/db.js"
);

const start = Date.now();
console.log(`[scan] start root=${root}`);

// 既存マップ
const existing = loadImagesMap(); // rel_path -> {id,mtime,size}

// ファイル列挙
const diskFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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

// サムネイル出力パス用
const cacheDir = path.join(process.cwd(), ".cache", "thumbs");
fs.mkdirSync(cacheDir, { recursive: true });

// 並列キュー実装
const queue = [];
async function worker() {
  while (true) {
    const job = queue.shift();
    if (!job) break;
    await job();
  }
}

for (const abs of diskFiles) {
  const rel = path.relative(root, abs);
  const stat = fs.statSync(abs);
  const prev = existing[rel];
  // 変更判定: 新規 or mtime/size 変化
  const changed =
    !prev || prev.mtime !== Math.floor(stat.mtimeMs) || prev.size !== stat.size;
  if (!changed) {
    skipped++;
    continue;
  }
  queue.push(async () => {
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
      // サムネイル: まだ無い場合のみ生成
      const idForName = prev?.id; // 既存ID (新規はまだ不明) → 新規はアクセス時生成に任せ簡略化
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

// 削除検出: DB にありディスクに存在しない rel_path
const diskSet = new Set(diskFiles.map((f) => path.relative(root, f)));
const toDelete = Object.keys(existing).filter((rel) => !diskSet.has(rel));
if (toDelete.length) {
  markDeleted(toDelete);
  console.log(`\n[delete] marked ${toDelete.length} records as deleted`);
}

// ワーカー起動
const workers = Array.from({ length: CONCURRENCY }, worker);
await Promise.all(workers);

setMeta("last_scan_finished", new Date().toISOString());

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(
  `\n[scan] done in ${elapsed}s files=${diskFiles.length} inserted=${inserted} updated=${updated} skipped=${skipped} deleted=${toDelete.length} thumbs=${thumbGen}`
);
