import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  // 動的にDBユーティリティを読み込むように修正
  const { getImageById } = await import("../../utils/db");
  const img = getImageById(id);
  if (!img) {
    console.error(`[thumb] Image not found in DB for id: ${id}`);
    throw createError({ statusCode: 404, statusMessage: "Image not found" });
  }
  const config = useRuntimeConfig();
  const abs = path.join(config.imageRoot, img.rel_path);
  const cacheDir = path.join(process.cwd(), ".cache", "thumbs");
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, id + ".jpg");

  const fileExists = fs.existsSync(outPath);
  const needsGeneration =
    !fileExists || (fileExists && fs.statSync(outPath).size === 0);

  if (needsGeneration) {
    if (fileExists) {
      fs.unlinkSync(outPath);
    }

    if (!fs.existsSync(abs)) {
      console.error(`[thumb] Source file not found: ${abs}`);
      throw createError({
        statusCode: 404,
        statusMessage: "Source file not found",
      });
    }
    try {
      await sharp(abs)
        .resize(config.public.thumbnailWidth)
        .jpeg({ quality: 80 })
        .toFile(outPath);
    } catch (e) {
      console.error(`[thumb] sharp failed for id ${id}:`, e);
      // sharpが失敗した場合、空のファイルが残ることがあるので削除する
      if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
      }
      throw createError({
        statusCode: 500,
        statusMessage: "Thumbnail generation failed",
      });
    }
  }

  // --- ここから修正 ---
  // ストリームを返す前に、最終的にファイルが存在し、中身があることを確認する
  try {
    const stats = fs.statSync(outPath);
    if (stats.size > 0) {
      setHeader(event, "Content-Type", "image/jpeg");
      return sendStream(event, fs.createReadStream(outPath));
    }
  } catch (e) {
    // statSyncが失敗した場合 (ファイルが存在しないなど)
    console.error(`[thumb] Final check failed for ${outPath}:`, e);
  }

  // ここに到達した場合、有効なサムネイルが提供できない
  throw createError({
    statusCode: 500,
    statusMessage: "Could not provide a valid thumbnail",
  });
  // --- ここまで修正 ---
});
