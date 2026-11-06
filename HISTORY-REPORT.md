# Historical shop data report

Checked 3,288 archived dates, 2017-10-26 through 2026-11-05.

- Every date displays monetary values; item counts are never substituted for V-Bucks.
- 2,883 adjusted totals have all counted prices; 405 show a known-price subtotal and the missing-price count.
- The all-listed-prices view has 2,234 totals with all prices and 1,054 known-price subtotals.
- 2,367 dates show a yellow possible-mistakes warning.
- All 3,288 snapshots open; every inferred bundle link resolves.

## Remaining exceptions

These calendar dates are absent from the downloaded source archive; no shop or price has been invented:

- 2019-10-14
- 2026-03-27
- 2026-04-13
- 2026-04-20
- 2026-05-18
- 2026-06-09
- 2026-06-11
- 2026-06-13
- 2026-07-01
- 2026-07-03

Reported regression: 2026-05-07 contains 28 bundles priced at 58,000 V-Bucks combined. Its known buyout subtotal is 155,800 V-Bucks with four unpriced listings. Previously, the price display was replaced with its 380-item count.

The complete dates and missing-price reasons are in [data/history-report.json](data/history-report.json).

Bundle assumptions use the named shop section, never the global item-type filter. All bundles in an inferred section remain separately priced unless confirmed contents prove coverage. Sections without bundles are not grouped.
