import { selectOffers, categoryTotals } from './shop.js';

export const emptySummary = { value: 0, count: 0, unpricedCount: 0, listedValue: 0, listedCount: 0, listedUnpricedCount: 0 };
export const arrivalCalculation = 'daily-arrivals-v6';
export const dayAfter = (date, offset = 1) => new Date(Date.parse(date.slice(0, 10) + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
export const itemIdentity = id => id.toLowerCase().replace(/^(?:fn:(?:item|track|instrument|car):|britems:|tracks:|instruments:|cars:)/, '');

function listingIdentity(offer) {
  try { const parts = JSON.parse(offer.id); if (Array.isArray(parts)) return String(parts[0]).toLowerCase(); } catch { /* Live offer IDs are plain strings. */ }
  return offer.id.toLowerCase();
}

function groupListings(offers) {
  const groups = new Map();
  for (const offer of offers) {
    const id = listingIdentity(offer);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(offer);
  }
  return groups;
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
  const previousItems = new Set(previous.offers.flatMap(offer => offer.itemIds.map(itemIdentity)));
  const previousListings = groupListings(previous.offers);
  let estimated = previous.offers.some(offer => offer.coverageUnknown);
  for (const offer of previous.offers) {
    if (!offer.isBundle && !offer.itemIds.length) previousItems.add(itemIdentity(listingIdentity(offer)));
  }
  // A richer snapshot can reveal contents for a listing that was already present.
  for (const [id, offers] of groupListings(shop.offers)) {
    const matches = previousListings.get(id);
    if (offers.length !== 1 || matches?.length !== 1) continue;
    const old = matches[0];
    const current = offers[0];
    if (old.isBundle !== current.isBundle || old.itemIds.length || !current.itemIds.length) continue;
    for (const itemId of current.itemIds) previousItems.add(itemIdentity(itemId));
    estimated = true;
  }
  for (const offer of shop.offers) {
    const added = offer.itemIds.filter(id => !previousItems.has(itemIdentity(id)));
    for (const id of added) {
      const type = itemType(offer, id);
      if (type) offer.arrivalTypes.push(type);
      else { offer.arrivalTypes.push(...offer.types.filter(type => type !== 'bundle')); estimated = true; }
    }
    if (added.length && offer.isBundle) offer.arrivalTypes.push('bundle');
    if (!offer.isBundle && !offer.itemIds.length) {
      const id = listingIdentity(offer);
      if (!previousListings.has(id) && !previousItems.has(itemIdentity(id))) {
        offer.arrivalTypes.push(...offer.types);
        estimated = true;
      }
    }
  }
  for (const bundle of shop.offers.filter(offer => offer.isBundle)) {
    if (bundle.itemIds.length && !bundle.coverageUnknown) continue;
    if (previousListings.has(listingIdentity(bundle))) continue;
    const related = shop.offers.filter(offer => !offer.isBundle && offer.bundles?.includes(bundle.id));
    const newTypes = related.flatMap(offer => offer.arrivalTypes);
    if (newTypes.length) { bundle.arrivalTypes.push(...newTypes, 'bundle'); estimated = true; }
    else if (!bundle.itemIds.length && !related.length) {
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
