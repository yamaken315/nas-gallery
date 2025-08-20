import type { H3Event } from "h3";

export default defineNitroPlugin((nitroApp) => {
  // Nitro の h3 イベントフックは nitroApp.hooks.h3 ではなく nitroApp.hooks 直下に afterResponse がある場合がある
  // 汎用: app.hooks.h3 互換が無い環境向けに directly wrap
  nitroApp.hooks.hook("afterResponse", (event: H3Event) => {
    const url = event.node.req.url || "";
    if (!url.startsWith("/api/thumb/")) return;
    const len = event.node.res.getHeader("Content-Length");
    const type = event.node.res.getHeader("Content-Type");
    const gen = event.node.res.getHeader("X-Thumb-Gen");
    const status = event.node.res.statusCode;
    console.log(
      `[thumb][afterResponse] status=${status} len=${len} type=${type} gen=${gen} url=${url}`
    );
  });
});
