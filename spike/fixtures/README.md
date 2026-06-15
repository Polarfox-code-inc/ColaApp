# Matcher fixtures (DATA-02)

Each fixture mirrors the marktguru `Offer` shape (`brand.name`, `product.name`,
`product.description`, top-level `description`) so the strict 12×1L matcher
(`contract/matcher.mjs`) can classify it offline. Every fixture also carries two
non-payload meta keys the matcher ignores:

- `_label` — `captured-live` (verbatim from `spike/fixtures/raw-67105-search.json`)
  or `synthesized-from-real-text` (built **verbatim** from the live pack-size
  strings documented in `01-RESEARCH.md` → "Strict 12×1L Matcher").
- `_source` — the exact origin string.

> No fixture is invented. Per `01-RESEARCH.md` Anti-Patterns and `spike/findings.md`
> §6, **zero real 12×1L Coca-Cola cases were on sale at PLZ 67105 this week**, so
> all three positive (`accept/`) cases are `synthesized-from-real-text` from the
> documented live token `12 x 1-l case`. The captured payload is a strong
> negative/quarantine corpus and supplies the reject/review cases where it has a
> matching real string.

## accept/ — classify() → "accept" (Coca-Cola, 12×1L, any flavor, D-06)

| File | Label | Source |
|------|-------|--------|
| `classic-12x1l.json` | synthesized-from-real-text | RESEARCH live token `12 x 1-l case`; Classic. Contains a Pfand phrase (`zzgl. 3,30 Pfand`) to prove D-10 (Pfand never flips the verdict). |
| `zero-12x1l.json` | synthesized-from-real-text | RESEARCH `12 x 1-l` + flavor `Zero` (captured `oder Coca-Cola Zero`). |
| `light-12x1l.json` | synthesized-from-real-text | RESEARCH `12 x 1-l` + flavor `Light`. |

## reject/ — classify() → "reject" (wrong pack/size or non-Coca-Cola brand, D-07)

| File | Label | Source |
|------|-------|--------|
| `bottle-125l.json` | captured-live | `raw-67105-search.json` results[9] — `je 1,25-l-Fl.` |
| `sixpack-033.json` | captured-live | results[8] — `je 6 x 0,33-l-Fl.-Pckg.` |
| `tray-10x033.json` | captured-live | results[7] — `je 10 x 0,33-l-DosenPckg.` |
| `wholesale-24x033.json` | synthesized-from-real-text | RESEARCH `24 x 0,33 l Dose … NUR FÜR GROSSHÄNDLER` |
| `case-12x05l.json` | synthesized-from-real-text | RESEARCH `12 x 0,5-l … 7,99 €` (right count, wrong size) |
| `case-6x1l.json` | synthesized-from-real-text | RESEARCH `6 x 1-l case … 7,99 €` (right size, wrong count) |
| `store-brand-cola.json` | synthesized-from-real-text | RESEARCH brand-gate store-brand list — `ja!` / River Cola at `12 x 1 l` |

## review/ — classify() → "review" (needsReview quarantine, D-08)

| File | Label | Source |
|------|-------|--------|
| `mixed-brand-12x1l.json` | synthesized-from-real-text | RESEARCH `12 x 1-l case … (Fanta/Sprite/Mezzo Mix)`; mixed-brand corroborated by results[1] `MEZZO MIX oder FANTA` |
| `kasten-no-size.json` | synthesized-from-real-text | RESEARCH "`Kasten` with no explicit per-bottle size" — ambiguous size |
