"use strict";

const os = require("node:os");
const path = require("node:path");

// Point the dataset manifest / model artifact at non-existent paths so the
// service's readJsonFile falls back to null — this isolates the aggregation logic.
process.env.APP_STORAGE_MODE = "local";
process.env.DETECTION_PROVIDER = "python";
process.env.DETECTION_MIN_CONFIDENCE = "55";
process.env.DATASET_MANIFEST_FILE = path.join(os.tmpdir(), `anomaly-no-manifest-${process.pid}.json`);
process.env.PYTHON_MODEL_PATH = path.join(os.tmpdir(), `anomaly-no-model-${process.pid}.json`);

const test = require("node:test");
const assert = require("node:assert/strict");

const { DashboardService } = require("../dist/services/dashboardService.js");

function fakeEventService(events) {
  return {
    async getEvents() {
      // EventService already returns newest-first; mirror that contract.
      return [...events].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    }
  };
}

function evt(overrides) {
  return {
    eventId: "x",
    deviceId: "d",
    sectionId: "s",
    distance: 1,
    confidence: 0.5,
    status: "NEW",
    severity: "LOW",
    detectedAt: "2026-06-14T00:00:00.000Z",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    ...overrides
  };
}

test("getSnapshot returns an empty-but-valid snapshot with no events", async () => {
  const service = new DashboardService(fakeEventService([]));
  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.events.total, 0);
  assert.equal(snapshot.events.averageConfidence, 0);
  assert.equal(snapshot.events.latestDetectionAt, null);
  assert.deepEqual(snapshot.events.byStatus, { NEW: 0, CHECKING: 0, RESOLVED: 0 });
  assert.deepEqual(snapshot.events.bySeverity, { LOW: 0, MEDIUM: 0, HIGH: 0 });
  assert.equal(snapshot.model, null, "no model artifact -> model is null");
  assert.equal(snapshot.dataset.totalSamples, 0);
  assert.equal(snapshot.runtime.storageMode, "local");
});

test("getSnapshot aggregates status, severity, average confidence and latest detection", async () => {
  const service = new DashboardService(
    fakeEventService([
      evt({ eventId: "1", status: "NEW", severity: "HIGH", confidence: 0.8, detectedAt: "2026-06-10T00:00:00.000Z" }),
      evt({ eventId: "2", status: "RESOLVED", severity: "LOW", confidence: 0.4, detectedAt: "2026-06-14T00:00:00.000Z" }),
      evt({ eventId: "3", status: "NEW", severity: undefined, confidence: 0.6, detectedAt: "2026-06-12T00:00:00.000Z" })
    ])
  );

  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.events.total, 3);
  assert.deepEqual(snapshot.events.byStatus, { NEW: 2, CHECKING: 0, RESOLVED: 1 });
  assert.deepEqual(snapshot.events.bySeverity, { LOW: 1, MEDIUM: 0, HIGH: 1 });
  // (0.8 + 0.4 + 0.6) / 3 = 0.6
  assert.equal(snapshot.events.averageConfidence, 0.6);
  // newest event first -> 2026-06-14
  assert.equal(snapshot.events.latestDetectionAt, "2026-06-14T00:00:00.000Z");
});

test("getSnapshot exposes runtime configuration and highlights", async () => {
  const service = new DashboardService(fakeEventService([]));
  const snapshot = await service.getSnapshot();

  assert.equal(snapshot.runtime.detectionProvider, "python");
  assert.equal(snapshot.runtime.threshold, 55);
  assert.ok(Array.isArray(snapshot.highlights));
  assert.ok(snapshot.highlights.length >= 1);
  assert.ok(snapshot.highlights[0].includes("PYTHON"));
});
