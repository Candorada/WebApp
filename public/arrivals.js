import { selectOffers, categoryTotals } from './shop.js';

export const emptySummary = { value: 0, count: 0, unpricedCount: 0, listedValue: 0, listedCount: 0, listedUnpricedCount: 0 };
export const arrivalCalculation = 'daily-arrivals-v8';
export const dayAfter = (date, offset = 1) => new Date(Date.parse(date.slice(0, 10) + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
export const itemIdentity = id => id.toLowerCase().replace(/^(?:fn:(?:item|track|instrument|car):|britems:|tracks:|instruments:|cars:)/, '');

function listingIdentity(offer) {
  try { const parts = JSON.parse(offer.id); if (Array.isArray(parts)) return String(parts[0]).toLowerCase(); } catch { /* Live offer IDs are plain strings. */ }
  return offer.id.toLowerCase();
}

function matchKeys(name, image, id) {
  const keys = [];
  const normalizedName = name?.normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  if (normalizedName) keys.push('name:' + normalizedName);
  if (image && URL.canParse(image)) {
    const url = new URL(image);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      const path = url.hostname === 'cdn.source.gs'
        ? url.pathname.replace(/-(?:128|256|512|1024|2048)(?=\.(?:png|webp|jpe?g)$)/i, '')
        : url.pathname;
      keys.push('image:' + url.host + path);
    }
  }
  if (id) keys.push('id:' + itemIdentity(id));
  return keys;
}

function listingKeys(offer) {
  const kind = offer.isBundle ? 'bundle:' : 'item:';
  return matchKeys(offer.name, offer.image, listingIdentity(offer)).map(key => kind + key);
}

function contents(offer) {
  if (!offer.itemIds.length) {
    return offer.items.map(name => ({ name, keys: matchKeys(name) }));
  }
  return offer.itemIds.map((id, index) => {
    const name = offer.itemNames?.[id] ?? (offer.items.length === offer.itemIds.length ? offer.items[index] : undefined);
    const image = offer.itemImages?.[id] ?? (!offer.isBundle && offer.itemIds.length === 1 ? offer.image : undefined);
    return { id, name, keys: matchKeys(name, image, id) };
  });
}

function hasContents(offer) {
  return offer.itemIds.length > 0 || offer.items.some(name => name !== offer.name);
}

function itemType(offer, id) {
  if (offer.itemTypes?.[id]) return offer.itemTypes[id];
  if (id.startsWith('tracks:')) return 'track';
  if (id.startsWith('instruments:')) return 'instrument';
  if (id.startsWith('cars:')) return 'car';
  const key = itemIdentity(id);
  for (const [pattern, type] of [
    [/^(cid_|character_)/, 'outfit'], [/^pickaxe_/, 'pickaxe'], [/^(bid_|backpack_)/, 'backpack'],
    [/^glider_/, 'glider'], [/^(eid_|emote_)/, 'emote'], [/^wrap_/, 'wrap'],
    [/^(sid_|sparks_)/, 'track'], [/^(emoji_|emoticon_)/, 'emoji'], [/^(lsid_|loadingscreen_)/, 'loadingscreen'],
    [/^musicpack_/, 'music'], [/^contrail_/, 'contrail'], [/^spray_/, 'spray'],
    [/^(carbody_|carskin_|wheel_|boost_|trail_)/, 'car'], [/^(shoe|kicks_)/, 'shoe'], [/^sidekick_/, 'sidekick'],
  ]) if (pattern.test(key)) return type;
  const types = offer.types.filter(type => type !== 'bundle');
  return types.length === 1 ? types[0] : null;
}

export function arrivalOffers(offers) {
  return offers.filter(offer => offer.arrivalTypes?.length).map(offer => ({ ...offer, types: offer.arrivalTypes }));
}

export function annotateArrivals(shop, previous) {
  const date = shop.shopDate.slice(0, 10);
  const comparisonDate = dayAfter(date, -1);
  for (const offer of shop.offers) offer.arrivalTypes = [];
  if (!previous || previous.shopDate.slice(0, 10) !== comparisonDate) {
    shop.arrivals = { ...emptySummary, categories: {}, available: false, comparisonDate, reason: `The shop snapshot for ${comparisonDate} is unavailable, so daily additions cannot be determined.` };
    return shop;
  }
  const previousItems = new Set();
  const previousListings = new Map();
  let estimated = previous.offers.some(offer => offer.coverageUnknown);
  for (const offer of previous.offers) {
    for (const item of contents(offer)) for (const key of item.keys) previousItems.add(key);
    if (!offer.isBundle) {
      for (const key of matchKeys(offer.name, offer.image, listingIdentity(offer))) previousItems.add(key);
    }
    for (const key of listingKeys(offer)) {
      if (!previousListings.has(key)) previousListings.set(key, []);
      previousListings.get(key).push(offer);
    }
  }
  const entries = shop.offers.map(offer => ({
    offer,
    items: contents(offer),
    previous: [...new Set(listingKeys(offer).flatMap(key => previousListings.get(key) || []))],
  }));
  // A richer snapshot can reveal contents for a listing that was already present.
  for (const entry of entries) {
    if (!entry.previous.length || entry.previous.some(hasContents) || !hasContents(entry.offer)) continue;
    for (const item of entry.items) for (const key of item.keys) previousItems.add(key);
    estimated = true;
  }
  for (const { offer, items, previous: matches } of entries) {
    if (!offer.isBundle && items.length <= 1 && matches.length) continue;
    const added = hasContents(offer) ? items.filter(item => item.keys.length && !item.keys.some(key => previousItems.has(key))) : [];
    for (const { id } of added) {
      const type = id ? itemType(offer, id) : null;
      if (type) offer.arrivalTypes.push(type);
      else { offer.arrivalTypes.push(...offer.types.filter(type => type !== 'bundle')); estimated = true; }
    }
    if (added.length && offer.isBundle) offer.arrivalTypes.push('bundle');
    if (!offer.isBundle && !hasContents(offer)) {
      if (!matchKeys(offer.name, offer.image, listingIdentity(offer)).some(key => previousItems.has(key))) {
        offer.arrivalTypes.push(...offer.types);
        estimated = true;
      }
    }
  }
  for (const { offer: bundle, previous: matches } of entries.filter(entry => entry.offer.isBundle)) {
    if (hasContents(bundle)) continue;
    if (matches.length) continue;
    const related = shop.offers.filter(offer => !offer.isBundle && offer.bundles?.includes(bundle.id));
    const newTypes = related.flatMap(offer => offer.arrivalTypes);
    if (newTypes.length) { bundle.arrivalTypes.push(...newTypes, 'bundle'); estimated = true; }
    else if (!related.length) {
      bundle.arrivalTypes.push(...bundle.types); estimated = true;
    }
  }
  for (const offer of shop.offers) offer.arrivalTypes = [...new Set(offer.arrivalTypes)];
  const offers = arrivalOffers(shop.offers);
  const selection = selectOffers(offers);
  shop.arrivals = {
    ...selection.totals, listedValue: offers.reduce((sum, offer) => sum + (offer.price ?? 0), 0),
    listedCount: offers.length, listedUnpricedCount: offers.filter(offer => offer.price === null).length,
    categories: categoryTotals(offers), available: true, comparisonDate, estimated,
  };
  return shop;
}

export function tokenHistory(points, category) {
  const byDate = new Map(points.map(point => [point.date, point]));
  const summary = point => category ? point.categories?.[category] || emptySummary : point;
  return points.map(point => {
    const value = { ...emptySummary };
    let availableDays = 0;
    let estimated = Boolean(point.qualityReason);
    for (let offset = 0; offset < 14; offset++) {
      const day = byDate.get(dayAfter(point.date, offset));
      const source = !offset ? day : day?.arrivals?.available ? day.arrivals : null;
      if (!source) continue;
      const stats = summary(source);
      for (const key of Object.keys(emptySummary)) value[key] += stats[key] || 0;
      availableDays++;
      estimated ||= Boolean(source.estimated || day.qualityReason);
    }
    return { ...point, ...value, estimated, token: { endDate: dayAfter(point.date, 13), availableDays } };
  });
}
