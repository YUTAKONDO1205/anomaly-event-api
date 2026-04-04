# API Spec

`anomaly-event-api` が提供する HTTP API の仕様です。

この API は次の 2 つのユースケースを想定しています。

- 画像をアップロードして異常検出を実行する
- 異常イベントを一覧・詳細・ステータス更新で管理する

## Base URL

実行モードごとにベース URL が変わります。

- local モード: `http://127.0.0.1:3000`
- AWS モード: `https://{api-id}.execute-api.{region}.amazonaws.com`

## Response Format

成功時は次の形式で返します。

```json
{
  "message": "OK",
  "data": {}
}
```

エラー時は次の形式です。

```json
{
  "message": "Bad Request"
}
```

## Common Status Codes

| Status | Meaning |
| --- | --- |
| `200` | 正常終了 |
| `201` | 作成成功 |
| `400` | リクエスト不正 |
| `404` | 対象なし |
| `500` | サーバー内部エラー |

## Event Model

```json
{
  "eventId": "3c65b8b4-25f2-41b5-a845-2dc9045f48df",
  "deviceId": "drone-001",
  "sectionId": "A-12",
  "distance": 14.2,
  "detectedAt": "2026-04-04T10:00:00Z",
  "confidence": 0.93,
  "status": "NEW",
  "imageKey": "images/sample.jpg",
  "note": "crack-like anomaly",
  "createdAt": "2026-04-04T10:01:22.000Z",
  "updatedAt": "2026-04-04T10:01:22.000Z"
}
```

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `eventId` | `string` | イベント ID |
| `deviceId` | `string` | 撮影デバイス ID |
| `sectionId` | `string` | 点検区間 ID |
| `distance` | `number` | 対象物までの距離 |
| `detectedAt` | `string` | ISO 8601 形式の検出時刻 |
| `confidence` | `number` | 0 から 1 の信頼度 |
| `status` | `NEW \| CHECKING \| RESOLVED` | イベント状態 |
| `imageKey` | `string` | 画像キー |
| `note` | `string` | 補足メモ |
| `createdAt` | `string` | 作成日時 |
| `updatedAt` | `string` | 更新日時 |

## Endpoints

### POST `/events`

イベントを手動作成します。

#### Request

```json
{
  "deviceId": "drone-001",
  "sectionId": "A-12",
  "distance": 14.2,
  "detectedAt": "2026-04-04T10:00:00Z",
  "confidence": 0.93,
  "imageKey": "images/sample.jpg",
  "note": "crack-like anomaly"
}
```

#### Validation

- `deviceId` は必須の非空文字列
- `sectionId` は必須の非空文字列
- `distance` は `0` 以上の数値
- `detectedAt` は ISO 8601 日時
- `confidence` は `0` 以上 `1` 以下
- `imageKey` は指定時のみ非空文字列
- `note` は指定時のみ文字列

#### Response

`201 Created`

```json
{
  "message": "Event created",
  "data": {
    "eventId": "generated-uuid",
    "deviceId": "drone-001",
    "sectionId": "A-12",
    "distance": 14.2,
    "detectedAt": "2026-04-04T10:00:00Z",
    "confidence": 0.93,
    "status": "NEW",
    "imageKey": "images/sample.jpg",
    "note": "crack-like anomaly",
    "createdAt": "2026-04-04T10:01:22.000Z",
    "updatedAt": "2026-04-04T10:01:22.000Z"
  }
}
```

### GET `/events`

イベント一覧を取得します。

#### Query Parameters

| Name | Type | Description |
| --- | --- | --- |
| `status` | `NEW \| CHECKING \| RESOLVED` | ステータス絞り込み |
| `deviceId` | `string` | デバイス ID 絞り込み |

#### Notes

- `detectedAt` の降順で返します
- local モードではローカル保存、AWS モードでは DynamoDB から取得します

#### Response

`200 OK`

```json
{
  "message": "Events fetched",
  "data": [
    {
      "eventId": "sample-event-id",
      "deviceId": "drone-001",
      "sectionId": "A-12",
      "distance": 14.2,
      "detectedAt": "2026-04-04T10:00:00Z",
      "confidence": 0.93,
      "status": "NEW",
      "imageKey": "images/sample.jpg",
      "note": "crack-like anomaly",
      "createdAt": "2026-04-04T10:01:22.000Z",
      "updatedAt": "2026-04-04T10:01:22.000Z"
    }
  ]
}
```

### GET `/events/{id}`

単一イベントを取得します。

#### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `id` | `string` | イベント ID |

#### Response

`200 OK`

