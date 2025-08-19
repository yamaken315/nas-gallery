import path from "node:path";
import fs from "node:fs";
import { getImageById } from "../../utils/db";

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  const img = getImageById(id);
  if (!img) throw createError({ statusCode: 404 });
  const config = useRuntimeConfig();
  const abs = path.join(config.imageRoot, img.rel_path);
  const ext = img.ext.toLowerCase();
  const type =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  setHeader(event, "Content-Type", type);
  return sendStream(event, fs.createReadStream(abs));
});
