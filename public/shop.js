const labels = {
  bundle: 'Bundles', outfit: 'Outfits', emote: 'Emotes', pickaxe: 'Pickaxes',
  glider: 'Gliders', backpack: 'Back Bling', wrap: 'Wraps', track: 'Jam Tracks',
  instrument: 'Instruments', car: 'Cars', sidekick: 'Sidekicks', shoe: 'Kicks',
  loadingscreen: 'Loading Screens', music: 'Lobby Music', contrail: 'Contrails',
  spray: 'Sprays', emoji: 'Emoticons', toy: 'Toys', other: 'Other',
};

export function typeLabel(type) {
  return labels[type] || type;
}

export function selectOffers(offers, selectedTypes) {
  const selected = offers.filter(offer => !selectedTypes || offer.types.some(type => selectedTypes.has(type)));
  const coveredBy = new Map();
  const retainedBundles = [];
  const bundles = selected.filter(offer => offer.isBundle && offer.itemIds.length).sort((a, b) =>
    b.itemIds.length - a.itemIds.length || (a.price ?? Infinity) - (b.price ?? Infinity) || a.id.localeCompare(b.id));
  for (const bundle of bundles) {
    const parent = retainedBundles.find(other => bundle.itemIds.every(id => other.itemIds.includes(id)));
    if (parent) coveredBy.set(bundle.id, [parent]);
    else retainedBundles.push(bundle);
  }
  for (const offer of selected) {
    if (offer.isBundle) continue;
    const assumed = selected.filter(bundle => bundle.isBundle && offer.bundles?.includes(bundle.id));
    if (assumed.length) { coveredBy.set(offer.id, assumed); continue; }
    const parent = offer.itemIds.length && retainedBundles.find(bundle => offer.itemIds.every(id => bundle.itemIds.includes(id)));
    if (parent) coveredBy.set(offer.id, [parent]);
  }
  const counted = selected.filter(offer => !coveredBy.has(offer.id) && !offer.bundleOnly);
  const summary = counted.reduce((sum, offer) => {
    sum.value += offer.price;
    sum.savings += Math.max(0, offer.regularPrice - offer.price);
    sum.count++;
    return sum;
  }, { value: 0, savings: 0, count: 0 });
  if (counted.some(offer => offer.price === null)) {
    summary.value = null;
    summary.savings = null;
  }
  return { selected, counted, coveredBy, totals: summary };
}

export function totals(offers, selectedTypes) {
  return selectOffers(offers, selectedTypes).totals;
}

export function normalizeShop(payload) {
  const data = payload?.data;
  if (payload?.status !== 200 || !Array.isArray(data?.entries) || !Number.isFinite(Date.parse(data.date))) {
    throw new Error('The shop provider returned an unexpected response.');
  }
  const unique = new Map();
  for (const entry of data.entries) {
    if (typeof entry.offerId !== 'string' || !entry.offerId || !Number.isSafeInteger(entry.finalPrice) || entry.finalPrice < 0) {
      throw new Error('An offer is missing a valid ID or price.');
    }
    if (unique.has(entry.offerId)) {
      if (unique.get(entry.offerId).price !== entry.finalPrice) throw new Error('A repeated offer has conflicting prices.');
      continue;
    }
    const contents = ['brItems', 'tracks', 'instruments', 'cars'].flatMap(group =>
      (Array.isArray(entry[group]) ? entry[group] : []).map(item => ({ group, item })));
    if (contents.some(({ item }) => typeof item?.id !== 'string' || !item.id)) {
      throw new Error('An offer contains an item without a valid cosmetic ID.');
    }
    const items = contents.map(({ item }) => item);
    const itemIds = [...new Set(contents.map(({ group, item }) => `${group}:${item.id.toLowerCase()}`))];
    const isBundle = Boolean(entry.bundle);
    const types = [...new Set(contents.map(({ group, item }) => group === 'brItems' ? item.type?.value || 'other'
      : group === 'tracks' ? 'track' : group === 'instruments' ? 'instrument' : 'car'))];
    if (isBundle) types.push('bundle');
    if (!types.length) types.push('other');
    const first = items[0];
    const type = entry.bundle ? 'bundle'
      : entry.brItems?.[0]?.type?.value || (entry.tracks?.length ? 'track'
      : entry.instruments?.length ? 'instrument' : entry.cars?.length ? 'car' : 'other');
    const image = entry.bundle?.image || entry.newDisplayAsset?.renderImages?.[0]?.image
      || first?.images?.featured || first?.images?.icon || first?.images?.large || first?.albumArt;
    unique.set(entry.offerId, {
      id: entry.offerId,
      name: entry.bundle?.name || first?.name || first?.title || 'Unnamed offer',
      type,
      typeLabel: labels[type] || first?.type?.displayValue || type,
      types,
      itemIds,
      isBundle,
      bundleOnly: Boolean(entry.cars?.length && !isBundle),
      price: entry.finalPrice,
      regularPrice: Number.isSafeInteger(entry.regularPrice) && entry.regularPrice >= 0 ? entry.regularPrice : entry.finalPrice,
      section: entry.layout?.name || 'Item shop',
      image: typeof image === 'string' && image.startsWith('https://') ? image : null,
      items: items.map(item => item.name || item.title).filter(Boolean),
    });
  }
  const offers = [...unique.values()];
  return { shopDate: new Date(data.date).toISOString(), offers, totals: totals(offers), duplicateCount: data.entries.length - offers.length };
}
