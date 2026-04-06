# 利用ガイド

このドキュメントは、「何から触ればよいか」「画面をどう使うか」「API をどう試すか」をまとめた実用ガイドです。

## まず何を試すか

おすすめの順番:

1. `npm run local` でローカル起動
2. 画像を 1 枚流して推論を確認
3. event 一覧と dashboard の変化を見る
4. 必要なら AWS にデプロイして同じ流れを確認

## ローカルでの使い方

### 起動

```bash
npm install
python -m pip install -r requirements.txt
npm run dataset:index
npm run ml:train
npm run local
```

### 触る順番

1. `http://127.0.0.1:3000` を開く
2. `Detection Studio` に `Device ID` と `Section ID` を入れる
3. 画像を選ぶ
4. `Upload and Detect` を押す
5. 結果の `summary` と `heatmap` を確認する
6. `Recent Events` に event が出るか確認する

## AWS での使い方

### デプロイ

```bash
npm run sam:deploy
npm run sam:publish-web
```

### 確認

1. `FrontendWebsiteUrl` を開く
2. 画像を 1 枚アップロードする
3. `Upload and Detect` を押す
4. `ApiUrl/dashboard` で dashboard を確認する
5. `Recent Events` で event が保存されているか確認する

## 画面の使い方

### Detection Studio

役割:

- 画像をアップロードして推論を実行する
- 推論結果と説明情報を見る

見どころ:

- `anomalyConfidence`
- `topLabel`
- `contributions`
- `focusRegions`
- `attentionGrid`
- `heatmap`

### Control Tower

役割:

- runtime 設定と model / dataset 状態を確認する

主に見る値:

- detection provider
- threshold
- target label
- dataset sample count
- model accuracy / recall / recommended threshold

### Recent Events

役割:

- 保存済み event 一覧を見る
- 選択した event の status を更新する

## API を直接試す

### `GET /dashboard`

```bash
curl http://127.0.0.1:3000/dashboard
```

### `GET /events`

```bash
curl http://127.0.0.1:3000/events
```

### `POST /upload-url`

```bash
curl -X POST http://127.0.0.1:3000/upload-url ^
  -H "Content-Type: application/json" ^
  -d "{\"contentType\":\"image/jpeg\"}"
```

### `POST /detect`

local では `imageDataBase64` を含めます。aws では先に `POST /upload-url` で presigned URL を取り、画像を PUT してから `imageKey` を指定します。

## よくある確認ポイント

### 推論は成功したのに event が増えない

- anomaly 判定が `false` だと event は作成されません
- response の `anomalyDetected` を確認してください

### 画面に `Detection failed with 503` が出る

- deep-learning Lambda のコールドスタートが長い場合があります
- 現在は `heuristic-fallback` に切り替わることがあります
- CloudWatch Logs で `DetectImageFunction` と `DeepLearningInferenceFunction` を確認してください

### dashboard の件数が変わらない

- `Refresh Data` を押してください
- API Base URL が別環境を向いていないか確認してください
