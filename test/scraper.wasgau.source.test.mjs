// test/scraper.wasgau.source.test.mjs
//
// Offline proof that the Wasgau network seam is a good citizen that cannot be
// steered off wasgau.de / 1kcloud (D-09, SC4, Pitfall 11, T-05-12..T-05-15):
// host allow-list before the request, redirect re-check after it, body-size cap,
// UA header, retry count, shared deadline, and strictly sequential every-page
// fetching. Every request goes to an injected fake fetchImpl; nothing touches
// the network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Namespace import: a missing named export must fail an assertion, not the
// module load.
import * as source from "../scraper/wasgau/source.mjs";
import { UA } from "../scraper/fetch.mjs";
import { HOMEPAGE_URL } from "../scraper/wasgau/leaflet.mjs";
import { fetchCandidates } from "../scraper/wasgau/build.mjs";

const { createFetchText } = source;
const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "wasgau");
const fx = (name) => readFileSync(join(FIX, name), "utf8");

// baseMs: 0 keeps retry backoff effectively instant.
const FAST = { baseMs: 0 };

// A recording fake fetch. `respond(url, init)` returns the response shape
// { ok, status, url, text }; defaults to a 200 echoing the request URL.
function fakeFetch(respond = (url) => ({ ok: true, status: 200, url, body: "ok" })) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = respond(url, init);
    return { ok: r.ok, status: r.status, url: r.url, text: async () => r.body };
  };
  return { calls, impl };
}

test("exports the allow-list, body cap and deadline constants", () => {
  assert.ok(source.ALLOWED_HOSTS instanceof Set, "ALLOWED_HOSTS must be a Set");
  assert.deepEqual([...source.ALLOWED_HOSTS].sort(), ["wasgau-dlog.1kcloud.com", "www.wasgau.de"]);
  assert.equal(source.MAX_BODY_CHARS, 5_000_000);
  assert.equal(source.WASGAU_DEADLINE_MS, 120_000);
});

test("sends the project User-Agent and resolves the body text", async () => {
  const f = fakeFetch((url) => ({ ok: true, status: 200, url, body: "<html>hi</html>" }));
  const text = await createFetchText({ fetchImpl: f.impl, ...FAST })(HOMEPAGE_URL);
  assert.equal(text, "<html>hi</html>");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].init.headers["user-agent"], UA);
});

for (const url of [
  "http://www.wasgau.de/",
  "https://evil.example/x",
  "https://wasgau-dlog.1kcloud.com.evil.example/ep1rP1V0/", // suffix trick
  "https://www.wasgau.de.evil.example/",
]) {
  test(`refuses ${url} without ever calling fetch (T-05-12)`, async () => {
    const f = fakeFetch();
    await assert.rejects(() => createFetchText({ fetchImpl: f.impl, ...FAST })(url), /host not allowed/);
    assert.equal(f.calls.length, 0);
  });
}

test("rejects a response redirected to a foreign host (T-05-12)", async () => {
  const f = fakeFetch(() => ({ ok: true, status: 200, url: "https://evil.example/landing", body: "x" }));
  await assert.rejects(
    () => createFetchText({ fetchImpl: f.impl, ...FAST })(HOMEPAGE_URL),
    /redirected off allow-list/
  );
});

test("rejects a body longer than MAX_BODY_CHARS (T-05-13)", async () => {
  const big = "a".repeat(5_000_001);
  const f = fakeFetch((url) => ({ ok: true, status: 200, url, body: big }));
  await assert.rejects(() => createFetchText({ fetchImpl: f.impl, ...FAST })(HOMEPAGE_URL), /too large/);
});

test("HTTP 503 -> status + host only, never the body, after 3 attempts (T-05-15)", async () => {
  const f = fakeFetch((url) => ({ ok: false, status: 503, url, body: 'var cfg = {"mapboxToken":"pk.secret"}' }));
  await assert.rejects(
    () => createFetchText({ fetchImpl: f.impl, ...FAST })(HOMEPAGE_URL),
    (err) => {
      assert.match(err.message, /HTTP 503/);
      assert.match(err.message, /www\.wasgau\.de/);
      assert.doesNotMatch(err.message, /mapboxToken/);
      return true;
    }
  );
  assert.equal(f.calls.length, 3); // initial + 2 retries
});

test("the shared deadline bounds a hung host (T-05-13)", async () => {
  // Never settles until its signal aborts.
  const hung = (url, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  const start = Date.now();
  await assert.rejects(() => createFetchText({ deadlineMs: 50, fetchImpl: hung, ...FAST })(HOMEPAGE_URL));
  assert.ok(Date.now() - start < 2000, "must reject well before the per-attempt timeouts");
});

test("fetchCandidates fetches every index page strictly one at a time, ascending (D-09, T-05-14)", async () => {
  const LEAFLET = "https://wasgau-dlog.1kcloud.com/ep1rP1V0/";
  // Page 2 has no captured XML, the real no-Cola p24 capture stands in.
  const pages = { 1: "page_1.xml", 2: "page_24.xml", 17: "page_17.positive.xml", 26: "page_26.xml" };
  const urls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchText = async (url) => {
    urls.push(url);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((r) => setTimeout(r, 2)); // give overlap a chance
      if (url === HOMEPAGE_URL) return fx("homepage.html");
      if (url === LEAFLET) return fx("index.html");
      const m = url.match(/page_(\d+)\.xml$/);
      if (m && pages[m[1]]) return fx(pages[m[1]]);
      throw new Error(`unexpected URL ${url}`);
    } finally {
      inFlight -= 1;
    }
  };

  await fetchCandidates({ fetchText, priorDoc: null });

  assert.equal(maxInFlight, 1);
  assert.deepEqual(urls, [
    HOMEPAGE_URL,
    LEAFLET,
    `${LEAFLET}epaper/coords/page_1.xml`,
    `${LEAFLET}epaper/coords/page_2.xml`,
    `${LEAFLET}epaper/coords/page_17.xml`,
    `${LEAFLET}epaper/coords/page_26.xml`,
  ]);
  assert.ok(!urls.some((u) => u.endsWith("/page_24.xml")), "page_24 (not listed in the index) must never be requested");
});
