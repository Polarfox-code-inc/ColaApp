import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classify, normalize } from "../contract/matcher.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(ROOT, "spike", "fixtures");

// Load every *.json fixture in a verdict directory (each mirrors a marktguru Offer).
const loadVerdictDir = (verdict) => {
  const dir = join(FIX, verdict);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: `${verdict}/${f}`, offer: JSON.parse(readFileSync(join(dir, f), "utf8")) }));
};

const accept = loadVerdictDir("accept");
const reject = loadVerdictDir("reject");
const review = loadVerdictDir("review");

// Guard the corpus size so the matcher boundary stays pinned (DATA-02).
test("fixture corpus has >=3 accept, >=7 reject, >=2 review", () => {
  assert.ok(accept.length >= 3, `accept=${accept.length}`);
  assert.ok(reject.length >= 7, `reject=${reject.length}`);
  assert.ok(review.length >= 2, `review=${review.length}`);
});

// classify(fixture) must return the expected verdict for every fixture.
for (const { name, offer } of accept) {
  test(`accept: ${name} -> "accept"`, () => {
    assert.equal(classify(offer), "accept");
  });
}

for (const { name, offer } of reject) {
  test(`reject: ${name} -> "reject"`, () => {
    assert.equal(classify(offer), "reject");
  });
}

for (const { name, offer } of review) {
  test(`review: ${name} -> "review"`, () => {
    assert.equal(classify(offer), "review");
  });
}

// D-10 / Pitfall 5: a Pfand phrase in the description must never flip the verdict.
test("Pfand text does not affect the verdict (D-10)", () => {
  const base = {
    brand: { name: "Coca-Cola", uniqueName: "coca-cola" },
    product: { name: "Cola", description: "Original" },
    description: "Coca-Cola 12 x 1-l case 11,99 €",
  };
  const withPfand = {
    ...base,
    description: `${base.description} zzgl. 3,30 Pfand`,
  };
  assert.equal(classify(base), "accept");
  assert.equal(classify(withPfand), "accept");
});

// Odd-count 1-litre case (e.g. the real Kaufland "14 x je 1-l") is case-like but
// not the canonical 12-pack -> review, never silently dropped (D-08).
test("a 14 x 1 l Coca-Cola case -> review (odd count)", () => {
  assert.equal(
    classify({
      brand: { name: "Coca-Cola" },
      product: { name: "Cola" },
      description: "Coca-Cola koffeinhaltig 14 x je 1-l-PET-Fl.",
    }),
    "review"
  );
});

// The known-wrong 6x count stays a hard reject (DISQUALIFY precedes the review
// path) — odd-count review must not weaken the 6x1L boundary (D-07).
test("a 6 x 1 l case stays reject (known-wrong count)", () => {
  assert.equal(
    classify({
      brand: { name: "Coca-Cola" },
      product: { name: "Cola" },
      description: "Coca-Cola 6 x 1-l case",
    }),
    "reject"
  );
});

// "12 x je 1-l" (real Kaufland phrasing with "je") still reads as the clean
// 12x1L case -> accept.
test('the "je" phrasing "12 x je 1-l" still accepts', () => {
  assert.equal(
    classify({
      brand: { name: "Coca-Cola" },
      product: { name: "Cola", description: "koffeinhaltig" },
      description: "Coca-Cola 12 x je 1-l-PET-Fl.",
    }),
    "accept"
  );
});

// Anti-Pattern #1: the matcher must read description text, not title alone.
test("normalize() concatenates description, not just product.name", () => {
  const text = normalize({
    brand: { name: "Coca-Cola" },
    product: { name: "Cola", description: "Zero" },
    description: "12 x 1-l case",
  });
  assert.ok(text.includes("12 x 1-l"), `normalized text missing pack token: ${text}`);
  assert.ok(text.includes("zero"));
});
