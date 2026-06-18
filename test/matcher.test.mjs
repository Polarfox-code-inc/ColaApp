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

const offer = (description, extra = {}) => ({
  brand: { name: "Coca-Cola" },
  product: { name: "Cola" },
  description,
  ...extra,
});

// A 1-litre case of 12 OR MORE bottles (a full Kasten + bonus) -> accept, incl.
// Coca-Cola-company mixed bundles and any flavor (user scope decision 2026-06).
test("a 14 x 1 l Coca-Cola case -> accept (>=12, bonus bottles ok)", () => {
  assert.equal(classify(offer("Coca-Cola koffeinhaltig 14 x je 1-l-PET-Fl.")), "accept");
});

test("a 20 x 1 l mixed Coke-company case -> accept", () => {
  assert.equal(classify(offer("Coca-Cola oder Fanta 20 x 1-l versch. Sorten")), "accept");
});

test("a mixed-brand 12 x 1 l bundle that includes Coca-Cola -> accept", () => {
  assert.equal(
    classify(offer("Coca-Cola, Fanta, Sprite oder Mezzo Mix 12 x 1-l versch. Sorten")),
    "accept"
  );
});

// "versch. Sorten" = various FLAVORS; it must never demote a confirmable case.
test('"versch. Sorten" alone does not demote a clean 12x1L case', () => {
  assert.equal(classify(offer("Coca-Cola koffeinhaltig versch. Sorten 12 x 1-l")), "accept");
});

// Fewer than 12 1-litre bottles is a six-pack, not a case -> reject.
test("a 6 x 1 l case -> reject (under a full case)", () => {
  assert.equal(classify(offer("Coca-Cola 6 x 1-l case")), "reject");
});

test("an 11 x 1 l pack -> reject (still under 12)", () => {
  assert.equal(classify(offer("Coca-Cola 11 x 1-l")), "reject");
});

// "12 x je 1-l" (real Kaufland phrasing with "je") -> accept.
test('the "je" phrasing "12 x je 1-l" accepts', () => {
  assert.equal(classify(offer("Coca-Cola 12 x je 1-l-PET-Fl.")), "accept");
});

// A "Kasten" with no confirmable per-bottle size/count -> review (ambiguous).
test('an ambiguous "Kasten" with no size -> review', () => {
  assert.equal(classify(offer("Coca-Cola Kasten versch. Sorten")), "review");
});

// A Fanta-only bundle (no Coca-Cola) -> reject even at a valid case size.
test("a case that does NOT include Coca-Cola -> reject", () => {
  assert.equal(
    classify({ brand: { name: "Fanta" }, product: { name: "Limo" }, description: "Fanta oder Sprite 12 x 1-l" }),
    "reject"
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
