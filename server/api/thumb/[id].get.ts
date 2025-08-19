import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  // 動的にDBユーティリティを読み込むように修正
  const { getImageById } =
    require("../../utils/db") as typeof import("../../utils/db");
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
  if (!fs.existsSync(outPath)) {
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
      throw createError({
        statusCode: 500,
        statusMessage: "Thumbnail generation failed",
      });
    }
  }
  setHeader(event, "Content-Type", "image/jpeg");
  return sendStream(event, fs.createReadStream(outPath));
});
