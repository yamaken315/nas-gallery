import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  devtools: false,
  compatibilityDate: "2024-12-01",
  nitro: {
    // 一時的に /api/thumb の Nitro キャッシュを無効化（表示不具合調査のため）
    routeRules: {
      // "/api/thumb/**": { cache: { maxAge: 60 * 60 } },
    },
  },
  runtimeConfig: {
    // サーバサイドのみ
    imageRoot: process.env.IMAGE_ROOT || "/mnt/nas/photos",
    authUser: process.env.BASIC_USER || "viewer",
    authPasswordHash: process.env.BASIC_PASS_HASH || "", // bcrypt などに後で切替
    public: {
      thumbnailWidth: 320,
    },
  },
});
