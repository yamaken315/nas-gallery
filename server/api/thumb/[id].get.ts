import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getImageById } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const q: any = getQuery(event);
  const debug = q && "debug" in q;
  const t0 = Date.now();
  const idParam = getRouterParam(event, "id");
  if (!idParam || !/^\d+$/.test(idParam)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid id" });
  }
  const id = Number(idParam);
  const config = useRuntimeConfig();
  const cacheDir = path.join(process.cwd(), ".cache", "thumbs");
  const outPath = path.join(cacheDir, id + ".jpg");

  if (debug) console.log(`[thumb][${id}] start debug`);

  function respond(outPath: string, gen: string) {
    const st = fs.statSync(outPath);
    if (st.size === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: "Zero-byte thumbnail",
      });
    }
    // 明示的に 200 固定 (204 化防止)
    event.node.res.statusCode = 200;
    setHeader(event, "Content-Type", "image/jpeg");
    // H3 setHeader は string 受け取りだが型定義差異回避のためテンプレート化
    setHeader(event as any, "Content-Length", st.size as any);
    setHeader(
      event,
      "Cache-Control",
      gen === "placeholder" ? "public, max-age=300" : "public, max-age=3600"
    );
    setHeader(event, "X-Thumb-Gen", gen);
    if (gen === "placeholder")
      setHeader(event, "X-Thumb-Error", "truncated-jpeg");
    if (debug)
      setHeader(
        event,
        "X-Debug",
        `${gen};${Date.now() - t0}ms;size=${st.size}`
      );
    // ETag が 204 化に絡む疑いがある場合は明示的にオフ (空文字より no-store 指定)
    if (debug) setHeader(event, "Cache-Debug", "force200");
    return sendStream(event, fs.createReadStream(outPath));
  }

  // 1. キャッシュヒット判定 (サイズ0は削除して再生成)
  try {
    const stats = fs.statSync(outPath);
    if (stats.size > 0) {
      if (debug) console.log(`[thumb][${id}] cache hit size=${stats.size}`);
      return respond(outPath, "hit");
    } else {
      // 0バイトファイルは破棄
      try {
        fs.unlinkSync(outPath);
        if (debug) console.log(`[thumb][${id}] removed zero-byte cache`);
      } catch {}
    }
  } catch {
    // 不在なら生成へ
    if (debug) console.log(`[thumb][${id}] no cache file`);
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
  if (debug) {
    try {
      const st = fs.statSync(abs);
      console.log(`[thumb][${id}] source ok size=${st.size}`);
    } catch (e) {
      console.log(`[thumb][${id}] source stat error`, e);
    }
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
      if (debug) console.log(`[thumb][${id}] sharp success tmp`);
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
        if (debug) console.log(`[thumb][${id}] placeholder generated`);
      } else {
        throw err; // 他のエラーは上位で 500
      }
    }
    if (!fs.existsSync(outPath)) {
      try {
        fs.renameSync(tmp, outPath);
        if (debug) console.log(`[thumb][${id}] rename -> final`);
      } catch {
        /* ignore */
      }
    } else {
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
    if (debug) {
      try {
        const st2 = fs.statSync(outPath);
        console.log(`[thumb][${id}] final size=${st2.size}`);
      } catch (e) {
        console.log(`[thumb][${id}] final stat error`, e);
      }
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
  return respond(outPath, genStatus);
});
