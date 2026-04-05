# anomaly-event-api

開発者: 近藤悠太 (Kondo Yuta)

深層学習ベースのひび割れ検知 API と、イベント運用 UI をまとめて扱う検証スタジオです。

Node.js + TypeScript の API から Python 推論パイプラインを呼び出し、`MobileNetV2 Transfer Learning` による判定結果、Grad-CAM ベースの注目領域、ヒートマップ、イベント保存までを一つの流れで扱えます。ローカルでの検証だけでなく、AWS 上で深層学習を動かす構成も用意しています。

## 概要

このプロジェクトでできることは次のとおりです。

- 画像をアップロードしてひび割れ判定を実行
- 判定スコア、説明文、寄与シグナル、注目領域、ヒートマップを UI で確認
- 異常検知時にイベントを自動作成
- イベント一覧、詳細表示、ステータス更新を Web UI 上で完結
- `GET /dashboard` で runtime / dataset / model / events を集約表示
- ローカル構成と AWS 構成を切り替えて利用

## 主な機能

### Detection Studio

- 画像アップロードと同時に判定を実行
- `anomalyConfidence`、`topLabel`、`labels` を表示
- `contributions` による寄与要素の説明
- `focusRegions` と `attentionGrid` による注目領域の可視化
- `heatmap.rawDataUrl` と `heatmap.overlayDataUrl` によるヒートマップ表示

### Control Tower

- 実行中の provider、threshold、target label の確認
- dataset の positive / negative / total 集計
- model metrics の確認
- event の status / severity 集計

### Event Operations

- 異常検知時に event を自動作成
- 一覧から event 詳細を開いて証拠画像を確認
- `NEW` / `CHECKING` / `RESOLVED` のステータス更新
- `Reload Events` で一覧だけ更新
- `Refresh Data` で dashboard と events を再取得
- `Refresh Database` でローカル保存された events / uploads を削除

### Runtime Modes

| Mode | Storage | Detection | 主な用途 |
| --- | --- | --- | --- |
| `local` | `local-storage/uploads`, `local-storage/events/events.json` | Python MobileNetV2 + Grad-CAM | UI 開発、学習、疎通確認 |
| `aws` | S3 + DynamoDB | Python Inference Lambda / Rekognition / Heuristic | AWS 公開、本番寄り検証 |

## 技術スタック

- API: Node.js + TypeScript
- Deep Learning: Python + PyTorch + torchvision
- Model: `MobileNetV2 Transfer Learning`
- Explainability: Grad-CAM
- Frontend: 静的 HTML / CSS / JavaScript
- AWS: API Gateway + Lambda + Python Inference Lambda + DynamoDB + S3 + SAM

## 前提

### ローカル実行

- Node.js と `npm`
- Python と `pip`

### AWS デプロイ

- AWS CLI
- AWS SAM CLI
- Docker
- AWS 認証設定済みの端末

## ローカルで試す

### 最短手順

1. 依存関係を入れる

```bash
npm install
python -m pip install -r requirements.txt
```

2. 学習用画像を配置する

```text
datasets/
  raw/
    positive/
    negative/
```

3. データセット index を作る

```bash
npm run dataset:index
```

4. モデルを学習する

```bash
npm run ml:train
```

5. ローカルアプリを起動する

```bash
npm run local
```

起動後のアクセス先:

- Web UI: `http://127.0.0.1:3000`
- Dashboard API: `GET http://127.0.0.1:3000/dashboard`

### ローカル起動時の挙動

`npm run local` は `scripts/local-dev-server.mjs` を通して次を自動設定します。

- `APP_STORAGE_MODE=local`
- `DETECTION_PROVIDER=python`
- `DETECTION_TARGET_LABEL=Positive`
- `DETECTION_MIN_CONFIDENCE=55`

特徴:

- 画像は `local-storage/uploads` に保存
- イベントは `local-storage/events/events.json` に保存
- `POST /detect` で Python 深層学習推論を実行
- モデルが無い場合は初回推論時に自動学習

## データセット準備

`datasets/raw/positive` と `datasets/raw/negative` の画像を走査して、`datasets/manifests/index.json` を生成します。

### `dataset.config.json`

必要に応じて入力先を差し替えられます。

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

### 学習で生成されるもの

- `local-storage/ml/crack-local-model.json`
- `local-storage/ml/crack-local-model.pt`

## Web UI の使い方

### Top Bar

- `API Base URL`: 接続先 API を切り替える
- `Refresh Data`: dashboard と events を再取得
- `Last sync ...`: 最終同期時刻を表示

