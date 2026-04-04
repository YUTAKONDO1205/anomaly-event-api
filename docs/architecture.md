# Architecture

このドキュメントは `anomaly-event-api` の構成と責務分割を説明します。

## Goals

このプロジェクトの狙いは次の 3 つです。

- ひび割れ画像を入力して異常検出を実行できること
- 異常だった結果をイベントとして保存・追跡できること
- AWS 本番構成の前に local モードで素早く検証できること

## Runtime Modes

このリポジトリは 2 つの実行モードを持ちます。

| Mode | Storage | Detection | Primary Use |
| --- | --- | --- | --- |
| `local` | ローカルファイル | manifest ベースの簡易分類 | UI 開発、疎通確認、サンプル検証 |
| `aws` | DynamoDB + S3 | Rekognition Custom Labels | サーバレス本番構成 |

## High-Level View

### Local Mode

```text
Browser
  -> Local Dev Server
     -> Handlers
        -> Services
           -> Local Storage
              -> local-storage/uploads
              -> local-storage/events/events.json
```

### AWS Mode

```text
Client / Device
  -> API Gateway (HttpApi)
     -> Lambda Handlers
        -> Services
           -> DynamoDB
           -> S3
           -> Rekognition Custom Labels
           -> CloudWatch Logs
```

## Layered Design

コードは大きく 4 層に分かれています。

### 1. Handler Layer

`src/handlers/`

責務:

- HTTP リクエストを受ける
- バリデーションを呼ぶ
- service を呼ぶ
- HTTP レスポンスへ整形する

代表:

- `createEvent.ts`
- `getEvents.ts`
- `getEventById.ts`
- `updateEventStatus.ts`
- `getUploadUrl.ts`
- `detectImage.ts`

### 2. Service Layer

`src/services/`

責務:

- 業務ロジックの実行
- イベント作成
- アップロード URL 発行
- 異常検出
- local / aws の実行モード差分の吸収

主要サービス:

- `EventService`
- `UploadService`
- `DetectionService`
- `HeuristicDetectionService`

### 3. Repository Layer

`src/repositories/`

責務:

- イベントの永続化
- local モードでは JSON ファイル
- aws モードでは DynamoDB

### 4. Utility Layer

`src/utils/`

責務:

- 環境変数管理
- リクエストバリデーション
- エラーハンドリング
- ログ出力
- レスポンス整形
- ローカルストレージ操作

## Request Flow

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
     -> load image
     -> detect labels
     -> if anomaly: create event
  -> HTTP Response
```

## Detection Strategy

### Local Mode

local モードでは、`datasets/manifests/index.json` に載っている `Positive / Negative` サンプルを読み、
各クラスの特徴量中心を使って簡易判定します。

特徴量の例:

- 明るさ
- コントラスト
- エッジ量
- 暗いエッジ比率
- 暗い画素比率

用途:

- 画面確認
- API のつながり確認
- バッチ投入の確認

制約:

- 本番精度を保証しない
- Rekognition や独自モデルの代替ではなく開発補助向け

### AWS Mode

aws モードでは、S3 に保存された画像を `DetectionService` が読み込み、
Rekognition Custom Labels へ送って `Positive` ラベルの信頼度を評価します。

判定条件:

- `targetLabel` と一致するラベル名
- `DETECTION_MIN_CONFIDENCE` 以上の confidence

## Storage Design

### Local Storage

| Path | Purpose |
| --- | --- |
| `local-storage/uploads` | 受信画像の保存先 |
| `local-storage/events/events.json` | 保存済みイベント |

### AWS Storage

| Resource | Purpose |
| --- | --- |
| DynamoDB `EventsTable` | イベント保存 |
| S3 `EventImagesBucket` | 画像保存 |

## Deployment View

`template.yaml` によって次を定義しています。

- HttpApi
- Lambda Functions
- DynamoDB Table
- S3 Bucket

追加されている主要な関数:

- `CreateEventFunction`
- `GetEventsFunction`
- `GetEventByIdFunction`
- `UpdateEventStatusFunction`
- `GetUploadUrlFunction`
- `DetectImageFunction`

## Operational Notes

### Observability

- Lambda エラーは `logger.error` で出力
- AWS モードでは CloudWatch Logs で追跡
- local モードではターミナルログで追跡

### Validation

入力検証は `src/utils/validate.ts` に集約されています。

代表的な検証:

- event 作成入力
- detection 入力
- upload content type
- status 更新値

### Sorting and Filtering

- `GET /events` は `detectedAt` 降順
- `status` と `deviceId` で絞り込み可能

## Trade-Offs

### この設計の強み

- local と aws の両方を同じ API 体験で扱える
- handler / service / repository の責務が分かれていて拡張しやすい
- UI から検出までのフローが短く、デモしやすい

### 今後伸ばしやすい点

- repository を差し替えて RDB や別ストレージに移行
- detection service を独自モデル API へ差し替え
- frontend を React / Next.js へ差し替え

## Recommended Next Steps

- 異常領域の可視化を追加する
- 検出結果にしきい値や履歴の比較を出す
- 認証と権限制御を追加する
- イベント一覧にページングを追加する

## Related Documents

- [API Spec](./api-spec.md)
- [Detection Flow](./detection-flow.md)
