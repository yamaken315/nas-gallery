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

  function respondBuffer(outPath: string, gen: string) {
    const data = fs.readFileSync(outPath); // 同期で確実にバッファ取得
    if (data.length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: "Zero-byte thumbnail",
      });
    }
    // 強制 200
    event.node.res.statusCode = 200;
    setHeader(event, "Content-Type", "image/jpeg");
    setHeader(event as any, "Content-Length", data.length as any);
    // 一時的にブラウザ / 中間キャッシュ無効化できる debug オプション
    const noCache = debug || "nocache" in (q || {});
    setHeader(
      event,
      "Cache-Control",
      noCache
        ? "no-store"
        : gen === "placeholder"
        ? "public, max-age=300"
        : "public, max-age=3600"
    );
    setHeader(event, "X-Thumb-Gen", gen);
    if (gen === "placeholder")
      setHeader(event, "X-Thumb-Error", "truncated-jpeg");
    if (debug)
      setHeader(
        event,
        "X-Debug",
        `${gen};${Date.now() - t0}ms;bytes=${data.length}`
      );
    // ETag/Last-Modified が 204/304 判定に干渉しないよう debug 時は抑制
    if (debug) {
      setHeader(event, "ETag", `debug-${Date.now()}-${data.length}`);
      setHeader(event, "Last-Modified", new Date().toUTCString());
    }
    return data;
  }

  // 1. キャッシュヒット判定 (サイズ0は削除して再生成)
  try {
    const stats = fs.statSync(outPath);
    if (stats.size > 0) {
      // 簡易JPEG検証 (SOI/EOI マーカー)
      let valid = true;
      try {
        const fd = fs.openSync(outPath, "r");
        const head = Buffer.alloc(4);
        const tail = Buffer.alloc(2);
        fs.readSync(fd, head, 0, 4, 0);
        fs.readSync(fd, tail, 0, 2, stats.size - 2);
        fs.closeSync(fd);
        if (!(head[0] === 0xff && head[1] === 0xd8)) valid = false; // SOI
        if (!(tail[0] === 0xff && tail[1] === 0xd9)) valid = false; // EOI
      } catch (e) {
        valid = false;
      }
      if (!valid) {
        if (debug)
          console.warn(`[thumb][${id}] invalid jpeg cache -> regenerate`);
        try {
          fs.unlinkSync(outPath);
        } catch {}
      } else {
        // 小さすぎる (プレースホルダ閾値) なら placeholder として応答
        let kind: "hit" | "placeholder" = "hit";
        if (stats.size >= 250 && stats.size <= 350) {
          try {
            const buf = fs.readFileSync(outPath);
            // JFIF 文字列を含み、サイズが小さい → 1x1 JPEG の典型パターン
            if (buf.includes(Buffer.from("JFIF"))) {
              kind = "placeholder";
            }
          } catch {}
        }
        if (debug)
          console.log(
            `[thumb][${id}] cache hit size=${stats.size} kind=${kind}`
          );
        return respondBuffer(
          outPath,
          kind === "placeholder" ? "placeholder" : "hit"
        );
      }
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
      // まずメタデータを取得して色空間やチャンネル構成を確認
      const probe = sharp(abs, { failOn: "none" });
      const meta = await probe.metadata();
      if (debug)
        console.log(
          `[thumb][${id}] meta space=${meta.space} channels=${meta.channels} alpha=${meta.hasAlpha}`
        );

      let pipeline = sharp(abs, { failOn: "none" }).rotate();

      // CMYK やその他 sRGB 以外は sRGB に変換 (緑かぶり/色ズレ対策)
      if (meta.space && !["srgb", "rgb"].includes(meta.space)) {
        pipeline = pipeline.toColorspace("srgb");
        if (debug) console.log(`[thumb][${id}] colorspace -> srgb`);
      }

      // 透過がある (PNG 等) 場合は白背景でフラット化 (緑/意図しない透過パターン対策)
      if (meta.hasAlpha) {
        pipeline = pipeline.flatten({ background: "#ffffff" });
        if (debug) console.log(`[thumb][${id}] flatten alpha -> white`);
      }

      await pipeline
        .resize({
          width: config.public.thumbnailWidth,
          withoutEnlargement: true,
        })
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
  return respondBuffer(outPath, genStatus);
});
