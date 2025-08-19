import fs from "node:fs";
import path from "node:path";

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const cacheDir = path.join(process.cwd(), ".cache", "thumbs");
  const outPath = path.join(cacheDir, id + ".jpg");

  // ファイルが存在し、中身があるかだけをチェックする
  try {
    const stats = fs.statSync(outPath);
    if (stats.size > 0) {
      setHeader(event, "Content-Type", "image/jpeg");
      return sendStream(event, fs.createReadStream(outPath));
    }
  } catch (e) {
    // statSyncが失敗した場合 (ファイルが存在しないなど)
    // 何もせず、下の404エラーにフォールスルーする
  }

  // ここに到達した場合、有効なサムネイルが存在しない
  throw createError({
    statusCode: 404,
    statusMessage: "Thumbnail not found. Please run the scan script.",
  });
});
