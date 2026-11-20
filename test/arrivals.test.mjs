import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShop, selectOffers } from '../public/shop.js';
import { annotateArrivals, arrivalOffers, dayAfter, tokenHistory, tokenOffers, tokenWindow, emptySummary } from '../public/arrivals.js';

const item = (id, type = 'outfit') => ({ id, name: id, type: { value: type } });
const single = (id, price, type = 'outfit') => ({ offerId: `listing-${id}-${price}`, finalPrice: price, brItems: [item(id, type)] });
const pack = (id, price, contents) => ({ offerId: id, finalPrice: price, bundle: { name: id }, brItems: contents });
const shop = (date, entries) => normalizeShop({ status: 200, data: { date: date + 'T00:00:00Z', entries } });

test('daily additions include returning items but ignore repricing, offer-ID changes and source prefixes', () => {
  const previous = shop('2026-11-18', [single('skin', 1000)]);
  previous.offers[0].itemIds = ['fn:item:SKIN'];
  const current = annotateArrivals(shop('2026-11-19', [single('skin', 1200), single('axe', 800, 'pickaxe')]), previous);
  assert.equal(current.arrivals.value, 800);
  assert.equal(current.arrivals.count, 1);
  assert.deepEqual(arrivalOffers(current.offers).map(offer => offer.name), ['axe']);
  const absent = shop('2026-11-19', []);
  const returning = annotateArrivals(shop('2026-11-20', [single('skin', 1000)]), absent);
  assert.equal(returning.arrivals.value, 1000);
});

test('a bundle containing a new accessory replaces it and is attributed to the new category only', () => {
  const previous = shop('2026-11-18', [single('skin', 1500)]);
  const current = annotateArrivals(shop('2026-11-19', [single('skin', 1500), single('axe', 800, 'pickaxe'), pack('pack', 2000, [item('skin'), item('axe', 'pickaxe')])]), previous);
  assert.equal(current.arrivals.value, 2000);
  assert.equal(current.arrivals.categories.pickaxe.value, 2000);
  assert.equal(current.arrivals.categories.outfit, undefined);
  assert.equal(current.arrivals.categories.bundle.value, 2000);
  const selection = selectOffers(arrivalOffers(current.offers));
  assert.equal(selection.coveredBy.has('listing-axe-800'), true);
  assert.equal(selection.counted.length, 1);
  const repackaged = annotateArrivals(shop('2026-11-20', [pack('new-pack-id', 2500, [item('skin'), item('axe', 'pickaxe')])]), current);
  assert.equal(repackaged.arrivals.value, 0);
});

test('unknown-content bundles use stable listing identities rather than their changing prices', () => {
  const before = shop('2026-11-18', [pack('same-pack', 2000, [])]);
  const after = annotateArrivals(shop('2026-11-19', [pack('same-pack', 1800, [])]), before);
  assert.equal(after.arrivals.value, 0);
});

test('matching names or asset URLs are each sufficient despite changed IDs', () => {
  const previous = shop('2026-07-31', [
    { ...single('old-mic', 800, 'pickaxe'), brItems: [{ ...item('old-mic', 'pickaxe'), name: 'Lil World Mic' }] },
    { ...single('old-wrap', 500, 'wrap'), brItems: [{ ...item('old-wrap', 'wrap'), images: { icon: 'https://cdn.source.gs/item-512.webp?v=1' } }] },
  ]);
  const current = annotateArrivals(shop('2026-08-01', [
    { ...single('new-mic', 800, 'instrument'), brItems: [{ ...item('new-mic', 'instrument'), name: '  LIL WORLD MIC ' }] },
    { ...single('new-wrap', 500, 'wrap'), brItems: [{ ...item('new-wrap', 'wrap'), images: { icon: 'https://cdn.source.gs/item-128.webp?v=2' } }] },
    single('different', 300),
  ]), previous);
  assert.deepEqual(arrivalOffers(current.offers).map(offer => offer.name), ['different']);
  assert.equal(current.arrivals.value, 300);
});

test('renumbered bundle contents match previous standalone items by name', () => {
  const previous = shop('2026-07-31', [single('mic', 800, 'pickaxe')]);
  const current = annotateArrivals(shop('2026-08-01', [
    pack('different-pack', 2000, [{ ...item('instrument-version', 'instrument'), name: 'mic' }]),
  ]), previous);
  assert.equal(current.arrivals.value, 0);
});

