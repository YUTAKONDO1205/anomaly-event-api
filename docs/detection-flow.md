# Detection Flow

このドキュメントは、画像アップロードから異常イベント保存までの流れをまとめたものです。

## Overview

このプロジェクトの検出フローは次の 2 つをサポートしています。

- local モード: AWS 不要で、手元データと簡易分類器で検証
- aws モード: S3 と Rekognition Custom Labels を使った本番寄りフロー

## End-to-End Flow

### UI から見た流れ

```text
Select Image
  -> POST /upload-url
  -> Upload or inline send
  -> POST /detect
  -> Detection Result
  -> Optional Event Creation
  -> GET /events
```

## Local Mode Flow

### What Happens

1. フロントが `POST /upload-url` を呼ぶ
2. API は `uploadMode: "inline"` を返す
3. フロントは画像を base64 で `POST /detect` に送る
4. API は画像を `local-storage/uploads` に保存する
5. `HeuristicDetectionService` が `datasets/manifests/index.json` を使って判定する
6. 異常ありなら `local-storage/events/events.json` にイベントを保存する
7. フロントがイベント一覧を再読込する

### Local Detection Inputs

local モードでは次の情報が使われます。

- `imageKey`
- `imageContentType`
- `imageDataBase64`
- `deviceId`
- `sectionId`
- `distance`
- `detectedAt`

### Local Detection Characteristics

- Rekognition ARN は不要
- `dataset:index` で作った manifest を元に動く
- UI 開発と配線確認に向く
- 厳密な本番精度は目的にしていない

## AWS Mode Flow

### What Happens

1. フロントが `POST /upload-url` を呼ぶ
2. API は `uploadMode: "presigned"` と署名付き URL を返す
3. ブラウザが画像を S3 に直接アップロードする
4. フロントが `POST /detect` を呼ぶ
5. API は S3 から画像を読み込む
6. `DetectionService` が Rekognition Custom Labels に画像を送る
7. `Positive` ラベルが閾値以上ならイベントを DynamoDB に保存する
8. フロントがイベント一覧を再読込する

### Required AWS Settings

- `EVENTS_TABLE`
- `EVENT_IMAGES_BUCKET`
- `REKOGNITION_PROJECT_VERSION_ARN`
- `DETECTION_TARGET_LABEL`
- `DETECTION_MIN_CONFIDENCE`

## Detection Output

`POST /detect` は次の情報を返します。

- `anomalyDetected`
- `anomalyConfidence`
- `threshold`
- `targetLabel`
- `topLabel`
- `labels`
- `event`

## Threshold Behavior

### Local Mode

- 既定値は `50`
- local データでのデモや簡易比較向け

### AWS Mode

- 既定値は `80`
- Rekognition の confidence と比較

## Dataset Preparation

### Image Folders

- `datasets/raw/positive`
- `datasets/raw/negative`

### Manifest Generation

```bash
npm run dataset:index
```

これにより `datasets/manifests/index.json` が作られます。

`dataset.config.json` で次を調整できます。

- `maxImagesPerClass`
- `shuffle`
- `concurrency`

## Local Verification

### Quick Start

```bash
npm install
npm run dataset:index
npm run local
```

ブラウザで `http://127.0.0.1:3000` を開きます。

### Batch Verification

ターミナル 1:

```bash
npm run local
```

ターミナル 2:

```bash
npm run dataset:run
```

## AWS Verification

```bash
npm install
npm run sam:build
npm run sam:local
```

必要に応じて別ターミナルで:

```bash
npm run frontend
```

## Failure Points to Watch

### Local Mode

- `dataset:index` を作っていない
- `Positive / Negative` の画像配置が逆
- WEBP を local 判定で使っている
- 画像枚数が少なすぎて簡易分類が不安定

### AWS Mode

- `REKOGNITION_PROJECT_VERSION_ARN` 未設定
- Rekognition モデルが起動していない
- S3 / DynamoDB の権限不足
- `DETECTION_TARGET_LABEL` が学習ラベル名と一致していない

## Recommended Workflow

一番安全な進め方は次です。

1. local モードで UI と API の配線を固める
2. `dataset:run` でまとめて流し、傾向を見る
3. AWS モードへ切り替える
4. Rekognition で本番精度を確認する

## Related Documents

- [API Spec](./api-spec.md)
- [Architecture](./architecture.md)
