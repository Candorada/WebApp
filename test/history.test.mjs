import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { normalizeArchiveShop, archiveSnapshot } from '../history-source.mjs';
import { HistoryStore, captureDue, validDate } from '../history-store.mjs';
import { dateFromPath, datePath } from '../public/date-route.js';
import { selectOffers, normalizeShop } from '../public/shop.js';

const cosmetic = (id, type = 'Outfit') => ({ itemKey: `fn:item:${id}`, name: id, type });
const offer = (id, price, extra = {}) => ({ id, ...cosmetic(id), price: { amount: price, currency: 'V-Bucks' }, contents: [], ...extra });
const archive = items => ({ data: { shopDate: '2017-10-26', exact: true, shop: { updatedAt: null, sections: [{ items }] } } });
const live = (date, value) => ({ shopDate: date + 'T00:00:00Z', totals: { value, count: 2, savings: 0 }, offers: [] });
const seed = { version: 1, importedAt: '2026-11-06T00:00:00Z', rows: [{ date: '2017-10-26', value: 5000, count: 4, capturedAt: null, sourceDate: '2017-10-26', exact: true }], gaps: [] };

test('historical totals use archived prices and remove contents covered by bundles', () => {
  const items = [offer('skin', 1500), offer('axe', 800, { type: 'Pickaxe' }), offer('pack', 2000, { type: 'Bundle', itemKey: 'fn:bundle:pack', contents: [cosmetic('skin'), cosmetic('axe', 'Pickaxe')] }), offer('unrelated', 500)];
  const row = normalizeArchiveShop(archive(items), '2017-10-26');
  assert.equal(row.value, 2500);
  assert.equal(row.count, 2);
  assert.equal(row.sourceDate, '2017-10-26');
});

test('missing prices retain monetary subtotals with separate missing-price counts', () => {
  const missingPrice = normalizeArchiveShop(archive([offer('unknown', null)]), '2017-10-26');
  assert.equal(missingPrice.value, 0);
  assert.equal(missingPrice.unpricedCount, 1);
  assert.equal(missingPrice.listedValue, 0);
  assert.equal(missingPrice.listedUnpricedCount, 1);
  assert.equal(missingPrice.listedCount, 1);
  assert.equal(missingPrice.count, 1);
  const missingContents = normalizeArchiveShop(archive([offer('pack', 2000, { type: 'Bundle' })]), '2017-10-26');
  assert.equal(missingContents.value, 2000);
  assert.equal(missingContents.listedValue, 2000);
  assert.match(missingContents.qualityReason, /Possible mistakes/);
});

test('cash-only packs, upcoming sections and bundle components do not inflate history', () => {
  const payload = archive([offer('item', 500), offer('cash', 20, { price: { amount: 20, currency: 'USD' } }), offer('component', null, { bundle: 'Parent', price: { amount: null, label: 'Included', currency: 'V-Bucks' } })]);
  payload.data.shop.sections.push({ upcoming: true, items: [offer('future', 1000)] });
  assert.equal(normalizeArchiveShop(payload, '2017-10-26').value, 500);
});

test('different offers can share the archive listing ID; duplicate tiles still count once', () => {
  const small = offer('pack', 1000, { type: 'Bundle', contents: [cosmetic('skin')] });
  const large = offer('pack', 1500, { type: 'Bundle', contents: [cosmetic('skin'), cosmetic('axe', 'Pickaxe')] });
  const row = normalizeArchiveShop(archive([small, large, large]), '2017-10-26');
  assert.equal(row.value, 1500);
  assert.equal(row.listedValue, 2500);
});

test('missing cosmetic identities preserve prices with a warning', () => {
  const row = normalizeArchiveShop(archive([offer('unknown-id', 800, { itemKey: null })]), '2017-10-26');
  assert.equal(row.listedValue, 800);
  assert.equal(row.value, 800);
  assert.match(row.qualityReason, /Possible mistakes/);
});

test('live history freezes the 23:00 UTC capture and starts a new shop day independently', () => {
  const store = new HistoryStore(':memory:', seed);
  try {
    store.recordLive(live('2026-11-06', 100), new Date('2026-11-06T12:00:00Z'));
    assert.equal(store.get('2026-11-06').finalized, 0);
    assert.equal(captureDue(store.get('2026-11-06'), new Date('2026-11-06T22:59:00Z')), false);
    assert.equal(captureDue(store.get('2026-11-06'), new Date('2026-11-06T23:00:00Z')), true);
    store.recordLive(live('2026-11-06', 200), new Date('2026-11-06T23:00:00Z'));
    assert.equal(store.recordLive(live('2026-11-06', 999), new Date('2026-11-06T23:30:00Z')), false);
    assert.equal(store.get('2026-11-06').value, 200);
    assert.equal(store.snapshot('2026-11-06').totals.value, 200);
    assert.equal(captureDue(store.get('2026-11-06'), new Date('2026-11-06T23:59:00Z')), false);
    assert.equal(store.recordLive(live('2026-11-06', 999), new Date('2026-11-07T00:01:00Z')), false);
    store.recordLive(live('2026-11-07', 300), new Date('2026-11-07T00:05:00Z'));
    assert.equal(store.list().length, 3);
    assert.equal(store.get('2017-10-26').value, 5000);
  } finally { store.close(); }
});

