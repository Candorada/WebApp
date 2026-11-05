import { selectOffers, typeLabel } from './shop.js';

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en-US');
const storageKey = 'fortnite-shop-value-excluded-types';
let excluded = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) excluded = new Set(saved.filter(type => typeof type === 'string'));
} catch { /* Filters also work when browser storage is unavailable. */ }
let shop;
let loading = false;

function selectedTypes() {
  return new Set(shop.offers.flatMap(offer => offer.types).filter(type => !excluded.has(type)));
}

function saveFilters() {
  try { localStorage.setItem(storageKey, JSON.stringify([...excluded])); } catch { /* Keep the current selection in memory. */ }
}

function renderTypes() {
  const types = new Map();
  for (const offer of shop.offers) {
    for (const id of offer.types) {
      const type = types.get(id) || { label: typeLabel(id), count: 0 };
      type.count++;
      types.set(id, type);
    }
  }
  $('types').replaceChildren();
  for (const [id, type] of [...types].sort((a, b) => a[1].label.localeCompare(b[1].label))) {
    const label = document.createElement('label');
    label.className = 'type-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !excluded.has(id);
    input.addEventListener('change', () => {
      if (input.checked) excluded.delete(id); else excluded.add(id);
      saveFilters();
      renderOffers();
    });
    const name = document.createElement('span');
    name.textContent = type.label;
    const count = document.createElement('span');
    count.className = 'type-count';
    count.textContent = number.format(type.count);
    label.append(input, name, count);
    $('types').append(label);
  }
}

function offerCard(offer, coveredBy) {
  const article = document.createElement('article');
  const excludedFromTotal = coveredBy || offer.bundleOnly;
  article.className = excludedFromTotal ? 'offer covered' : 'offer';
  article.dataset.offerId = offer.id;
  const art = document.createElement('div');
  art.className = 'offer-art';
  if (offer.image) {
    const image = document.createElement('img');
    image.src = offer.image;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => image.remove(), { once: true });
    art.append(image);
  }
  const info = document.createElement('div');
  info.className = 'offer-info';
  const type = document.createElement('p');
  type.className = 'offer-type';
  type.textContent = `${offer.isBundle ? 'Bundle · ' : ''}${offer.types.filter(id => id !== 'bundle').map(typeLabel).join(' · ')}`;
  const name = document.createElement('h3');
  name.textContent = offer.name;
  name.title = offer.items.join(', ');
  const price = document.createElement('div');
  price.className = 'offer-price';
  price.append(document.createTextNode(number.format(offer.price)));
  const unit = document.createElement('small');
  unit.textContent = 'V-BUCKS';
  price.append(unit);
  if (offer.regularPrice > offer.price) {
    const original = document.createElement('del');
    original.textContent = number.format(offer.regularPrice);
    price.append(original);
  }
  info.append(type, name, price);
  if (excludedFromTotal) {
    const note = document.createElement('p');
    note.className = 'coverage-note';
    note.textContent = coveredBy ? `Included in ${coveredBy.name}` : 'Only sold in a bundle';
    note.title = 'Excluded from the total';
    info.append(note);
    article.setAttribute('aria-label', `${offer.name} — not added to total. ${note.textContent}.`);
  }
  article.append(art, info);
  return article;
}

function renderOffers() {
  if (!shop) return;
  const selected = selectedTypes();
  const selection = selectOffers(shop.offers, selected);
  const summary = selection.totals;
  $('total').textContent = number.format(summary.value);
  $('offer-count').textContent = number.format(summary.count);
  $('savings').textContent = number.format(summary.savings);
  const all = selection.selected.length === shop.offers.length;
  $('total-label').textContent = all ? 'TOTAL SHOP VALUE' : 'SELECTED SHOP VALUE';
  const omitted = selection.selected.length - summary.count;
  $('full-total').textContent = `${number.format(omitted)} covered or bundle-only listings excluded.${all ? '' : ` Full shop: ${number.format(shop.totals.value)} V-Bucks.`}`;
  const query = $('search').value.trim().toLocaleLowerCase();
  const offers = selection.selected.filter(offer => `${offer.name} ${offer.items.join(' ')}`.toLocaleLowerCase().includes(query));
  const sort = $('sort').value;
  offers.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (sort === 'price-asc' ? a.price - b.price : b.price - a.price) || a.name.localeCompare(b.name));
  $('offers').replaceChildren(...offers.map(offer => offerCard(offer, selection.coveredBy.get(offer.id))));
  $('offers').setAttribute('aria-busy', 'false');
  $('showing').textContent = `${number.format(offers.length)} listings · ${number.format(summary.count)} counted · ${number.format(omitted)} grayed out${query ? ' · Search only filters this list' : ''}`;
  $('empty').hidden = offers.length > 0;
}

async function loadShop() {
  if (loading) return;
  loading = true;
  $('refresh').disabled = true;
  $('refresh').textContent = '↻ Loading…';
  try {
    const response = await fetch('/api/shop', { signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not refresh the shop.');
    shop = result;
    const day = shop.shopDate.slice(0, 10);
    $('shop-date').textContent = `${new Date(shop.shopDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} rotation · Resets at 00:00 UTC`;
    const stale = day !== new Date().toISOString().slice(0, 10);
    $('notice').hidden = !stale;
    $('notice').textContent = stale ? `The provider's latest shop is dated ${day}. This result may be out of date; the app will keep checking.` : '';
    const checked = new Date(shop.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    $('updated').textContent = `Checked ${checked} · Auto-refresh every minute`;
    renderTypes();
    renderOffers();
  } catch (error) {
    $('notice').hidden = false;
    $('notice').textContent = `${error.name === 'TimeoutError' ? 'The request timed out. Try Refresh again.' : error.message}${shop ? ' Showing the previous result; it may be out of date.' : ''}`;
    if (!shop) {
      $('shop-date').textContent = 'Shop unavailable · Press Refresh to retry';
      $('showing').textContent = 'Waiting for shop data';
      $('types').textContent = 'Item types will appear when the shop loads.';
      $('offers').setAttribute('aria-busy', 'false');
    }
  } finally {
    loading = false;
    $('refresh').disabled = false;
    $('refresh').textContent = '↻ Refresh';
  }
}

$('refresh').addEventListener('click', loadShop);
$('search').addEventListener('input', renderOffers);
$('sort').addEventListener('change', renderOffers);
$('select-all').addEventListener('click', () => {
  if (!shop) return;
  excluded.clear(); saveFilters(); renderTypes(); renderOffers();
});
$('select-none').addEventListener('click', () => {
  if (!shop) return;
  excluded = new Set(shop.offers.flatMap(offer => offer.types));
  saveFilters(); renderTypes(); renderOffers();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadShop(); });
loadShop();
setInterval(loadShop, 60000);
