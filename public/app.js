import { selectOffers, typeLabel } from './shop.js';
import { dateFromPath, datePath } from './date-route.js';
import { arrivalOffers, arrivalCalculation, tokenDays, tokenOffers } from './arrivals.js';

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
let tokenLineup;
const snapshots = new Map();
const formatted = value => value === null ? '—' : number.format(value);
export const visibleDate = () => activeDate || shop?.shopDate.slice(0, 10);
const availableTypes = new Set();
let lastSelection;
let arrivalsOnly = false;
try { arrivalsOnly = localStorage.getItem('fortnite-shop-new-items-only') === '1'; } catch { /* In-memory toggles work without storage. */ }
export const newItemsOnly = () => arrivalsOnly;
$('new-items-only').checked = arrivalsOnly;

function visibleOffers() {
  return arrivalsOnly ? arrivalOffers(shop?.offers || []) : shop?.offers || [];
}

function announceDay() {
  document.dispatchEvent(new CustomEvent('shop:navigation', { detail: { date: visibleDate() } }));
}

export function selectedTypes() {
  return new Set([...availableTypes].filter(type => !excluded.has(type)));
}

export function setAvailableTypes(types) {
  for (const type of types) availableTypes.add(type);
  renderTypes();
  renderOffers();
}

export function selectCategory(type) {
  excluded = new Set(type ? [...availableTypes].filter(id => id !== type) : []);
  saveFilters(); renderTypes(); renderOffers();
}

function saveFilters() {
  try { localStorage.setItem(storageKey, JSON.stringify([...excluded])); } catch { /* Keep the current selection in memory. */ }
}

