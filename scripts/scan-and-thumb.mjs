import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import os from "node:os";

// --- Configuration ---
const root = process.env.IMAGE_ROOT || "/mnt/nas/photos";
const exts = [".jpg", ".jpeg", ".png", ".webp"];
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY || os.cpus().length);

// スキャン専用の純 JS DB モジュールを内部ディレクトリから読み込む (server/utils からは削除済み)
let dbMod;
try {
  // auto-import 対象外に移動した純JS版DBモジュールを読み込む
  dbMod = await import("./_internal/db-runtime.js");
} catch (e) {
  console.error("[scan] FATAL: cannot load internal db-runtime module", e);
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
  thumbGen = 0; // 互換用（常に 0 に近くなる想定）

// 簡易 JPEG 末尾検査 (SOI/EOI)
function isLikelyTruncatedJpeg(abs, stat) {
  if (!/\.jpe?g$/i.test(abs)) return false;
  if (stat.size < 4) return true;
  try {
    const fd = fs.openSync(abs, 'r');
    const head = Buffer.alloc(2);
    const tail = Buffer.alloc(2);
    fs.readSync(fd, head, 0, 2, 0);
    fs.readSync(fd, tail, 0, 2, stat.size - 2);
    fs.closeSync(fd);
    if (!(head[0] === 0xFF && head[1] === 0xD8)) return true; // SOI 欠落
    if (!(tail[0] === 0xFF && tail[1] === 0xD9)) return true; // EOI 欠落
    return false;
  } catch {
    return true;
  }
}

const truncatedList = [];

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
      // ここでのサムネイル事前生成は廃止（オンデマンド生成に一本化）
      // 代わりに壊れ JPEG の簡易検査のみ実施
      if (isLikelyTruncatedJpeg(abs, stat)) {
        truncatedList.push(rel);
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

// 壊れ画像レポート
if (truncatedList.length) {
  const reportPath = path.join(projectRoot(), 'data', 'corrupted-images.log');
  try {
    const lines = truncatedList.sort().join('\n') + '\n';
    fs.appendFileSync(reportPath, `# ${new Date().toISOString()} truncated=${truncatedList.length}\n` + lines);
    console.warn(`\n[scan] detected truncated JPEGs: ${truncatedList.length} (logged to data/corrupted-images.log)`);
  } catch (e) {
    console.warn(`\n[scan] failed to write corrupted report:`, e.message);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(
  `\n[scan] done in ${elapsed}s files=${diskFiles.length} inserted=${inserted} updated=${updated} skipped=${skipped} deleted=${toDelete.length} thumbs(pre-gen removed)=${thumbGen} truncated=${truncatedList.length}`
);
