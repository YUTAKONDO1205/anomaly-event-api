# API Spec

## Base URL

- local: `http://127.0.0.1:3000`
- aws api: `https://{api-id}.execute-api.{region}.amazonaws.com`
- aws frontend: `http://{frontend-bucket}.s3-website-{region}.amazonaws.com`

## Common Response Shape

成功レスポンスは基本的に次の形です。

```json
{
  "message": "OK",
  "data": {}
}
```

エラー時は通常 `data` を含まず、`message` に理由が入ります。

```json
{
  "message": "Bad Request"
}
```

## Runtime Notes

### local

- 画像は `local-storage/uploads` に保存されます
- event は `local-storage/events/events.json` に保存されます
- `POST /detect` は Python の `crack_ml.py` を使って推論します
- `POST /admin/reset-local-database` は local dev server 専用です

### aws

- 画像は S3 に保存されます
- event は DynamoDB に保存されます
- `POST /detect` は `DetectionProvider` に応じて provider を切り替えます
  - `aws-deep-learning`
  - `rekognition`
  - `heuristic`

## Endpoints Summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/dashboard` | runtime / dataset / model / events の集約 |
| `GET` | `/events` | event 一覧取得 |
| `POST` | `/events` | event 手動作成 |
| `GET` | `/events/{id}` | event 詳細取得 |
| `PATCH` | `/events/{id}/status` | event status 更新 |
| `GET` | `/uploads/{imageKey}` | 保存画像取得 |
| `POST` | `/upload-url` | アップロード先生成 |
| `POST` | `/detect` | 画像判定実行 |
| `POST` | `/admin/reset-local-database` | local storage 初期化 |

`/admin/reset-local-database` は local dev server 専用です。SAM / AWS には出ません。

## `GET /dashboard`

runtime、dataset、model、events の snapshot を返します。

主なフィールド:

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

Optional query:

- `status=NEW|CHECKING|RESOLVED`
- `deviceId=...`

レスポンスは `detectedAt` 降順です。

## `POST /events`

event を手動作成します。

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

単一の event を返します。

- 存在しない場合は `404`

## `PATCH /events/{id}/status`

```json
{
  "status": "CHECKING"
}
```

許可される status:

- `NEW`
- `CHECKING`
- `RESOLVED`

## `GET /uploads/{imageKey}`

保存画像を返します。

### local

- `local-storage/uploads` から直接返します

### aws

- 短命な S3 signed URL へリダイレクトします

## `POST /upload-url`

アップロード先を生成します。

request:

```json
{
  "contentType": "image/jpeg"
}
```

response の主なフィールド:

- `key`
- `bucket`
- `contentType`
- `uploadUrl`
- `expiresIn`
- `uploadMode`

### local の挙動

- `uploadMode` は `inline`
- `uploadUrl` は local dev server の `/uploads/...`
- 実際の画像 bytes は `POST /detect` の `imageDataBase64` に含めます

### aws の挙動

- `uploadMode` は `presigned`
- `uploadUrl` は S3 PUT 用の presigned URL
- frontend はまずこの URL に PUT し、その後 `POST /detect` を叩きます

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
- aws + `heuristic`: 画像特徴量ベースのフォールバック

### deep-learning response example

```json
{
  "message": "Anomaly detected and event created",
  "data": {
    "imageKey": "images/sample.jpg",
    "anomalyDetected": true,
    "anomalyConfidence": 97.2,
    "threshold": 55,
    "targetLabel": "Positive",
    "topLabel": {
      "name": "Positive",
      "confidence": 97.2
    },
    "provider": "aws-deep-learning",
    "processingMs": 420,
    "model": {
      "provider": "aws-deep-learning",
      "classifier": "MobileNetV2 Transfer Learning",
      "version": "deep-mobilenetv2-v1",
      "trainedAt": "2026-04-05T00:00:00.000Z",
      "ready": true,
      "metrics": {
        "accuracy": 0.98,
        "precision": 0.98,
        "recall": 0.98,
        "f1": 0.98,
        "auc": 0.99,
        "recommendedThreshold": 0.42
      }
    },
    "explanation": {
      "summary": "Deep model activated around...",
      "confidenceBand": "HIGH",
      "dominantSignals": [
        "Crack probability",
        "Activation block 1-1"
      ],
      "recommendedAction": "Flag this frame for operator review...",
      "contributions": [],
      "focusRegions": [],
      "attentionGrid": {
        "rows": 6,
        "cols": 6,
        "values": []
      },
      "heatmap": {
        "width": 160,
        "height": 160,
        "alpha": 0.42,
        "rawDataUrl": "data:image/png;base64,...",
        "overlayDataUrl": "data:image/png;base64,..."
      }
    },
    "event": {
      "eventId": "generated-uuid",
      "severity": "HIGH",
      "detectionProvider": "aws-deep-learning"
    }
  }
}
```

ヒートマップ関連:

- `explanation.heatmap.rawDataUrl`: ヒートマップ単体画像
- `explanation.heatmap.overlayDataUrl`: 元画像に重ねたオーバーレイ画像

## `POST /admin/reset-local-database`

local dev server 専用です。

ローカル保存の次を削除します。

- `local-storage/events/events.json`
- `local-storage/uploads`

学習済みモデルは削除しません。

## Typical Status Codes

- `200`: 正常取得 / 正常更新
- `201`: event 作成成功
- `400`: validation error
- `404`: event or image not found
- `500`: unexpected server error
