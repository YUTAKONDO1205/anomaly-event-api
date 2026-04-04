# anomaly-event-api

AWS サーバレス構成で作る異常検知イベント管理 API です。

## 概要
デバイスやドローンが検知した異常イベントを保存し、一覧表示・詳細取得・状態更新・画像アップロード用署名付きURL発行を行います。

## 想定構成
- API Gateway
- AWS Lambda
- DynamoDB
- S3
- CloudWatch

## API一覧
- `POST /events`
- `GET /events`
- `GET /events/{id}`
- `PATCH /events/{id}/status`
- `POST /upload-url`

## セットアップ
```bash
npm install
npm run build
sam build
sam local start-api
```

## デプロイ
```bash
sam build
sam deploy --guided
```
