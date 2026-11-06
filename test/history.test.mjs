import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { normalizeArchiveShop, archiveSnapshot } from '../history-source.mjs';
import { HistoryStore, captureDue, validDate } from '../history-store.mjs';
import { dateFromPath, datePath } from '../public/date-route.js';
import { selectOffers } from '../public/shop.js';

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

test('missing historical prices are never guessed; listed totals survive missing bundle contents', () => {
  const missingPrice = normalizeArchiveShop(archive([offer('unknown', null)]), '2017-10-26');
  assert.equal(missingPrice.value, null);
  assert.equal(missingPrice.listedValue, null);
  const missingContents = normalizeArchiveShop(archive([offer('pack', 2000, { type: 'Bundle' })]), '2017-10-26');
  assert.equal(missingContents.value, null);
  assert.equal(missingContents.listedValue, 2000);
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

test('missing cosmetic identities preserve listed prices but cannot certify bundle coverage', () => {
  const row = normalizeArchiveShop(archive([offer('unknown-id', 800, { itemKey: null })]), '2017-10-26');
  assert.equal(row.listedValue, 800);
  assert.equal(row.value, null);
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
    first.close();
    const reopened = new HistoryStore(filename, seed);
    assert.equal(reopened.list().length, 2);
    assert.equal(reopened.get('2026-11-06').value, 1234);
    assert.equal(reopened.snapshot('2026-11-06').totals.value, 1234);
    reopened.close();
  } finally {
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
  assert.equal(selectOffers(shop.offers).totals.value, null);
  assert.equal(selectOffers(shop.offers, new Set(['pickaxe'])).totals.value, 800);
  assert.equal(selectOffers(shop.offers, new Set(['emote'])).totals.value, 2000);
  assert.equal(selectOffers(shop.offers, new Set()).totals.value, 0);
  const missingContents = archiveSnapshot(archive([offer('pack', 2000, { type: 'Bundle' })]), '2017-10-26');
  assert.equal(selectOffers(missingContents.offers).totals.value, null);
});
