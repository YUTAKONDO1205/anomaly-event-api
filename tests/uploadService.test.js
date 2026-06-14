"use strict";

// Exercise the local (inline) upload path only — the presigned path needs AWS.
process.env.APP_STORAGE_MODE = "local";
process.env.EVENT_IMAGES_BUCKET = "local-uploads";

const test = require("node:test");
const assert = require("node:assert/strict");

const { UploadService, buildImageObjectKey } = require("../dist/services/uploadService.js");

const KEY_RE = /^images\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

test("buildImageObjectKey maps content types to extensions", () => {
  assert.match(buildImageObjectKey("image/jpeg"), /^images\/[0-9a-f-]{36}\.jpg$/i);
  assert.match(buildImageObjectKey("image/png"), /^images\/[0-9a-f-]{36}\.png$/i);
  assert.match(buildImageObjectKey("image/webp"), /^images\/[0-9a-f-]{36}\.webp$/i);
});

test("buildImageObjectKey produces unique keys", () => {
  assert.notEqual(buildImageObjectKey("image/jpeg"), buildImageObjectKey("image/jpeg"));
});

test("createUploadUrl returns an inline descriptor in local mode", async () => {
  const service = new UploadService();
  const result = await service.createUploadUrl("image/png", "http://127.0.0.1:3000");

  assert.match(result.key, KEY_RE);
  assert.equal(result.uploadMode, "inline");
  assert.equal(result.expiresIn, 0);
  assert.equal(result.contentType, "image/png");
  assert.equal(result.uploadUrl, `http://127.0.0.1:3000/uploads/${encodeURIComponent(result.key)}`);
});

test("createUploadUrl tolerates a missing base url", async () => {
  const service = new UploadService();
  const result = await service.createUploadUrl("image/jpeg");
  assert.equal(result.uploadUrl, null);
  assert.equal(result.uploadMode, "inline");
});
