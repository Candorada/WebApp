import { totals } from './public/shop.js';

function category(item) {
  const type = (item.type || '').toLowerCase();
  if (/jam track/.test(type)) return 'track';
  if (/^(car|decal|wheel|boost|trail)/.test(type) || /^fn:item:(carbody_|carskin_|wheel_)/i.test(item.itemKey || '')) return 'car';
  if (/^(guitar|bass|drum|microphone|keytar|instrument)/.test(type)) return 'instrument';
  return ({ outfit: 'outfit', skin: 'outfit', character: 'outfit', emote: 'emote', pickaxe: 'pickaxe', glider: 'glider', 'back bling': 'backpack', wrap: 'wrap', shoes: 'shoe', kicks: 'shoe', sidekick: 'sidekick', companion: 'sidekick', pet: 'backpack', 'loading screen': 'loadingscreen', 'lobby music': 'music', contrail: 'contrail', spray: 'spray', emoticon: 'emoji', toy: 'toy', bundle: 'bundle' })[type] || 'other';
}

export function archiveSnapshot(payload, date) {
  const archive = payload?.data;
  const shop = archive?.shop;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(shop?.sections)) throw new Error('Invalid historical shop response.');
  const unique = new Map();
  const unknownPrices = [];
  let missingContents = false;
  for (const section of shop.sections) {
    if (section.upcoming) continue;
    if (!Array.isArray(section.items)) throw new Error('Historical section is missing its offers.');
    for (const item of section.items) {
      if (item.soldOut) continue;
      if (item.price?.currency && item.price.currency !== 'V-Bucks') continue;
      const included = Boolean(item.bundle) || /bundle.only|included/i.test(item.badge || item.price?.label || '');
      const price = item.price?.amount ?? (included || /^free$/i.test(item.price?.label || '') ? 0 : null);
      if (!item.id) throw new Error('An archived offer has no ID.');
      if (price === null) unknownPrices.push(item.name || item.id);
      else if (!Number.isSafeInteger(price) || price < 0) throw new Error('An archived offer has an invalid price.');
      const isBundle = /bundle/i.test(item.type || '') || item.itemKey?.startsWith('fn:bundle:');
      const contents = item.contents?.length ? item.contents : isBundle ? [] : [item];
      if (isBundle && !contents.length) missingContents = true;
      const missingIdentity = contents.some(content => typeof content.itemKey !== 'string' || !content.itemKey);
      if (missingIdentity) missingContents = true;
      const itemIds = missingIdentity ? [] : [...new Set(contents.map(content => content.itemKey.toLowerCase()))];
      const id = JSON.stringify([String(item.id), price, [...itemIds].sort()]);
      if (unique.has(id)) continue;
      const isCar = contents.some(content => /^(car|decal|wheel|boost|trail)/i.test(content.type || '') || /^fn:item:(carbody_|carskin_|wheel_)/i.test(content.itemKey || ''));
      const types = [...new Set(contents.map(category))];
      if (isBundle) types.push('bundle');
      if (!types.length) types.push(category(item));
      const image = item.images?.card || item.images?.render;
      unique.set(id, {
        id, name: item.name || item.id, price,
        regularPrice: Number.isSafeInteger(item.price?.regular) ? item.price.regular : price,
        isBundle: Boolean(isBundle), bundleOnly: included || (isCar && !isBundle),
        itemIds, types: [...new Set(types)],
        coverageUnknown: missingIdentity || (Boolean(isBundle) && !contents.length),
        items: contents.map(content => content.name).filter(Boolean),
        image: typeof image === 'string' && image.startsWith('https://') ? image : null,
      });
    }
  }
  const offers = [...unique.values()];
  const summary = totals(offers);
  const completePrices = unknownPrices.length === 0;
  const completeContents = completePrices && !missingContents;
  return {
    shopDate: date + 'T00:00:00.000Z', offers,
    totals: { ...summary, value: completeContents ? summary.value : null }, source: 'itemshop.gg',
    qualityReason: !completePrices ? `Historical prices missing for ${unknownPrices.join(', ')}.` : missingContents ? 'The archive does not include all bundle contents for this date.' : null,
    capturedAt: shop.updatedAt || null,
    sourceDate: archive.shopDate || shop.shopDate || date,
    exact: archive.exact !== false,
  };
}

export function normalizeArchiveShop(payload, date) {
  const snapshot = archiveSnapshot(payload, date);
  const completePrices = snapshot.offers.every(offer => offer.price !== null);
  return {
    date, value: snapshot.totals.value, count: snapshot.totals.value === null ? null : snapshot.totals.count,
    listedValue: completePrices ? snapshot.offers.reduce((sum, offer) => sum + offer.price, 0) : null,
    listedCount: completePrices ? snapshot.offers.length : null,
    qualityReason: snapshot.qualityReason, capturedAt: snapshot.capturedAt, sourceDate: snapshot.sourceDate, exact: snapshot.exact,
  };
}
