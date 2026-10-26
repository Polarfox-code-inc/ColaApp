// scraper/wasgau/source.mjs
//
// The Wasgau source's network seam (Phase 5): the only Wasgau module that
// touches the network. createFetchText() returns a `(url) => Promise<string>`
// that build.mjs calls strictly one request at a time (D-09). Tests inject a
// fixture-serving fetchText instead, so the suite never contacts wasgau.de or
// 1kcloud (RESEARCH Pitfall 1).
//
// Market choice (D-18): the homepage `var wasgau` angebotslink is global and
// identical on the Dudenhofen market page /maerkte/wasgau-frischemarkt-dudenhofen/
// (verified 2026-10-12), so no market selector or cookie is sent. If wasgau.de
// ever serves per-market leaflets, Dudenhofen is the reference branch.
//
// SECURITY (T-05-12, Pitfall 11 — SSRF via link or redirect): build.mjs already
// rebuilds every URL from a validated leaflet id, but this seam is the last
// line: a URL is requested only when it is https AND its exact host is in
// ALLOWED_HOSTS (an exact Set lookup, so "wasgau-dlog.1kcloud.com.evil.example"
// suffix tricks fail). A refused URL is never requested and never retried. The
// final response URL (after any redirects native fetch followed) is checked
// against the same rule, so a redirect cannot carry the runner off-list.
//
// SECURITY (T-05-13 — oversized / decompression-bomb body, hung host): each
// attempt has a fresh 10 s timeout (withRetry), every request of the run shares
// ONE WASGAU_DEADLINE_MS deadline, and a decoded body above MAX_BODY_CHARS is
// refused (RESEARCH Pitfall 11's 5 MB guideline; a homepage, index or per-page
// coords XML is plain text and expected to stay well below it — the largest
// coords page seen so far is ~2.1 M chars, 2026-10-26 page 14).
//
// SECURITY (T-05-04 / T-05-15): the homepage HTML carries a third-party Mapbox
// token. It must never be logged or persisted; this module returns the body to
// the caller only, does no logging, and its error texts carry the HTTP status +
// host (or a refusal reason), never the body.
//
// GOOD CITIZEN (D-09, SC4): the shared User-Agent from fetch.mjs, at most 3
// attempts per request, strictly sequential callers, every leaflet page once per
// NEW leaflet id (the index text is truncated for some pages, see build.mjs),
// the homepage only while the id is unchanged.
//
// Node 22+ (native fetch decodes gzip). No dependencies.

import { UA, withRetry } from "../fetch.mjs";
import { HOMEPAGE_URL, LEAFLET_HOST } from "./leaflet.mjs";

// Wall-clock cap for every Wasgau request of one run, retries included. Raised
// from 60 s on 2026-10-26 when discovery moved to every leaflet page: a new
// leaflet now costs ~30 sequential requests (measured: 28 coords pages,
// 0.16-2.1 MB each, ~2.6 s total from a German line). 120 s leaves headroom for
// slower runner networks and a few retried attempts (each attempt may take up
// to the 10 s per-attempt timeout) while still bounding a hung host.
export const WASGAU_DEADLINE_MS = 120_000;

// The only hosts the Wasgau source may ever talk to (exact match).
export const ALLOWED_HOSTS = new Set([new URL(HOMEPAGE_URL).host, LEAFLET_HOST]);

// Decoded-body cap per response (characters).
export const MAX_BODY_CHARS = 5_000_000;

// Parse a URL and return its host when it is https on an allowed host, else
// null. An unparseable URL is not allowed either.
function allowedHost(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  return u.protocol === "https:" && ALLOWED_HOSTS.has(u.host) ? u.host : null;
}

// Host for error texts only; never the body.
const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "invalid url";
  }
};

/**
 * Create the real fetchText seam. The deadline starts when this is called, so
 * create one per run.
 * @param {{ deadlineMs?: number, fetchImpl?: typeof fetch, baseMs?: number }} [opts]
 * @returns {(url: string) => Promise<string>}
 */
export function createFetchText({
  deadlineMs = WASGAU_DEADLINE_MS,
  fetchImpl = globalThis.fetch,
  baseMs = 1000,
} = {}) {
  const deadline = AbortSignal.timeout(deadlineMs); // shared by every request
  return async (url) => {
    // Refuse before any request; outside withRetry so it is never retried.
    const host = allowedHost(url);
    if (!host) throw new Error(`wasgau fetch refused: host not allowed (${hostOf(url)})`);

    return withRetry(
      async (signal) => {
        const res = await fetchImpl(url, { headers: { "user-agent": UA }, signal });
        // Re-check after redirects: res.url is the final URL native fetch landed on.
        if (res.url && !allowedHost(res.url)) {
          throw new Error(`wasgau fetch refused: redirected off allow-list (${hostOf(res.url)})`);
        }
        if (!res.ok) {
          // Host only — never the body (it may carry the Mapbox token).
          throw new Error(`wasgau fetch failed: HTTP ${res.status} (${host})`);
        }
        const text = await res.text();
        if (text.length > MAX_BODY_CHARS) {
          throw new Error(`wasgau fetch refused: body too large (${text.length} chars)`);
        }
        return text;
      },
      { deadline, baseMs }
    );
  };
}