test('stored history survives reopening the database and seeding is idempotent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fortnite-history-test-'));
  const filename = join(directory, 'history.sqlite');
  try {
    const first = new HistoryStore(filename, seed);
    first.recordLive(live('2026-11-06', 1234), new Date('2026-11-06T23:00:00Z'));
    first.db.exec('ALTER TABLE shops DROP COLUMN unpriced_count; ALTER TABLE shops DROP COLUMN listed_unpriced_count;');
    first.close();
    const reopened = new HistoryStore(filename, seed);
    assert.equal(reopened.list().length, 2);
    assert.equal(reopened.get('2026-11-06').value, 1234);
    assert.equal(reopened.snapshot('2026-11-06').totals.value, 1234);
    assert.equal(reopened.get('2026-11-06').unpricedCount, 0);
    reopened.close();
  } finally {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary cleanup path.');
    await rm(directory, { recursive: true, force: true });
  }
});

test('live category captures preserve bundle adjustment and backfill existing stored snapshots', async () => {
  const shop = normalizeShop({ status: 200, data: { date: '2026-11-06T00:00:00Z', entries: [
    { offerId: 'skin', finalPrice: 1500, brItems: [{ id: 'skin', name: 'Skin', type: { value: 'outfit' } }] },
    { offerId: 'pack', finalPrice: 2000, bundle: { name: 'Pack' }, brItems: [{ id: 'skin', name: 'Skin', type: { value: 'outfit' } }] },
  ] } });
  const directory = await mkdtemp(join(tmpdir(), 'fortnite-category-test-'));
  const filename = join(directory, 'history.sqlite');
  let store = new HistoryStore(filename);
  try {
    store.recordLive(shop, new Date('2026-11-06T23:00:00Z'));
    assert.equal(store.get('2026-11-06').categories.outfit.value, 2000);
    assert.equal(store.get('2026-11-06').categories.outfit.listedValue, 3500);
    assert.equal(store.list()[0].categories.bundle.value, 2000);
    assert.equal(store.recordLive(shop, new Date('2026-11-06T23:05:00Z')), false);
    store.db.exec('ALTER TABLE shops DROP COLUMN category_totals');
    store.close();
    store = new HistoryStore(filename);
    assert.equal(store.get('2026-11-06').categories.outfit.value, 2000);
    assert.equal(store.get('2026-11-06').finalized, 1);
  } finally {
    store.close();
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary cleanup path.');
    await rm(directory, { recursive: true, force: true });
  }
});

test('dates reject impossible calendar days', () => {
  assert.equal(validDate('2026-02-31'), false);
  assert.equal(validDate('2017-10-26'), true);
  assert.equal(validDate('../secret'), false);
  assert.equal(captureDue(null, new Date('2026-11-06T00:00:00Z')), true);
});

test('Unix-second routes use UTC days and reject malformed paths and impossible dates', () => {
  assert.equal(datePath('2017-10-26'), '/1508976000');
  assert.equal(dateFromPath('/1508976000'), '2017-10-26');
  assert.equal(dateFromPath('/1509062399'), '2017-10-26');
  assert.equal(dateFromPath('/'), null);
  for (const path of ['/bad', '/NaN', '/1508976000000', '/1508976000/extra', '/-1', '/1.5']) assert.equal(dateFromPath(path), undefined);
  assert.equal(datePath('2026-02-31'), '/');
});

test('archived lineups retain missing prices and can recalculate complete category selections', () => {
  const shop = archiveSnapshot(archive([
    offer('unknown', null), offer('axe', 800, { type: 'Pickaxe' }),
    offer('pack', 2000, { type: 'Bundle', contents: [cosmetic('emote', 'Emote'), cosmetic('glider', 'Glider')] }),
  ]), '2017-10-26');
  assert.equal(shop.offers.length, 3);
  assert.equal(shop.offers[0].price, null);
  assert.equal(selectOffers(shop.offers).totals.value, 2800);
  assert.equal(selectOffers(shop.offers).totals.unpricedCount, 1);
  assert.equal(selectOffers(shop.offers, new Set(['pickaxe'])).totals.value, 800);
  assert.equal(selectOffers(shop.offers, new Set(['emote'])).totals.value, 2000);
  assert.equal(selectOffers(shop.offers, new Set()).totals.value, 0);
  const missingContents = archiveSnapshot(archive([offer('pack', 2000, { type: 'Bundle' })]), '2017-10-26');
  assert.equal(selectOffers(missingContents.offers).totals.value, 2000);
});

test('incomplete historical sections link every item to all section bundles and filters keep those bundles', () => {
  const payload = archive([]);
  payload.data.shop.sections = [
    { title: 'Terminator', items: [offer('first', 2000, { type: 'Bundle' }), offer('second', 2500, { type: 'Bundle' }), offer('skin', 1500), offer('axe', 800, { type: 'Pickaxe' })] },
    { title: 'Daily', items: [offer('daily', 500)] },
  ];
  const shop = archiveSnapshot(payload, '2017-10-26');
  const skin = shop.offers.find(offer => offer.name === 'skin');
  const axe = shop.offers.find(offer => offer.name === 'axe');
  assert.equal(skin.bundles.length, 2);
  assert.deepEqual(axe.bundles, skin.bundles);
  const all = selectOffers(shop.offers);
  assert.equal(all.totals.value, 5000);
  assert.equal(all.coveredBy.get(skin.id).length, 2);
  assert.equal(all.coveredBy.has(shop.offers.find(offer => offer.name === 'daily').id), false);
  const axes = selectOffers(shop.offers, new Set(['pickaxe']));
  assert.equal(axes.totals.value, 4500);
  assert.equal(axes.coveredBy.get(axe.id).length, 2);
  assert.match(shop.qualityReason, /Possible mistakes/);
  // Switching off both bundle types leaves standalone items countable again.
  const withoutBundles = selectOffers(shop.offers.filter(offer => !offer.isBundle));
  assert.equal(withoutBundles.totals.value, 2800);
});
