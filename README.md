# anomaly-event-api

深層学習ベースのひび割れ検知 API と、イベント運用 UI をまとめて試せるローカル検証スタジオです。

Node.js 側の API から Python の推論パイプラインを呼び出し、`MobileNetV2` 転移学習モデルによる判定結果に加えて、Grad-CAM ベースの `attentionGrid`、`focusRegions`、ヒートマップ画像まで返します。

## できること

- 画像をアップロードしてひび割れ判定を実行
- 判定スコア、説明文、注目領域、ヒートマップを UI で確認
- 異常検知時にイベントを自動作成
- `GET /dashboard` で runtime / dataset / model / events を集約表示
- ローカル構成と AWS/SAM 構成を切り替えて利用

## 技術構成

- API: Node.js + TypeScript
- Deep Learning: Python + PyTorch + torchvision
- Model: `MobileNetV2 Transfer Learning`
- Explainability: Grad-CAM
- Local storage: `local-storage/events/events.json`, `local-storage/uploads`
- AWS mode: API Gateway + Lambda + DynamoDB + S3 + Rekognition Custom Labels

## 前提

- `npm` が使える Node.js 環境
- `python` コマンドが使える Python 環境
- `pip` が利用可能であること

## クイックスタート

### 1. 依存関係を入れる

```bash
npm install
python -m pip install -r requirements.txt
```

### 2. データセット index を作る

```bash
npm run dataset:index
```

`datasets/raw/positive` と `datasets/raw/negative` を走査して、`datasets/manifests/index.json` を生成します。

### 3. モデルを学習する

```bash
npm run ml:train
```

生成物:

- メタデータ: `local-storage/ml/crack-local-model.json`
- 重み: `local-storage/ml/crack-local-model.pt`

### 4. ローカルアプリを起動する

```bash
npm run local
```

起動後のアクセス先:

- Web UI: `http://127.0.0.1:3000`
- Dashboard API: `GET http://127.0.0.1:3000/dashboard`

## Web UI の使い方

### Detection Studio

1. `Device ID`, `Section ID`, `Distance` を入力します。
2. 画像ファイルを選びます。
3. `Upload and Detect` を押します。
4. 判定後に以下を確認できます。

- summary
- labels
- signal contributions
- focus regions
- attention grid
- heatmap image
- overlay image

### Operations

- 異常と判定された画像はイベントとして保存されます。
- 一覧からイベント詳細を開けます。
- ステータス更新も UI から行えます。

## 主要コマンド

```bash
npm run build
npm run typecheck
npm run test
npm run dataset:index
npm run dataset:run
npm run ml:train
npm run frontend
npm run local
npm run sam:build
npm run sam:local
npm run sam:deploy
```

コマンドの用途:

- `npm run build`: TypeScript をビルド
- `npm run typecheck`: 型チェックのみ実行
- `npm run test`: ビルド後に Node のテストを実行
- `npm run dataset:index`: 画像一覧 manifest を再生成
- `npm run dataset:run`: データセットに対して一括検知を実行
- `npm run ml:train`: Python モデルを学習
- `npm run frontend`: フロントエンド静的配信のみ起動 (`http://127.0.0.1:4173`)
- `npm run local`: API + frontend をまとめてローカル起動
- `npm run sam:*`: AWS SAM 向けのビルド / ローカル / デプロイ

## データセット設定

`dataset.config.json` を置くと、データセット index 作成時の入力先を切り替えられます。

例:

```json
{
  "positiveDir": "./datasets/raw/positive",
  "negativeDir": "./datasets/raw/negative",
  "outputFile": "./datasets/manifests/index.json",
  "maxImagesPerClass": 0,
  "shuffle": false
}
```

テンプレートは `dataset.config.example.json` にあります。

## ローカルモード

ローカル起動時は `scripts/local-dev-server.mjs` が以下を自動設定します。

- `APP_STORAGE_MODE=local`
- `DETECTION_PROVIDER=python`
- `DETECTION_TARGET_LABEL=Positive`
- `DETECTION_MIN_CONFIDENCE=55`

