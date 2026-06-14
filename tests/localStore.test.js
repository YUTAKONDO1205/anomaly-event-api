"use strict";

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

// Point the local store at a throwaway temp directory BEFORE importing the module,
// because env.ts resolves these paths once at import time.
const tmpRoot = path.join(os.tmpdir(), `anomaly-localstore-${process.pid}-${Date.now()}`);
process.env.APP_STORAGE_MODE = "local";
process.env.LOCAL_EVENTS_FILE = path.join(tmpRoot, "events", "events.json");
process.env.LOCAL_UPLOADS_DIR = path.join(tmpRoot, "uploads");

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  readLocalEvents,
  writeLocalEvents,
  updateLocalEvents,
  resetLocalEventStorage,
  writeLocalUpload,
  readLocalUpload,
  resolveLocalUploadPath
} = require("../dist/utils/localStore.js");

function makeEvent(id) {
  return {
    eventId: id,
    deviceId: "d",
    sectionId: "s",
    distance: 1,
    confidence: 0.5,
    status: "NEW",
    detectedAt: "2026-06-14T00:00:00.000Z",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z"
  };
}

test.beforeEach(async () => {
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
});

test.after(async () => {
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
});

test("readLocalEvents returns [] when the events file does not exist", async () => {
  assert.deepEqual(await readLocalEvents(), []);
});

test("writeLocalEvents then readLocalEvents round-trips and creates the directory", async () => {
  await writeLocalEvents([makeEvent("a"), makeEvent("b")]);
  const events = await readLocalEvents();
  assert.deepEqual(events.map((e) => e.eventId), ["a", "b"]);
});

test("updateLocalEvents applies the mutator and returns the next items", async () => {
  await writeLocalEvents([makeEvent("a")]);
  const next = await updateLocalEvents((items) => [...items, makeEvent("b")]);
  assert.deepEqual(next.map((e) => e.eventId), ["a", "b"]);
  assert.deepEqual((await readLocalEvents()).map((e) => e.eventId), ["a", "b"]);
});

test("concurrent updateLocalEvents calls serialize without losing writes", async () => {
  await writeLocalEvents([]);
  const appends = Array.from({ length: 25 }, (_, i) =>
    updateLocalEvents((items) => [...items, makeEvent(`e${i}`)])
  );
  await Promise.all(appends);

  const finalEvents = await readLocalEvents();
  assert.equal(finalEvents.length, 25, "every concurrent append must survive the file lock");
  const ids = new Set(finalEvents.map((e) => e.eventId));
  assert.equal(ids.size, 25, "no duplicate or dropped writes");
});

test("writeLocalUpload then readLocalUpload round-trips bytes", async () => {
  const bytes = Buffer.from([1, 2, 3, 4, 5]);
  const filePath = await writeLocalUpload("images/sample.bin", bytes);
  assert.equal(filePath, resolveLocalUploadPath("images/sample.bin"));
  assert.deepEqual(Buffer.from(await readLocalUpload("images/sample.bin")), bytes);
});

test("resolveLocalUploadPath confines keys and rejects path traversal", () => {
  const safe = resolveLocalUploadPath("images/sample.bin");
  assert.ok(safe.startsWith(path.resolve(process.env.LOCAL_UPLOADS_DIR)));

  for (const bad of ["../escape.bin", "a/../../escape.bin", "/etc/passwd", "images/../../escape"]) {
    assert.throws(() => resolveLocalUploadPath(bad), /Invalid imageKey/);
  }
});

test("writeLocalUpload / readLocalUpload reject a traversal key", async () => {
  await assert.rejects(() => writeLocalUpload("../escape.bin", Buffer.from([1])), /Invalid imageKey/);
  await assert.rejects(() => readLocalUpload("../../etc/passwd"), /Invalid imageKey/);
});

test("resetLocalEventStorage clears events and reports counts", async () => {
  await writeLocalEvents([makeEvent("a"), makeEvent("b"), makeEvent("c")]);
  await writeLocalUpload("images/one.bin", Buffer.from([1]));
  await writeLocalUpload("images/two.bin", Buffer.from([2]));

  const result = await resetLocalEventStorage();
  assert.equal(result.eventsCleared, 3);
  assert.equal(result.uploadsCleared, 2);
  assert.deepEqual(await readLocalEvents(), []);
});
