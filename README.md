# anomaly-event-api

近藤 雄太さん向けの、ひび割れ検知イベント管理 API / UI サンプルです。

Node.js + TypeScript で API を実装し、Python + PyTorch の `MobileNetV2 Transfer Learning` と Grad-CAM を使って画像推論を行います。ローカル実行と AWS 実行の両方に対応しています。

## 概要

- 画像をアップロードして異常検知を実行
- 推論結果から event を保存
- dashboard で runtime / dataset / model / event を確認
- local と AWS の両方で同じ UI / API 体験を提供

## 主な機能

### 検知画面

- 画像アップロード
- `anomalyConfidence` / `topLabel` / `labels` の表示
- `contributions` / `focusRegions` / `attentionGrid` の表示
- `heatmap.rawDataUrl` / `heatmap.overlayDataUrl` の表示

### ダッシュボード

- 使用中の provider / threshold / target label
- dataset の positive / negative / total
- model metrics
- event の status / severity 集計

### イベント操作

- event 一覧取得
- event 詳細取得
- `NEW` / `CHECKING` / `RESOLVED` の更新

## 実行モード

| モード | 保存先 | 推論方式 | 主な用途 |
| --- | --- | --- | --- |
| `local` | `local-storage/uploads`, `local-storage/events/events.json` | Python MobileNetV2 + Grad-CAM | ローカル開発、学習確認 |
| `aws` | S3 + DynamoDB | Python Inference Lambda / Rekognition / Heuristic | AWS 上での公開・検証 |

## 技術スタック

- API: Node.js + TypeScript
- 推論: Python + PyTorch + torchvision
- モデル: `MobileNetV2 Transfer Learning`
- 説明可能性: Grad-CAM
- フロントエンド: HTML / CSS / JavaScript
- AWS: API Gateway + Lambda + DynamoDB + S3 + SAM

## 前提条件

### ローカル開発

- Node.js
- `npm`
- Python
- `pip`

### AWS 実行

- AWS CLI
- AWS SAM CLI
- Docker
- `aws configure` 済みの AWS アカウント

## ローカルで試す

1. 依存関係を入れます。

```bash
npm install
python -m pip install -r requirements.txt
```

2. 学習用画像を配置します。

```text
datasets/
  raw/
    positive/
    negative/
```

3. dataset manifest を作成します。

```bash
npm run dataset:index
```

4. モデルを学習します。

```bash
npm run ml:train
```

5. ローカル API / UI を起動します。

```bash
npm run local
```

起動後の URL:

- Web UI: `http://127.0.0.1:3000`
- Dashboard API: `GET http://127.0.0.1:3000/dashboard`

## おすすめの触り方

初めて触るときは、次の順番がおすすめです。

1. `npm run local` でローカル UI を起動する
2. `Detection Studio` から画像を 1 枚流して推論結果を見る
3. `Control Tower` で model / dataset / event 集計を確認する
4. `Recent Events` で event を開いて status を変更してみる
5. 慣れたら AWS にデプロイして同じ流れを確認する

## 画面の使い方

### Top Bar

- `API Base URL`: 接続先 API を確認できます
- `Refresh Data`: dashboard と event 一覧を再読み込みします
- `Last sync`: 最終同期時刻を表示します

### Detection Studio

入力項目:

1. `Device ID`
2. `Section ID`
3. `Distance`
4. `Note`
5. `Image file`
6. `Upload and Detect`

実行後に確認できるもの:

- 異常判定の有無
- confidence
- labels
- contributions
- focus regions
- attention grid
- heatmap
- overlay
- raw JSON

### Control Tower

主に見る項目:

- detection provider
- threshold / target label
- dataset sample count
- model accuracy / recall / recommended threshold
- latest detection
- event status mix / severity mix

### Recent Events / Selected Event

- 最新の event 一覧を表示します
- 1 件選ぶと詳細を表示します
- `NEW` / `CHECKING` / `RESOLVED` を更新できます

