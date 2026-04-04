# Detection Flow

## Local Mode

```text
Browser UI
  -> POST /upload-url
  -> POST /detect
     -> write local image
     -> PythonDetectionService
        -> python/crack_ml.py
           -> load manifest
           -> train model if needed
           -> infer confidence + explanation
     -> create event when anomalyDetected = true
  -> GET /events
  -> GET /dashboard
```

### Local Detection Output

- `anomalyDetected`
- `anomalyConfidence`
- `provider`
- `processingMs`
- `model`
- `explanation.summary`
- `explanation.contributions`
- `explanation.focusRegions`
- `explanation.attentionGrid`

### Local Setup

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

AWS mode continues to use Rekognition and does not rely on the local Python model.
