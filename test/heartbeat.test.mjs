// test/heartbeat.test.mjs
// Locks the D-04/D-05 contract for the keepalive heartbeat writer:
//   1. writeHeartbeat(dataDir) produces data/heartbeat.json parsing to { lastRun: <ISO> }.
//   2. D-05 invariant: the heartbeat NEVER touches status.json / current-offers.json
//      stores[].lastUpdated — those bytes are identical before and after.
//   3. Serialization convention: 2-space indent + trailing newline; re-running
//      overwrites with a newer lastRun.
//
// Fully offline; each case gets a fresh tmp dataDir for isolation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeHeartbeat } from "../scripts/heartbeat.mjs";

async function freshDir() {
  return mkdtemp(join(tmpdir(), "colahb-"));
}

test("writeHeartbeat writes heartbeat.json with a valid ISO lastRun", async () => {
  const dir = await freshDir();
  try {
    await writeHeartbeat(dir);
    const text = await readFile(join(dir, "heartbeat.json"), "utf8");
    const parsed = JSON.parse(text);
    assert.equal(typeof parsed.lastRun, "string");
    assert.ok(!Number.isNaN(Date.parse(parsed.lastRun)), "lastRun must be a valid ISO-8601 date");
    // ISO round-trips back to the same string.
    assert.equal(new Date(parsed.lastRun).toISOString(), parsed.lastRun);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("D-05 invariant: heartbeat does not mutate status.json / current-offers.json", async () => {
  const dir = await freshDir();
  try {
    // Seed the two freshness-bearing files with known per-store lastUpdated values.
    const statusBefore =
      JSON.stringify(
        {
          lastUpdated: "2026-06-10T00:00:00.000Z",
          stores: [
            { store: "REWE", status: "offer", lastUpdated: "2026-06-09T08:00:00.000Z" },
            { store: "Wasgau", status: "unavailable", lastUpdated: "2026-06-01T08:00:00.000Z" },
          ],
        },
        null,
        2
      ) + "\n";
    const currentBefore =
      JSON.stringify(
        {
          lastUpdated: "2026-06-10T00:00:00.000Z",
          stores: [{ store: "REWE", displayName: "REWE", status: "no_offer" }],
        },
        null,
        2
      ) + "\n";
    await writeFile(join(dir, "status.json"), statusBefore, "utf8");
    await writeFile(join(dir, "current-offers.json"), currentBefore, "utf8");

    await writeHeartbeat(dir);

    const statusAfter = await readFile(join(dir, "status.json"), "utf8");
    const currentAfter = await readFile(join(dir, "current-offers.json"), "utf8");
    assert.equal(statusAfter, statusBefore, "status.json must be byte-identical");
    assert.equal(currentAfter, currentBefore, "current-offers.json must be byte-identical");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("heartbeat uses 2-space indent + trailing newline and re-run bumps lastRun", async () => {
  const dir = await freshDir();
  try {
    await writeHeartbeat(dir);
    const first = await readFile(join(dir, "heartbeat.json"), "utf8");
    // Serialization convention: pretty-printed (newline + 2-space indent) + trailing newline.
    assert.ok(first.endsWith("\n"), "must end with a trailing newline");
    assert.equal(first, JSON.stringify(JSON.parse(first), null, 2) + "\n");
    const firstRun = JSON.parse(first).lastRun;

    // Ensure a strictly-later clock so the re-run produces a newer value.
    await new Promise((r) => setTimeout(r, 5));
    await writeHeartbeat(dir);
    const second = await readFile(join(dir, "heartbeat.json"), "utf8");
    const secondRun = JSON.parse(second).lastRun;
    assert.ok(
      Date.parse(secondRun) >= Date.parse(firstRun),
      "re-running must overwrite with a not-older lastRun"
    );
    assert.ok(second.endsWith("\n"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
