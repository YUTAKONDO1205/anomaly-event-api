# ドキュメント案内

`docs/` 配下の読み分けガイドです。

## まず読むもの

### 全体像を知りたい

- [README](../README.md)
- [アーキテクチャ](./architecture.md)

### API を使いたい

- [API仕様](./api-spec.md)

### 実際の操作手順を追いたい

- [利用ガイド](./usage-guide.md)

### 検知処理の流れを追いたい

- [検知フロー](./detection-flow.md)

### AWS へのデプロイ / 削除を確認したい

- [AWS運用メモ](./aws-operations.md)

## ファイルごとの役割

### `api-spec.md`

- base URL
- endpoint 一覧
- request / response の形
- local / aws の違い

### `usage-guide.md`

- まず何を試すか
- 画面の使い方
- local / aws での確認手順
- API を直接叩く例

### `architecture.md`

- runtime mode
- handler / service / repository / utility の責務
- storage 設計
- AWS 構成

### `detection-flow.md`

- 画像アップロードから event 保存までの流れ
- local / aws の違い
- provider 切り替え
- 失敗時のフォールバック

### `aws-operations.md`

- 初回デプロイ
- 通常再デプロイ
- フロント公開
- スタック削除
- よくあるエラー対処
