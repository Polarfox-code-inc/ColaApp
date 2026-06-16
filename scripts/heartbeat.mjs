// scripts/heartbeat.mjs
//
// Keepalive heartbeat writer (D-04/D-05, Option A — a SEPARATE file).
//
// Writes data/heartbeat.json holding only a top-level "last successful run"
// timestamp: { "lastRun": "<ISO-8601>" }. The CI workflow runs this AFTER
// `npm run scrape` so that, even when no per-store offers change, the repo still
// sees a commit each run — resetting GitHub's 60-day scheduled-workflow inactivity
// clock (INFR-03 keepalive) without inventing fake offer freshness.
//
// D-05 INVARIANT (load-bearing): the heartbeat MUST NOT touch any per-store
// `stores[].lastUpdated` in status.json / current-offers.json. A dedicated file
// satisfies this by construction — this module never reads, imports, or writes the
// scraper's documents, and never imports merge.mjs.
//
// Resilience: writes atomically via a SAME-DIRECTORY temp file + rename (mirrors
// scraper/io.mjs writeAtomic, lines 67-71) so a crash mid-write leaves either the
// old file or the new one — never a half-written file the CI commit could capture
// (DATA-05). Serialized with 2-space indent + trailing newline to match every
// other committed data/*.json (clean git diffs).
//
// Node 22+ (node:fs/promises, node:crypto, node:path, node:url). No dependencies —
// mirrors scraper/io.mjs's "No dependencies" rule; Phase 4 adds NO npm packages.

import { writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the default data dir relative to THIS file so `node scripts/heartbeat.mjs`
// works from any cwd in CI. The script lives in scripts/ (one level under repo
// root), so the hop to data/ is "../data" (mirrors scraper/io.mjs lines 22-25).
const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = join(HERE, "..", "data");

// Same-directory temp + rename: EXDEV-safe atomic swap (nodejs/node#19077).
// Verbatim mirror of scraper/io.mjs writeAtomic so the two writers share one seam.
async function writeAtomic(targetPath, text) {
  const tmp = `${targetPath}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, targetPath); // atomic on the same filesystem
}

/**
 * Write data/heartbeat.json with the current run timestamp.
 *
 * @param {string} [dataDir] target data directory (defaults to repo data/).
 * @returns {Promise<void>}
 */
export async function writeHeartbeat(dataDir = DEFAULT_DATA_DIR) {
  const text = JSON.stringify({ lastRun: new Date().toISOString() }, null, 2) + "\n";
  await writeAtomic(join(dataDir, "heartbeat.json"), text);
}

// Run when invoked directly (`node scripts/heartbeat.mjs`) so CI can call it as a
// standalone step. Importing the module (e.g. from the test) does NOT trigger this.
if (import.meta.url === `file://${process.argv[1]}` || fileURLToPath(import.meta.url) === process.argv[1]) {
  writeHeartbeat().catch((err) => {
    console.error("heartbeat failed:", err);
    process.exitCode = 1;
  });
}
