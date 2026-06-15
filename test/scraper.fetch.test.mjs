// test/scraper.fetch.test.mjs
//
// Offline unit tests for scraper/fetch.mjs's withRetry helper (D-11).
// No network: withRetry is exercised entirely through an injected fake `fn`
// (a counter that throws N times then resolves, and one that always throws).
//
// Mirrors the node:test + assert/strict harness used by test/matcher.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry, getKeys } from "../scraper/fetch.mjs";

// Drive getKeys offline by stubbing the global fetch with a homepage body.
// Restores the real fetch afterwards so other suites are unaffected.
async function getKeysFromHtml(html) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => html });
  try {
    return await getKeys();
  } finally {
    globalThis.fetch = realFetch;
  }
}

const ISLAND = '{"config":{"apiKey":"AK","clientKey":"CK"}}';

// baseMs:0 keeps the backoff sleep effectively instant so the suite is fast;
// the retry *count* behavior is independent of the delay magnitude.
const FAST = { baseMs: 0 };

test("withRetry: fn that throws twice then resolves -> resolves and called 3 times", async () => {
  let calls = 0;
  const fn = () => {
    calls += 1;
    if (calls < 3) throw new Error(`transient ${calls}`);
    return "ok";
  };
  const result = await withRetry(fn, FAST);
  assert.equal(result, "ok");
  assert.equal(calls, 3, "fn should be called exactly 3 times (initial + 2 retries)");
});

test("withRetry: fn that succeeds first try -> called once", async () => {
  let calls = 0;
  const fn = () => {
    calls += 1;
    return 42;
  };
  const result = await withRetry(fn, FAST);
  assert.equal(result, 42);
  assert.equal(calls, 1, "no retries needed");
});

test("withRetry: fn that always throws -> rejects with last error after 3 calls", async () => {
  let calls = 0;
  const fn = () => {
    calls += 1;
    throw new Error(`always ${calls}`);
  };
  await assert.rejects(() => withRetry(fn, FAST), /always 3/);
  assert.equal(calls, 3, "max 3 attempts (initial + 2 retries)");
});

test("withRetry: each attempt receives a distinct, fresh AbortSignal", async () => {
  // undici #1926: a fired AbortSignal.timeout stays aborted — reusing it makes
  // every retry fail instantly. Prove each attempt gets a different signal object
  // and that none of them is already aborted at hand-off.
  const signals = [];
  const fn = (signal) => {
    signals.push(signal);
    if (signals.length < 3) throw new Error("retry me");
    return "done";
  };
  const result = await withRetry(fn, FAST);
  assert.equal(result, "done");
  assert.equal(signals.length, 3);
  // Each is an AbortSignal instance.
  for (const s of signals) {
    assert.ok(s instanceof AbortSignal, "fn must receive an AbortSignal");
    assert.equal(s.aborted, false, "signal must not be pre-fired at hand-off");
  }
  // Distinct objects — no reuse across attempts.
  assert.notEqual(signals[0], signals[1], "attempt 0 and 1 must get different signals");
  assert.notEqual(signals[1], signals[2], "attempt 1 and 2 must get different signals");
});

// --- WR-03: loosened bootstrap-island regex tolerates trivial markup drift ---

test("getKeys still matches the plain `type=\"application/json\"` island", async () => {
  const html = `<html><body><script type="application/json">${ISLAND}</script></body></html>`;
  assert.deepEqual(await getKeysFromHtml(html), { apiKey: "AK", clientKey: "CK" });
});

test("getKeys matches an island with an extra id attribute (Next.js shape) (WR-03)", async () => {
  const html = `<script type="application/json" id="__NEXT_DATA__">${ISLAND}</script>`;
  assert.deepEqual(await getKeysFromHtml(html), { apiKey: "AK", clientKey: "CK" });
});

test("getKeys matches whitespace around `=` and single quotes (WR-03)", async () => {
  const html = `<script  type = 'application/json'  data-foo="x">${ISLAND}</script>`;
  assert.deepEqual(await getKeysFromHtml(html), { apiKey: "AK", clientKey: "CK" });
});

test("getKeys skips islands lacking the keys and picks the right one (WR-03)", async () => {
  const html =
    `<script type="application/json" id="other">{"foo":1}</script>` +
    `<script type="application/json" id="__NEXT_DATA__">${ISLAND}</script>`;
  assert.deepEqual(await getKeysFromHtml(html), { apiKey: "AK", clientKey: "CK" });
});

test("getKeys throws when no island carries the bootstrap keys (WR-03)", async () => {
  const html = `<script type="application/json">{"config":{}}</script>`;
  await assert.rejects(() => getKeysFromHtml(html), /config\.apiKey not found/);
});

test("withRetry: default options allow up to 3 attempts", async () => {
  let calls = 0;
  // No opts passed -> defaults retries:2 -> still max 3 calls. Use a fn that
  // always throws and just assert the count; baseMs default would sleep ~1s+3s,
  // so this is the one test we keep cheap by resolving on the 3rd call.
  const fn = () => {
    calls += 1;
    if (calls < 3) throw new Error("transient");
    return "ok";
  };
  const result = await withRetry(fn);
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});
