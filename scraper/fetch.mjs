// scraper/fetch.mjs
//
// The scraper's network boundary — the only module that touches marktguru.
// Refactors spike/probe.mjs's two fetches (homepage bootstrap-key scrape +
// the single /offers/search call) into reusable functions, and wraps both in
// one retry helper with a fresh per-attempt timeout and exponential backoff.
//
// SECURITY (D-12, ASVS V7): the scraped apiKey/clientKey are low-sensitivity
// public bootstrap values, but they are NEVER logged and NEVER written to disk.
// Only their *presence* is reported; errors log `err.message` only — never the
// key values nor the raw header object.
//
// GOOD CITIZEN (D-01/D-12, CLAUDE.md ToS): native `fetch` only (no axios /
// node-fetch), a SINGLE low-volume /offers/search call per run (all advertisers
// come back in one response — findings §2), a descriptive User-Agent, at most
// 3 attempts, no parallelism, keys re-fetched every run (never cached).
//
// Node 22+ (native fetch, AbortSignal.timeout, top-level ESM). No dependencies.

const UA = "colaapp-scraper/0.1 (personal, low-volume)";
const HOME = "https://www.marktguru.de/";
const API = "https://api.marktguru.de/api/v1/offers/search";
const ZIP = "67105";
const QUERY = "coca cola";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn(signal)` up to 3 times (initial + 2 retries), each with a FRESH
 * `AbortSignal.timeout(10_000)`, sleeping ~1s then ~3s (+ jitter) between
 * attempts. Resolves with the first success; throws the last error after the
 * final attempt. Wraps BOTH network calls so transient failures are absorbed
 * and a persistent failure routes the orchestrator to its total-failure path.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T> | T} fn receives a fresh signal per attempt
 * @param {{retries?: number, baseMs?: number}} [opts]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, { retries = 2, baseMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Fresh signal PER ATTEMPT — never reuse an already-fired AbortSignal.
    // A fired AbortSignal.timeout stays aborted, so a reused one would make
    // every subsequent attempt fail instantly (undici #1926).
    const signal = AbortSignal.timeout(10_000);
    try {
      return await fn(signal);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      // Exponential backoff + jitter: ~1s then ~3s (D-11). 3 ** attempt gives
      // 1, 3; the jitter avoids synchronized retry storms.
      const delay = baseMs * 3 ** attempt + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Fetch the marktguru homepage and extract the bootstrap API keys from the
 * FIRST <script type="application/json"> island whose parsed object exposes
 * both config.apiKey and config.clientKey — selected by PRESENCE, never a fixed
 * index (the island position is not stable). Malformed islands are skipped,
 * not thrown. Key VALUES are never logged.
 *
 * @param {AbortSignal} [signal] per-attempt timeout signal from withRetry
 * @returns {Promise<{apiKey: string, clientKey: string}>}
 */
export async function getKeys(signal) {
  const res = await fetch(HOME, { headers: { "user-agent": UA }, signal });
  if (!res.ok) {
    throw new Error(`homepage fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  // Loosened opening-tag match (WR-03): tolerate extra attributes (e.g.
  // id="__NEXT_DATA__"), whitespace around `=`, and single OR double quotes,
  // so a trivial markup change does not route every run to total-failure.
  // Still ReDoS-safe: a single non-greedy `.*?` body capture, [^>]* on the
  // attribute run, no nested quantifiers (no catastrophic backtracking).
  const blocks = [
    ...html.matchAll(
      /<script\b[^>]*\btype\s*=\s*["']application\/json["'][^>]*>(.*?)<\/script>/gms
    ),
  ];
  for (let i = 0; i < blocks.length; i++) {
    let parsed;
    try {
      parsed = JSON.parse(blocks[i][1]); // never eval; bad islands skipped
    } catch {
      continue;
    }
    if (parsed?.config?.apiKey && parsed?.config?.clientKey) {
      // Report PRESENCE only — never the key values (D-12, ASVS V7).
      return { apiKey: parsed.config.apiKey, clientKey: parsed.config.clientKey };
    }
  }
  throw new Error(
    "config.apiKey not found in any homepage JSON island — marktguru may have changed its bootstrap shape."
  );
}

/**
 * Make the SINGLE /offers/search call (all advertisers come back in one
 * response — findings §2). `limit=200` caps the payload size.
 *
 * @param {{apiKey: string, clientKey: string}} keys
 * @param {AbortSignal} [signal] per-attempt timeout signal from withRetry
 * @returns {Promise<unknown>} the raw parsed JSON payload
 */
export async function searchOffers(keys, signal) {
  const url = `${API}?as=web&q=${encodeURIComponent(QUERY)}&zipCode=${ZIP}&limit=200&offset=0`;
  const res = await fetch(url, {
    headers: {
      "x-apikey": keys.apiKey,
      "x-clientkey": keys.clientKey,
      "user-agent": UA,
    },
    signal,
  });
  if (!res.ok) {
    throw new Error(`offers/search failed: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Resolve the offers array out of the response wrapper. `results` is the
 * confirmed live key (findings §1); the fallbacks keep the scraper resilient
 * to a future shape change without re-probing.
 *
 * @param {unknown} data
 * @returns {unknown[]}
 */
export const resolveResults = (data) =>
  Array.isArray(data)
    ? data
    : data?.results ?? data?.data ?? Object.values(data ?? {}).find(Array.isArray) ?? [];

/**
 * Orchestrate one full fetch: scrape fresh bootstrap keys, make the single
 * offers/search call, and return the resolved `results[]` array. Each network
 * call is retried independently; a persistent failure throws (caller routes to
 * the total-failure path). A SINGLE search call per run (D-01) — no per-store
 * queries, no parallelism.
 *
 * @returns {Promise<unknown[]>}
 */
export async function fetchOffers() {
  const keys = await withRetry(getKeys);
  const data = await withRetry((signal) => searchOffers(keys, signal));
  return resolveResults(data);
}
