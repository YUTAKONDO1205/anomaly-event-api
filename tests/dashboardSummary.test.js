"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createEmptyStatusSummary,
  createEmptySeveritySummary,
  incrementStatus,
  incrementSeverity
} = require("../dist/types/dashboard.js");

test("createEmptyStatusSummary starts every status at zero", () => {
  assert.deepEqual(createEmptyStatusSummary(), { NEW: 0, CHECKING: 0, RESOLVED: 0 });
});

test("createEmptySeveritySummary starts every severity at zero", () => {
  assert.deepEqual(createEmptySeveritySummary(), { LOW: 0, MEDIUM: 0, HIGH: 0 });
});

test("incrementStatus tallies each status bucket", () => {
  const summary = createEmptyStatusSummary();
  incrementStatus(summary, "NEW");
  incrementStatus(summary, "NEW");
  incrementStatus(summary, "RESOLVED");
  assert.deepEqual(summary, { NEW: 2, CHECKING: 0, RESOLVED: 1 });
});

test("incrementSeverity tallies a known severity", () => {
  const summary = createEmptySeveritySummary();
  incrementSeverity(summary, "HIGH");
  incrementSeverity(summary, "LOW");
  incrementSeverity(summary, "HIGH");
  assert.deepEqual(summary, { LOW: 1, MEDIUM: 0, HIGH: 2 });
});

test("incrementSeverity ignores undefined severity (events may omit it)", () => {
  const summary = createEmptySeveritySummary();
  incrementSeverity(summary, undefined);
  assert.deepEqual(summary, { LOW: 0, MEDIUM: 0, HIGH: 0 });
});
