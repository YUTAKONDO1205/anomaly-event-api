# AWS運用メモ

このドキュメントは、AWS へのデプロイ、再デプロイ、フロント公開、削除、トラブルシュートをまとめたものです。

## 初回デプロイ

```bash
npm install
python -m pip install -r requirements.txt
npm run dataset:index
npm run ml:train
aws configure
aws sts get-caller-identity
npm run sam:deploy:guided
```

guided 実行時の推奨入力:

- `Confirm changes before deploy`: `N`
- `Allow SAM CLI IAM role creation`: `Y`
- `Disable rollback`: `N`
- 各 `... has no authentication. Is this okay?`: `Y`
- `Save arguments to configuration file`: `Y`
- `SAM configuration file [samconfig.toml]`: `Enter`
- `SAM configuration environment [default]`: `Enter`

## 通常の再デプロイ

```bash
npm run sam:deploy
```

## フロントエンド公開

```bash
npm run sam:publish-web
```

確認ポイント:

- `ApiUrl`
- `FrontendWebsiteUrl`

## スタック削除

### まずは `sam delete`

```bash
sam delete
```

### `sam delete` がこけたとき

`NoSuchBucket` や `DELETE_FAILED` が出た場合は、CloudFormation 側で再削除します。

```bash
aws cloudformation delete-stack --stack-name anomaly-event-api --region ap-northeast-1
aws cloudformation wait stack-delete-complete --stack-name anomaly-event-api --region ap-northeast-1
```

### S3 バケットが空でないとき

CloudFormation の stack events に `The bucket you tried to delete is not empty` が出た場合は、先にバケットを空にしてください。

```bash
aws s3 rm s3://anomaly-event-images-<account>-<region> --recursive
aws s3 rm s3://anomaly-event-frontend-<account>-<region> --recursive
aws cloudformation delete-stack --stack-name anomaly-event-api --region ap-northeast-1
aws cloudformation wait stack-delete-complete --stack-name anomaly-event-api --region ap-northeast-1
```

## よくあるエラー

### `Security Constraints Not Satisfied!`

guided deploy 中に認証なし警告で `N` を入れたときに出ます。このテンプレートは public API 前提なので、該当質問には `Y` を入れてください。

### `ROLLBACK_COMPLETE state and can not be updated`

失敗した stack が残っています。削除後に再デプロイしてください。

```bash
aws cloudformation delete-stack --stack-name anomaly-event-api --region ap-northeast-1
aws cloudformation wait stack-delete-complete --stack-name anomaly-event-api --region ap-northeast-1
npm run sam:deploy
```

### `Unzipped size must be smaller than 262144000 bytes`

Node Lambda に不要な dataset や local file が含まれている可能性があります。`.npmignore` を確認してください。

### `Detection failed with 503`

AWS deep-learning Lambda のコールドスタートが長いと起こります。現在は fallback 実装ありですが、原因調査時は CloudWatch Logs を確認します。

対象 log group:

- `DetectImageFunction`
- `DeepLearningInferenceFunction`

### `sam delete` で `NoSuchBucket`

SAM CLI の後片付けが失敗しているだけで、実リソースはほぼ削除済みのことがあります。CloudFormation の `delete-stack` を再実行してください。
