// test/scraper.wasgau.candidates.test.mjs
// Wasgau candidate cache, re-evaluation and review gating (Phase 5):
//   - unit: evaluateCandidates gating (D-12 probation, D-13 pairing classes,
//     unpaired case -> error, expiry/upcoming), refreshVerdicts, the
//     deterministic + poison-proof candidates doc (D-11, T-05-08)
//   - run(): the leaflet-id cache (one request per unchanged week, D-05/D-06),
//     byte-identical candidates file, partial-failure safety (Pitfall 10),
//     unpaired near-miss written for review, probation off -> history.
//   - all-pages discovery (2026-10-26): a new leaflet fetches EVERY index page,
//     so a Cola case whose 1kcloud index text is truncated is still found; the
//     CANDIDATES_DOC_VERSION cache-buster makes an old-rule cached doc a miss.
// Fully offline: every run() injects a URL-recording fixture stub; fixture
// variants are in-memory string edits (no new fixture files, Pitfall 9).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { run } from "../scraper/index.mjs";
import { parseCurrentOffers, parseStatusFile } from "../contract/schema.mjs";
import * as cands from "../scraper/wasgau/candidates.mjs";
import { CANDIDATES_FILE } from "../scraper/wasgau/build.mjs";
import { COLA_RE, parseIndex } from "../scraper/wasgau/leaflet.mjs";

const { evaluateCandidates, buildCandidatesDoc, parseCandidatesDoc, CandidatesDocSchema } = cands;

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "wasgau");
const fx = (name) => readFileSync(join(FIX, name), "utf8");

// Real reconstructed p17 box texts: the synthesized-from-real 12x1L PET case
// (matcher: accept) and the real 6x1L glass case (matcher: reject).
const ACCEPT_TEXT =
  "*Coca Cola1) oder *Coca Cola Zero 1) und weitere Sorten je 12 x 1-l-MW-PET-flaschen, zzgl. 2.40 Pfand, 1-l-Preis 0.75, 1)koffeinhaltig";
const REJECT_TEXT =
  "*Coca Cola1) oder *Coca Cola Zero 1) und weitere Sorten je 6 x 1-l-MW-Glasflaschen, zzgl. 2.40 Pfand, 1-l-Preis 1.50, 1)koffeinhaltig";

const LEAFLET_ROOT = "https://wasgau-dlog.1kcloud.com/ep1rP1V0/";
const HOME = "https://www.wasgau.de/";

// One schema-shaped candidate; override any field.
const cand = (o = {}) => ({
  page: 17,
  box: 14,
  bbox: [23.04, 216.25, 101.34, 268.0],
  text: ACCEPT_TEXT,
  priceCents: 899,
  pairing: "clean",
  adjacentCents: [899],
  unitPriceCents: 75,
  litres: 12,
  validFrom: "2026-10-12",
  validTo: "2026-10-17",
  windowSource: "leaflet",
  verdict: "accept",
  ...o,
});

// Always built through buildCandidatesDoc, so every unit doc is schema-valid.
const docOf = (candidates, o = {}) =>
  buildCandidatesDoc({
    leafletId: "ep1rP1V0",
    leafletUrl: LEAFLET_ROOT,
    title: "WASGAU Prospekt ab 12.10.",
    leafletWindow: { from: "2026-10-12", to: "2026-10-17" },
    colaPages: [17],
    candidates,
    ...o,
  });

const NOW = new Date("2026-10-14T10:00:00Z"); // Wednesday inside 12..17 Oct
const OFF = { probation: false };
const ON = { probation: true };

// --- evaluateCandidates: probation (D-12) ---

test("evaluate: probation ON forces needsReview on a clean accept (D-12)", () => {
  const r = evaluateCandidates(docOf([cand()]), NOW, ON);
  assert.equal(r.status, "offer");
  assert.equal(r.needsReview, true);
});

