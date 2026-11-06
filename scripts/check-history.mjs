import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { selectOffers } from '../public/shop.js';

const seed = JSON.parse(await readFile(new URL('../data/history-seed.json', import.meta.url)));
const dates = new Set(seed.rows.map(row => row.date));
const missingDates = [];
for (let day = Date.parse(seed.rows[0].date); day <= Date.parse(seed.rows.at(-1).date); day += 86400000) {
  const date = new Date(day).toISOString().slice(0, 10);
  if (!dates.has(date)) missingDates.push(date);
}
let linkedItems = 0;
for (const row of seed.rows) {
  const shop = JSON.parse(gunzipSync(await readFile(new URL(`../data/history-shops/${row.date}.json.gz`, import.meta.url))));
  const bundles = new Set(shop.offers.filter(offer => offer.isBundle).map(offer => offer.id));
  for (const offer of shop.offers) {
    if (offer.bundles.length) linkedItems++;
    for (const id of offer.bundles) assert.ok(bundles.has(id), `${row.date}: missing linked bundle`);
  }
  const selection = selectOffers(shop.offers);
  const countedIds = new Set(selection.counted.map(offer => offer.id));
  let bundleFloor = 0;
  for (const bundle of shop.offers.filter(offer => offer.isBundle)) {
    const parents = selection.coveredBy.get(bundle.id);
    if (parents) {
      for (const parent of parents) {
        assert.ok(!bundle.coverageUnknown && !parent.coverageUnknown, `${row.date}: assumed bundle coverage`);
        assert.ok(bundle.itemIds.length && bundle.itemIds.every(id => parent.itemIds.includes(id)), `${row.date}: bundle not completely covered`);
      }
    } else {
      assert.ok(countedIds.has(bundle.id), `${row.date}: bundle removed from buyout`);
      bundleFloor += bundle.price ?? 0;
    }
  }
  assert.ok(selection.totals.value >= bundleFloor, `${row.date}: buyout below its bundle prices`);
  assert.equal(selection.totals.value, row.value, `${row.date}: graph and shop totals differ`);
  assert.equal(selection.totals.unpricedCount, row.unpricedCount, `${row.date}: missing-price count differs`);
  assert.equal(row.listedCount, shop.offers.length, `${row.date}: incorrect item count`);
  assert.ok(!row.unpricedCount || row.qualityReason, `${row.date}: missing warning`);
}
const partial = seed.rows.filter(row => row.unpricedCount > 0);
const listedPartial = seed.rows.filter(row => row.listedUnpricedCount > 0);
const report = {
  checkedAt: new Date().toISOString(), archivedDates: seed.rows.length,
  adjustedCompletePriceDates: seed.rows.length - partial.length,
  listedCompletePriceDates: seed.rows.length - listedPartial.length,
  adjustedPartialPriceDates: partial.length, listedPartialPriceDates: listedPartial.length,
  warningDates: seed.rows.filter(row => row.qualityReason).length, linkedItems,
  missingDates, importFailures: seed.gaps,
  partialSubtotals: partial.map(row => ({ date: row.date, knownValue: row.value, unpricedCount: row.unpricedCount, reason: row.qualityReason })),
  listedPartialDates: listedPartial.map(row => row.date),
};
await writeFile(new URL('../data/history-report.json', import.meta.url), JSON.stringify(report));
const lines = [
  '# Historical shop data report', '',
  `Checked ${report.archivedDates.toLocaleString('en-US')} archived dates, ${seed.rows[0].date} through ${seed.rows.at(-1).date}.`, '',
  `- Every date displays monetary values; item counts are never substituted for V-Bucks.`,
  `- ${report.adjustedCompletePriceDates.toLocaleString('en-US')} adjusted totals have all counted prices; ${report.adjustedPartialPriceDates} show a known-price subtotal and the missing-price count.`,
  `- The all-listed-prices view has ${report.listedCompletePriceDates.toLocaleString('en-US')} totals with all prices and ${report.listedPartialPriceDates.toLocaleString('en-US')} known-price subtotals.`,
  `- ${report.warningDates.toLocaleString('en-US')} dates show a yellow possible-mistakes warning.`,
  `- All ${report.archivedDates.toLocaleString('en-US')} snapshots open; every inferred bundle link resolves.`, '',
  '## Remaining exceptions', '',
  'These calendar dates are absent from the downloaded source archive; no shop or price has been invented:', '',
  ...missingDates.map(date => `- ${date}`), '',
  'Reported regression: 2026-05-07 contains 28 bundles priced at 58,000 V-Bucks combined. Its known buyout subtotal is 155,800 V-Bucks with four unpriced listings. Previously, the price display was replaced with its 380-item count.', '',
  'The complete dates and missing-price reasons are in [data/history-report.json](data/history-report.json).', '',
  'Bundle assumptions use the named shop section, never the global item-type filter. All bundles in an inferred section remain separately priced unless confirmed contents prove coverage. Sections without bundles are not grouped.', '',
];
await writeFile(new URL('../HISTORY-REPORT.md', import.meta.url), lines.join('\n'));
const { partialSubtotals, listedPartialDates, ...summary } = report;
console.log(JSON.stringify(summary));
