# Architecture

このドキュメントは `anomaly-event-api` の構成、責務分割、runtime mode ごとの差分を説明します。

## Goals

このプロジェクトの狙いは次の 3 つです。

- ひび割れ画像を入力して異常検出を実行できること
- 異常だった結果を event として保存・追跡できること
- local と aws の両方で同じ体験を保ちながら構成を切り替えられること

## Runtime Modes

| Mode | Storage | Detection | Primary Use |
| --- | --- | --- | --- |
| `local` | ローカルファイル | Python MobileNetV2 + Grad-CAM | UI 開発、学習、疎通確認 |
| `aws` | DynamoDB + S3 | Python Inference Lambda / Rekognition / Heuristic | AWS 公開、本番寄り検証 |

## High-Level View

### Local Mode

```text
Browser
  -> Local Dev Server
     -> Handlers
        -> Services
           -> PythonDetectionService
              -> python/crack_ml.py
           -> Local Storage
              -> local-storage/uploads
              -> local-storage/events/events.json
```

### AWS Mode

```text
Browser / Client
  -> API Gateway (HttpApi)
     -> Node.js Lambda Handlers
        -> Services
           -> S3
           -> DynamoDB
           -> AwsDeepLearningService
              -> DeepLearningInferenceFunction
           -> Rekognition
           -> CloudWatch Logs
```

## Main Layers

コードは大きく 4 層に分かれています。

### 1. Handler Layer

`src/handlers/`

責務:

- HTTP リクエストを受ける
- validation を呼ぶ
- service を呼ぶ
- HTTP response を整形する

主要 handler:

- `createEvent.ts`
- `getEvents.ts`
- `getEventById.ts`
- `updateEventStatus.ts`
- `getUploadUrl.ts`
- `detectImage.ts`
- `getDashboard.ts`
- `getUploadedImage.ts`

### 2. Service Layer

`src/services/`

責務:

- 業務ロジックの実行
- upload URL 発行
- deep-learning / rekognition / heuristic の切り替え
- event 作成
- local / aws 差分の吸収

主要 service:

- `DetectionService`
- `PythonDetectionService`
- `AwsDeepLearningService`
- `HeuristicDetectionService`
- `UploadService`
- `DashboardService`
- `EventService`

### 3. Repository Layer

`src/repositories/`

責務:

- event の永続化
- local では JSON ファイル
- aws では DynamoDB

### 4. Utility Layer

`src/utils/`

責務:

- 環境変数管理
- validation
- response 整形
- logger
- local storage 操作

## Main Request Flows

### Event CRUD

```text
HTTP Request
  -> handler
  -> validate
  -> EventService
  -> EventRepository
  -> storage
  -> HTTP Response
```

### Detection Flow

```text
HTTP Request (/detect)
  -> detectImage handler
  -> validateDetectImageInput
  -> DetectionService
     -> load image bytes
     -> select provider
     -> detect labels
     -> if anomaly: create event
  -> HTTP Response
```

## Detection Strategy

### Local Mode

local モードでは、`python/crack_ml.py` を通して `MobileNetV2 Transfer Learning` を実行します。

特徴:

- 初回推論時に model が無ければ自動学習
- Grad-CAM による heatmap を生成
- focus regions / attention grid / contributions を返す

向いている用途:

- UI 確認
- API 疎通
- 学習 / 推論の検証

### AWS Mode

aws モードでは、S3 に保存された画像を `DetectionService` が読み込み、`DetectionProvider` に応じて provider を切り替えます。

- `aws-deep-learning`: Python コンテナ Lambda で MobileNetV2 + Grad-CAM を実行
- `rekognition`: Rekognition Custom Labels を利用
- `heuristic`: 画像特徴量ベースのフォールバック

深層学習 path では、ローカルで学習した model 重みを `aws/deep-learning-artifacts/model` にコピーして Lambda image に同梱します。

## Storage Design

### Local Storage

| Path | Purpose |
| --- | --- |
| `local-storage/uploads` | 受信画像の保存先 |
| `local-storage/events/events.json` | event 保存先 |
| `local-storage/ml` | 学習済みモデルと metadata |

### AWS Storage

| Resource | Purpose |
| --- | --- |
| DynamoDB `EventsTable` | event 保存 |
| S3 `EventImagesBucket` | アップロード画像 |
| S3 `FrontendBucket` | frontend 公開 |

## Deployment View

`template.yaml` で次を定義しています。

- HttpApi
- Node.js Lambda Functions
- Python Deep Learning Image Function
- DynamoDB Table
- S3 Upload Bucket
- S3 Frontend Website Bucket

主要 function:

- `CreateEventFunction`
- `GetEventsFunction`
- `GetEventByIdFunction`
- `UpdateEventStatusFunction`
- `GetUploadUrlFunction`
- `DetectImageFunction`
- `GetDashboardFunction`
- `GetUploadedImageFunction`
- `DeepLearningInferenceFunction`

## Frontend Integration

frontend は静的 HTML / CSS / JavaScript です。

役割:

- upload-url の取得
- local / aws で upload 手順を切り替え
- detect 実行
- heatmap / attention / event detail の表示
- refresh / sync / local reset の操作

AWS 公開時は `app-config.js` で API Base URL を注入します。

## Operational Notes

### Observability

- Lambda エラーは `logger.error` で出力
- AWS モードでは CloudWatch Logs で追跡
- local モードではターミナルログで追跡

### Validation

validation は `src/utils/validate.ts` に集約されています。

主な対象:

- event 作成入力
- detect 入力
- upload content type
- status 更新値

### Sorting and Filtering

- `GET /events` は `detectedAt` 降順
- `status` と `deviceId` で絞り込み可能

## Trade-Offs

### この設計の強み

- local と aws の両方をほぼ同じ API 体験で扱える
- deep-learning path と fallback path を同居できる
- handler / service / repository の責務が分かれていて拡張しやすい
- UI から検出、保存、運用までの距離が短い

### 今後伸ばしやすい点

- 認証 / 権限制御
- CloudFront による HTTPS frontend 配信
- model versioning / model registry
- 非同期推論キュー
- event pagination / search

## Related Documents

- [API Spec](./api-spec.md)
- [Detection Flow](./detection-flow.md)
