# Detection Flow

## Local Mode

```text
Browser UI
  -> POST /upload-url
  -> POST /detect
     -> save local image
     -> PythonDetectionService
        -> python/crack_ml.py
           -> load manifest
           -> train MobileNetV2 if needed
           -> run deep-learning inference
           -> build Grad-CAM explanation
     -> create event when anomalyDetected = true
  -> GET /events
  -> GET /dashboard
```

## Local Detection Output

- `anomalyDetected`
- `anomalyConfidence`
- `provider`
- `processingMs`
- `model`
- `explanation.summary`
- `explanation.contributions`
- `explanation.focusRegions`
- `explanation.attentionGrid`
- `explanation.heatmap.rawDataUrl`
- `explanation.heatmap.overlayDataUrl`

## Local Setup

```bash
npm install
python -m pip install -r requirements.txt
npm run dataset:index
npm run ml:train
npm run local
```

## AWS Mode

```text
Client
  -> API Gateway
  -> Lambda
  -> S3
  -> Rekognition Custom Labels
  -> DynamoDB
```

AWS mode continues to use Rekognition and does not depend on the local deep-learning model.
