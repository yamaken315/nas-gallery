import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getImageById } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const config = useRuntimeConfig();
  const cacheDir = path.join(process.cwd(), ".cache", "thumbs");
  const outPath = path.join(cacheDir, id + ".jpg");

  // 1. キャッシュが存在すれば、それを返す
  try {
    const stats = fs.statSync(outPath);
    if (stats.size > 0) {
      setHeader(event, "Content-Type", "image/jpeg");
      return sendStream(event, fs.createReadStream(outPath));
    }
  } catch (e) {
    // ファイルが存在しない場合など。処理を続行する。
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

  // 3. サムネイルを生成してキャッシュに保存
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    await sharp(abs)
      .resize(config.public.thumbnailWidth)
      .jpeg({ quality: 80 })
      .toFile(outPath);
  } catch (e) {
    console.error(`[thumb] sharp failed for id ${id}:`, e);
    throw createError({
      statusCode: 500,
      statusMessage: "Thumbnail generation failed",
    });
  }

  // 4. 生成したファイルを返す
  setHeader(event, "Content-Type", "image/jpeg");
  return sendStream(event, fs.createReadStream(outPath));
});
