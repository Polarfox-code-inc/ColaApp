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
// SECURITY (T-05-04): the homepage HTML carries a third-party Mapbox token. It
// must never be logged or persisted; this module returns the body to the caller
// only, and its error texts carry the HTTP status + host, never the body.
// Plan 05-05 adds the host allow-list, the redirect re-check and the body-size cap.
//
// GOOD CITIZEN: the shared User-Agent from fetch.mjs, at most 3 attempts per
// request via withRetry (fresh 10 s per-attempt signal), all bounded by ONE
// shared deadline for the whole Wasgau run.
//
// Node 22+ (native fetch decodes gzip). No dependencies.

import { UA, withRetry } from "../fetch.mjs";

// Wall-clock cap for every Wasgau request of one run, retries included.
export const WASGAU_DEADLINE_MS = 60_000;

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
  return async (url) =>
    withRetry(
      async (signal) => {
        const res = await fetchImpl(url, { headers: { "user-agent": UA }, signal });
        if (!res.ok) {
          // Host only — never the body (it may carry the Mapbox token).
          throw new Error(`wasgau fetch failed: HTTP ${res.status} (${new URL(url).host})`);
        }
        return res.text();
      },
      { deadline, baseMs }
    );
}
