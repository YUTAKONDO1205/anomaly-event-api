# anomaly-event-api

Python ベースのローカル機械学習推論と、イベント運用 UI を一体化したひび割れ検知スタジオです。

今回の構成では、既存の `uav_model.py` / `crack_classifier_mobilenetv2.tflite` にある発想を踏まえつつ、現在のローカル実行環境で確実に動く Python モデルを追加し、Node.js API から呼び出せるようにしています。

## What Changed

- `python/crack_ml.py`
  - dataset manifest からローカル特徴量モデルを自動学習
  - 推論時に `attentionGrid` / `focusRegions` / `contributions` を返却
- `GET /dashboard`
  - dataset / model / event summary を集約
- `POST /detect`
  - `provider`, `processingMs`, `model`, `explanation` を返却
- frontend
  - ランディングページ風の構成へ全面改修
  - ライブ検知、可視化、イベント詳細、ステータス更新を統合

## Local Setup

```bash
npm install
python -m pip install -r requirements.txt
npm run dataset:index
npm run ml:train
npm run local
```

起動後:

- App: `http://127.0.0.1:3000`
- Dashboard API: `GET http://127.0.0.1:3000/dashboard`

## Main Commands

```bash
npm run build
npm run typecheck
npm run dataset:index
npm run ml:train
npm run local
npm run dataset:run
```

## Runtime Modes

### local

- storage: `local-storage/events/events.json`, `local-storage/uploads`
- detection: Python local ML (`DETECTION_PROVIDER=python`)
- purpose: UI / API / explainability の一括検証

### aws

- storage: DynamoDB + S3
- detection: Rekognition Custom Labels
- purpose: サーバレス本番構成

## API Overview

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/dashboard` | runtime / dataset / model / event summary |
| `POST` | `/events` | event manually create |
| `GET` | `/events` | list events |
| `GET` | `/events/{id}` | get event detail |
| `PATCH` | `/events/{id}/status` | update event status |
| `POST` | `/upload-url` | get upload target |
| `POST` | `/detect` | run detection and optionally create event |

## `/detect` Response Additions

`POST /detect` では既存の判定結果に加えて、次の情報を返します。

```json
{
  "provider": "python",
  "processingMs": 184,
  "model": {
    "provider": "python",
    "classifier": "Local Crack Logistic Regression",
    "version": "local-crack-ml-v1",
    "trainedAt": "2026-04-04T16:12:00.000Z",
    "ready": true,
    "metrics": {
      "accuracy": 1,
      "precision": 1,
      "recall": 1,
      "f1": 1,
      "auc": 1,
      "recommendedThreshold": 0.35
    }
  },
  "explanation": {
    "summary": "Crack-like structure is dominant...",
    "confidenceBand": "HIGH",
    "dominantSignals": ["Hotspot block 1-1", "Local contrast"],
    "recommendedAction": "Flag this frame for operator review...",
    "contributions": [],
    "focusRegions": [],
    "attentionGrid": {
      "rows": 6,
      "cols": 6,
      "values": []
    }
  }
}
```

## Environment Variables

### Shared

- `APP_STORAGE_MODE`
- `DETECTION_PROVIDER`
- `DETECTION_TARGET_LABEL`
- `DETECTION_MIN_CONFIDENCE`

### Local Python ML

- `PYTHON_EXECUTABLE`
- `PYTHON_DETECTION_SCRIPT`
- `PYTHON_MODEL_PATH`
- `DATASET_MANIFEST_FILE`

### AWS

- `EVENTS_TABLE`
- `EVENT_IMAGES_BUCKET`
- `REKOGNITION_PROJECT_VERSION_ARN`

## Files

```text
frontend/                  new landing + operations UI
python/crack_ml.py         local ML training + inference
scripts/train-python-model.mjs
src/handlers/getDashboard.ts
src/services/dashboardService.ts
src/services/pythonDetectionService.ts
src/services/detectionService.ts
local-storage/ml/          generated local model artifact
```

## Notes

- 初回の Python 推論時は、モデルアーティファクトが無ければ自動学習します。
- Python 依存が無い場合は `pip install -r requirements.txt` を実行してください。
- local mode では `/uploads/...` から保存画像を再表示できます。

## Related Docs

- [API Spec](./docs/api-spec.md)
- [Detection Flow](./docs/detection-flow.md)
- [Architecture](./docs/architecture.md)
