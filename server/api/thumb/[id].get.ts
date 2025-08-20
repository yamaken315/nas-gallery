import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getImageById } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, "id");
  if (!idParam || !/^\d+$/.test(idParam)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid id" });
  }
  const id = Number(idParam);
  const config = useRuntimeConfig();
  const cacheDir = path.join(process.cwd(), ".cache", "thumbs");
  const outPath = path.join(cacheDir, id + ".jpg");

  // 1. キャッシュヒット判定 (サイズ0は削除して再生成)
  try {
    const stats = fs.statSync(outPath);
    if (stats.size > 0) {
      setHeader(event, "Content-Type", "image/jpeg");
      setHeader(event, "Cache-Control", "public, max-age=3600");
      setHeader(event, "X-Thumb-Gen", "hit");
      return sendStream(event, fs.createReadStream(outPath));
    } else {
      // 0バイトファイルは破棄
      try {
        fs.unlinkSync(outPath);
      } catch {}
    }
  } catch {
    // 不在なら生成へ
  }

  // 2. キャッシュがなければ、DBから元画像情報を取得
  const img = getImageById(id);
  if (!img) {
    throw createError({
      statusCode: 404,
      statusMessage: "Image not found in DB",
    });
  }

  const abs = path.join(config.imageRoot, img.rel_path);
  if (!fs.existsSync(abs)) {
    throw createError({
      statusCode: 404,
      statusMessage: "Source file not found",
    });
  }

  // 3. サムネイル生成 (一時ファイル→rename で原子的に配置)
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const tmp = outPath + ".tmp-" + process.pid + "-" + Date.now();
    await sharp(abs)
      .resize(config.public.thumbnailWidth)
      .jpeg({ quality: 80 })
      .toFile(tmp);
    // 生成成功後に rename (既に誰かが作っていたら置き換えない)
    if (!fs.existsSync(outPath)) {
      try {
        fs.renameSync(tmp, outPath);
      } catch {
        /* 競合時は tmp を捨てる */
      }
    } else {
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
  } catch (e) {
    console.error(`[thumb] sharp failed for id ${id}:`, e);
    throw createError({
      statusCode: 500,
      statusMessage: "Thumbnail generation failed",
    });
  }

  // 4. 応答
  setHeader(event, "Content-Type", "image/jpeg");
  setHeader(event, "Cache-Control", "public, max-age=3600");
  setHeader(event, "X-Thumb-Gen", "miss");
  return sendStream(event, fs.createReadStream(outPath));
});