function renderTypes() {
  const types = new Map([...availableTypes].map(id => [id, { label: typeLabel(id), count: 0 }]));
  for (const offer of visibleOffers()) {
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

function offerCard(offer, coveredBy, date) {
  const article = document.createElement('article');
  const excludedFromTotal = !date && (coveredBy || (!offer.isBundle && offer.bundleOnly));
  article.className = excludedFromTotal ? 'offer covered' : 'offer';
  article.dataset.offerId = offer.id;
  article.id = `offer-${date ? `${date}-` : ''}${offer.id}`;
  article.tabIndex = -1;
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
  const name = document.createElement(date ? 'h4' : 'h3');
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
  if (date && (offer.items.length > 1 || (offer.isBundle && offer.items.length))) {
    const contents = document.createElement('details');
    contents.className = 'offer-contents';
    const title = document.createElement('summary');
    title.textContent = 'Included items';
    const list = document.createElement('ul');
    for (const item of new Set(offer.items)) {
      const row = document.createElement('li');
      row.textContent = item;
      list.append(row);
    }
    contents.append(title, list);
    info.append(contents);
  }
  if (offer.price === null) {
    const note = document.createElement('p');
    note.className = 'coverage-note';
    note.textContent = 'Price missing from archive';
    info.append(note);
  }
  if (excludedFromTotal) {
    const note = document.createElement('p');
    note.className = 'coverage-note';
    if (coveredBy) {
      note.append(document.createTextNode(offer.bundles?.length ? 'Assumed included in: ' : 'Included in: '));
      coveredBy.forEach((bundle, index) => {
        if (index) note.append(document.createTextNode(' / '));
        const link = document.createElement('a');
        link.href = '#' + encodeURIComponent(`offer-${bundle.id}`);
        link.textContent = bundle.name;
        link.addEventListener('click', event => {
          event.preventDefault();
          $('search').value = '';
          renderLineup();
          const target = document.getElementById(`offer-${bundle.id}`);
          target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target?.focus({ preventScroll: true });
        });
        note.append(link);
      });
    } else note.textContent = 'Only sold in a bundle';
    note.title = 'Excluded from the total';
    info.append(note);
    article.setAttribute('aria-label', `${offer.name} — not added to total. ${note.textContent}.`);
  }
  article.append(art, info);
  return article;
}

function renderOffers() {
  const selected = selectedTypes();
  const key = JSON.stringify({ types: [...selected].sort(), arrivalsOnly });
  if (lastSelection !== key) {
    lastSelection = key;
    document.dispatchEvent(new CustomEvent('shop:filters', { detail: { types: [...selected] } }));
  }
  if (!shop) return;
  const candidates = visibleOffers();
  const selection = selectOffers(candidates, selected);
  const summary = selection.totals;
  const incomplete = summary.unpricedCount > 0;
  const unavailable = arrivalsOnly && !shop.arrivals?.available;
  $('new-items-status').hidden = !arrivalsOnly;
  $('new-items-status').textContent = shop.arrivals?.available
    ? `Compared with ${shop.arrivals.comparisonDate}. Returning items count; full matching bundle prices are included.${shop.arrivals.estimated ? ' Some item identities or bundle contents are inferred.' : ''}`
    : shop.arrivals?.reason || 'Daily additions cannot be determined because the previous shop is unavailable.';
  $('total').textContent = unavailable ? '—' : number.format(summary.value);
  $('total-unit').textContent = unavailable ? 'COMPARISON UNAVAILABLE' : incomplete ? 'V-BUCKS · KNOWN PRICES' : 'V-BUCKS';
  $('offer-count').textContent = unavailable ? '—' : number.format(summary.count);
  $('savings').textContent = unavailable ? '—' : formatted(summary.savings);
  const all = selection.selected.length === candidates.length;
  $('total-label').textContent = arrivalsOnly ? 'NEWLY ADDED ITEMS VALUE' : incomplete ? 'KNOWN BUYOUT SUBTOTAL' : all ? 'ESTIMATED SHOP BUYOUT' : 'SELECTED BUYOUT COST';
  const omitted = selection.selected.length - summary.count;
  $('full-total').textContent = unavailable ? $('new-items-status').textContent : incomplete
    ? `${number.format(summary.unpricedCount)} counted listings have no archived price and are not included in this subtotal. The full buyout price may differ.`
    : `${number.format(omitted)} covered or bundle-only listings excluded.${all ? '' : ` ${arrivalsOnly ? 'All daily additions' : 'Full shop'}: ${formatted(arrivalsOnly ? shop.arrivals.value : shop.totals.value)} V-Bucks.`}`;
  if (!tokenLineup) renderLineup(selection);
}

const searchQuery = () => $('search').value.trim().toLocaleLowerCase();

function matchingOffers(offers, query) {
  const sort = $('sort').value;
  return offers.filter(offer => !query || `${offer.name} ${offer.items.join(' ')}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (a.price === null) - (b.price === null) || (sort === 'price-asc' ? a.price - b.price : b.price - a.price) || a.name.localeCompare(b.name));
}

function renderLineup(selection) {
  if (tokenLineup) { renderTokenLineup(tokenLineup); return; }
  if (!shop) {
    $('offers').replaceChildren();
    $('showing').textContent = 'Loading offers…';
    $('empty').hidden = true;
    return;
  }
  selection ??= selectOffers(visibleOffers(), selectedTypes());
  const query = searchQuery();
  const offers = matchingOffers(selection.selected, query);
  const count = selection.totals.count;
  $('offers').replaceChildren(...offers.map(offer => offerCard(offer, selection.coveredBy.get(offer.id))));
  $('offers').setAttribute('aria-busy', 'false');
  $('showing').textContent = `${number.format(offers.length)} listings · ${number.format(count)} counted · ${number.format(selection.selected.length - count)} grayed out${query ? ' · Search only filters this list' : ''}`;
  $('empty').hidden = offers.length > 0;
  $('empty').textContent = arrivalsOnly && !shop.arrivals?.available ? 'Turn off New items only to view this shop; the previous day is unavailable.'
    : arrivalsOnly ? 'No newly added items match this selection or search.' : 'No offers to show. Select an item type or change your search.';
}

function renderTokenLineup(lineup) {
  const { date, days, shops, category, metric, hasTypes } = lineup;
  const loading = !date || (hasTypes && days.length > 0 && !shops);
  $('offers').setAttribute('aria-busy', String(loading));
  const query = searchQuery();
  const sections = [];
  let count = 0;
  let value = 0;
  let available = 0;
  if (hasTypes && shops) {
    for (const [index, { date: day, arrivals }] of days.entries()) {
      const snapshot = shops[index];
      if (!snapshot || (arrivals && !snapshot.arrivals?.available)) continue;
      available++;
      const offers = tokenOffers(snapshot, arrivals, category, metric);
      const subtotal = offers.reduce((sum, offer) => sum + (offer.price ?? 0), 0);
      count += offers.length;
      value += subtotal;
      const matches = matchingOffers(offers, query);
      if (!matches.length) continue;
      const section = document.createElement('section');
      section.className = 'token-day';
      section.dataset.date = day;
      const heading = document.createElement('h3');
      heading.textContent = new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      const label = document.createElement('p');
      label.className = 'token-day-subtotal';
      label.textContent = `${arrivals ? 'Daily additions' : 'Start-day shop'} · ${number.format(subtotal)} V-Bucks`;
      const grid = document.createElement('div');
      grid.className = 'offers';
      grid.append(...matches.map(offer => offerCard(offer, undefined, day)));
      section.append(heading, label, grid);
      sections.push(section);
    }
  }
  $('offers').replaceChildren(...sections);
  const scope = category ? typeLabel(category) : 'Full shop';
  $('showing').textContent = loading ? `Loading the ${tokenDays}-day lineup…` : !hasTypes ? 'No categories selected'
    : `${scope} · ${number.format(count)} offers · ${number.format(value)} V-Bucks · ${available}/${tokenDays} days itemized${available < days.length ? ' · Some lists failed to load. Use Refresh to retry.' : ''}${query ? ' · Search only filters this list' : ''}`;
  $('empty').hidden = loading || sections.length > 0;
  $('empty').textContent = !hasTypes ? 'Select an item type to show offers.' : !available ? 'No item lists are available in this window.'
    : query ? 'No token offers match this search.' : 'No offers contributed to this selection.';
}

export function setTokenLineup(plan) {
  if (!plan) {
    if (!tokenLineup) return;
    tokenLineup.request?.abort();
    tokenLineup = undefined;
    renderLineup();
    return;
  }
  const key = JSON.stringify([plan.date, plan.days]);
  if (key !== tokenLineup?.key) {
    tokenLineup?.request?.abort();
    tokenLineup = { ...plan, key };
  } else {
    if (tokenLineup.category === plan.category && tokenLineup.metric === plan.metric && tokenLineup.hasTypes === plan.hasTypes) return;
    Object.assign(tokenLineup, plan);
  }
  if (plan.hasTypes && plan.days.length && !tokenLineup.shops && !tokenLineup.request) loadTokenLineup(tokenLineup);
  else renderLineup();
}

async function loadTokenLineup(lineup) {
  lineup.request?.abort();
  const request = new AbortController();
  lineup.request = request;
  lineup.shops = undefined;
  renderLineup();
  const results = await Promise.allSettled(lineup.days.map(({ date }) => archivedShop(date, request.signal)));
  if (request.signal.aborted) return;
  lineup.shops = results.map(result => result.status === 'fulfilled' ? result.value : null);
  lineup.request = undefined;
  renderLineup();
}

async function archivedShop(date, signal, refresh = false) {
  if (!refresh && snapshots.has(date)) return snapshots.get(date);
  const response = await fetch(`/api/history/${date}?calculation=${arrivalCalculation}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), cache: refresh ? 'reload' : 'default' });
  if ([400, 404].includes(response.status)) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load the archived shop.');
  if (!data.snapshot?.offers) throw new Error('The archived item list is unavailable.');
  if (data.finalized) {
    snapshots.set(date, data.snapshot);
    if (snapshots.size > 32) snapshots.delete(snapshots.keys().next().value);
  }
  return data.snapshot;
}