test("evaluate: probation OFF, a clean accept is a normal offer", () => {
  const r = evaluateCandidates(docOf([cand()]), NOW, OFF);
  assert.equal(r.status, "offer");
  assert.equal(r.store, "Wasgau");
  assert.equal(r.needsReview, false);
  assert.equal(r.price, 899);
  assert.equal(r.pricePerLitre, 75);
  assert.equal(r.validFrom, "2026-10-12");
  assert.equal(r.validTo, "2026-10-17");
});

// --- evaluateCandidates: D-13 pairing classes ---

test("evaluate: an ambiguous accept stays needsReview with its best-guess price (D-13)", () => {
  const r = evaluateCandidates(docOf([cand({ pairing: "ambiguous", adjacentCents: [899, 1099] })]), NOW, OFF);
  assert.equal(r.status, "offer");
  assert.equal(r.needsReview, true);
  assert.equal(r.price, 899);
});

test("evaluate: a mismatch accept stays needsReview with its best-guess price (D-13)", () => {
  const r = evaluateCandidates(docOf([cand({ pairing: "mismatch" })]), NOW, OFF);
  assert.equal(r.status, "offer");
  assert.equal(r.needsReview, true);
  assert.equal(r.price, 899);
});

test("evaluate: a clean accept wins over a cheaper ambiguous accept", () => {
  const doc = docOf([
    cand({ box: 14, priceCents: 1099, adjacentCents: [1099] }),
    cand({ box: 20, priceCents: 899, pairing: "ambiguous", adjacentCents: [899, 1099] }),
  ]);
  const r = evaluateCandidates(doc, NOW, OFF);
  assert.equal(r.price, 1099);
  assert.equal(r.needsReview, false);
});

// --- evaluateCandidates: unpaired Cola case -> error (P5-SC3) ---

test("evaluate: an accept-text candidate without a paired price throws", () => {
  const doc = docOf([cand({ priceCents: null, pairing: "unpaired", adjacentCents: [] })]);
  assert.throws(() => evaluateCandidates(doc, NOW, OFF), /without a paired price \(page 17 box 14\)/);
});

test("evaluate: an unpaired reject-text candidate is ignored", () => {
  const doc = docOf([
    cand({ box: 14 }),
    cand({ box: 17, text: REJECT_TEXT, verdict: "reject", priceCents: null, pairing: "unpaired", adjacentCents: [] }),
  ]);
  const r = evaluateCandidates(doc, NOW, OFF);
  assert.equal(r.status, "offer");
  assert.equal(r.price, 899);
});

// --- evaluateCandidates: expiry and upcoming (D-06 / D-07, Pitfall 12) ---

test("evaluate: now after validTo yields no_offer (expiry)", () => {
  assert.deepEqual(evaluateCandidates(docOf([cand()]), new Date("2026-10-18T10:00:00Z"), OFF), {
    status: "no_offer",
  });
});

test("evaluate: now before validFrom yields an upcoming offer", () => {
  const r = evaluateCandidates(docOf([cand()]), new Date("2026-10-08T10:00:00Z"), OFF);
  assert.equal(r.status, "offer");
  assert.equal(r.validFrom, "2026-10-12");
});

// --- fresh verdicts (D-06) ---

test("evaluate: a stored 'reject' verdict on accept text is evaluated as accept", () => {
  const r = evaluateCandidates(docOf([cand({ verdict: "reject" })]), NOW, OFF);
  assert.equal(r.status, "offer");
  assert.equal(r.price, 899);
});