## API を直接試す

### dashboard を確認する

local:

```bash
curl http://127.0.0.1:3000/dashboard
```

aws:

```bash
curl https://{api-id}.execute-api.{region}.amazonaws.com/dashboard
```

### upload-url を取得する

```bash
curl -X POST http://127.0.0.1:3000/upload-url ^
  -H "Content-Type: application/json" ^
  -d "{\"contentType\":\"image/jpeg\"}"
```

### detect を直接呼ぶ

local では `imageDataBase64` を含める形、aws では先に presigned URL で画像を S3 へ PUT してから `imageKey` を指定する形です。実際の request 例は [API仕様](./docs/api-spec.md) と [利用ガイド](./docs/usage-guide.md) にまとめています。

## AWS へデプロイする

### 事前準備

```bash
npm install
python -m pip install -r requirements.txt
npm run dataset:index
npm run ml:train
aws configure
aws sts get-caller-identity
```

### 初回デプロイ

初回、または AWS アカウント / リージョンを変える場合は guided を使います。

```bash
npm run sam:deploy:guided
```

guided 実行時の推奨入力:

- `Confirm changes before deploy`: `N`
- `Allow SAM CLI IAM role creation`: `Y`
- `Disable rollback`: `N`
- `CreateEventFunction has no authentication. Is this okay?`: `Y`
- `GetEventsFunction has no authentication. Is this okay?`: `Y`
- `GetDashboardFunction has no authentication. Is this okay?`: `Y`
- `GetEventByIdFunction has no authentication. Is this okay?`: `Y`
- `UpdateEventStatusFunction has no authentication. Is this okay?`: `Y`
- `GetUploadUrlFunction has no authentication. Is this okay?`: `Y`
- `DetectImageFunction has no authentication. Is this okay?`: `Y`
- `GetUploadedImageFunction has no authentication. Is this okay?`: `Y`
- `Save arguments to configuration file`: `Y`
- `SAM configuration file [samconfig.toml]`: `Enter`
- `SAM configuration environment [default]`: `Enter`

補足:

- このテンプレートの HTTP API は現状パブリック公開前提です。
- 認証なし警告に `N` を入れると `Security Constraints Not Satisfied!` で停止します。

### 通常の再デプロイ

`samconfig.toml` を保存済みなら、以後はこれだけで大丈夫です。

```bash
npm run sam:deploy
```

### フロントエンド公開

API と Lambda のデプロイ後に、静的フロントを S3 Website へ公開します。

```bash
npm run sam:publish-web
```

公開後に確認するもの:

- `ApiUrl`
- `FrontendWebsiteUrl`

注意:

- S3 Website URL は `HTTP` です。
- `HTTPS` で公開したい場合は CloudFront を前段に追加してください。

## provider を切り替える

AWS では `DetectionProvider` で推論方式を切り替えます。

- `aws-deep-learning`
- `rekognition`
- `heuristic`

切り替え方法:

- 初回や設定変更時は `npm run sam:deploy:guided`
- 既存設定を変える場合は `samconfig.toml` の `parameter_overrides` を更新して `npm run sam:deploy`

## 動作確認の流れ

### local

1. `npm run local`
2. `http://127.0.0.1:3000` を開く
3. 画像を 1 枚アップロードして `Upload and Detect`
4. `Recent Events` に新しい event が出るか確認
5. `GET /dashboard` で件数が反映されるか確認

### aws

1. `npm run sam:deploy`
2. `npm run sam:publish-web`
3. `FrontendWebsiteUrl` を開く
4. 画像を 1 枚アップロードして `Upload and Detect`
5. `ApiUrl/dashboard` で dashboard を確認

## AWS スタック削除

### まず試す方法

```bash
sam delete
```

### `sam delete` が失敗したとき

実運用では、`sam delete` が後片付けの途中で `NoSuchBucket` や `DELETE_FAILED` になっても、CloudFormation 側の再削除で片付くことがあります。

