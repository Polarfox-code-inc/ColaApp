// scraper/clock.mjs
// The single injectable "now" seam (RESEARCH Pattern 4). Every pure module
// (normalize/select/dedup/merge) receives `now` as a parameter and NEVER calls
// `new Date()` itself — that keeps them deterministic against the offline
// fixtures. The orchestrator captures `const now = systemNow()` once and threads
// it everywhere.

/** @returns {Date} the current wall-clock instant. */
export const systemNow = () => new Date();