test("refreshVerdicts rewrites only the verdict field, and is a byte no-op when unchanged", () => {
  assert.equal(typeof cands.refreshVerdicts, "function", "refreshVerdicts must be exported");
  const stale = docOf([cand({ verdict: "reject" }), cand({ box: 17, text: REJECT_TEXT, verdict: "reject" })]);
  const before = JSON.stringify(stale);
  const fresh = cands.refreshVerdicts(stale);
  assert.equal(JSON.stringify(stale), before, "input must not be mutated");
  assert.equal(fresh.candidates[0].verdict, "accept");
  assert.equal(fresh.candidates[1].verdict, "reject");
  const blank = (d) => JSON.stringify({ ...d, candidates: d.candidates.map((c) => ({ ...c, verdict: "-" })) });
  assert.equal(blank(fresh), blank(stale));
  assert.ok(parseCandidatesDoc(fresh), "refreshed doc stays schema-valid");
  assert.equal(JSON.stringify(cands.refreshVerdicts(fresh)), JSON.stringify(fresh));
});

// --- deterministic, poison-proof doc (D-11, T-05-08) ---

test("buildCandidatesDoc: shuffled input gives identical bytes; bbox rounded to 0.1", () => {
  const list = [cand({ page: 26, box: 36 }), cand({ page: 17, box: 17 }), cand({ page: 17, box: 14 })];
  const a = docOf(list);
  const b = docOf([list[2], list[0], list[1]]);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.candidates.map((c) => [c.page, c.box]), [[17, 14], [17, 17], [26, 36]]);
  assert.deepEqual(a.candidates[0].bbox, [23, 216.3, 101.3, 268]);
});

test("candidates doc: extra key, bad leafletId, bad date are rejected on build and on read", () => {
  const good = JSON.parse(JSON.stringify(docOf([cand()])));
  // buildCandidatesDoc emits fixed keys only; its schema rejects any extra key.
  assert.throws(() => CandidatesDocSchema.parse({ ...good, extra: 1 }));
  assert.equal(parseCandidatesDoc({ ...good, extra: 1 }), null);
  assert.equal(parseCandidatesDoc({ ...good, candidates: [{ ...good.candidates[0], extra: 1 }] }), null);

  assert.throws(() => docOf([cand()], { leafletId: "../evil" }));
  assert.equal(parseCandidatesDoc({ ...good, leafletId: "../evil" }), null);

  assert.throws(() => docOf([cand({ validFrom: "15.10.2026" })]));
  assert.equal(parseCandidatesDoc({ ...good, candidates: [{ ...good.candidates[0], validFrom: "15.10.2026" }] }), null);
});

test("candidates doc: version is the first key (2); a doc without it or with an old version is a cache miss", () => {
  const good = JSON.parse(JSON.stringify(docOf([cand()])));
  assert.equal(cands.CANDIDATES_DOC_VERSION, 2);
  assert.equal(Object.keys(good)[0], "version");
  assert.equal(good.version, 2);
  assert.ok(parseCandidatesDoc(good), "a current-version doc stays valid");
  const { version, ...unversioned } = good;
  assert.equal(parseCandidatesDoc(unversioned), null);
  assert.equal(parseCandidatesDoc({ ...good, version: 1 }), null);
});

// ---------------------------------------------------------------------------
// run()-level proofs (offline fixture stub, fresh tmp dir per case)
// ---------------------------------------------------------------------------

// The index fixture lists pages 1, 2, 17, 26 and every listed page is now
// fetched. Page 2 has no captured XML, so the real no-Cola page_24 capture
// stands in (extractCandidates takes the page number from the URL, not the XML).
const DEFAULT_PAGES = {
  1: fx("page_1.xml"),
  2: fx("page_24.xml"),
  17: fx("page_17.positive.xml"),
  26: fx("page_26.xml"),
};

