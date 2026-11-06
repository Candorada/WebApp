import { totals } from './public/shop.js';

export function normalizeArchiveShop(payload, date) {
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
      if (price === null) { unknownPrices.push(item.name || item.id); continue; }
      if (!Number.isSafeInteger(price) || price < 0) throw new Error('An archived offer has an invalid price.');
      const isBundle = /bundle/i.test(item.type || '') || item.itemKey?.startsWith('fn:bundle:');
      const contents = item.contents?.length ? item.contents : isBundle ? [] : [item];
      if (isBundle && !contents.length) missingContents = true;
      const missingIdentity = contents.some(content => typeof content.itemKey !== 'string' || !content.itemKey);
      if (missingIdentity) missingContents = true;
      const itemIds = missingIdentity ? [] : [...new Set(contents.map(content => content.itemKey.toLowerCase()))];
      const id = JSON.stringify([String(item.id), price, [...itemIds].sort()]);
      if (unique.has(id)) continue;
      const isCar = contents.some(content => /^(car|decal|wheel|boost|trail)/i.test(content.type || '') || /^fn:item:(carbody_|carskin_|wheel_)/i.test(content.itemKey || ''));
      unique.set(id, {
        id, name: item.name, price,
        regularPrice: Number.isSafeInteger(item.price?.regular) ? item.price.regular : price,
        isBundle: Boolean(isBundle), bundleOnly: included || (isCar && !isBundle),
        itemIds, types: [isBundle ? 'bundle' : 'other'],
      });
    }
  }
  const summary = totals([...unique.values()]);
  const completePrices = unknownPrices.length === 0;
  const completeContents = completePrices && !missingContents;
  return {
    date, value: completeContents ? summary.value : null,
    count: completeContents ? summary.count : null,
    listedValue: completePrices ? [...unique.values()].reduce((sum, offer) => sum + offer.price, 0) : null,
    listedCount: completePrices ? unique.size : null,
    qualityReason: !completePrices ? `Historical prices missing for ${unknownPrices.join(', ')}.` : missingContents ? 'The archive does not include all bundle contents for this date.' : null,
    capturedAt: shop.updatedAt || null,
    sourceDate: archive.shopDate || shop.shopDate || date,
    exact: archive.exact !== false,
  };
}
