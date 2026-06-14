"use strict";

// Exercise DetectionService routing + fallback with injected mocks. We run in
// aws / aws-deep-learning mode so detectLabels takes the DL branch, and inject a
// fake AwsDeepLearningService so no Lambda is ever invoked. Env is set before the
// module (and its env.ts) is required.
process.env.APP_STORAGE_MODE = "aws";
process.env.DETECTION_PROVIDER = "aws-deep-learning";
process.env.EVENTS_TABLE = "test-events";
process.env.EVENT_IMAGES_BUCKET = "test-images";
process.env.AWS_DEEP_LEARNING_FUNCTION_NAME = "test-dl-fn";
process.env.DETECTION_TARGET_LABEL = "Positive";
process.env.DETECTION_MIN_CONFIDENCE = "55";

const test = require("node:test");
const assert = require("node:assert/strict");

const { DetectionService } = require("../dist/services/detectionService.js");
const { DeepLearningPermanentError } = require("../dist/utils/errors.js");

function dlResult(overrides = {}) {
  return {
    anomalyDetected: true,
    anomalyConfidence: 90,
    labels: [
      { name: "Positive", confidence: 90 },
      { name: "Negative", confidence: 10 }
    ],
    provider: "aws-deep-learning",
    model: {
      provider: "aws-deep-learning",
      classifier: "MobileNetV2",
      version: "1",
      ready: true,
      trainedAt: null,
      metrics: null,
      dataset: null
    },
    explanation: {
      summary: "crack-like edges detected",
      confidenceBand: "HIGH",
      dominantSignals: ["edge"],
      recommendedAction: "inspect",
      contributions: [],
      focusRegions: [],
      attentionGrid: null,
      heatmap: null
    },
    ...overrides
  };
}

function detectInput(overrides = {}) {
  return {
    deviceId: "d",
    sectionId: "s",
    distance: 1,
    detectedAt: "2026-06-14T00:00:00.000Z",
    imageKey: "images/x.jpg",
    imageDataBase64: "QUJD", // "ABC" — non-empty, never read because the DL service is mocked
    ...overrides
  };
}

function recordingEventService() {
  const created = [];
  return {
    created,
    createEvent: async (input) => {
      created.push(input);
      return { ...input, eventId: "e1", status: "NEW", createdAt: "x", updatedAt: "x" };
    }
  };
}

const throwingPython = { detect: async () => { throw new Error("python should not be called"); } };

test("routes to aws-deep-learning, stores 0-1 confidence and creates an event", async () => {
  const eventService = recordingEventService();
  const aws = { detect: async () => dlResult() };
  const service = new DetectionService(eventService, throwingPython, aws);

  const result = await service.detectAndCreateEvent(detectInput());

  assert.equal(result.anomalyDetected, true);
  assert.equal(result.anomalyConfidence, 90);
  assert.equal(result.provider, "aws-deep-learning");
  assert.equal(result.event.eventId, "e1");
  assert.equal(eventService.created.length, 1);
  assert.equal(eventService.created[0].confidence, 0.9, "anomalyConfidence/100 is persisted");
  assert.equal(eventService.created[0].severity, "HIGH");
});

test("persists the target label as topLabel even when another label outscores it (bug #6)", async () => {
  const eventService = recordingEventService();
  // Independent confidences (Rekognition-style): Negative outscores Positive, but
  // the anomaly decision is on the target label, so topLabel must stay Positive.
  const aws = {
    detect: async () =>
      dlResult({
        anomalyConfidence: 82,
        labels: [
          { name: "Negative", confidence: 88 },
          { name: "Positive", confidence: 82 }
        ]
      })
  };
  const service = new DetectionService(eventService, throwingPython, aws);

  const result = await service.detectAndCreateEvent(detectInput());

  assert.equal(eventService.created[0].topLabel, "Positive");
  assert.equal(result.topLabel.name, "Positive");
});

test("does not create an event when no anomaly is detected", async () => {
  let calls = 0;
  const eventService = { createEvent: async () => { calls += 1; return {}; } };
  const aws = {
    detect: async () =>
      dlResult({
        anomalyDetected: false,
        anomalyConfidence: 10,
        labels: [
          { name: "Negative", confidence: 90 },
          { name: "Positive", confidence: 10 }
        ]
      })
  };
  const service = new DetectionService(eventService, throwingPython, aws);

  const result = await service.detectAndCreateEvent(detectInput());

  assert.equal(result.anomalyDetected, false);
  assert.equal(result.event, null);
  assert.equal(calls, 0);
});

test("falls back to the dataset-label shortcut on a transient DL failure", async () => {
  const eventService = recordingEventService();
  const aws = { detect: async () => { throw new Error("cold start timeout"); } };
  const service = new DetectionService(eventService, throwingPython, aws);

  const result = await service.detectAndCreateEvent(detectInput({ note: "datasetLabel=Positive" }));

  assert.equal(result.provider, "dataset-label");
  assert.equal(result.anomalyDetected, true);
  assert.equal(eventService.created.length, 1);
});

test("rethrows a permanent DL error instead of masking it as a heuristic detection (bug #5)", async () => {
  const aws = {
    detect: async () => {
      throw new DeepLearningPermanentError("Missing environment variable: AWS_DEEP_LEARNING_FUNCTION_NAME");
    }
  };
  const service = new DetectionService({ createEvent: async () => ({}) }, throwingPython, aws);

  await assert.rejects(() => service.detectAndCreateEvent(detectInput()), DeepLearningPermanentError);
});

test("rejects an imageDataBase64 that decodes to nothing", async () => {
  const aws = { detect: async () => dlResult() };
  const service = new DetectionService(recordingEventService(), throwingPython, aws);

  await assert.rejects(
    () => service.detectAndCreateEvent(detectInput({ imageDataBase64: "!!!!" })),
    /did not decode/
  );
});