```bash
aws cloudformation delete-stack --stack-name anomaly-event-api --region ap-northeast-1
aws cloudformation wait stack-delete-complete --stack-name anomaly-event-api --region ap-northeast-1
```

### S3 バケットが空でなくて削除できないとき

CloudFormation イベントに `The bucket you tried to delete is not empty` が出た場合は、対象バケットを空にしてから再度削除してください。

```bash
aws s3 rm s3://anomaly-event-images-<account>-<region> --recursive
aws s3 rm s3://anomaly-event-frontend-<account>-<region> --recursive
aws cloudformation delete-stack --stack-name anomaly-event-api --region ap-northeast-1
aws cloudformation wait stack-delete-complete --stack-name anomaly-event-api --region ap-northeast-1
```

## よくある詰まりどころ

### `ROLLBACK_COMPLETE state and can not be updated`

前回の失敗スタックが残っています。先に削除してから再デプロイしてください。

```bash
aws cloudformation delete-stack --stack-name anomaly-event-api --region ap-northeast-1
aws cloudformation wait stack-delete-complete --stack-name anomaly-event-api --region ap-northeast-1
npm run sam:deploy
```

### `Unzipped size must be smaller than 262144000 bytes`

Node Lambda のパッケージが大きすぎる状態です。このリポジトリでは `.npmignore` で `datasets` や `local-storage` などを除外して対処しています。データやモデルを追加した場合は、Lambda に不要なファイルが含まれていないか確認してください。

### 画面で `Detection failed with 503`

AWS deep-learning Lambda のコールドスタートで時間がかかると起こります。現在は API 側で短時間で見切って `heuristic-fallback` に切り替える実装にしてあります。CloudWatch Logs では以下を確認してください。

- `DetectImageFunction`
- `DeepLearningInferenceFunction`

### `sam delete` で `NoSuchBucket`

SAM CLI の後片付けでこける場合があります。多くは実リソースがほぼ消えているので、CloudFormation の `delete-stack` を再実行すれば片付くことがあります。

## よく使うコマンド

| コマンド | 用途 |
| --- | --- |
| `npm run build` | TypeScript ビルド |
| `npm run typecheck` | 型チェック |
| `npm run test` | テスト実行 |
| `npm run dataset:index` | dataset manifest 作成 |
| `npm run ml:train` | ローカル学習 |
| `npm run local` | ローカル API / UI 起動 |
| `npm run aws:prepare-deep-learning` | AWS 用モデル artifact 準備 |
| `npm run sam:build` | SAM ビルド |
| `npm run sam:deploy:guided` | 初回デプロイ |
| `npm run sam:deploy` | 通常デプロイ |
| `npm run sam:publish-web` | フロントエンド公開 |
| `sam delete` | SAM でスタック削除 |

## 主要ファイル

| パス | 役割 |
| --- | --- |
| `frontend/` | UI |
| `python/crack_ml.py` | MobileNetV2 学習 / 推論 / Grad-CAM |
| `aws/deep-learning-lambda/handler.py` | AWS deep-learning inference Lambda |
| `scripts/build-dataset-index.mjs` | dataset manifest 作成 |
| `scripts/train-python-model.mjs` | Python 学習実行 |
| `scripts/prepare-aws-deep-learning-artifacts.mjs` | AWS 用モデル artifact 作成 |
| `scripts/publish-frontend-aws.mjs` | S3 Website へフロント公開 |
| `src/services/detectionService.ts` | provider 切り替えと event 作成 |
| `src/services/awsDeepLearningService.ts` | AWS Python Lambda 呼び出し |
| `template.yaml` | SAM テンプレート |

## 関連ドキュメント

- [ドキュメント案内](./docs/README.md)
- [利用ガイド](./docs/usage-guide.md)
- [API仕様](./docs/api-spec.md)
- [検知フロー](./docs/detection-flow.md)
- [アーキテクチャ](./docs/architecture.md)
- [AWS運用メモ](./docs/aws-operations.md)
