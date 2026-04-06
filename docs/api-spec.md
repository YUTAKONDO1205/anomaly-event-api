# API仕様

## Base URL

- local: `http://127.0.0.1:3000`
- aws api: `https://{api-id}.execute-api.{region}.amazonaws.com`
- aws frontend: `http://{frontend-bucket}.s3-website-{region}.amazonaws.com`

## 共通レスポンス形式

正常時:

```json
{
  "message": "OK",
  "data": {}
}
```

エラー時:

```json
{
  "message": "Bad Request"
}
```

## 実行モードごとの違い

### local

- 画像は `local-storage/uploads` に保存
- event は `local-storage/events/events.json` に保存
- `POST /detect` は Python の `crack_ml.py` を使って推論
- `POST /admin/reset-local-database` が利用可能

### aws

- 画像は S3 に保存
- event は DynamoDB に保存
- `POST /detect` は `DetectionProvider` に応じて provider を選択
  - `aws-deep-learning`
  - `rekognition`
  - `heuristic`

## エンドポイント一覧

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/dashboard` | runtime / dataset / model / events の一覧 |
| `GET` | `/events` | event 一覧 |
| `POST` | `/events` | event 手動作成 |
| `GET` | `/events/{id}` | event 詳細 |
| `PATCH` | `/events/{id}/status` | event status 更新 |
| `GET` | `/uploads/{imageKey}` | 保存済み画像の取得 |
| `POST` | `/upload-url` | アップロード先取得 |
| `POST` | `/detect` | 推論実行 |
| `POST` | `/admin/reset-local-database` | local storage 初期化 |

`/admin/reset-local-database` は local 開発専用です。AWS には公開しません。

## `GET /dashboard`

主な返却項目:

- `runtime.storageMode`
- `runtime.detectionProvider`
- `runtime.targetLabel`
- `runtime.threshold`
- `dataset.totalSamples`
- `model.classifier`
- `model.metrics`
- `events.total`
- `events.byStatus`
- `events.bySeverity`
- `highlights`

## `GET /events`

event 一覧を返します。

利用可能な query:

- `status=NEW|CHECKING|RESOLVED`
- `deviceId=...`

レスポンスは `detectedAt` の降順です。

## `POST /events`

手動で event を登録します。

```json
{
  "deviceId": "drone-001",
  "sectionId": "A-12",
  "distance": 12.4,
  "detectedAt": "2026-04-05T00:00:00Z",
  "confidence": 0.81,
  "severity": "MEDIUM",
  "detectionProvider": "aws-deep-learning",
  "topLabel": "Positive",
  "evidenceSummary": "Manual event registration",
  "insightTags": ["manual", "operator"],
  "imageKey": "images/sample.jpg",
  "note": "manual create"
}
```

## `GET /events/{id}`

単一 event を返します。見つからない場合は `404` です。

## `PATCH /events/{id}/status`

```json
{
  "status": "CHECKING"
}
```

設定可能な status:

- `NEW`
- `CHECKING`
- `RESOLVED`

## `GET /uploads/{imageKey}`

保存済み画像を返します。

### local

- `local-storage/uploads` から直接返します

### aws

- S3 の signed URL へリダイレクトします

## `POST /upload-url`

画像アップロード先を返します。

request:

```json
{
  "contentType": "image/jpeg"
}
```

主な response 項目:

- `key`
- `bucket`
- `contentType`
- `uploadUrl`
- `expiresIn`
- `uploadMode`

### local の挙動

- `uploadMode` は `inline`
- 画像本体は `POST /detect` の `imageDataBase64` に含めます

### aws の挙動

- `uploadMode` は `presigned`
- `uploadUrl` は S3 PUT 用 presigned URL です

## `POST /detect`

request:

```json
{
  "deviceId": "drone-001",
  "sectionId": "A-12",
  "distance": 12.4,
  "detectedAt": "2026-04-05T00:00:00Z",
  "imageKey": "images/sample.jpg",
  "imageContentType": "image/jpeg",
  "imageDataBase64": "optional-in-local-mode",
  "note": "frontend upload"
}
```

### provider ごとの違い

- local + `python`: ローカル Python 推論
- aws + `aws-deep-learning`: Python deep-learning Lambda を invoke
- aws + `rekognition`: Rekognition Custom Labels
- aws + `heuristic`: 画像特徴ベースの軽量判定

### 補足

- `aws-deep-learning` が応答できない場合は `heuristic-fallback` に切り替わることがあります
- anomaly と判定された場合は event を作成します

## `POST /admin/reset-local-database`

local 開発専用です。以下を初期化します。

- `local-storage/events/events.json`
- `local-storage/uploads`

## 代表的なステータスコード

- `200`: 正常取得 / 正常更新
- `201`: event 作成成功
- `400`: validation error
- `404`: not found
- `500`: server error
