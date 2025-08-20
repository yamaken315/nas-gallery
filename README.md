# NAS Gallery

ローカル NAS(QNAP 等) 上の画像を高速閲覧しタグ管理する学習用ギャラリー。

## 主な機能

- 画像メタデータを SQLite にキャッシュ (差分スキャン対応)
- サムネイル自動生成 (sharp)
- タグ付け / 編集 UI (カンマ区切り全置換)
- Basic 認証 (後で強化可能)

## 要件

- Node.js 18+ 推奨 (ESM / sharp 対応)
- NAS の共有フォルダをローカルへマウント済み (例: `/mnt/nas/photos`)
- macOS / Linux 開発想定

## 迅速セットアップ (Quick Start)

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the root of the project by copying the example file:

```bash
cp .env.example .env
# .env を開き IMAGE_ROOT や BASIC_PASS_HASH を必要に応じ調整

# 3. 開発サーバ起動
npm run dev
# 別ターミナルで初回スキャン (NAS パスを環境変数で上書き可)
IMAGE_ROOT=/Volumes/samples node scripts/scan-and-thumb.mjs

# 4. ブラウザアクセス
open http://localhost:3000/
# Basic 認証: BASIC_USER / BASIC_PASS_HASH の plain: 以降
```

## .env 主要項目

| 変数             | 説明                                   |
| ---------------- | -------------------------------------- |
| IMAGE_ROOT       | NAS 上の画像ルートパス                 |
| BASIC_USER       | Basic 認証ユーザ名                     |
| BASIC_PASS_HASH  | `plain:password` 形式 (後で bcrypt 化) |
| THUMBNAIL_WIDTH  | サムネイル幅 (既定 320)                |
| SCAN_CONCURRENCY | スキャン並列数 (CPU コア数推奨)        |

## ディレクトリ構成 (抜粋)

```
server/
  middleware/basicAuth.ts   # 認証
  utils/db.ts               # SQLite 初期化 + クエリ
  api/...                   # API ルート
scripts/scan-and-thumb.mjs  # 差分スキャン + メタ更新
pages/                      # Nuxt ページ (一覧 / 詳細+タグ)
.docs/PROJECT_MANIFEST.md   # プロジェクト方針 & 進捗
.cache/thumbs               # 生成サムネイル (自動)
data/meta.db                # SQLite DB (自動)
```

## スキャン (差分)

- mtime / size が変化したファイルのみ更新
- 既に無いファイルは `deleted=1` マーク (物理削除は行わない)
- 実行例: `SCAN_CONCURRENCY=8 IMAGE_ROOT=/mnt/nas/photos node scripts/scan-and-thumb.mjs`

## タグ編集

1. 一覧から画像をクリック
2. 詳細ページの Tags フォームに `family, summer, 2023` のように入力 → Save
3. PUT により既存タグを置換
4. 全タグ: `/api/tags` (usage_count 含む)

## セキュリティ注意

- `.env` や `data/` を公開したくない場合は非公開リポジトリ利用推奨
- Basic 認証は学習/局所利用前提。外部公開する際は HTTPS + bcrypt + セッション / 逆プロキシ必須

## 典型的トラブルシュート

| 症状               | 対処                                                            |
| ------------------ | --------------------------------------------------------------- |
| 画像が表示されない | IMAGE_ROOT のパス/権限確認。NAS マウントが切れていないか        |
| サムネイル生成失敗 | sharp の依存 (libvips) 再インストール: `npm rebuild sharp`      |
| タグ保存 401       | Basic 認証ヘッダをブラウザが保持しているか確認 / パスワード照合 |
| push できない      | SSH 鍵設定 / `git remote -v` 再確認                             |

## Roadmap (抜粋)

- bcrypt + セッション認証
- EXIF 読み取り (exifr)
- タグ PATCH API (追加/削除差分更新)
- サムネイル再試行キュー
- 物理削除ガーベジコレクタ

## ライセンス

学習用途 (未指定: 必要に応じて追加)。

---

改善案 / Issue: GitHub Issues へ。PR 歓迎。
