# Docs Guide

`docs/` 配下の読み方ガイドです。

このフォルダは、実装の全体像、API の使い方、検知の流れを役割ごとに分けてまとめています。最初に全体を知りたい場合はルートの `README.md` を見て、そのあと必要に応じてこの `docs/` を開く構成です。

## まずどれを読むか

### ローカルで最短で動かしたい

- ルートの `README.md`
- [Detection Flow](./detection-flow.md)

### API の入出力を確認したい

- [API Spec](./api-spec.md)

### AWS でどう構成されているか知りたい

- [Architecture](./architecture.md)
- [Detection Flow](./detection-flow.md)

### local と aws の違いを知りたい

- [Architecture](./architecture.md)

## ファイルごとの役割

### `api-spec.md`

API 利用者向けのドキュメントです。

- base URL
- endpoint 一覧
- request / response の形
- local と aws での違い
- deep-learning response の例

### `architecture.md`

設計の見取り図です。

- runtime mode
- handler / service / repository / utility の責務
- storage 設計
- AWS deep-learning Lambda を含む構成
- デプロイ視点の整理

### `detection-flow.md`

画像アップロードから event 保存までの時系列に絞ったドキュメントです。

- local での流れ
- aws での流れ
- upload-url の違い
- provider 切り替えの考え方

## こんなときはこのドキュメント

| 知りたいこと | 開くファイル |
| --- | --- |
| このプロジェクトはどう動くか | [Architecture](./architecture.md) |
| どの API を叩けばいいか | [API Spec](./api-spec.md) |
| ローカルでの検知の流れ | [Detection Flow](./detection-flow.md) |
| AWS deep-learning の流れ | [Detection Flow](./detection-flow.md) |
| local / aws の差分 | [Architecture](./architecture.md) |
| `POST /detect` の返り値 | [API Spec](./api-spec.md) |

## 補足

- UI の使い方、コマンド一覧、環境変数、AWS デプロイ手順はルートの `README.md` を参照してください。
- `docs/` はコードの実装方針を補う位置付けなので、実運用手順はルートの `README.md` を正として更新しています。
