# Detection Flow

開発者: 近藤悠太 (Kondo Yuta)

このドキュメントは、画像アップロードから event 保存までの流れを local / aws で追うためのメモです。

## Local Mode

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

### Local でのポイント

- `POST /upload-url` は `inline` モードを返します
- frontend は画像を base64 にして `POST /detect` に含めます
- API は `local-storage/uploads` に画像を保存します
- event は `local-storage/events/events.json` に保存します
- `Refresh Database` は local storage だけを初期化します

## Local Detection Output

主に UI で使うフィールド:

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

## Local Setup

```bash
npm install
python -m pip install -r requirements.txt
npm run dataset:index
npm run ml:train
npm run local
```

## AWS Mode

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
     -> create event when anomalyDetected = true
     -> store event in DynamoDB
  -> GET /dashboard
  -> GET /events
  -> GET /events/{id}
  -> GET /uploads/{imageKey}
     -> redirect to signed S3 URL
```

## AWS Provider Selection

`DetectionProvider` に応じて検知方法が切り替わります。

- `aws-deep-learning`: Python コンテナ Lambda を invoke
- `rekognition`: Rekognition Custom Labels を使用
- `heuristic`: 画像特徴量ベースのフォールバック

既定値は `aws-deep-learning` です。

## AWS Deep-Learning Setup

```bash
npm run ml:train
npm run aws:prepare-deep-learning
npm run sam:deploy
npm run sam:publish-web
```

### setup 時の意味

- `ml:train`: ローカルで学習済みモデルを生成
- `aws:prepare-deep-learning`: 学習済み model json / pt を AWS 配備用ディレクトリへコピー
- `sam:deploy`: API と Python inference Lambda をデプロイ
- `sam:publish-web`: frontend を S3 website へ公開

## UI Refresh Flow

Detection 実行後やボタン操作で次の API が使われます。

### `Refresh Data`

- `GET /dashboard`
- `GET /events`

### `Reload Events`

- `GET /events`

### `Refresh Database`

- `POST /admin/reset-local-database`
- local only

## Failure Points

よく詰まりやすい箇所:

- Python dependencies 未導入
- dataset manifest 未生成
- model 未学習
- 古い `npm run local` が残っていてルート追加が反映されていない
- AWS では Docker build に時間がかかる
- `aws-deep-learning` 利用時に model artifact 未準備
