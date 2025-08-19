# Migration Plan: temp-seed → project root

目的: scaffolding された Nuxt アプリ (temp-seed) をリポジトリ直下へ統合し階層を単純化。

## 手順 (A)
1. 開発サーバ停止。
2. ルートへ移動すべき項目一覧:
   - temp-seed/nuxt.config.ts → ./nuxt.config.ts
   - temp-seed/tsconfig.json → ./tsconfig.json
   - temp-seed/package.json の scripts/設定をルート package.json に統合
   - temp-seed/.env → ./.env (存在しなければ)
   - temp-seed/app, pages, server, scripts, public, docs
   - temp-seed/.gitignore の必要行をルート .gitignore へマージ
3. 移動後 temp-seed ディレクトリ削除。
4. 動作確認: `npm install` → `npm run dev`。

## Rollback
- Git 管理下であれば reset。未コミットなら temp-seed のバックアップコピーを残しておく。

## 留意点
- ルート package.json の依存と重複するため競合をマージ。name/version をルート側採用。
- VSCode の Nuxt 型補完はルートに配置された方がシンプル。

---