async function loadShop(refresh = false) {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  const date = activeDate;
  $('refresh').disabled = true;
  $('refresh').textContent = '↻ Loading…';
  if (!tokenLineup) $('offers').setAttribute('aria-busy', 'true');
  try {
    let result;
    if (date) result = await archivedShop(date, controller.signal, refresh);
    else {
      const response = await fetch('/api/shop', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), cache: refresh ? 'reload' : 'default' });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not refresh the shop.');
    }
    if (controller !== pending) return;
    if (!result && date) { navigateDate(null, { replace: true }); return; }
    if (!result?.offers) throw new Error('The item list is unavailable.');
    shop = result;
    const day = shop.shopDate.slice(0, 10);
    const displayDate = new Date(shop.shopDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    $('shop-date').textContent = `${displayDate} rotation · ${date ? 'Archived shop · UTC' : 'Resets at 00:00 UTC'}`;
    $('hero-title').textContent = `Shop of ${displayDate}`;
    $('shop-mode').textContent = date ? 'ARCHIVED SHOP' : 'LIVE SHOP';
    $('live-shop').hidden = !date;
    document.title = date ? `${displayDate} · Fortnite Shop Value` : 'Fortnite Shop Value';
    const stale = !date && day !== new Date().toISOString().slice(0, 10);
    $('notice').hidden = !stale && !shop.qualityReason;
    $('notice').textContent = shop.qualityReason || (stale ? `The provider's latest shop is dated ${day}. This result may be out of date; the app will keep checking.` : '');
    const checked = shop.fetchedAt && new Date(shop.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    $('updated').textContent = date ? `Viewing ${displayDate} · Filters apply to this shop` : `Checked ${checked} · Auto-refresh every minute`;
    setAvailableTypes(shop.offers.flatMap(offer => offer.types));
    announceDay();
  } catch (error) {
    if (controller !== pending || controller.signal.aborted) return;
    $('notice').hidden = false;
    $('notice').textContent = `${error.name === 'TimeoutError' ? 'The request timed out. Try Refresh again.' : error.message}${shop ? ' Showing the previous result; it may be out of date.' : ''}`;
    if (!shop) {
      $('shop-date').textContent = 'Shop unavailable · Press Refresh to retry';
      $('types').textContent = 'Item types will appear when the shop loads.';
      if (!tokenLineup) $('showing').textContent = 'Waiting for shop data';
    }
  } finally {
    if (controller === pending) {
      pending = undefined;
      $('refresh').disabled = false;
      $('refresh').textContent = '↻ Refresh';
      if (!tokenLineup) $('offers').setAttribute('aria-busy', 'false');
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
    $('types').replaceChildren();
    if (!tokenLineup) renderLineup();
  }
  announceDay();
  return loadShop();
}

$('refresh').addEventListener('click', () => {
  loadShop(true);
  if (tokenLineup?.hasTypes && tokenLineup.days.length) loadTokenLineup(tokenLineup);
});
for (const home of document.querySelectorAll('a[href="/"]')) home.addEventListener('click', event => {
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); navigateDate(null);
});
window.addEventListener('popstate', () => navigateDate(dateFromPath(location.pathname), { replace: true }));
$('search').addEventListener('input', () => renderLineup());
$('sort').addEventListener('change', () => renderLineup());
$('new-items-only').addEventListener('change', () => {
  arrivalsOnly = $('new-items-only').checked;
  try { localStorage.setItem('fortnite-shop-new-items-only', arrivalsOnly ? '1' : '0'); } catch { /* Keep the current mode in memory. */ }
  renderTypes(); renderOffers();
});
$('select-all').addEventListener('click', () => {
  if (!shop) return;
  selectCategory(null);
});
$('select-none').addEventListener('click', () => {
  if (!shop) return;
  excluded = new Set(availableTypes);
  saveFilters(); renderTypes(); renderOffers();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !activeDate) loadShop(); });
navigateDate(dateFromPath(location.pathname), { replace: true });
setInterval(() => { if (!document.hidden && !activeDate) loadShop(); }, 60000);
