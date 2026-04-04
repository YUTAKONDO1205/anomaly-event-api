# anomaly-event-api

ひび割れ画像を使って異常を検出し、イベントとして保存・確認できる API / ローカル検証アプリです。

今のリポジトリは 2 つの動かし方を持っています。

- `local` モード: AWS なしで、手元の画像データから簡易分類してすぐ試せる
- `aws` モード: S3 / DynamoDB / Lambda / Rekognition Custom Labels を使う本番寄り構成

フロントも同梱しているので、画像を選んでアップロードし、そのまま検出結果とイベント一覧まで確認できます。

## できること

- ひび割れ画像のアップロード
- 異常検出の実行
- 検出結果の表示
- 異常だった画像のイベント保存
- イベント一覧取得
- ステータス更新
- `Positive / Negative` データセットを使ったローカル一括実行

## まず最初に

画像をすでに入れているなら、最短でここからです。

```bash
npm install
npm run dataset:index
npm run local
```

起動後にブラウザで `http://127.0.0.1:3000` を開いてください。

## モード一覧

| モード | 用途 | 必要なもの | 保存先 | 検出方法 |
| --- | --- | --- | --- | --- |
| `local` | すぐ試す、UI確認、データ動線確認 | Node.js と画像データ | ローカルファイル | manifest を使った簡易分類 |
| `aws` | 本番寄り検証、サーバレス運用 | AWS / SAM / Rekognition モデル | S3 + DynamoDB | Rekognition Custom Labels |

## ローカル起動

### 1. 画像を置く

以下に画像を置きます。

- `datasets/raw/positive`
- `datasets/raw/negative`

現在の想定ラベル:

- `Positive` = 異常あり
- `Negative` = 正常

### 2. manifest を作る

```bash
npm run dataset:index
```

既定では `dataset.config.json` の `maxImagesPerClass` が `100` なので、

- Positive 100 枚
- Negative 100 枚

の合計 200 件を index 化します。

全件を使いたい場合は `dataset.config.json` の `maxImagesPerClass` を `0` にしてください。

### 3. アプリを起動する

```bash
npm run local
```

これで次がまとめて立ち上がります。

- API
- フロント
- ローカル保存先

アクセス先:

- `http://127.0.0.1:3000`

### 4. UI で試す

画面でできること:

- 画像選択
- 検出実行
- 検出 JSON の確認
- イベント一覧の確認

ローカルで作られたイベントは次に保存されます。

- `local-storage/events/events.json`

ローカルで受けた画像は次に保存されます。

- `local-storage/uploads`

## 一括実行

データセットをまとめて流したいときは、ターミナルを 2 つ使います。

### ターミナル 1

```bash
npm run local
```

### ターミナル 2

```bash
npm run dataset:run
```

これで `datasets/manifests/index.json` に入っている画像を順番に API へ流し、異常判定されたものをイベントとして保存します。

## AWS モード

AWS 構成で動かす場合は、`.env.example` を参考に環境変数を設定してください。

主要な設定:

- `EVENTS_TABLE`
- `EVENT_IMAGES_BUCKET`
- `REKOGNITION_PROJECT_VERSION_ARN`
- `DETECTION_TARGET_LABEL`
- `DETECTION_MIN_CONFIDENCE`

ローカル SAM 実行:

```bash
npm run sam:build
npm run sam:local
```

デプロイ:

```bash
npm run sam:deploy
```

詳細な流れは [docs/detection-flow.md](docs/detection-flow.md) を見てください。

## API

| Method | Path | 説明 |
| --- | --- | --- |
| `POST` | `/events` | イベントを作成 |
| `GET` | `/events` | イベント一覧を取得 |
| `GET` | `/events/{id}` | 単一イベントを取得 |
| `PATCH` | `/events/{id}/status` | イベントステータスを更新 |
| `POST` | `/upload-url` | 画像アップロード用情報を返す |
| `POST` | `/detect` | 画像を判定し、異常ならイベントを保存 |

## ディレクトリ構成

```text
.
├─ datasets/
│  ├─ manifests/            # index.json
│  └─ raw/
│     ├─ negative/          # 正常画像
│     └─ positive/          # 異常画像
├─ events/                  # Lambda / API テスト用イベント
├─ frontend/                # ローカルUI
├─ local-storage/           # local モードの保存先
├─ scripts/                 # dataset / local server 補助スクリプト
├─ src/
│  ├─ handlers/             # Lambda handler
│  ├─ repositories/         # 永続化層
│  ├─ services/             # 検出 / アップロード / イベント処理
│  └─ utils/                # 共通処理
├─ template.yaml            # AWS SAM 定義
└─ dataset.config.json      # dataset 実行設定
```

## よく使うコマンド

```bash
npm install
npm run build
npm run typecheck
npm run dataset:index
npm run dataset:run
npm run local
npm run sam:build
npm run sam:local
npm run sam:deploy
```

## 設定ファイル

### `dataset.config.json`

主な項目:

- `positiveDir`
- `negativeDir`
- `outputFile`
- `apiBaseUrl`
- `defaultDeviceId`
- `defaultSectionId`
- `defaultDistance`
- `concurrency`
- `maxImagesPerClass`
- `shuffle`

### `.env.example`

ローカル / AWS 切り替えに関係する項目:

- `APP_STORAGE_MODE`
- `DETECTION_PROVIDER`
- `LOCAL_UPLOADS_DIR`
- `LOCAL_EVENTS_FILE`

## アーキテクチャ

### local モード

```text
Browser
  -> Local Dev Server
  -> Detection Service
  -> local-storage/events/events.json
```

### aws モード

```text
Client / Device
  -> API Gateway
  -> Lambda
  -> DynamoDB
  -> S3
  -> Rekognition Custom Labels
```

## 補足

- local モードは本番精度を保証するものではなく、疎通確認と UI 仕上げに向いたモードです
- 本番精度が必要なら `aws` モードで Rekognition か独自モデルに切り替えてください
- docs 配下の古いファイルに文字化けが残っている場合でも、この README の手順で動作確認は進められます

## 次にやると強いこと

- `Positive / Negative` の index 件数を増やして local 判定を安定させる
- `POST /detect` のレスポンスを使って、検出ラベルの可視化を UI に足す
- AWS の Rekognition モデル ARN を設定して本番系フローに切り替える
