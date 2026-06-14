"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ok, created, badRequest, notFound, serverError, conflict } = require("../dist/utils/response.js");

const CORS_ORIGIN = "Access-Control-Allow-Origin";

test("ok wraps data with a 200 status and message envelope", () => {
  const res = ok({ value: 1 }, "Fetched");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { message: "Fetched", data: { value: 1 } });
  assert.equal(res.headers["Content-Type"], "application/json");
  assert.equal(res.headers[CORS_ORIGIN], "*");
});

test("ok defaults the message to OK", () => {
  assert.equal(JSON.parse(ok({}).body).message, "OK");
});

test("created returns a 201 with a data envelope", () => {
  const res = created({ id: "e1" }, "Event created");
  assert.equal(res.statusCode, 201);
  assert.deepEqual(JSON.parse(res.body), { message: "Event created", data: { id: "e1" } });
});

test("badRequest returns 400 with a message and no data field", () => {
  const res = badRequest("nope");
  assert.equal(res.statusCode, 400);
  assert.deepEqual(JSON.parse(res.body), { message: "nope" });
});

test("notFound returns 404", () => {
  assert.equal(notFound().statusCode, 404);
  assert.equal(JSON.parse(notFound("gone").body).message, "gone");
});

test("serverError returns 500 with a safe default message", () => {
  const res = serverError();
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.parse(res.body).message, "Internal Server Error");
});

test("conflict returns 409 with the rejection message", () => {
  const res = conflict("Cannot change status from RESOLVED to NEW");
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.parse(res.body).message, "Cannot change status from RESOLVED to NEW");
});

test("every response advertises the shared CORS headers", () => {
  for (const res of [ok({}), created({}), badRequest(), notFound(), serverError(), conflict()]) {
    assert.equal(res.headers[CORS_ORIGIN], "*");
    assert.equal(res.headers["Access-Control-Allow-Methods"], "GET,POST,PATCH,OPTIONS");
  }
});
