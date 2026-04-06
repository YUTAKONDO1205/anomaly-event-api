# 検知フロー

このドキュメントは、画像アップロードから event 保存までの流れを local / aws それぞれでまとめたものです。

## local の流れ

```text
Browser UI
  -> POST /upload-url
     -> uploadMode = inline
  -> POST /detect
     -> save local image
     -> PythonDetectionService
        -> python/crack_ml.py
           -> load manifest
           -> train MobileNetV2 if needed
           -> run deep-learning inference
           -> build Grad-CAM explanation
     -> create event when anomalyDetected = true
  -> GET /dashboard
  -> GET /events
  -> GET /events/{id}
  -> GET /uploads/{imageKey}
```

### 補足

- `POST /upload-url` は `inline` モードを返します
- frontend は画像を base64 にして `POST /detect` に含めます
- API は `local-storage/uploads` に画像を保存します
- event は `local-storage/events/events.json` に保存されます

## local で UI に返す主な項目

- `anomalyDetected`
- `anomalyConfidence`
- `provider`
- `processingMs`
- `model`
- `explanation.summary`
- `explanation.contributions`
- `explanation.focusRegions`
- `explanation.attentionGrid`
- `explanation.heatmap.rawDataUrl`
- `explanation.heatmap.overlayDataUrl`
- `event`

## local セットアップ

```bash
npm install
python -m pip install -r requirements.txt
npm run dataset:index
npm run ml:train
npm run local
```

## aws の流れ

```text
Browser UI
  -> POST /upload-url
     -> uploadMode = presigned
  -> PUT image to S3 presigned URL
  -> POST /detect
     -> DetectImage Lambda
        -> load image bytes from S3
        -> choose provider by DetectionProvider
           -> aws-deep-learning
              -> invoke DeepLearningInferenceFunction
                 -> load packaged MobileNetV2 weights
                 -> run deep-learning inference
                 -> build Grad-CAM explanation
           -> rekognition
           -> heuristic
           -> heuristic-fallback when deep-learning is unavailable
     -> create event when anomalyDetected = true
     -> store event in DynamoDB
  -> GET /dashboard
  -> GET /events
  -> GET /events/{id}
  -> GET /uploads/{imageKey}
     -> redirect to signed S3 URL
```

## AWS provider 切り替え

`DetectionProvider` に応じて推論方法を切り替えます。

- `aws-deep-learning`: Python コンテナ Lambda を invoke
- `rekognition`: Rekognition Custom Labels
- `heuristic`: 画像特徴量ベース判定

既定値は `aws-deep-learning` です。

## AWS deep-learning セットアップ

```bash
npm run ml:train
npm run aws:prepare-deep-learning
npm run sam:deploy
npm run sam:publish-web
```

### 補足

- `ml:train`: ローカルで学習済みモデルを作る
- `aws:prepare-deep-learning`: 学習済み `json` / `pt` を AWS 用 artifact にコピー
- `sam:deploy`: API と Python inference Lambda をデプロイ
- `sam:publish-web`: frontend を S3 Website に公開

## 画面更新フロー

### `Refresh Data`

- `GET /dashboard`
- `GET /events`

### `Reload Events`

- `GET /events`

### `Refresh Database`

- `POST /admin/reset-local-database`
- local 専用

## 失敗しやすいポイント

- Python dependencies 未導入
- dataset manifest 未作成
- model 未学習
- `npm run local` 再起動前に古い state が残る
- AWS では Docker build に時間がかかる
- `aws-deep-learning` 用 artifact 未作成
- コールドスタート時に deep-learning Lambda が遅い

## 実運用メモ

- 以前は AWS deep-learning Lambda のコールドスタートが長く、画面で `Detection failed with 503` が出ることがありました
- 現在は API 側で一定時間で見切って `heuristic-fallback` に切り替える実装です
- 503 や timeout を調べるときは CloudWatch Logs の `DetectImageFunction` と `DeepLearningInferenceFunction` を確認してください
