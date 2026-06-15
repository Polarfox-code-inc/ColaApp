// spike/probe.mjs
//
// Live marktguru spike (Phase 1, Plan 01).
//
// Two-step probe that PROVES the data source before any contract is frozen:
//   1. getKeys(): GET the marktguru homepage, parse every
//      <script type="application/json"> island, and return the first whose
//      parsed object exposes config.apiKey / config.clientKey.
//   2. GET /offers/search?q=coca cola&zipCode=67105 with those keys, dump the
//      raw unfiltered payload to spike/fixtures/raw-67105-search.json, and log:
//        - how many JSON islands matched and which index held the keys (Pitfall 4)
//        - Object.keys(data) so the real wrapper key is resolved (Open Q1 / Pitfall 1)
//        - the sorted set of distinct advertisers[].uniqueName (Pitfall 3 / Open Q)
//        - a sample validityDates value (Open Q4)
//
// SECURITY: the scraped apiKey/clientKey are low-sensitivity public bootstrap
// values, but they are NEVER logged and NEVER written to disk (RESEARCH Security
// Domain, T-01-02). Only their *presence* is reported.
//
// GOOD CITIZEN: native fetch only, a single low-volume request, a descriptive
// User-Agent, no loops, no parallelism (CLAUDE.md ToS guidance, T-01-04).
//
// Node 22+ (native fetch, top-level await, ESM). No dependencies.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const UA = "colaapp-spike/0.1 (personal, low-volume)";
const HOME = "https://www.marktguru.de/";
const API = "https://api.marktguru.de/api/v1/offers/search";
const ZIP = "67105";
const QUERY = "coca cola";

// Resolve the fixture path relative to this file so the probe works from any cwd.
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = `${HERE}/fixtures/raw-67105-search.json`;

/**
 * Fetch the marktguru homepage and extract the bootstrap API keys from the
 * first <script type="application/json"> island that contains config.apiKey.
 * Logs how many islands matched and which index won (no key VALUES are logged).
 * @returns {Promise<{apiKey: string, clientKey: string}>}
 */
async function getKeys() {
  const res = await fetch(HOME, { headers: { "user-agent": UA } });
  if (!res.ok) {
    throw new Error(`homepage fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  // Bounded, non-greedy match — no catastrophic backtracking (T-01-01).
  const blocks = [...html.matchAll(/<script\s+type="application\/json">(.*?)<\/script>/gms)];
  console.log(`JSON islands found on homepage: ${blocks.length}`);
  for (let i = 0; i < blocks.length; i++) {
    const json = blocks[i][1];
    let parsed;
    try {
      parsed = JSON.parse(json); // never eval; bad blocks are skipped (T-01-01)
    } catch {
      continue;
    }
    if (parsed?.config?.apiKey && parsed?.config?.clientKey) {
      console.log(`apiKey/clientKey found in JSON island index: ${i} (Phase 2 should select by config.apiKey, not by fixed index)`);
      return { apiKey: parsed.config.apiKey, clientKey: parsed.config.clientKey };
    }
  }
  throw new Error(
    "config.apiKey not found in any homepage JSON island — marktguru may have changed its bootstrap shape (re-confirm regex/field path)."
  );
}

async function main() {
  const { apiKey, clientKey } = await getKeys();

  const url = `${API}?as=web&q=${encodeURIComponent(QUERY)}&zipCode=${ZIP}&limit=200&offset=0`;
  const res = await fetch(url, {
    headers: {
      "x-apikey": apiKey,
      "x-clientkey": clientKey,
      "user-agent": UA,
    },
  });
  if (!res.ok) {
    throw new Error(`offers/search failed: HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  // Persist the raw, unfiltered payload — the field-name source of truth.
  await mkdir(dirname(FIXTURE), { recursive: true });
  await writeFile(FIXTURE, JSON.stringify(data, null, 2), "utf8");
  console.log(`raw payload written to: ${FIXTURE}`);

  // Resolve the real wrapper key (Open Question 1 / Pitfall 1).
  const topKeys = Array.isArray(data) ? ["<bare array>"] : Object.keys(data);
  console.log("Object.keys(data):", topKeys);
  let wrapperKey = "<bare array>";
  let offers;
  if (Array.isArray(data)) {
    offers = data;
  } else if (Array.isArray(data.results)) {
    offers = data.results;
    wrapperKey = "results";
  } else if (Array.isArray(data.data)) {
    offers = data.data;
    wrapperKey = "data";
  } else {
    // Last resort: find the first top-level array property.
    const arrEntry = Object.entries(data).find(([, v]) => Array.isArray(v));
    if (arrEntry) {
      offers = arrEntry[1];
      wrapperKey = arrEntry[0];
    } else {
      offers = [];
    }
  }
  console.log(`offers array resolved via wrapper key: "${wrapperKey}" (count: ${offers.length})`);

  // Distinct advertiser slugs (Pitfall 3 — build the 5-store map from real data).
  const slugs = new Set();
  for (const o of offers) {
    for (const a of o?.advertisers ?? []) {
      if (a?.uniqueName) slugs.add(a.uniqueName);
    }
  }
  console.log("distinct advertisers[].uniqueName @67105:", [...slugs].sort());

  // Sample a validityDates value to judge granularity (Open Question 4).
  const withDates = offers.find((o) => o?.validityDates);
  if (withDates) {
    console.log("sample validityDates:", JSON.stringify(withDates.validityDates));
  } else {
    console.log("sample validityDates: <none present on any returned offer>");
  }

  // Surface possible 12x1L positive cases for the human checkpoint to eyeball.
  const candidates = offers
    .map((o) =>
      [o?.brand?.name, o?.product?.name, o?.product?.description, o?.description]
        .filter(Boolean)
        .join(" ")
    )
    .filter((t) => /12\s*[x×]\s*1\s*-?\s*l/i.test(t));
  console.log(`possible 12x1L-text offers: ${candidates.length}`);
  for (const c of candidates.slice(0, 10)) console.log("  -", c);
}

main().catch((err) => {
  console.error("PROBE FAILED:", err.message);
  console.error(
    "If the network is blocked here, re-run on a machine with access to marktguru.de " +
      "(`npm run probe`). Do NOT fabricate a payload — see spike/findings.md fallback."
  );
  process.exitCode = 1;
});
