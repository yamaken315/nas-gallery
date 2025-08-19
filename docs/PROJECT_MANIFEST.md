# NAS Gallery Project Manifest

## 目的
NAS(QNAP)上の画像コレクションをローカルネットワーク内で高速閲覧（サムネイル＋原寸/高画質）し、タグによるフィルタを可能にする学習用アプリ。

## スコープ (Phase 0)
- Nuxt3 + Nitro サーバ
- Basic 認証 (簡易)
- ディレクトリスキャン → SQLite メタDB (images, tags, image_tags)
- サムネイル生成 (sharp) / キャッシュフォルダ
- 一覧 + 単画像表示 UI

## 非スコープ (今はやらない)
- 公開インターネット運用
- 複数ユーザ管理/権限
- 動画/RAW 対応
- 外部クラウドストレージ同期

## アーキ概要
- Storage: NAS マウント (読み取り) + ローカルキャッシュ: .cache/thumbs
- DB: SQLite (ファイル: data/meta.db)
- API: /api/images(list, detail), /api/thumb/:id, /api/raw/:id, /api/auth/check(予定)
- 将来: 増分スキャン (mtime), ワーカー化

## セキュリティ方針 (初期)
- LAN 内想定。Basic 認証 + 環境変数。transport は HTTP（HTTPS 化は後続: 逆プロキシ/Nginx or Caddy）。
- 後で: bcrypt ハッシュ + セッション Cookie (HttpOnly, SameSite=Lax)

## パフォーマンス方針
- 初回フルスキャン -> DB キャッシュ
- サムネイル: 需要時生成 & ディスクキャッシュ
- ETag/Cache-Control でブラウザキャッシュ活用

## タグ設計 (初期)
- 画像ファイル名からのヒューリスティック / もしくは後で手動付与 UI
- EXIF 読み取り (Phase 1)

## ディレクトリ構成 (現状)
```
server/
  middleware/basicAuth.ts
  utils/db.ts
  api/images/index.get.ts
  api/images/[id].get.ts
  api/images/[id]/tags.get.ts
  api/images/[id]/tags.put.ts
  api/thumb/[id].get.ts
  api/raw/[id].get.ts
  api/tags/index.get.ts
pages/
  index.vue
  image/[id].vue
scripts/
  scan-and-thumb.mjs
public/
  favicon.ico
  robots.txt
```
自動生成: data/ (DB), .cache/thumbs (サムネイル)

## 作業ログ
- [x] Phase 0 scaffolding
- [x] スキャンスクリプト (初版)
- [x] API 実装 (一覧/詳細/サムネ/原寸)
- [x] UI 一覧 & 詳細 (初版)
- [x] 認証 (Basic 初版)
- [x] サムネイル提供 (初版)
- [x] 差分スキャン (mtime/size, 削除マーク, 並列)
- [x] タグ付け簡易UI (PUT 全置換方式)

## 今後メモ
- 失敗サムネイル再試行キュー
- bcrypt 置換 / ログインフォーム & session cookie
- EXIF 読み取り追加
- 削除マーク後の物理削除ガーベジコマンド
- タグ部分更新 (追加/削除API) 分離

(更新履歴)
- 2025-08-19: タグUI & API 追加