```json
{
  "message": "Event fetched",
  "data": {
    "eventId": "sample-event-id",
    "deviceId": "drone-001",
    "sectionId": "A-12",
    "distance": 14.2,
    "detectedAt": "2026-04-04T10:00:00Z",
    "confidence": 0.93,
    "status": "NEW",
    "imageKey": "images/sample.jpg",
    "note": "crack-like anomaly",
    "createdAt": "2026-04-04T10:01:22.000Z",
    "updatedAt": "2026-04-04T10:01:22.000Z"
  }
}
```

### PATCH `/events/{id}/status`

イベントの状態を更新します。

#### Request

```json
{
  "status": "CHECKING"
}
```

#### Validation

- `status` は `NEW`, `CHECKING`, `RESOLVED` のいずれか

#### Response

`200 OK`

```json
{
  "message": "Event status updated",
  "data": {
    "eventId": "sample-event-id",
    "status": "CHECKING",
    "updatedAt": "2026-04-04T10:05:00.000Z"
  }
}
```

### POST `/upload-url`

画像アップロードのための情報を返します。

#### Request

```json
{
  "contentType": "image/jpeg"
}
```

#### Allowed Content Types

- `image/jpeg`
- `image/png`
- `image/webp`

#### Response in AWS Mode

`200 OK`

```json
{
  "message": "Upload URL generated",
  "data": {
    "key": "images/550e8400-e29b-41d4-a716-446655440000.jpg",
    "bucket": "anomaly-event-images-123456789012-ap-northeast-1",
    "contentType": "image/jpeg",
    "uploadUrl": "https://signed-url.example.com",
    "expiresIn": 300,
    "uploadMode": "presigned"
  }
}
```

#### Response in Local Mode

`200 OK`

```json
{
  "message": "Upload URL generated",
  "data": {
    "key": "images/550e8400-e29b-41d4-a716-446655440000.jpg",
    "bucket": "local-uploads",
    "contentType": "image/jpeg",
    "uploadUrl": "http://127.0.0.1:3000/uploads/images%2F550e8400-e29b-41d4-a716-446655440000.jpg",
    "expiresIn": 0,
    "uploadMode": "inline"
  }
}
```

### POST `/detect`

画像を判定し、異常であればイベントとして保存します。

#### Request

```json
{
  "deviceId": "drone-001",
  "sectionId": "A-12",
  "distance": 14.2,
  "detectedAt": "2026-04-04T10:00:00Z",
  "imageKey": "images/sample.jpg",
  "imageContentType": "image/jpeg",
  "imageDataBase64": "optional-in-local-mode",
  "note": "frontend upload"
}
```

#### Notes

- AWS モードでは通常 `imageKey` を使って S3 上の画像を判定します
- local モードでは `imageDataBase64` を一緒に送ることで、その場で画像を保存して判定できます
- frontend はこの切り替えを自動で処理します

#### Response

`200 OK`

```json
{
  "message": "Anomaly detected and event created",
  "data": {
    "imageKey": "images/sample.jpg",
    "anomalyDetected": true,
    "anomalyConfidence": 92.4,
    "threshold": 80,
    "targetLabel": "Positive",
    "topLabel": {
      "name": "Positive",
      "confidence": 92.4
    },
    "labels": [
      {
        "name": "Positive",
        "confidence": 92.4
      },
      {
        "name": "Negative",
        "confidence": 7.6
      }
    ],
    "event": {
      "eventId": "generated-uuid",
      "deviceId": "drone-001",
      "sectionId": "A-12",
      "distance": 14.2,
      "detectedAt": "2026-04-04T10:00:00Z",
      "confidence": 0.924,
      "status": "NEW",
      "imageKey": "images/sample.jpg",
      "note": "frontend upload",
      "createdAt": "2026-04-04T10:01:22.000Z",
      "updatedAt": "2026-04-04T10:01:22.000Z"
    }
  }
}
```

#### Example When No Anomaly Is Detected

```json
{
  "message": "No anomaly detected",
  "data": {
    "imageKey": "images/sample.jpg",
    "anomalyDetected": false,
    "anomalyConfidence": 12.3,
    "threshold": 50,
    "targetLabel": "Positive",
    "topLabel": {
      "name": "Negative",
      "confidence": 87.7
    },
    "labels": [
      {
        "name": "Negative",
        "confidence": 87.7
      },
      {
        "name": "Positive",
        "confidence": 12.3
      }
    ],
    "event": null
  }
}
```

## Sample Event Files

ローカル検証用のサンプルは `events/` 配下にあります。

- `events/create-event.json`
- `events/get-events.json`
- `events/get-event-by-id.json`
- `events/update-status.json`
- `events/get-upload-url.json`
- `events/detect-image.json`

## Validation Summary

### `status`

- `NEW`
- `CHECKING`
- `RESOLVED`

### `contentType`

- `image/jpeg`
- `image/png`
- `image/webp`

## Related Documents

- [Architecture](./architecture.md)
- [Detection Flow](./detection-flow.md)
