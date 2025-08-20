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
  let genStatus: "miss" | "placeholder" = "miss";
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const tmp = outPath + ".tmp-" + process.pid + "-" + Date.now();
    try {
      await sharp(abs)
        .rotate() // EXIF Orientation 対応
        .resize(config.public.thumbnailWidth)
        .jpeg({ quality: 80 })
        .toFile(tmp);
    } catch (err: any) {
      const msg = String(err?.message || err);
      // 壊れた / 途中までの JPEG の場合はプレースホルダ
      if (/premature end of JPEG image|VipsJpeg/i.test(msg)) {
        console.warn(`[thumb] truncated JPEG detected id=${id} -> placeholder`);
        genStatus = "placeholder";
        const placeholder = Buffer.from(
          // 1x1 の白ピクセル JPEG (最小構成) Base64
          "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAAQABADASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAIDB//EABYBAQEBAAAAAAAAAAAAAAAAAAABAv/EABYBAQEBAAAAAAAAAAAAAAAAAAEABf/EABYRAQEBAAAAAAAAAAAAAAAAAAACAf/aAAwDAQACEQMRAD8A0QAAAP/Z",
          "base64"
        );
        fs.writeFileSync(tmp, placeholder);
      } else {
        throw err; // 他のエラーは上位で 500
      }
    }
    if (!fs.existsSync(outPath)) {
      try {
        fs.renameSync(tmp, outPath);
      } catch {
        /* ignore */
      }
    } else {
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
  } catch (e) {
    if (genStatus === "miss") {
      // placeholder 生成ではない純粋な失敗のみ 500
      console.error(`[thumb] sharp failed for id ${id}:`, e);
      throw createError({
        statusCode: 500,
        statusMessage: "Thumbnail generation failed",
      });
    }
  }

  // 4. 応答
  setHeader(event, "Content-Type", "image/jpeg");
  setHeader(
    event,
    "Cache-Control",
    genStatus === "placeholder" ? "public, max-age=300" : "public, max-age=3600"
  );
  setHeader(event, "X-Thumb-Gen", genStatus);
  if (genStatus === "placeholder")
    setHeader(event, "X-Thumb-Error", "truncated-jpeg");
  return sendStream(event, fs.createReadStream(outPath));
});