AWS に公開した frontend では `app-config.js` から API URL が自動注入されます。

### Detection Studio

1. `Device ID`
2. `Section ID`
3. `Distance`
4. `Note`
5. `Image file`
6. `Upload and Detect`

判定後に確認できるもの:

- summary
- labels
- signal contributions
- focus regions
- attention grid
- heatmap image
- overlay image
- raw JSON response

### Control Tower

表示される内容:

- runtime provider
- threshold / target label
- dataset sample count
- model accuracy / recall / recommended threshold
- latest detection
- event status mix / severity mix

### Recent Events / Selected Event

- 異常と判定された画像は event として保存されます
- 一覧から event を選ぶと詳細画像と metadata を確認できます
- event detail から status を更新できます

ボタンの意味:

- `Reload Events`: event 一覧のみ更新
- `Refresh Data`: dashboard と event 一覧を更新
- `Refresh Database`: `local-storage/events` と `local-storage/uploads` を削除

`Refresh Database` は local モード専用です。学習済みモデルは削除しません。

## AWS で深層学習を動かす

このリポジトリは AWS 上でも深層学習を動かせます。API は Node.js Lambda、推論は別の Python コンテナ Lambda で実行し、Web UI は S3 静的サイトとして公開できます。

### デプロイされるもの

- HTTP API
- Node.js Lambda handlers
- Python deep-learning inference Lambda
- DynamoDB events table
- S3 upload bucket
- S3 frontend website bucket

### デプロイ手順

1. ローカルでモデルを学習する

```bash
npm run ml:train
```

2. AWS 配備用アーティファクトを準備する

```bash
npm run aws:prepare-deep-learning
```

3. API と deep-learning Lambda をデプロイする

```bash
npm run sam:deploy
```

4. frontend を S3 静的サイトへ公開する

```bash
npm run sam:publish-web
```

[初回セットアップ]
npm install
python -m pip install -r requirements.txt
[データ準備（画像置いたあと）]
npm run dataset:index
npm run ml:train
[AWS設定（1回だけ）]
aws configure
aws sts get-caller-identity
[デプロイ]
npm run sam:deploy
[フロント公開]
npm run sam:publish-web


### AWS 配備時の補足

- `sam build` / `sam deploy` は Python 推論 Lambda をコンテナイメージでビルドするため Docker が必要です
- `aws:prepare-deep-learning` は `local-storage/ml/crack-local-model.json` と `local-storage/ml/crack-local-model.pt` を参照します
- `sam:deploy` は `sam build` を含みます
- `samconfig.toml` の既定 stack name は `anomaly-event-api` です

別の stack name を使う場合:

```bash
npm run sam:publish-web -- --stack-name your-stack-name
```

CloudFormation Outputs:

- `ApiUrl`
- `DeepLearningFunctionName`
- `FrontendBucketName`
- `FrontendWebsiteUrl`

`sam:publish-web` は `FrontendWebsiteUrl` 用の S3 bucket へ frontend 一式をアップロードし、`app-config.js` に `ApiUrl` を自動注入します。

注意:

- S3 website endpoint は HTTP です。HTTPS が必要な場合は CloudFront を別途追加してください
- 初回の `sam build` は PyTorch を含むため時間がかかります

## AWS 上の検知プロバイダ

AWS では `DetectionProvider` パラメータで provider を切り替えられます。

- `aws-deep-learning`: Python コンテナ Lambda 上で MobileNetV2 + Grad-CAM を実行
- `rekognition`: Rekognition Custom Labels を利用
- `heuristic`: 画像特徴量ベースのフォールバック

既定値は `aws-deep-learning` です。

## 環境変数

よく使うものを抜粋しています。

| Name | 用途 |
| --- | --- |
| `APP_STORAGE_MODE` | `local` / `aws` の切り替え |
| `DETECTION_PROVIDER` | `python` / `aws-deep-learning` / `rekognition` / `heuristic` |
| `DETECTION_TARGET_LABEL` | 異常扱いする target label |
| `DETECTION_MIN_CONFIDENCE` | 異常判定 threshold |
| `EVENTS_TABLE` | AWS の DynamoDB table 名 |
| `EVENT_IMAGES_BUCKET` | AWS の S3 bucket 名 |
| `AWS_REGION` | AWS region |
| `AWS_DEEP_LEARNING_FUNCTION_NAME` | `aws-deep-learning` を手動で使うときの Lambda 名 |
| `REKOGNITION_PROJECT_VERSION_ARN` | Rekognition Custom Labels を使うときの ARN |
| `LOCAL_UPLOADS_DIR` | local mode の画像保存先 |
| `LOCAL_EVENTS_FILE` | local mode の event JSON 保存先 |
| `PYTHON_EXECUTABLE` | ローカル Python 実行ファイル名 |
| `PYTHON_MODEL_PATH` | モデル artifact JSON のパス |

