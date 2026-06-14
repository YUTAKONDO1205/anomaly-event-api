"use strict";

// Pure validation-layer tests. validate.ts has no I/O and reads no env at import
// time, but we set local mode defensively so transitive imports never throw.
process.env.APP_STORAGE_MODE = process.env.APP_STORAGE_MODE || "local";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseJson,
  validateCreateEventInput,
  validateListEventsQuery,
  validateUpdateStatusInput,
  isValidUpdateStatusInput,
  validateUploadUrlInput,
  validateDetectImageInput,
  allowedEventStatuses,
  allowedEventSeverities,
  allowedUploadContentTypes
} = require("../dist/utils/validate.js");
const { RequestValidationError } = require("../dist/utils/errors.js");

function validCreateEventInput(overrides = {}) {
  return {
    deviceId: "device-1",
    sectionId: "section-1",
    distance: 12.5,
    detectedAt: "2026-06-14T10:00:00.000Z",
    confidence: 0.82,
    ...overrides
  };
}

function validDetectImageInput(overrides = {}) {
  return {
    deviceId: "device-1",
    sectionId: "section-1",
    distance: 0,
    detectedAt: "2026-06-14T10:00:00.000Z",
    imageKey: "images/abc.jpg",
    ...overrides
  };
}

test("allow-lists expose the documented enum values", () => {
  assert.deepEqual(allowedEventStatuses, ["NEW", "CHECKING", "RESOLVED"]);
  assert.deepEqual(allowedEventSeverities, ["LOW", "MEDIUM", "HIGH"]);
  assert.deepEqual(allowedUploadContentTypes, ["image/jpeg", "image/png", "image/webp"]);
});

test("parseJson returns null for empty bodies", () => {
  assert.equal(parseJson(null), null);
  assert.equal(parseJson(undefined), null);
  assert.equal(parseJson(""), null);
});

test("parseJson parses a valid JSON object", () => {
  assert.deepEqual(parseJson('{"a":1,"b":"two"}'), { a: 1, b: "two" });
});

test("parseJson throws RequestValidationError on malformed JSON", () => {
  assert.throws(() => parseJson("{not json"), RequestValidationError);
  assert.throws(() => parseJson("{not json"), /valid JSON/i);
});

test("validateCreateEventInput accepts a fully valid payload", () => {
  assert.deepEqual(validateCreateEventInput(validCreateEventInput()), []);
});

test("validateCreateEventInput accepts valid optional fields", () => {
  const input = validCreateEventInput({
    severity: "HIGH",
    detectionProvider: "python",
    topLabel: "Positive",
    evidenceSummary: "crack-like edges",
    insightTags: ["edge", "dark"],
    imageKey: "images/a.png",
    note: ""
  });
  assert.deepEqual(validateCreateEventInput(input), []);
});

test("validateCreateEventInput requires a body", () => {
  assert.deepEqual(validateCreateEventInput(null), ["Request body is required"]);
});

test("validateCreateEventInput flags missing/blank string ids", () => {
  const errors = validateCreateEventInput(validCreateEventInput({ deviceId: "  ", sectionId: undefined }));
  assert.ok(errors.some((e) => e.includes("deviceId")));
  assert.ok(errors.some((e) => e.includes("sectionId")));
});

test("validateCreateEventInput rejects negative or non-finite distance", () => {
  assert.ok(validateCreateEventInput(validCreateEventInput({ distance: -1 })).some((e) => e.includes("distance")));
  assert.ok(validateCreateEventInput(validCreateEventInput({ distance: Number.NaN })).some((e) => e.includes("distance")));
  assert.ok(validateCreateEventInput(validCreateEventInput({ distance: "5" })).some((e) => e.includes("distance")));
  // boundary: zero is allowed
  assert.deepEqual(validateCreateEventInput(validCreateEventInput({ distance: 0 })), []);
});

test("validateCreateEventInput rejects an invalid detectedAt", () => {
  assert.ok(
    validateCreateEventInput(validCreateEventInput({ detectedAt: "not-a-date" })).some((e) => e.includes("detectedAt"))
  );
});

