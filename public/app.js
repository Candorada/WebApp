import { selectOffers, typeLabel } from './shop.js';
import { dateFromPath, datePath } from './date-route.js';

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en-US');
const storageKey = 'fortnite-shop-value-excluded-types';
let excluded = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) excluded = new Set(saved.filter(type => typeof type === 'string'));
} catch { /* Filters also work when browser storage is unavailable. */ }
let shop;
let activeDate = null;
let pending;
const snapshots = new Map();
const formatted = value => value === null ? '—' : number.format(value);
export const visibleDate = () => activeDate || shop?.shopDate.slice(0, 10);

function announceDay() {
  document.dispatchEvent(new CustomEvent('shop:navigation', { detail: { date: visibleDate() } }));
}

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
  price.append(document.createTextNode(formatted(offer.price)));
  const unit = document.createElement('small');
  unit.textContent = 'V-BUCKS';
  price.append(unit);
  if (offer.price !== null && offer.regularPrice > offer.price) {
    const original = document.createElement('del');
    original.textContent = number.format(offer.regularPrice);
    price.append(original);
  }
  info.append(type, name, price);
  if (offer.price === null || offer.coverageUnknown) {
    const note = document.createElement('p');
    note.className = 'coverage-note';
    note.textContent = offer.price === null ? 'Price missing from archive' : 'Bundle coverage unavailable in archive';
    info.append(note);
  }
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
  $('total').textContent = formatted(summary.value);
  $('offer-count').textContent = number.format(summary.count);
  $('savings').textContent = formatted(summary.savings);
  const all = selection.selected.length === shop.offers.length;
  $('total-label').textContent = all ? 'TOTAL SHOP VALUE' : 'SELECTED SHOP VALUE';
  const omitted = selection.selected.length - summary.count;
  $('full-total').textContent = summary.value === null
    ? 'This selection has missing historical prices or bundle contents. Toggle those item types off to calculate the remaining offers.'
    : `${number.format(omitted)} covered or bundle-only listings excluded.${all ? '' : ` Full shop: ${formatted(shop.totals.value)} V-Bucks.`}`;
  const query = $('search').value.trim().toLocaleLowerCase();
  const offers = selection.selected.filter(offer => `${offer.name} ${offer.items.join(' ')}`.toLocaleLowerCase().includes(query));
  const sort = $('sort').value;
  offers.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (a.price === null) - (b.price === null) || (sort === 'price-asc' ? a.price - b.price : b.price - a.price) || a.name.localeCompare(b.name));
  $('offers').replaceChildren(...offers.map(offer => offerCard(offer, selection.coveredBy.get(offer.id))));
  $('offers').setAttribute('aria-busy', 'false');
  $('showing').textContent = `${number.format(offers.length)} listings · ${number.format(summary.count)} counted · ${number.format(omitted)} grayed out${query ? ' · Search only filters this list' : ''}`;
  $('empty').hidden = offers.length > 0;
}

async function loadShop(refresh = false) {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  const date = activeDate;
  $('refresh').disabled = true;
  $('refresh').textContent = '↻ Loading…';
  $('offers').setAttribute('aria-busy', 'true');
  try {
    let result = date && snapshots.get(date);
    if (!result || refresh) {
      const response = await fetch(date ? `/api/history/${date}` : '/api/shop', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), cache: refresh ? 'reload' : 'default' });
      const data = await response.json();
      if (date && [400, 404].includes(response.status)) { navigateDate(null, { replace: true }); return; }
      if (!response.ok) throw new Error(data.error || 'Could not refresh the shop.');
      result = date ? data.snapshot : data;
      if (!result?.offers) throw new Error('The archived item list is unavailable.');
      if (date && data.finalized) {
        snapshots.set(date, result);
        if (snapshots.size > 12) snapshots.delete(snapshots.keys().next().value);
      }
    }
    if (controller !== pending) return;
    shop = result;
    const day = shop.shopDate.slice(0, 10);
    const displayDate = new Date(shop.shopDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    $('shop-date').textContent = `${displayDate} rotation · ${date ? 'Archived shop · UTC' : 'Resets at 00:00 UTC'}`;
    $('hero-day').textContent = date ? 'That day’s shop.' : "Today's shop.";
    $('shop-mode').textContent = date ? 'ARCHIVED SHOP' : 'LIVE SHOP';
    $('live-shop').hidden = !date;
    document.title = date ? `${displayDate} · Fortnite Shop Value` : 'Fortnite Shop Value';
    const stale = !date && day !== new Date().toISOString().slice(0, 10);
    $('notice').hidden = !stale && !shop.qualityReason;
    $('notice').textContent = shop.qualityReason || (stale ? `The provider's latest shop is dated ${day}. This result may be out of date; the app will keep checking.` : '');
    const checked = shop.fetchedAt && new Date(shop.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    $('updated').textContent = date ? `Viewing ${displayDate} · Filters apply to this shop` : `Checked ${checked} · Auto-refresh every minute`;
    renderTypes();
    renderOffers();
    announceDay();
  } catch (error) {
    if (controller !== pending || controller.signal.aborted) return;
    $('notice').hidden = false;
    $('notice').textContent = `${error.name === 'TimeoutError' ? 'The request timed out. Try Refresh again.' : error.message}${shop ? ' Showing the previous result; it may be out of date.' : ''}`;
    if (!shop) {
      $('shop-date').textContent = 'Shop unavailable · Press Refresh to retry';
      $('showing').textContent = 'Waiting for shop data';
      $('types').textContent = 'Item types will appear when the shop loads.';
      $('offers').setAttribute('aria-busy', 'false');
    }
  } finally {
    if (controller === pending) {
      pending = undefined;
      $('refresh').disabled = false;
      $('refresh').textContent = '↻ Refresh';
      $('offers').setAttribute('aria-busy', 'false');
    }
  }
}

export function navigateDate(date, { replace = false } = {}) {
  const path = datePath(date);
  activeDate = path === '/' ? null : date;
  if (location.pathname !== path || replace) history[replace ? 'replaceState' : 'pushState'](null, '', path);
  // Clear the previous day's data while fetching so filters never act on a stale shop.
  if (shop?.shopDate.slice(0, 10) !== activeDate) {
    shop = undefined;
    $('total').textContent = '—';
    $('offer-count').textContent = '—';
    $('savings').textContent = '—';
    $('full-total').textContent = 'Loading the selected shop…';
    $('shop-date').textContent = date ? `Loading ${date}…` : 'Loading the live shop…';
    $('showing').textContent = 'Loading offers…';
    $('types').replaceChildren();
    $('offers').replaceChildren();
    $('empty').hidden = true;
  }
  announceDay();
  return loadShop();
}

$('refresh').addEventListener('click', () => loadShop(true));
for (const home of document.querySelectorAll('a[href="/"]')) home.addEventListener('click', event => {
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); navigateDate(null);
});
window.addEventListener('popstate', () => navigateDate(dateFromPath(location.pathname), { replace: true }));
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
document.addEventListener('visibilitychange', () => { if (!document.hidden && !activeDate) loadShop(); });
navigateDate(dateFromPath(location.pathname), { replace: true });
setInterval(() => { if (!document.hidden && !activeDate) loadShop(); }, 60000);
