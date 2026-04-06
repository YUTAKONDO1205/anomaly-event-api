# アーキテクチャ

このドキュメントは `anomaly-event-api` の構成、責務分離、runtime mode ごとの差分をまとめたものです。

## 目的

- ひび割れ画像を受け取り、異常検知を実行する
- 検知結果を event として保存する
- local と aws の両方で同じ操作感を提供する

## 実行モード

| モード | 保存先 | 推論方式 | 主な用途 |
| --- | --- | --- | --- |
| `local` | ローカルファイル | Python MobileNetV2 + Grad-CAM | 開発、学習確認 |
| `aws` | DynamoDB + S3 | Python Inference Lambda / Rekognition / Heuristic | 公開・運用確認 |

## 全体像

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

## レイヤ構成

### 1. Handler Layer

`src/handlers/`

責務:

- HTTP リクエスト受付
- validation
- service 呼び出し
- HTTP response 整形

主な handler:

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

- 業務ロジックの実装
- upload URL 発行
- provider 切り替え
- event 作成
- local / aws 差分の吸収

主な service:

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

- 環境変数解決
- validation
- response 整形
- logger
- local storage 操作

## 主なリクエストフロー

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

## 検知戦略

### local

- `python/crack_ml.py` で `MobileNetV2 Transfer Learning` を実行
- 必要ならローカルでモデル学習
- Grad-CAM による heatmap 生成
- `focusRegions` / `attentionGrid` / `contributions` を返却

### aws

`DetectionService` が `DetectionProvider` を見て provider を切り替えます。

- `aws-deep-learning`: Python コンテナ Lambda を invoke
- `rekognition`: Rekognition Custom Labels
- `heuristic`: 軽量な特徴量ベース判定

補足:

- `aws-deep-learning` がコールドスタートやタイムアウトで間に合わない場合、API 側で `heuristic-fallback` に切り替える実装です

## 保存設計

### Local Storage

| パス | 用途 |
| --- | --- |
| `local-storage/uploads` | アップロード画像保存 |
| `local-storage/events/events.json` | event 保存 |
| `local-storage/ml` | 学習済みモデルと metadata |

### AWS Storage

| リソース | 用途 |
| --- | --- |
| DynamoDB `EventsTable` | event 保存 |
| S3 `EventImagesBucket` | アップロード画像保存 |
| S3 `FrontendBucket` | フロントエンド公開 |

## デプロイ構成

`template.yaml` で以下を構成します。

- HttpApi
- Node.js Lambda Functions
- Python Deep Learning Image Function
- DynamoDB Table
- S3 Upload Bucket
- S3 Frontend Website Bucket

主な function:

- `CreateEventFunction`
- `GetEventsFunction`
- `GetEventByIdFunction`
- `UpdateEventStatusFunction`
- `GetUploadUrlFunction`
- `DetectImageFunction`
- `GetDashboardFunction`
- `GetUploadedImageFunction`
- `DeepLearningInferenceFunction`

## 運用メモ

### ログ

- Lambda エラーは `logger.error` で出力
- AWS では CloudWatch Logs で確認

### 検証

- validation は `src/utils/validate.ts` に集約
- event 作成、detect 入力、upload content type、status 更新値を検証

### トレードオフ

- local と aws を同じ API で扱うため、provider 切り替えの分岐が増える
- deep-learning path と fallback path を同時に保守する必要がある
- S3 Website は HTTP のみなので、HTTPS が必要なら CloudFront を追加する
