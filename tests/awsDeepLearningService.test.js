"use strict";

// Verify the inline-image size guard rejects oversized images BEFORE any Lambda
// invoke (so no network is touched). aws mode + a function name are required so
// the guard, not the missing-env-var check, is what fires.
process.env.APP_STORAGE_MODE = "aws";
process.env.EVENTS_TABLE = "test-events";
process.env.EVENT_IMAGES_BUCKET = "test-images";
process.env.AWS_DEEP_LEARNING_FUNCTION_NAME = "test-dl-fn";

const test = require("node:test");
const assert = require("node:assert/strict");

const { AwsDeepLearningService } = require("../dist/services/awsDeepLearningService.js");
const { RequestValidationError } = require("../dist/utils/errors.js");

test("detect rejects an oversized inline image before invoking Lambda", async () => {
  const service = new AwsDeepLearningService();
  const oversized = new Uint8Array(5 * 1024 * 1024); // 5MB > ~4.5MB cap
  await assert.rejects(() => service.detect(oversized), RequestValidationError);
});
