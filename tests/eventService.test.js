"use strict";

// EventService accepts an injected repository, so we exercise it against a fake
// in-memory repository (no DynamoDB / filesystem). Local mode keeps env import safe.
process.env.APP_STORAGE_MODE = "local";

const test = require("node:test");
const assert = require("node:assert/strict");

const { EventService } = require("../dist/services/eventService.js");
const { InvalidStatusTransitionError } = require("../dist/utils/errors.js");

function createFakeRepository(initial = []) {
  const calls = { save: [], updateStatus: [] };
  let items = [...initial];

  return {
    calls,
    get items() {
      return items;
    },
    async save(item) {
      calls.save.push(item);
      items.push(item);
    },
    async findAll(filters = {}) {
      return items.filter((item) => {
        if (filters.status && item.status !== filters.status) return false;
        if (filters.deviceId && item.deviceId !== filters.deviceId) return false;
        return true;
      });
    },
    async findById(eventId) {
      return items.find((item) => item.eventId === eventId) ?? null;
    },
    async updateStatus(eventId, status, expectedStatus) {
      calls.updateStatus.push({ eventId, status, expectedStatus });
      const found = items.find((item) => item.eventId === eventId);
      if (!found) return null;
      found.status = status;
      return found;
    }
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test("createEvent stamps id/status/timestamps and persists via the repository", async () => {
  const repo = createFakeRepository();
  const service = new EventService(repo);

  const created = await service.createEvent({
    deviceId: "device-1",
    sectionId: "section-1",
    distance: 3,
    detectedAt: "2026-06-14T09:00:00.000Z",
    confidence: 0.5
  });

  assert.match(created.eventId, UUID_RE);
  assert.equal(created.status, "NEW");
  assert.equal(typeof created.createdAt, "string");
  assert.equal(created.createdAt, created.updatedAt);
  assert.ok(!Number.isNaN(Date.parse(created.createdAt)));

  assert.equal(repo.calls.save.length, 1);
  assert.equal(repo.calls.save[0].eventId, created.eventId);
});

test("createEvent generates a unique id per call", async () => {
  const repo = createFakeRepository();
  const service = new EventService(repo);
  const base = { deviceId: "d", sectionId: "s", distance: 1, detectedAt: "2026-06-14T09:00:00.000Z", confidence: 0.1 };

  const a = await service.createEvent(base);
  const b = await service.createEvent(base);
  assert.notEqual(a.eventId, b.eventId);
});

test("getEvents returns events sorted by detectedAt descending", async () => {
  const repo = createFakeRepository([
    { eventId: "1", deviceId: "d", sectionId: "s", distance: 1, confidence: 0.1, status: "NEW", detectedAt: "2026-06-10T00:00:00.000Z", createdAt: "x", updatedAt: "x" },
    { eventId: "2", deviceId: "d", sectionId: "s", distance: 1, confidence: 0.1, status: "NEW", detectedAt: "2026-06-14T00:00:00.000Z", createdAt: "x", updatedAt: "x" },
    { eventId: "3", deviceId: "d", sectionId: "s", distance: 1, confidence: 0.1, status: "NEW", detectedAt: "2026-06-12T00:00:00.000Z", createdAt: "x", updatedAt: "x" }
  ]);
  const service = new EventService(repo);

  const events = await service.getEvents();
  assert.deepEqual(events.map((e) => e.eventId), ["2", "3", "1"]);
});

test("getEvents forwards filters to the repository", async () => {
  const repo = createFakeRepository([
    { eventId: "1", deviceId: "alpha", sectionId: "s", distance: 1, confidence: 0.1, status: "NEW", detectedAt: "2026-06-10T00:00:00.000Z", createdAt: "x", updatedAt: "x" },
    { eventId: "2", deviceId: "beta", sectionId: "s", distance: 1, confidence: 0.1, status: "RESOLVED", detectedAt: "2026-06-14T00:00:00.000Z", createdAt: "x", updatedAt: "x" }
  ]);
  const service = new EventService(repo);

  const onlyResolved = await service.getEvents({ status: "RESOLVED" });
  assert.deepEqual(onlyResolved.map((e) => e.eventId), ["2"]);

  const onlyAlpha = await service.getEvents({ deviceId: "alpha" });
  assert.deepEqual(onlyAlpha.map((e) => e.eventId), ["1"]);
});

test("updateStatus delegates to the repository and returns its result", async () => {
  const repo = createFakeRepository([
    { eventId: "1", deviceId: "d", sectionId: "s", distance: 1, confidence: 0.1, status: "NEW", detectedAt: "2026-06-10T00:00:00.000Z", createdAt: "x", updatedAt: "x" }
  ]);
  const service = new EventService(repo);

  const updated = await service.updateStatus("1", "CHECKING");
  assert.equal(updated.status, "CHECKING");
  assert.deepEqual(repo.calls.updateStatus, [{ eventId: "1", status: "CHECKING", expectedStatus: "NEW" }]);

  const missing = await service.updateStatus("nope", "RESOLVED");
  assert.equal(missing, null);
});

test("getEventById returns null when the event is absent", async () => {
  const repo = createFakeRepository();
  const service = new EventService(repo);
  assert.equal(await service.getEventById("missing"), null);
});

function seedOne(status) {
  return createFakeRepository([
    {
      eventId: "1",
      deviceId: "d",
      sectionId: "s",
      distance: 1,
      confidence: 0.1,
      status,
      detectedAt: "2026-06-10T00:00:00.000Z",
      createdAt: "x",
      updatedAt: "x"
    }
  ]);
}

test("updateStatus walks the allowed lifecycle NEW->CHECKING->RESOLVED", async () => {
  const service = new EventService(seedOne("NEW"));
  assert.equal((await service.updateStatus("1", "CHECKING")).status, "CHECKING");
  assert.equal((await service.updateStatus("1", "RESOLVED")).status, "RESOLVED");
});

test("updateStatus rejects an illegal transition (RESOLVED -> NEW) with InvalidStatusTransitionError", async () => {
  const service = new EventService(seedOne("RESOLVED"));
  await assert.rejects(() => service.updateStatus("1", "NEW"), InvalidStatusTransitionError);
});

test("updateStatus rejects a same-status no-op", async () => {
  const service = new EventService(seedOne("NEW"));
  await assert.rejects(() => service.updateStatus("1", "NEW"), InvalidStatusTransitionError);
});

test("updateStatus returns null (not an error) when the event is missing", async () => {
  const service = new EventService(createFakeRepository());
  assert.equal(await service.updateStatus("missing", "CHECKING"), null);
});

test("updateStatus forwards the expected prior status to the repository (optimistic lock)", async () => {
  const repo = seedOne("NEW");
  const service = new EventService(repo);
  await service.updateStatus("1", "CHECKING");
  assert.deepEqual(repo.calls.updateStatus, [{ eventId: "1", status: "CHECKING", expectedStatus: "NEW" }]);
});
