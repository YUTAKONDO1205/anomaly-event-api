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

```json
{
  "message": "Dashboard snapshot fetched",
  "data": {
    "runtime": {
      "storageMode": "local",
      "detectionProvider": "python",
      "targetLabel": "Positive",
      "threshold": 55
    },
    "dataset": {
      "positiveSamples": 100,
      "negativeSamples": 100,
      "totalSamples": 200,
      "generatedAt": "2026-04-04T15:32:41.287Z"
    },
    "model": {
      "provider": "python",
      "classifier": "Local Crack Logistic Regression",
      "version": "local-crack-ml-v1",
      "trainedAt": "2026-04-04T16:12:00.000Z",
      "ready": true
    },
    "events": {
      "total": 4,
      "averageConfidence": 0.6352,
      "latestDetectionAt": "2026-04-04T16:13:31.000Z",
      "byStatus": {
        "NEW": 4,
        "CHECKING": 0,
        "RESOLVED": 0
      },
      "bySeverity": {
        "LOW": 0,
        "MEDIUM": 1,
        "HIGH": 3
      }
    },
    "highlights": []
  }
}
```

### `GET /events`

List stored events.

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
  "detectedAt": "2026-04-04T10:00:00Z",
  "imageKey": "images/sample.jpg",
  "imageContentType": "image/jpeg",
  "imageDataBase64": "optional-in-local-mode",
  "note": "frontend upload"
}
```

Extended response example:

```json
{
  "message": "Anomaly detected and event created",
  "data": {
    "imageKey": "images/sample.jpg",
    "anomalyDetected": true,
    "anomalyConfidence": 99.37,
    "threshold": 55,
    "targetLabel": "Positive",
    "topLabel": {
      "name": "Positive",
      "confidence": 99.37
    },
    "labels": [],
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
      "dominantSignals": [
        "Hotspot block 1-1",
        "Local contrast"
      ],
      "recommendedAction": "Flag this frame for operator review...",
      "contributions": [],
      "focusRegions": [],
      "attentionGrid": {
        "rows": 6,
        "cols": 6,
        "values": []
      }
    },
    "event": {
      "eventId": "generated-uuid",
      "severity": "HIGH",
      "detectionProvider": "python",
      "topLabel": "Positive",
      "evidenceSummary": "Crack-like structure is dominant..."
    }
  }
}
```
