# spike/ — marktguru live probe

This directory holds the **Phase 1 spike**: a one-shot probe that proves the
marktguru data source before any contract (Plan 02) or matcher (Plan 03) is
frozen against it.

## What it does

`probe.mjs` performs two live requests:

1. `GET https://www.marktguru.de/` — scrapes the homepage and extracts the
   bootstrap API keys (`config.apiKey` / `config.clientKey`) from the
   `<script type="application/json">` island that contains them.
2. `GET https://api.marktguru.de/api/v1/offers/search?as=web&q=coca%20cola&zipCode=67105&limit=200&offset=0`
   with the `x-apikey` / `x-clientkey` headers.

It then:

- writes the **raw, unfiltered** response to `fixtures/raw-67105-search.json`
  (the field-name source of truth for the frozen contract),
- logs `Object.keys(data)` so the real response **wrapper key** is resolved,
- logs the sorted set of distinct `advertisers[].uniqueName` slugs returned for
  PLZ 67105 (used to build the fixed 5-store map),
- logs a sample `validityDates` value and any offers whose text looks like a
  `12 x 1 l` case (candidates for the positive matcher fixture).

The recorded answers are written up in [`findings.md`](./findings.md).

## How to run

```bash
npm run probe
```

Requires Node 22+ (native `fetch`, ESM). No dependencies.

The probe **never** logs or writes the scraped `apiKey`/`clientKey` — only their
presence and the index of the JSON island that held them. The keys are
low-sensitivity public bootstrap values but are still kept out of version control.

## Good-citizen cadence (CLAUDE.md ToS guidance)

marktguru's API is **unofficial and undocumented**. Use it gently:

- a single, low-volume request per run (this probe makes exactly two fetches),
- a descriptive `User-Agent` (`colaapp-spike/0.1 (personal, low-volume)`),
- no loops, no parallelism, no hammering,
- in production the scraper caches the homepage keys (~6h) and runs only a few
  times a day. Treat breakage as expected, not exceptional.

## If the network is blocked

If `npm run probe` cannot reach marktguru (sandbox/network restriction), run it
on a machine with access. If it still cannot run, or if no real `12 x 1 l`
Coca-Cola offer is on sale that week, Plan 03 synthesizes the positive fixture
**verbatim from the documented live strings** in `01-RESEARCH.md` — clearly
labelled as synthesized-from-real. The probe will **never** fabricate a payload;
on failure it exits non-zero with an actionable message.
