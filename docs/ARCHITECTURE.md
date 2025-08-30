# NAS Gallery - Architecture & Design Specification

**バージョン: 1.0**
**最終更新日: 2025-08-31**

## 1. 哲学と設計思想

本アプリケーションは、個人のNAS（Network Attached Storage）に保存された膨大な写真を、安全かつ快適に閲覧・活用するための「パーソナルアーカイブ・フロントエンド」である。

設計における最優先事項は以下の通り。

1.  **データ主権 (Data Sovereignty)**: ユーザーの個人データ（写真、メタデータ）は、ユーザーが管理するローカルネットワークの外に出ることはない。
2.  **パフォーマンス (Performance)**: LAN内での動作を前提とし、画像の読み込みや操作は軽快であること。
3.  **体験価値 (User Experience)**: 単なるファイルブラウザではなく、AIなどの技術を活用して、写真との「再会」や「発見」といった価値を提供する。

この思想に基づき、アーキテクチャは「ローカルファースト」を徹底し、外部サービスへの依存を最小限に抑える。

## 2. システム構成図 (Component Diagram)

アプリケーションを構成する主要なコンポーネントと、それらの関係性を示す。

```mermaid
graph TD
    subgraph "ユーザー環境"
        User["<fa:fa-user> ユーザー"]
        Browser["<fa:fa-window-maximize> ブラウザ (Vue.js UI)"]
    end

    subgraph "サーバー環境 (ローカルマシン)"
        NuxtServer["<fa:fa-server> Nuxt 3 サーバー"]
        subgraph "データストア"
            DB[(<fa:fa-database> SQLite DB<br>data/meta.db)]
            Cache[(<fa:fa-file-archive> サムネイルキャッシュ<br>.cache/thumbs/)]
            Logs[(<fa:fa-file-alt> ログファイル<br>data/*.log)]
        end
    end

    subgraph "外部ストレージ"
        NAS["<fa:fa-hdd> NAS (画像原本)"]
    end

    User --> Browser
    Browser <-->|HTTP/HTTPS| NuxtServer
    NuxtServer -- "画像スキャン (scripts/scan-and-thumb.mjs)" --> NAS
    NuxtServer -- "DB読み書き (server/utils/db.ts)" --> DB
    NuxtServer -- "サムネイル生成/読込" --> Cache
    NuxtServer -- "ログ書き込み" --> Logs
    NuxtServer -- "画像原本読み込み (server/api/raw/)" --> NAS

    style User fill:#f9f,stroke:#333,stroke-width:2px
    style Browser fill:#9cf,stroke:#333,stroke-width:2px
    style NuxtServer fill:#9c9,stroke:#333,stroke-width:2px
```

## 3. ユースケース図 (Use Case Diagram)

ユーザーがこのアプリケーションで何ができるかを示す。

```mermaid
graph TD
    A["ユーザー"] --> B{"画像ギャラリーを閲覧する"}
    A --> C{"画像をフルサイズで表示する"}
    A --> D{"画像にタグ付けする"}
    A --> E{"タグで画像を検索する"}
    A --> F{"ライブラリを更新する (スキャン実行)"}
    A --> G{"破損画像を特定する (ログ確認)"}
```

## 4. 主要プロセス：サムネイル生成 (Sequence Diagram)

本アプリケーションで最も複雑なプロセスである、オンデマンドのサムネイル生成処理の流れを可視化する。

```mermaid
sequenceDiagram
    participant Browser
    participant API as /api/thumb/[id]
    participant Cache as サムネイルキャッシュ (FS)
    participant DB as SQLite
    participant NAS as 画像原本 (FS)

    Browser->>+API: GET /api/thumb/123

    API->>Cache: キャッシュ存在確認 (outPath)
    alt キャッシュあり (有効)
        Cache-->>API: 存在する
        API->>Browser: respondBuffer(outPath, "hit")
    else キャッシュなし or 無効 (0バイト/破損)
        API->>API: .lock ファイルで排他制御
        API->>DB: 画像ID=123の情報を取得
        DB-->>API: 画像情報 (相対パスなど)
        API->>NAS: 画像原本を読み込み
        NAS-->>API: 画像データ
        API->>API: sharpでリサイズ・変換 (メモリ上)
        API->>API: 生成バッファを検証 (マーカー, 寸法)
        alt 検証成功
            API->>Cache: 一時ファイルに書き込み
            Cache-->>API: 成功
            API->>Cache: renameして原子的に配置
            API->>Browser: respondBuffer(outPath, "miss")
        else 検証失敗
            API->>Cache: プレースホルダ画像を書き込み
            API->>API: 失敗理由をログに記録
            API->>Browser: respondBuffer(outPath, "placeholder")
        end
        API->>API: .lock ファイルを解放
    end
    API-->>-Browser: JPEG画像データ
```

## 5. API仕様

| エンドポイント | メソッド | 説明 | パラメータ | 成功時レスポンス |
| :--- | :--- | :--- | :--- | :--- |
| `/api/images` | GET | 画像の一覧をページネーション付きで取得する。 | `page` (クエリ) | `Image[]` のJSON |
| `/api/images/[id]` | GET | 指定したIDの画像情報を取得する。 | `id` (パス) | `Image` のJSON |
| `/api/images/[id]/tags` | GET | 指定したIDの画像に付けられたタグを取得する。 | `id` (パス) | `Tag[]` のJSON |
| `/api/images/[id]/tags` | PUT | 指定したIDの画像にタグを追加/削除する。 | `id` (パス), `tags` (ボディ) | `200 OK` |
| `/api/tags` | GET | 存在するすべてのタグの一覧を取得する。 | - | `Tag[]` のJSON |
| `/api/raw/[id]` | GET | 指定したIDの画像原本をストリーミング配信する。 | `id` (パス) | `image/*` |
| `/api/thumb/[id]` | GET | 指定したIDのサムネイルを生成またはキャッシュから配信する。 | `id` (パス), `debug` (クエリ) | `image/jpeg` |
