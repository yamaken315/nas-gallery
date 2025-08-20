# NASフォトギャラリー

Nuxt 3で構築された、NAS（ネットワーク接続ストレージ）上の画像を閲覧するためのシンプルなフォトギャラリーアプリケーションです。

マウントした画像ディレクトリをWebインターフェース経由で閲覧できます。オンデマンドのサムネイル生成、基本的な認証、クリーンでレスポンシブなUIを備えています。

## 主な機能

-   Webベースの画像ブラウジング
-   高速な読み込みを実現するオンデマンドのサムネイル生成
-   レスポンシブなグリッドレイアウト
-   フルサイズの画像を表示するためのライトボックス（モーダル表示）機能
-   ギャラリーを保護するための基本認証
-   画像データベースを効率的に更新するための差分スキャン
	-   サムネイルはアクセス時にオンデマンド生成（生成結果は `.cache/thumbs/` に保存し、原子的に配置）
	-   破損 (0バイト) サムネイルは再アクセス時に再生成されます

## セットアップとインストール

### 1. 前提条件

-   [Node.js](https://nodejs.org/) (v18以降を推奨)
-   アプリケーションを実行するマシンからアクセス可能な画像ディレクトリ（例: マウントされたNAS共有）

### 2. リポジトリのクローン

```bash
git clone <your-repository-url>
cd nas-gallery
```

### 3. 依存関係のインストール

```bash
npm install
```

### 4. 環境変数の設定

プロジェクトのルートに、サンプルファイルをコピーして`.env`ファイルを作成します。

```bash
cp .env.example .env
```

次に、`.env`ファイルをご自身の環境に合わせて編集します。

```
# 画像が保存されているルートディレクトリへの絶対パス（例: NASのマウントポイント）
IMAGE_ROOT=/path/to/your/nas/photos

# 基本認証の認証情報 (nuxt.config.ts の runtimeConfig に対応)
BASIC_USER=viewer
# 形式: plain:パスワード  （将来的に bcrypt 等へ拡張予定）
BASIC_PASS_HASH=plain:your-secret-password

# (任意) アプリケーションのポート番号
NUXT_PORT=3000

# (任意) サムネイルの幅（ピクセル単位）※ フロント公開設定
NUXT_PUBLIC_THUMBNAIL_WIDTH=320

# (任意) スキャン並列数 (CPU コア数未満に抑えると安定)
SCAN_CONCURRENCY=6
```

**【重要】**
- `IMAGE_ROOT` には画像が格納されているディレクトリへの **絶対パス** を指定してください。
- 認証は `BASIC_USER` と `BASIC_PASS_HASH` (plain:接頭辞) を使います。旧ドキュメントの `BASIC_AUTH_USER/BASIC_AUTH_PASS` とは異なります。
- パスワードは強力なものにし、将来 `bcrypt:` などへ移行する想定です。

### 5. 画像ディレクトリのスキャン

初めてアプリケーションを起動する前に、画像ディレクトリをスキャンしてデータベースを構築する必要があります。このコマンドは何度実行しても安全です（冪等性があります）。

```bash
npm run scan
```

このスクリプトは以下の処理を行います。
- `IMAGE_ROOT` 内のすべての画像ファイル（`.jpg`, `.jpeg`, `.png`, `.webp`）を検索します。
- 見つかったファイル情報をローカル SQLite (`data/meta.db`) に upsert。
- 以前登録されていたが見つからなくなったファイルを「削除済み」マーク。
- 一部 JPEG の SOI/EOI 簡易検査で「明確に破損」していそうなものを検出し `data/corrupted-images.log` に追記。

**注記：** スキャンスクリプト自体はサムネイルを事前生成しません。サムネイルは初回アクセス時にオンデマンドで生成され、二重生成や同時アクセスによる破損を避けるため一時ファイル → リネームで原子的に保存されます。

画像を追加、削除、更新した際には、このスキャンコマンドを再度実行してください。

### 6. アプリケーションの起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` （または指定したポート）にアクセスします。`.env`ファイルで設定したユーザー名とパスワードの入力が求められます。

## 使い方

-   **閲覧:** ギャラリーをスクロールして画像を閲覧します。画像はページ単位で読み込まれます。
-   **フルサイズ表示:** サムネイルをクリックすると、フルサイズの画像がライトボックス（モーダル）で表示されます。ライトボックス内で画像の切り替えも可能です。
-   **ライブラリの更新:** `IMAGE_ROOT`ディレクトリに画像を追加・削除した場合は、一度アプリケーションを停止し、`npm run scan`を再実行してから、再度アプリケーションを起動してください。

## データベースのリセット

誤ったスキャン結果やクリーンアップを行いたい場合は、以下のコマンドでSQLiteデータベース (`data/meta.db`) をリセットできます。

```
npm run reset:db            # ソフトリセット: レコード削除 (スキーマ保持)
npm run reset:db -- --hard  # ハードリセット: DBファイル削除→再初期化
npm run reset:db -- --images-only # images / image_tags のみ削除
```

`--force` を付けると確認プロンプトをスキップします。リセット後は必要に応じて `npm run scan` を再度実行してください。

## サムネイルキャッシュについて

生成されたサムネイルは `.cache/thumbs/` に保存されます。生成フローは以下の安全策を含みます:
1. Sharp で一旦メモリ上に JPEG を生成
2. JPEG マーカー (SOI/EOI)、寸法、サイズの妥当性チェック
3. OK の場合のみ一時ファイル → `rename` で原子的配置
4. 失敗・異常時は 1x1 プレースホルダ (白) を保存し、理由をログ

HTTP レスポンスヘッダ:
- `X-Thumb-Gen: hit | miss | placeholder`
- `X-Thumb-Reason: marker | no-dim | oversize | too-small | suspicious-small | reprobe | sharp-error` (placeholder 時)

ログ/診断:
- `data/thumbnail-gen.log` : placeholder 生成時の詳細 (id, reason, 元寸法, 生成サイズ, 先頭/末尾 HEX)
- `data/corrupted-images.log` : スキャン時判定した破損元ファイル一覧

ブラウザキャッシュ: 通常サムネイルは `Cache-Control: public, max-age=3600`。プレースホルダは短め (`max-age=300`)。`?debug` 付与で `no-store` 強制と追加ヘッダ表示。

同時アクセス時の競合: `.lock` ファイルによる簡易ロックで重複生成を抑止しています。

再生成: キャッシュが 0 バイト / 無効 JPEG と判定された場合は削除後再生成されます。

デバッグ例:
```
curl -I 'http://localhost:3000/api/thumb/123?debug'
```
ヘッダで `X-Thumb-Gen` / `X-Thumb-Reason` を確認します。

問題切り分けの推奨手順:
1. `npm run scan` で DB & 破損ログ更新
2. 問題 ID に `?debug` を付けアクセス
3. `data/thumbnail-gen.log` を tail して理由を把握
4. 元ファイル差し替え / 変換後に再アクセス

クリーンアップ (開発中のネイティブ不整合や破損キャッシュ疑い時):
```
rm -rf .nuxt .nitro .output dist .cache/thumbs
npm rebuild sharp better-sqlite3
```
再度 `npm run dev`。

より完全な再構築 (依存も再インストール):
```
rm -rf .nuxt .nitro .output dist .cache node_modules
npm install
npm run dev
```

