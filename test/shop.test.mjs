import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShop, totals, selectOffers } from '../public/shop.js';

const item = (id, type = 'outfit') => ({ id, name: id, type: { value: type } });
const offer = (id, price, type = 'outfit') => ({ offerId: id, finalPrice: price, regularPrice: price, brItems: [item(id, type)] });
const bundle = (id, price, items) => ({ offerId: id, finalPrice: price, bundle: { name: id }, brItems: items });
const feed = entries => ({ status: 200, data: { date: '2026-11-05T00:00:00Z', entries } });

test('counts duplicate offer IDs once and uses the discounted price', () => {
  const item = { ...offer('a', 1200), regularPrice: 1500 };
  const shop = normalizeShop(feed([item, item, offer('b', 0)]));
  assert.deepEqual(shop.totals, { value: 1200, savings: 300, count: 2 });
  assert.equal(shop.duplicateCount, 1);
});

test('selected bundles replace their standalone characters and smaller bundles', () => {
  const shop = normalizeShop(feed([
    offer('outfit', 1500),
    bundle('small', 1800, [item('outfit'), item('pickaxe', 'pickaxe')]),
    bundle('large', 2500, [item('outfit'), item('pickaxe', 'pickaxe'), item('emote', 'emote')]),
    offer('unrelated', 500, 'emote'),
  ]));
  assert.equal(shop.totals.value, 3000);
  assert.equal(shop.totals.count, 2);
  const selection = selectOffers(shop.offers);
  assert.deepEqual([...selection.coveredBy.keys()].sort(), ['outfit', 'small']);
  assert.ok([...selection.coveredBy.values()].every(parent => parent.id === 'large'));
  assert.equal(totals(shop.offers, new Set(['pickaxe'])).value, 2500);
  assert.equal(totals(shop.offers, new Set(['bundle'])).value, 2500);
  assert.equal(totals(shop.offers, new Set()).value, 0);
});

test('category selection includes bundles containing that type, once across multiple types', () => {
  const shop = normalizeShop(feed([offer('outfit', 1500), offer('emote', 500, 'emote'), bundle('bundle', 2000, [item('outfit'), item('pickaxe', 'pickaxe')])]));
  assert.equal(shop.totals.value, 2500);
  assert.equal(totals(shop.offers, new Set(['emote'])).value, 500);
  assert.equal(totals(shop.offers, new Set(['outfit'])).value, 2000);
  assert.equal(totals(shop.offers, new Set(['outfit', 'pickaxe'])).value, 2000);
});

test('equal-content bundles keep the cheaper offer with a stable tie-break', () => {
  const entries = [bundle('expensive', 2500, [item('same')]), bundle('cheap-b', 2000, [item('same')]), bundle('cheap-a', 2000, [item('same')])];
  for (const order of [entries, [...entries].reverse()]) {
    const shop = normalizeShop(feed(order));
    assert.equal(shop.totals.value, 2000);
    assert.equal(shop.totals.count, 1);
    assert.equal(selectOffers(shop.offers).counted[0].id, 'cheap-a');
  }
});

test('partial overlap preserves offers with unique contents and names do not define identity', () => {
  const sameName = { ...item('different-id'), name: 'outfit' };
  const shop = normalizeShop(feed([offer('outfit', 1500), bundle('partial', 2000, [item('outfit'), item('extra')]), bundle('other', 2200, [item('outfit'), sameName])]));
  assert.equal(shop.totals.value, 4200);
  assert.equal(shop.totals.count, 2);
});

test('a larger bundle outside the selected types does not suppress a selected offer', () => {
  const shop = normalizeShop(feed([offer('outfit', 1500), bundle('emotes', 2000, [item('dance', 'emote')])]));
  assert.equal(totals(shop.offers, new Set(['outfit'])).value, 1500);
});

test('Cars includes purchase bundles and excludes their component listings', () => {
  const wheel = item('wheel', 'wheel');
  const shop = normalizeShop(feed([
    { offerId: 'car-pack', finalPrice: 2200, bundle: { name: 'Car Pack' }, cars: [item('body', 'body'), wheel] },
    { offerId: 'wheel-listing', finalPrice: 400, cars: [wheel] },
  ]));
  assert.equal(totals(shop.offers, new Set(['car'])).value, 2200);
  assert.equal(totals(shop.offers, new Set(['car', 'bundle'])).value, 2200);
  const componentOnly = normalizeShop(feed([{ offerId: 'wheel-listing', finalPrice: 400, cars: [wheel] }]));
  assert.equal(componentOnly.totals.value, 0);
});

test('rejects invalid prices and conflicting duplicate offers instead of returning a partial total', () => {
  for (const price of [null, '1500', -100, 1.5]) assert.throws(() => normalizeShop(feed([offer('bad', price)])));
  assert.throws(() => normalizeShop(feed([offer('a', 100), offer('a', 200)])));
  assert.throws(() => normalizeShop({ status: 503 }));
  assert.throws(() => normalizeShop(feed([{ ...offer('missing-id', 500), brItems: [{ name: 'Missing ID' }] }])));
});

test('recognizes tracks, cars and future item types', () => {
  const shop = normalizeShop(feed([
    { offerId: 'track', finalPrice: 500, tracks: [{ id: 'song', title: 'Song' }] },
    { offerId: 'car', finalPrice: 1500, cars: [item('car', 'body')] },
    offer('new', 800, 'futuretype'),
  ]));
  assert.deepEqual(shop.offers.map(item => item.type), ['track', 'car', 'futuretype']);
  assert.equal(totals(shop.offers, new Set(['futuretype'])).value, 800);
});