test("validateCreateEventInput constrains confidence to [0,1]", () => {
  assert.ok(validateCreateEventInput(validCreateEventInput({ confidence: -0.1 })).some((e) => e.includes("confidence")));
  assert.ok(validateCreateEventInput(validCreateEventInput({ confidence: 1.1 })).some((e) => e.includes("confidence")));
  // boundaries are inclusive
  assert.deepEqual(validateCreateEventInput(validCreateEventInput({ confidence: 0 })), []);
  assert.deepEqual(validateCreateEventInput(validCreateEventInput({ confidence: 1 })), []);
});

test("validateCreateEventInput rejects an unknown severity", () => {
  assert.ok(validateCreateEventInput(validCreateEventInput({ severity: "CRITICAL" })).some((e) => e.includes("severity")));
});

test("validateCreateEventInput rejects malformed insightTags", () => {
  assert.ok(
    validateCreateEventInput(validCreateEventInput({ insightTags: ["ok", "  "] })).some((e) => e.includes("insightTags"))
  );
  assert.ok(
    validateCreateEventInput(validCreateEventInput({ insightTags: "edge" })).some((e) => e.includes("insightTags"))
  );
});

test("validateListEventsQuery accepts valid filters and an empty query", () => {
  assert.deepEqual(validateListEventsQuery({}), []);
  assert.deepEqual(validateListEventsQuery({ status: "NEW", deviceId: "device-1" }), []);
});

test("validateListEventsQuery rejects an unknown status", () => {
  assert.ok(validateListEventsQuery({ status: "ARCHIVED" }).some((e) => e.includes("status")));
});

test("validateListEventsQuery rejects a blank deviceId", () => {
  assert.ok(validateListEventsQuery({ deviceId: "   " }).some((e) => e.includes("deviceId")));
});

test("validateUpdateStatusInput / isValidUpdateStatusInput agree", () => {
  assert.deepEqual(validateUpdateStatusInput({ status: "RESOLVED" }), []);
  assert.equal(isValidUpdateStatusInput({ status: "RESOLVED" }), true);

  assert.deepEqual(validateUpdateStatusInput(null), ["Request body is required"]);
  assert.equal(isValidUpdateStatusInput(null), false);

  assert.ok(validateUpdateStatusInput({ status: "DONE" }).length > 0);
  assert.equal(isValidUpdateStatusInput({ status: "DONE" }), false);
});

test("validateUploadUrlInput enforces the content-type allow-list", () => {
  assert.deepEqual(validateUploadUrlInput({ contentType: "image/png" }), []);
  assert.deepEqual(validateUploadUrlInput(null), ["Request body is required"]);
  assert.ok(validateUploadUrlInput({ contentType: "image/gif" }).some((e) => e.includes("contentType")));
});

test("validateDetectImageInput accepts a minimal valid payload", () => {
  assert.deepEqual(validateDetectImageInput(validDetectImageInput()), []);
});

test("validateDetectImageInput requires imageKey", () => {
  assert.ok(validateDetectImageInput(validDetectImageInput({ imageKey: "" })).some((e) => e.includes("imageKey")));
});

test("validateDetectImageInput rejects path-traversal / absolute imageKeys", () => {
  for (const bad of ["../secret.jpg", "a/../../b.jpg", "/etc/passwd", "C:\\win.jpg", "images\\evil.jpg"]) {
    assert.ok(
      validateDetectImageInput(validDetectImageInput({ imageKey: bad })).some((e) => e.includes("imageKey")),
      `expected ${bad} to be rejected`
    );
  }
  assert.deepEqual(validateDetectImageInput(validDetectImageInput({ imageKey: "images/abc.jpg" })), []);
});

test("validateDetectImageInput rejects a blank imageDataBase64 when provided", () => {
  assert.ok(
    validateDetectImageInput(validDetectImageInput({ imageDataBase64: "   " })).some((e) =>
      e.includes("imageDataBase64")
    )
  );
  // a real base64 string is accepted
  assert.deepEqual(validateDetectImageInput(validDetectImageInput({ imageDataBase64: "QUJD" })), []);
});
