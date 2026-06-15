// scraper/io.mjs
//
// The scraper's filesystem boundary — read the prior snapshot, write whole
// files atomically, and append history lines. The only disk-side-effect module
// besides the orchestrator; everything between fetch and these writes is pure.
//
// Resilience rules (DATA-05):
//   - writeAtomic uses a SAME-DIRECTORY temp file + rename, so a crash mid-write
//     leaves either the old file or the new one — never a half-written file.
//   - appendLines APPENDS to price-history.jsonl — the JSONL is never rewritten
//     as an array (D-02).
//   - readPrior tolerates a cold start (no prior data/ files) by returning nulls
//     instead of throwing, enabling the Plan 03 carry-forward logic.
//
// Node 22+ (node:fs/promises, node:crypto, ESM). No dependencies.

import { readFile, writeFile, rename, appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the default data dir relative to THIS file so `npm run scrape` works
// from any cwd (mirrors spike/probe.mjs's `HERE`/`FIXTURE` pattern).
const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = join(HERE, "..", "data");

// Read + JSON.parse one file, returning null on ENOENT (cold start — the file
// simply does not exist yet). Other errors (e.g. malformed JSON) still throw.
async function readJsonOrNull(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") return null; // cold start: no prior file
    throw err;
  }
  return JSON.parse(text);
}

/**
 * Read the prior `current-offers.json` and `status.json` from `dataDir`.
 * Each missing file (cold start) resolves to `null` rather than throwing, so
 * the orchestrator can branch into its cold-start path (D-06).
 *
 * @param {string} [dataDir]
 * @returns {Promise<{currentOffers: object | null, status: object | null}>}
 */
export async function readPrior(dataDir = DEFAULT_DATA_DIR) {
  const [currentOffers, status] = await Promise.all([
    readJsonOrNull(join(dataDir, "current-offers.json")),
    readJsonOrNull(join(dataDir, "status.json")),
  ]);
  return { currentOffers, status };
}

/**
 * Write `text` to `targetPath` atomically via a same-directory temp file +
 * rename. The temp MUST live in the same directory as the target so `rename`
 * stays a same-filesystem atomic swap — a cross-device rename throws EXDEV
 * (nodejs/node#19077), so the temp path is derived from the target, never
 * placed under the OS temp directory.
 *
 * @param {string} targetPath
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function writeAtomic(targetPath, text) {
  const tmp = `${targetPath}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, targetPath); // atomic on the same filesystem
}

/**
 * Append `lines` to the JSONL history at `path`, each terminated by a newline.
 * APPEND-only — never rewrite the file as an array (D-02). A no-op when there
 * is nothing to append.
 *
 * @param {string} path
 * @param {string[]} lines already-serialized JSONL records (no trailing "\n")
 * @returns {Promise<void>}
 */
export async function appendLines(path, lines) {
  if (!lines || lines.length === 0) return;
  await appendFile(path, lines.map((l) => l + "\n").join(""), "utf8");
}

// Intended orchestrator write order (Plan 03): atomic current-offers.json,
// then atomic status.json, then append history LAST — so the brother-facing
// snapshot is replaced before the append-only graph grows.