`.env.example` には AWS 向けの基本値が入っています。

## 主要コマンド

| Command | 用途 |
| --- | --- |
| `npm run build` | TypeScript をビルド |
| `npm run typecheck` | 型チェックのみ実行 |
| `npm run test` | Node のテストを実行 |
| `npm run dataset:index` | dataset manifest を再生成 |
| `npm run dataset:run` | dataset 一括検知を実行 |
| `npm run ml:train` | Python モデルを学習 |
| `npm run frontend` | frontend 静的配信のみ起動 |
| `npm run local` | API + frontend をローカル起動 |
| `npm run aws:prepare-deep-learning` | AWS 用にモデル artifact をコピー |
| `npm run sam:build` | AWS deep-learning Lambda を含めて SAM build |
| `npm run sam:local` | SAM Local で API を起動 |
| `npm run sam:deploy` | AWS へデプロイ |
| `npm run sam:publish-web` | frontend を S3 website へ公開 |

## 生成物と保存先

| Path | 内容 |
| --- | --- |
| `datasets/manifests/index.json` | データセット index |
| `local-storage/ml/crack-local-model.json` | ローカルモデル metadata |
| `local-storage/ml/crack-local-model.pt` | ローカルモデル weights |
| `local-storage/events/events.json` | ローカル event 保存先 |
| `local-storage/uploads/` | ローカル画像保存先 |
| `aws/deep-learning-artifacts/model/` | AWS deep-learning Lambda 用にコピーしたモデル |

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
    "provider": "aws-deep-learning",
    "processingMs": 420,
    "model": {
      "provider": "aws-deep-learning",
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
      "detectionProvider": "aws-deep-learning"
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
- `GET /uploads/{imageKey}`
- `PATCH /events/{id}/status`
- `POST /upload-url`
- `POST /detect`

`GET /uploads/{imageKey}` の挙動:

- local: `local-storage/uploads` から画像を返す
- aws: 短命な S3 signed URL へリダイレクトする

詳しい入出力は [docs/api-spec.md](./docs/api-spec.md) を参照してください。

## 主要ファイル

```text
frontend/                               UI
python/crack_ml.py                      MobileNetV2 学習 + 推論 + Grad-CAM
aws/deep-learning-lambda/handler.py     AWS deep-learning inference Lambda
scripts/build-dataset-index.mjs         データセット manifest 生成
scripts/train-python-model.mjs          Python 学習起動
scripts/prepare-aws-deep-learning-artifacts.mjs
                                        AWS 配備用モデルコピー
scripts/local-dev-server.mjs            ローカル API + frontend 起動
scripts/publish-frontend-aws.mjs        S3 website へ frontend 公開
src/services/detectionService.ts        判定統合ロジック
src/services/pythonDetectionService.ts  ローカル Python 呼び出し
src/services/awsDeepLearningService.ts  AWS Python Lambda 呼び出し
src/handlers/getDashboard.ts            dashboard API
template.yaml                           SAM テンプレート
```

## Python 依存関係

`requirements.txt`

- `numpy>=2.0.0`
- `Pillow>=11.0.0`
- `torch>=2.11.0`
- `torchvision>=0.26.0`

## よくあるハマりどころ

- `python -m pip install -r requirements.txt` が未実行だと推論時に依存不足で失敗します
- 学習用画像を追加したら `npm run dataset:index` を再実行してください
- 初回推論はモデル学習を伴うため時間がかかります
- `Refresh Database` は local モード専用です
- `Database reset failed` が出るときは、古い `npm run local` が残っていて新しいルートが反映されていないことがあります
- AWS deep-learning 配備時は Docker build に時間がかかります
- `DETECTION_PROVIDER=aws-deep-learning` を手動指定する場合は `AWS_DEEP_LEARNING_FUNCTION_NAME` も必要です
- ローカル UI で画像が見えない場合は `local-storage/uploads` と `GET /uploads/{imageKey}` の応答を確認してください

## 関連ドキュメント

- [API Spec](./docs/api-spec.md)
- [Detection Flow](./docs/detection-flow.md)
- [Architecture](./docs/architecture.md)
