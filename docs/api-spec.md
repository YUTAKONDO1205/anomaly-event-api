# API Spec

## Base URL

- local: `http://127.0.0.1:3000`
- aws: `https://{api-id}.execute-api.{region}.amazonaws.com`

## Response Shape

```json
{
  "message": "OK",
  "data": {}
}
```

## Endpoints

### `GET /dashboard`

Returns runtime, dataset, model, and event summary.

### `GET /events`

List events.

Optional query:

- `status=NEW|CHECKING|RESOLVED`
- `deviceId=...`

### `GET /events/{id}`

Returns a single event.

### `PATCH /events/{id}/status`

```json
{
  "status": "CHECKING"
}
```

### `POST /upload-url`

```json
{
  "contentType": "image/jpeg"
}
```

### `POST /detect`

```json
{
  "deviceId": "drone-001",
  "sectionId": "A-12",
  "distance": 12.4,
  "detectedAt": "2026-04-05T00:00:00Z",
  "imageKey": "images/sample.jpg",
  "imageContentType": "image/jpeg",
  "imageDataBase64": "optional-in-local-mode",
  "note": "frontend upload"
}
```

Deep learning response example:

```json
{
  "message": "Anomaly detected and event created",
  "data": {
    "imageKey": "images/sample.jpg",
    "anomalyDetected": true,
    "anomalyConfidence": 97.2,
    "threshold": 55,
    "targetLabel": "Positive",
    "topLabel": {
      "name": "Positive",
      "confidence": 97.2
    },
    "provider": "python",
    "processingMs": 420,
    "model": {
      "provider": "python",
      "classifier": "MobileNetV2 Transfer Learning",
      "version": "deep-mobilenetv2-v1",
      "trainedAt": "2026-04-05T00:00:00.000Z",
      "ready": true,
      "metrics": {
        "accuracy": 0.98,
        "precision": 0.98,
        "recall": 0.98,
        "f1": 0.98,
        "auc": 0.99,
        "recommendedThreshold": 0.42
      }
    },
    "explanation": {
      "summary": "Deep model activated around...",
      "confidenceBand": "HIGH",
      "dominantSignals": [
        "Crack probability",
        "Activation block 1-1"
      ],
      "recommendedAction": "Flag this frame for operator review...",
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
      "severity": "HIGH",
      "detectionProvider": "python"
    }
  }
}
```

`explanation.heatmap.rawDataUrl` returns the Grad-CAM heatmap image, and `explanation.heatmap.overlayDataUrl` returns the same heatmap blended onto the input image.