// URL -> fixture stub for one leaflet id. `pages` maps page number to the XML
// text, or to an Error to throw, and is MERGED over DEFAULT_PAGES. Records every
// requested URL; unknown URLs throw.
function leafletStub({ id = "ep1rP1V0", index = fx("index.html"), pages = {} } = {}) {
  pages = { ...DEFAULT_PAGES, ...pages };
  const calls = [];
  const root = `https://wasgau-dlog.1kcloud.com/${id}/`;
  const homepage = fx("homepage.html").replaceAll("ep1rP1V0", id);
  const fetchText = async (url) => {
    calls.push(url);
    if (url === HOME) return homepage;
    if (url === root) return index;
    const m = url.startsWith(root) ? url.slice(root.length).match(/^epaper\/coords\/page_(\d+)\.xml$/) : null;
    const body = m ? pages[m[1]] : undefined;
    if (body instanceof Error) throw body;
    if (typeof body === "string") return body;
    throw new Error(`leafletStub: unexpected URL ${url}`);
  };
  return { calls, fetchText, root };
}

// Every run in this file goes through here: explicit Wasgau seam, no marktguru.
const runW = (d, now, wasgau) => run({ wasgau, now, dataDir: d, fetchOffers: async () => [] });

const T1 = new Date("2026-10-14T10:00:00Z");
const T2 = new Date("2026-10-14T16:00:00Z");

const freshDir = () => mkdtemp(join(tmpdir(), "colawasgau-"));
const readText = (d, name) => readFile(join(d, name), "utf8");
const wasgauOffer = async (d) =>
  parseCurrentOffers(JSON.parse(await readText(d, "current-offers.json"))).stores.find((s) => s.store === "Wasgau");
const wasgauStatus = async (d) =>
  parseStatusFile(JSON.parse(await readText(d, "status.json"))).stores.find((s) => s.store === "Wasgau");
