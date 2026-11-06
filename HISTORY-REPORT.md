# Historical shop data report

Checked 3,288 archived dates, 2017-10-26 through 2026-11-05.

- 2,883 dates have a bundle-adjusted V-Bucks total.
- 405 dates show total item counts in that view because prices are missing.
- The all-listed-prices view has 2,234 price totals and 1,054 item-count fallbacks.
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

Price-missing examples: 2017-12-17 (6 items), 2017-12-18 (6 items), 2017-12-19 (6 items).

The complete dates and missing-price reasons are in [data/history-report.json](data/history-report.json).

Bundle assumptions use the named shop section, never the global item-type filter. All bundles in an inferred section remain separately priced unless confirmed contents prove coverage. Sections without bundles are not grouped.
