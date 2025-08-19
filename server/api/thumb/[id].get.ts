import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getImageById } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const img = getImageById(id);
  if (!img) throw createError({ statusCode: 404 });
  const config = useRuntimeConfig();
  const abs = path.join(config.imageRoot, img.rel_path);
  const cacheDir = path.join(process.cwd(), ".cache", "thumbs");
  fs.mkdirSync(cacheDir, { recursive: true });
  const outPath = path.join(cacheDir, id + ".jpg");
  if (!fs.existsSync(outPath)) {
    await sharp(abs)
      .resize(config.public.thumbnailWidth)
      .jpeg({ quality: 80 })
      .toFile(outPath);
  }
  setHeader(event, "Content-Type", "image/jpeg");
  return sendStream(event, fs.createReadStream(outPath));
});
