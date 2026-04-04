# Detection Flow

This repository now supports an image-based anomaly detection flow:

1. The frontend requests a signed upload URL from `POST /upload-url`.
2. The browser uploads the image directly to S3.
3. The frontend calls `POST /detect` with the uploaded `imageKey` and event metadata.
4. The Lambda function loads the image from S3 and sends it to Amazon Rekognition Custom Labels.
5. If the configured target label is detected above the threshold, a new event is stored in DynamoDB.

## Required AWS setup

You still need a trained and running Amazon Rekognition Custom Labels model version.

Required environment variables:

- `REKOGNITION_PROJECT_VERSION_ARN`
- `DETECTION_TARGET_LABEL`
- `DETECTION_MIN_CONFIDENCE`

## Local run

### Simple local mode

This mode does not require AWS resources or a Rekognition model ARN.

1. `npm install`
2. `npm run dataset:index`
3. `npm run local`
4. Open `http://127.0.0.1:3000`

### Batch run in local mode

1. Start `npm run local`
2. In a second terminal run `npm run dataset:run`

### AWS-backed mode

1. `npm install`
2. Configure `REKOGNITION_PROJECT_VERSION_ARN`
3. `npm run sam:local`
4. `npm run frontend`

The frontend defaults to `http://127.0.0.1:3000`.