const readDoc = async (d) => parseCandidatesDoc(JSON.parse(await readText(d, CANDIDATES_FILE)));
async function historyLines(d) {
  try {
    return (await readText(d, "price-history.jsonl")).split("\n").map((l) => l.trim()).filter(Boolean);
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

// Wrap a run()-level case in a fresh tmp dir that is always removed.
const inDir = (fn) => async () => {
  const d = await freshDir();
  try {
    await fn(d);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
};

test(
  "run: unchanged leaflet id costs ONE request, byte-identical candidates file, lastUpdated bumps (D-05/D-06/D-11)",
  inDir(async (d) => {
    const s1 = leafletStub();
    await runW(d, T1, { fetchText: s1.fetchText });
    assert.equal(s1.calls.length, 6); // homepage, index, pages 1, 2, 17, 26
    const file1 = await readText(d, CANDIDATES_FILE);
    const offer1 = await wasgauOffer(d);

    const s2 = leafletStub();
    await runW(d, T2, { fetchText: s2.fetchText });
    assert.deepEqual(s2.calls, ["https://www.wasgau.de/"]);
    assert.equal(await readText(d, CANDIDATES_FILE), file1); // byte-identical (string compare)
    assert.deepEqual(await wasgauOffer(d), offer1);
    assert.deepEqual(await wasgauStatus(d), { store: "Wasgau", status: "offer", lastUpdated: "2026-10-14T16:00:00.000Z" });
  })
);

test(
  "run: the p26 2 L Coca Cola candidate carries the page weekend window (Task 1 integrated)",
  inDir(async (d) => {
    await runW(d, T1, { fetchText: leafletStub().fetchText });
    const c36 = (await readDoc(d)).candidates.find((c) => c.page === 26 && c.box === 36);
    assert.ok(c36, "page 26 box 36 must be a candidate");
    assert.equal(c36.windowSource, "page");
    assert.equal(c36.validFrom, "2026-10-15");
    assert.equal(c36.validTo, "2026-10-17");
  })
);

test(
  "run: a new leaflet id triggers the full re-download",
  inDir(async (d) => {
    await runW(d, T1, { fetchText: leafletStub().fetchText });
    const s2 = leafletStub({ id: "ep2NEW99" });
    await runW(d, T2, { fetchText: s2.fetchText });
    assert.deepEqual(s2.calls, [
      HOME,
      s2.root,
      `${s2.root}epaper/coords/page_1.xml`,
      `${s2.root}epaper/coords/page_2.xml`,
      `${s2.root}epaper/coords/page_17.xml`,
      `${s2.root}epaper/coords/page_26.xml`,
    ]);
    assert.equal((await readDoc(d)).leafletId, "ep2NEW99");
  })
);

test(
  "run: a corrupt candidates file is a cache miss and gets rewritten valid (T-05-08)",
  inDir(async (d) => {
    await writeFile(join(d, CANDIDATES_FILE), "{not json");
    const s = leafletStub();
    await runW(d, T1, { fetchText: s.fetchText });
    assert.equal(s.calls.length, 6);
    const doc = await readDoc(d);
    assert.ok(doc, "rewritten file must be schema-valid");
    assert.equal(doc.leafletId, "ep1rP1V0");
  })
);

test(
  "run: a failed new-leaflet page download keeps the previous candidates file (Pitfall 10)",
  inDir(async (d) => {
    await runW(d, T1, { fetchText: leafletStub().fetchText });
    const file1 = await readText(d, CANDIDATES_FILE);

    const failing = leafletStub({
      id: "ep2NEW99",
      pages: { 26: new Error("boom page_26") },
    });
    await runW(d, T2, { fetchText: failing.fetchText });
    assert.equal((await wasgauStatus(d)).status, "error");
    assert.equal(await readText(d, CANDIDATES_FILE), file1);
  })
);

test(
  "run: the same failure on a cold dir creates no candidates file",
  inDir(async (d) => {
    const failing = leafletStub({
      id: "ep2NEW99",
      pages: { 26: new Error("boom page_26") },
    });
    await runW(d, T1, { fetchText: failing.fetchText });
    assert.equal((await wasgauStatus(d)).status, "error");
    await assert.rejects(access(join(d, CANDIDATES_FILE)), { code: "ENOENT" });
  })
);

test(
  "run: an unpaired Cola case candidate -> Wasgau error, near-miss still written for review (P5-SC3, D-10/D-11)",
  inDir(async (d) => {
    const noPrice = fx("page_17.positive.xml").replace(/<textbox id="15"[\s\S]*?<\/textbox>\r?\n?/, "");
    assert.notEqual(noPrice, fx("page_17.positive.xml"), "textbox 15 must have been removed");
    await runW(d, T1, { fetchText: leafletStub({ pages: { 17: noPrice } }).fetchText });
    assert.equal((await wasgauStatus(d)).status, "error");
    const doc = await readDoc(d);
    assert.ok(doc, "candidates file must be written and valid");
    const c14 = doc.candidates.find((c) => c.page === 17 && c.box === 14);
    assert.equal(c14.pairing, "unpaired");
    assert.equal(c14.priceCents, null);
  })
);

test(
  "run: probation OFF turns the clean leaflet offer into a normal offer with one history line (D-12)",
  inDir(async (d) => {
    await runW(d, T1, { fetchText: leafletStub().fetchText, config: { probation: false } });
    assert.equal((await wasgauOffer(d)).needsReview, false);
    const lines = (await historyLines(d)).map((l) => JSON.parse(l)).filter((l) => l.store === "Wasgau");
    assert.deepEqual(lines, [
      { date: "2026-10-14", store: "Wasgau", price: 899, pricePerLitre: 75, validFrom: "2026-10-12", validTo: "2026-10-17" },
    ]);
  })
);

test(
  "run: a leaflet without any Cola box fetches every page once and yields no_offer",
  inDir(async (d) => {
    // Pages 1 and 2 are already Cola-free; swap the two Cola pages for p24.
    const s = leafletStub({ pages: { 17: fx("page_24.xml"), 26: fx("page_24.xml") } });
    await runW(d, T1, { fetchText: s.fetchText });
    assert.deepEqual(s.calls, [
      HOME,
      LEAFLET_ROOT,
      `${LEAFLET_ROOT}epaper/coords/page_1.xml`,
      `${LEAFLET_ROOT}epaper/coords/page_2.xml`,
      `${LEAFLET_ROOT}epaper/coords/page_17.xml`,
      `${LEAFLET_ROOT}epaper/coords/page_26.xml`,
    ]);
    assert.deepEqual((await readDoc(d)).colaPages, []);
    assert.equal((await wasgauOffer(d)).status, "no_offer");
    assert.equal((await wasgauStatus(d)).status, "no_offer");
  })
);

test(
  "run: an expired cached leaflet yields no_offer without any re-download (D-06)",
  inDir(async (d) => {
    await runW(d, T1, { fetchText: leafletStub().fetchText, config: { probation: false } });
    const s = leafletStub();
    await runW(d, new Date("2026-10-19T10:00:00Z"), { fetchText: s.fetchText, config: { probation: false } });
    assert.deepEqual(s.calls, [HOME]);
    assert.equal((await wasgauOffer(d)).status, "no_offer");
  })
);

test(
  "run: a leaflet published ahead of its window surfaces as an upcoming offer (D-07, Pitfall 12)",
  inDir(async (d) => {
    await runW(d, new Date("2026-10-09T10:00:00Z"), { fetchText: leafletStub().fetchText, config: { probation: false } });
    const o = await wasgauOffer(d);
    assert.equal(o.status, "offer");
    assert.equal(o.validFrom, "2026-10-12");
  })
);

test(
  "run: a 12x1 l case on a page whose index text lacks Coca-Cola is still found (1kcloud index truncation, 2026-10-26)",
  inDir(async (d) => {
    // Precondition: the index text of page 1 has no Cola mention, so the old
    // index-text Cola page picker would never have downloaded page 1.
    const p1 = parseIndex(fx("index.html")).pages.find((p) => p.page === 1);
    assert.ok(p1, "index fixture must list page 1");
    assert.equal(COLA_RE.test(p1.text), false, "index text lacks Coca-Cola on page 1");

    // Page 1's coords XML carries the 12x1 l box (positive p17 capture).
    const s = leafletStub({ pages: { 1: fx("page_17.positive.xml"), 17: fx("page_17.xml") } });
    await runW(d, T1, { fetchText: s.fetchText, config: { probation: false } });
    assert.deepEqual(s.calls, [
      HOME,
      LEAFLET_ROOT,
      `${LEAFLET_ROOT}epaper/coords/page_1.xml`,
      `${LEAFLET_ROOT}epaper/coords/page_2.xml`,
      `${LEAFLET_ROOT}epaper/coords/page_17.xml`,
      `${LEAFLET_ROOT}epaper/coords/page_26.xml`,
    ]);

    const doc = await readDoc(d);
    assert.deepEqual(doc.colaPages, [1, 17, 26]);
    const hit = doc.candidates.find((c) => c.page === 1 && c.box === 14);
    assert.ok(hit, "page 1 box 14 must be a candidate");
    assert.equal(hit.verdict, "accept");
    assert.equal(hit.pairing, "clean");
    assert.equal(hit.priceCents, 899);
    assert.equal(hit.litres, 12);

    const o = await wasgauOffer(d);
    assert.equal(o.status, "offer");
    assert.equal(o.price, 899);
    assert.equal(o.needsReview, false);
  })
);

test(
  "run: a cached doc from the old discovery rule (no version) is a cache miss and is rebuilt",
  inDir(async (d) => {
    const old = JSON.parse(JSON.stringify(docOf([cand()])));
    delete old.version; // what the old rule wrote (same leafletId as the stub)
    await writeFile(join(d, CANDIDATES_FILE), JSON.stringify(old, null, 2));
    const s = leafletStub();
    await runW(d, T1, { fetchText: s.fetchText });
    assert.equal(s.calls.length, 6, "full download, not the homepage-only cache hit");
    assert.equal((await readDoc(d)).version, cands.CANDIDATES_DOC_VERSION);
  })
);