test('a richer archive snapshot does not re-add retained bundles and their known contents', () => {
  const previous = shop('2026-10-02', [pack('persona', 3800, []), single('joker', 1800)]);
  previous.offers[0].id = JSON.stringify(['persona', 3800, []]);
  previous.offers[1].id = JSON.stringify(['joker', 1800, []]);
  previous.offers[1].itemIds = [];
  const current = shop('2026-10-03', [
    pack('persona', 3700, [item('joker'), item('persona-axe', 'pickaxe')]),
    single('joker', 1800),
    single('new-axe', 800, 'pickaxe'),
  ]);
  current.offers[0].id = JSON.stringify(['persona', 3700, current.offers[0].itemIds]);
  annotateArrivals(current, previous);
  assert.equal(current.arrivals.value, 800);
  assert.equal(current.arrivals.estimated, true);
  assert.deepEqual(arrivalOffers(current.offers).map(offer => offer.name), ['new-axe']);
});

test('sparse current listings recognize known items, and old bundles do not inherit inferred additions', () => {
  const previous = shop('2026-10-02', [pack('existing', 3000, [item('joker')])]);
  const current = shop('2026-10-03', [pack('existing', 3000, []), single('joker', 1800), single('new-axe', 800, 'pickaxe')]);
  current.offers[1].id = JSON.stringify(['joker', 1800, []]);
  current.offers[1].itemIds = [];
  current.offers[2].bundles = ['existing'];
  annotateArrivals(current, previous);
  assert.deepEqual(arrivalOffers(current.offers).map(offer => offer.name), ['new-axe']);
  assert.equal(current.arrivals.value, 800);
});

test('a retained bundle can still contain real additions when both days have contents', () => {
  const previous = shop('2026-10-02', [pack('existing', 3000, [item('joker')])]);
  const current = annotateArrivals(shop('2026-10-03', [
    pack('existing', 3000, [item('joker'), item('new-axe', 'pickaxe')]),
  ]), previous);
  assert.equal(current.arrivals.value, 3000);
  assert.equal(current.arrivals.categories.pickaxe.value, 3000);
});

test('missing previous days are unavailable comparisons rather than all-new shops or zero totals', () => {
  const current = annotateArrivals(shop('2026-11-20', [single('skin', 1500)]), shop('2026-11-18', []));
  assert.equal(current.arrivals.available, false);
  assert.equal(current.arrivals.comparisonDate, '2026-11-19');
  assert.match(current.arrivals.reason, /unavailable/);
  assert.deepEqual(arrivalOffers(current.offers), []);
});

test('token value is the starting shop plus exactly 13 following daily additions, with category support', () => {
  const points = Array.from({ length: 14 }, (_, i) => ({
    date: dayAfter('2026-10-01', i), ...emptySummary, value: i ? 50000 : 1000,
    categories: { pickaxe: { ...emptySummary, value: 100 } },
    arrivals: { ...emptySummary, available: true, value: i * 10, categories: { pickaxe: { ...emptySummary, value: i } } },
  }));
  const tokens = tokenHistory(points);
  assert.equal(tokens[0].value, 1910);
  assert.equal(tokens[0].token.availableDays, 14);
  assert.equal(tokens[0].token.endDate, '2026-10-14');
  assert.equal(tokenHistory(points, 'pickaxe')[0].value, 191);
  assert.equal(tokens.at(-1).value, 50000);
  assert.equal(tokens.at(-1).token.availableDays, 1);
  points[7].arrivals.available = false;
  const partial = tokenHistory(points)[0];
  assert.equal(partial.token.availableDays, 13);
  assert.equal(partial.value, 1840);
  const days = [...tokenWindow(new Map(points.map(point => [point.date, point])), points[0].date)];
  assert.equal(days.length, partial.token.availableDays);
  assert.equal(days[0].arrivals, false);
  assert.equal(days.at(-1).day.date, partial.token.endDate);
  assert.ok(days.slice(1).every(({ day, arrivals }) => arrivals && day.arrivals.available));
});

test('token itemization uses the same categories and price modes as the graph', () => {
  const pack = { offerId: 'pack', finalPrice: 2000, bundle: { name: 'pack' }, brItems: [item('outfit'), item('axe', 'pickaxe')] };
  const start = shop('2026-10-01', [single('outfit', 1500), single('axe', 800, 'pickaxe'), pack]);
  const next = shop('2026-10-02', [single('outfit', 1500), single('dance', 500, 'emote')]);
  annotateArrivals(next, start);
  assert.deepEqual(tokenOffers(start, false, 'pickaxe', 'value').map(offer => offer.name), ['pack']);
  assert.deepEqual(tokenOffers(start, false, 'pickaxe', 'listedValue').map(offer => offer.name), ['axe', 'pack']);
  assert.deepEqual(tokenOffers(next, true, null, 'value').map(offer => offer.name), ['dance']);
});