特徴:

- 画像は `local-storage/uploads` に保存
- イベントは `local-storage/events/events.json` に保存
- `POST /detect` で Python 深層学習推論を実行
- 初回推論時にモデルが無い場合は自動学習

## AWS モード

`.env.example` の値をベースに設定すると、AWS 向け構成でも動かせます。

主な環境変数:

```env
EVENTS_TABLE=AnomalyEvents
EVENT_IMAGES_BUCKET=anomaly-event-images
AWS_REGION=ap-northeast-1
APP_STORAGE_MODE=aws
DETECTION_PROVIDER=rekognition
REKOGNITION_PROJECT_VERSION_ARN=
DETECTION_TARGET_LABEL=Positive
DETECTION_MIN_CONFIDENCE=80
LOCAL_UPLOADS_DIR=local-storage/uploads
LOCAL_EVENTS_FILE=local-storage/events/events.json
```

AWS mode では Rekognition Custom Labels を利用し、ローカルの PyTorch モデルには依存しません。

## `/detect` のレスポンス例

以下は読みやすさのために一部の配列を簡略化したサンプルです。

```json
{
  "message": "Anomaly detected and event created",
  "data": {
    "imageKey": "images/sample.jpg",
    "anomalyDetected": true,
    "anomalyConfidence": 74.15,
    "threshold": 55,
    "targetLabel": "Positive",
    "provider": "python",
    "processingMs": 420,
    "model": {
      "provider": "python",
      "classifier": "MobileNetV2 Transfer Learning",
      "version": "deep-mobilenetv2-v1",
      "trainedAt": "2026-04-05T11:20:41.394682+00:00",
      "ready": true,
      "metrics": {
        "accuracy": 0.9,
        "precision": 1.0,
        "recall": 0.8,
        "f1": 0.8889,
        "auc": 1.0,
        "recommendedThreshold": 0.57
      }
    },
    "explanation": {
      "summary": "Deep model activated around 3 region(s), and the crack probability reached 74.1%.",
      "confidenceBand": "MEDIUM",
      "dominantSignals": [
        "Crack probability",
        "Normal surface probability",
        "Activation block 3-5"
      ],
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
      "severity": "MEDIUM",
      "detectionProvider": "python"
    }
  }
}
```

ヒートマップ関連:

- `explanation.heatmap.rawDataUrl`: ヒートマップ単体画像
- `explanation.heatmap.overlayDataUrl`: 元画像に重ねたオーバーレイ画像

## 主要 API

- `GET /dashboard`
- `GET /events`
- `GET /events/{id}`
- `PATCH /events/{id}/status`
- `POST /upload-url`
- `POST /detect`

詳しい入出力は [docs/api-spec.md](./docs/api-spec.md) を参照してください。

## 主要ファイル

```text
frontend/                         UI
python/crack_ml.py               MobileNetV2 学習 + 推論 + Grad-CAM
scripts/build-dataset-index.mjs  データセット manifest 生成
scripts/train-python-model.mjs   Python 学習起動
scripts/local-dev-server.mjs     ローカル API + frontend 起動
src/services/detectionService.ts 判定統合ロジック
src/services/pythonDetectionService.ts Python 呼び出し
src/handlers/getDashboard.ts     dashboard API
local-storage/ml/                学習済みモデルとメタデータ
```

## Python 依存関係

`requirements.txt`

- `numpy>=2.0.0`
- `Pillow>=11.0.0`
- `torch>=2.11.0`
- `torchvision>=0.26.0`

## よくあるハマりどころ

- `python -m pip install -r requirements.txt` が未実行だと推論時に依存不足で失敗します。
- 学習用画像を追加したら `npm run dataset:index` を再実行してください。
- 初回推論はモデル学習を伴うため時間がかかります。
- ローカル UI で画像が見えない場合は `local-storage/uploads` に保存されているか確認してください。

## 関連ドキュメント

- [API Spec](./docs/api-spec.md)
- [Detection Flow](./docs/detection-flow.md)
- [Architecture](./docs/architecture.md)
