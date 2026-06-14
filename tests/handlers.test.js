"use strict";

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

// Drive the real Lambda handlers end-to-end against local temp storage.
const tmpRoot = path.join(os.tmpdir(), `anomaly-handlers-${process.pid}-${Date.now()}`);
process.env.APP_STORAGE_MODE = "local";
process.env.DETECTION_PROVIDER = "heuristic";
process.env.EVENTS_TABLE = "local-events";
process.env.EVENT_IMAGES_BUCKET = "local-uploads";
process.env.LOCAL_EVENTS_FILE = path.join(tmpRoot, "events", "events.json");
process.env.LOCAL_UPLOADS_DIR = path.join(tmpRoot, "uploads");
process.env.DETECTION_MIN_CONFIDENCE = "55";

const test = require("node:test");
const assert = require("node:assert/strict");

const createEvent = require("../dist/handlers/createEvent.js").handler;
const getEvents = require("../dist/handlers/getEvents.js").handler;
const getEventById = require("../dist/handlers/getEventById.js").handler;
const updateEventStatus = require("../dist/handlers/updateEventStatus.js").handler;
const getDashboard = require("../dist/handlers/getDashboard.js").handler;
const getUploadUrl = require("../dist/handlers/getUploadUrl.js").handler;
const resetLocalDatabase = require("../dist/handlers/resetLocalDatabase.js").handler;

function httpEvent({ body, pathParameters, queryStringParameters, headers } = {}) {
  return {
    version: "2.0",
    body: body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body),
    pathParameters,
    queryStringParameters,
    headers: headers ?? {},
    isBase64Encoded: false
  };
}

function parse(result) {
  return result.body ? JSON.parse(result.body) : null;
}

const validEvent = {
  deviceId: "device-1",
  sectionId: "section-1",
  distance: 4.2,
  detectedAt: "2026-06-14T10:00:00.000Z",
  confidence: 0.77,
  severity: "MEDIUM"
};

test.after(async () => {
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
});

test("createEvent rejects an invalid payload with 400", async () => {
  const res = await createEvent(httpEvent({ body: { deviceId: "" } }));
  assert.equal(res.statusCode, 400);
  assert.match(parse(res).message, /deviceId/);
});

test("createEvent persists a valid event and returns 201", async () => {
  const res = await createEvent(httpEvent({ body: validEvent }));
  assert.equal(res.statusCode, 201);
  const { data } = parse(res);
  assert.equal(data.status, "NEW");
  assert.equal(data.deviceId, "device-1");
  assert.ok(data.eventId);
});

test("getEvents lists the persisted event", async () => {
  const res = await getEvents(httpEvent());
  assert.equal(res.statusCode, 200);
  const { data } = parse(res);
  assert.equal(data.length, 1);
  assert.equal(data[0].deviceId, "device-1");
});

test("getEvents rejects an invalid status filter with 400", async () => {
  const res = await getEvents(httpEvent({ queryStringParameters: { status: "ARCHIVED" } }));
  assert.equal(res.statusCode, 400);
});

test("getEvents treats an empty/whitespace status as no filter (bug #10)", async () => {
  const empty = await getEvents(httpEvent({ queryStringParameters: { status: "" } }));
  assert.equal(empty.statusCode, 200);
  assert.equal(parse(empty).data.length, 1);

  // event is still NEW at this point; a padded value is trimmed before validation
  const padded = await getEvents(httpEvent({ queryStringParameters: { status: " NEW " } }));
  assert.equal(padded.statusCode, 200);
  assert.equal(parse(padded).data.length, 1);
});

test("getEventById returns the event, and 404 for unknown ids", async () => {
  const list = parse(await getEvents(httpEvent())).data;
  const id = list[0].eventId;

  const found = await getEventById(httpEvent({ pathParameters: { id } }));
  assert.equal(found.statusCode, 200);
  assert.equal(parse(found).data.eventId, id);

  const missing = await getEventById(httpEvent({ pathParameters: { id: "does-not-exist" } }));
  assert.equal(missing.statusCode, 404);
});

test("updateEventStatus transitions status, with 400/404 guards", async () => {
  const id = parse(await getEvents(httpEvent())).data[0].eventId;

  const ok = await updateEventStatus(httpEvent({ pathParameters: { id }, body: { status: "CHECKING" } }));
  assert.equal(ok.statusCode, 200);
  assert.equal(parse(ok).data.status, "CHECKING");

  const badStatus = await updateEventStatus(httpEvent({ pathParameters: { id }, body: { status: "NOPE" } }));
  assert.equal(badStatus.statusCode, 400);

  const missing = await updateEventStatus(
    httpEvent({ pathParameters: { id: "does-not-exist" }, body: { status: "RESOLVED" } })
  );
  assert.equal(missing.statusCode, 404);
});

test("getDashboard reflects the stored event counts", async () => {
  const res = await getDashboard(httpEvent());
  assert.equal(res.statusCode, 200);
  const { data } = parse(res);
  assert.equal(data.events.total, 1);
  assert.equal(data.events.byStatus.CHECKING, 1);
  assert.equal(data.runtime.storageMode, "local");
});

test("getUploadUrl returns an inline descriptor for a valid content type", async () => {
  const res = await getUploadUrl(httpEvent({ body: { contentType: "image/png" }, headers: { host: "127.0.0.1:3000" } }));
  assert.equal(res.statusCode, 200);
  const { data } = parse(res);
  assert.equal(data.uploadMode, "inline");
  assert.match(data.key, /^images\/.+\.png$/);
});

test("getUploadUrl rejects an unsupported content type", async () => {
  const res = await getUploadUrl(httpEvent({ body: { contentType: "image/gif" } }));
  assert.equal(res.statusCode, 400);
});

test("resetLocalDatabase clears stored events", async () => {
  const res = await resetLocalDatabase(httpEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(parse(res).data.eventsCleared, 1);

  const after = parse(await getEvents(httpEvent())).data;
  assert.equal(after.length, 0);
});

test("updateEventStatus rejects an illegal transition with 409 (bug #1)", async () => {
  const id = parse(await createEvent(httpEvent({ body: validEvent }))).data.eventId;

  // NEW -> RESOLVED is allowed
  const resolved = await updateEventStatus(httpEvent({ pathParameters: { id }, body: { status: "RESOLVED" } }));
  assert.equal(resolved.statusCode, 200);

  // RESOLVED -> NEW is illegal -> 409 Conflict
  const illegal = await updateEventStatus(httpEvent({ pathParameters: { id }, body: { status: "NEW" } }));
  assert.equal(illegal.statusCode, 409);

  // same-status no-op is also rejected
  const noop = await updateEventStatus(httpEvent({ pathParameters: { id }, body: { status: "RESOLVED" } }));
  assert.equal(noop.statusCode, 409);
});
