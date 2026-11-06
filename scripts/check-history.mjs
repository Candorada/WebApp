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
  assert.equal(selectOffers(shop.offers).totals.value, row.value, `${row.date}: graph and shop totals differ`);
  assert.equal(row.listedCount, shop.offers.length, `${row.date}: incorrect item-count fallback`);
  assert.ok(row.value !== null || row.qualityReason, `${row.date}: missing warning`);
}
const countOnly = seed.rows.filter(row => row.value === null);
const listedCountOnly = seed.rows.filter(row => row.listedValue === null);
const report = {
  checkedAt: new Date().toISOString(), archivedDates: seed.rows.length,
  adjustedPriceDates: seed.rows.length - countOnly.length,
  listedPriceDates: seed.rows.length - listedCountOnly.length,
  adjustedItemCountDates: countOnly.length, listedItemCountDates: listedCountOnly.length,
  warningDates: seed.rows.filter(row => row.qualityReason).length, linkedItems,
  missingDates, importFailures: seed.gaps,
  itemCountFallbacks: countOnly.map(row => ({ date: row.date, items: row.listedCount, reason: row.qualityReason })),
  listedCountFallbacks: listedCountOnly.map(row => row.date),
};
await writeFile(new URL('../data/history-report.json', import.meta.url), JSON.stringify(report));
const lines = [
  '# Historical shop data report', '',
  `Checked ${report.archivedDates.toLocaleString('en-US')} archived dates, ${seed.rows[0].date} through ${seed.rows.at(-1).date}.`, '',
  `- ${report.adjustedPriceDates.toLocaleString('en-US')} dates have a bundle-adjusted V-Bucks total.`,
  `- ${report.adjustedItemCountDates} dates show total item counts in that view because prices are missing.`,
  `- The all-listed-prices view has ${report.listedPriceDates.toLocaleString('en-US')} price totals and ${report.listedItemCountDates.toLocaleString('en-US')} item-count fallbacks.`,
  `- ${report.warningDates.toLocaleString('en-US')} dates show a yellow possible-mistakes warning.`,
  `- All ${report.archivedDates.toLocaleString('en-US')} snapshots open; every inferred bundle link resolves.`, '',
  '## Remaining exceptions', '',
  'These calendar dates are absent from the downloaded source archive; no shop or price has been invented:', '',
  ...missingDates.map(date => `- ${date}`), '',
  'Price-missing examples: ' + countOnly.slice(0, 3).map(row => `${row.date} (${row.listedCount} items)`).join(', ') + '.', '',
  'The complete dates and missing-price reasons are in [data/history-report.json](data/history-report.json).', '',
  'Bundle assumptions use the named shop section, never the global item-type filter. All bundles in an inferred section remain separately priced unless confirmed contents prove coverage. Sections without bundles are not grouped.', '',
];
await writeFile(new URL('../HISTORY-REPORT.md', import.meta.url), lines.join('\n'));
const { itemCountFallbacks, listedCountFallbacks, ...summary } = report;
console.log(JSON.stringify(summary));
