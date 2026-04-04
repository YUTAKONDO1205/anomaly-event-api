# Docs Guide

`docs/` 配下の読み順ガイドです。

## Recommended Reading Order

### 1. 全体像を知りたい

- [Architecture](./architecture.md)

### 2. API を叩きたい

- [API Spec](./api-spec.md)

### 3. 画像検出の流れだけ知りたい

- [Detection Flow](./detection-flow.md)

## Which Doc to Open

| You Want To Know | Open |
| --- | --- |
| このプロジェクトはどう動くか | [Architecture](./architecture.md) |
| どのエンドポイントがあるか | [API Spec](./api-spec.md) |
| local と aws の違い | [Architecture](./architecture.md) |
| 画像アップロードから判定まで | [Detection Flow](./detection-flow.md) |
| `POST /detect` の返り値 | [API Spec](./api-spec.md) |

## Document Roles

### `api-spec.md`

API の入出力仕様、バリデーション、レスポンス例をまとめた利用者向けドキュメントです。

### `architecture.md`

handler / service / repository の責務分割、local / aws モード、永続化、運用視点をまとめた設計ドキュメントです。

### `detection-flow.md`

画像検出に絞って、UI からイベント保存までを時系列で追うためのドキュメントです。
