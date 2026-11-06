import { navigateDate, visibleDate, selectedTypes, setAvailableTypes, selectCategory } from './app.js';
import { typeLabel } from './shop.js';
import { timeTicks } from './history-axis.js';

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const svgNS = 'http://www.w3.org/2000/svg';
let points = [];
let fullPoints = [];
let selectedDate;
let visible = [];
let chartBounds;
let archiveGapCount = 0;
const metric = () => $('history-metric').value;
const unpriced = point => (metric() === 'value' ? point.unpricedCount : point.listedUnpricedCount) || 0;
const emptyTotals = { value: 0, count: 0, unpricedCount: 0, listedValue: 0, listedCount: 0, listedUnpricedCount: 0 };

function applyCategory() {
  const types = [...selectedTypes()];
  const category = types.length === 1 ? types[0] : null;
  points = category ? fullPoints.map(point => ({ ...point, ...(Object.hasOwn(point.categories, category) ? point.categories[category] : emptyTotals) }))
    : types.length ? fullPoints : fullPoints.map(point => ({ ...point, ...emptyTotals }));
  $('history-heading').textContent = category ? `${typeLabel(category)} price history` : types.length ? 'Full shop price history' : 'No categories selected';
  $('history-category').value = category || (types.length ? 'all' : '');
  $('history-category-hint').hidden = types.length === 1;
  $('history-category-hint').textContent = types.length > 1
    ? 'Select single category to compare value of specific item types.' : 'Select a category to compare its historical value.';
  if (selectedDate) selectDate(selectedDate); else draw();
}

function element(tag, attrs = {}, text) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
const timestamp = date => Date.parse(date + 'T00:00:00Z');
const displayDate = date => new Date(timestamp(date)).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function selectDate(date) {
  selectedDate = date;
  $('history-date').value = date;
  $('history-selected-date').textContent = displayDate(date);
  const point = points.find(point => point.date === date);
  $('history-value').textContent = point ? number.format(point[metric()]) : '—';
  $('history-unit').textContent = point && unpriced(point) ? 'V-BUCKS · KNOWN PRICES' : 'V-BUCKS';
  $('history-source').hidden = !point;
  if (!point) {
    $('history-detail').textContent = 'No complete price record for this date. A total has not been estimated.';
  } else {
    const source = point.source === 'itemshop.gg' ? `https://itemshop.gg/fortnite/${point.sourceDate}` : `/api/history/${point.date}`;
    $('history-source').href = source;
    const timing = point.source === 'itemshop.gg'
      ? 'Archived shop' + (point.exact ? '' : ` · carried forward from ${point.sourceDate}`)
      : point.finalized ? `Saved ${new Date(point.capturedAt).toLocaleTimeString(undefined, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false })} UTC` : 'Provisional snapshot';
    if (unpriced(point)) {
      $('history-detail').textContent = `Known price subtotal · ${unpriced(point)} unpriced listings excluded · ${timing} · Possible mistakes for this day`;
    } else {
      const count = metric() === 'value' ? point.count : point.listedCount;
      $('history-detail').textContent = `${number.format(count)} ${metric() === 'value' ? 'counted offers' : 'priced listings'} · ${timing}${point.qualityReason ? ' · Possible mistakes for this day' : ''}`;
    }
  }
  if (chartBounds && point && (timestamp(date) < chartBounds.first || timestamp(date) > chartBounds.last)) $('history-range').value = 'all';
  draw();
}

function draw() {
  const chart = $('history-chart');
  if (!points.length) return;
  const days = Number($('history-range').value);
  const cutoff = Number.isFinite(days) ? timestamp(points.at(-1).date) - (days - 1) * 86400000 : -Infinity;
  visible = points.filter(point => timestamp(point.date) >= cutoff);
  const partial = visible.filter(point => unpriced(point));
  $('history-status').textContent = `${number.format(points.length)} selectable dates · ${number.format(visible.length - partial.length)} totals with all prices · ${number.format(partial.length)} known-price subtotals in this view · ${points[0].date} onwards${archiveGapCount ? ` · ${archiveGapCount} unavailable source records` : ''}`;
  const width = Math.max(320, chart.clientWidth || 900);
  const height = 320;
  if (!visible.length) { chart.replaceChildren(element('text', { x: 20, y: 80, class: 'history-axis' }, 'No complete totals for this range.')); chartBounds = null; return; }
  const padding = { left: 59, right: 15, top: 21, bottom: 73 };
  const first = timestamp(visible[0].date);
  const last = timestamp(visible.at(-1).date);
  const span = Math.max(86400000, last - first);
  const maximum = Math.max(1, ...visible.map(point => point[metric()])) * 1.08;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const timeX = time => visible.length === 1 ? padding.left + plotWidth / 2 : padding.left + (time - first) / span * plotWidth;
  const x = point => timeX(timestamp(point.date));
  const y = point => padding.top + plotHeight * (1 - (point[metric()] ?? 0) / maximum);
  chartBounds = { first, last, left: padding.left, plotWidth, span, width };
  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.replaceChildren(element('title', {}, 'Shop buyout estimates in V-Bucks. Yellow markers are known-price subtotals with missing prices. Item counts are never plotted as prices.'));
  for (let i = 0; i <= 3; i++) {
    const value = maximum * i / 3;
    const position = padding.top + plotHeight * (1 - i / 3);
    chart.append(element('line', { x1: padding.left, x2: width - padding.right, y1: position, y2: position, class: 'history-grid' }));
    chart.append(element('text', { x: padding.left - 10, y: position + 4, 'text-anchor': 'end', class: 'history-axis' }, compact.format(value)));
  }
  const baseline = height - padding.bottom;
  const ticks = timeTicks(first, last, $('history-range').value);
  const dense = plotWidth / ticks.length < (days <= 31 ? 19 : 42);
  for (const tick of ticks) {
    const position = timeX(tick.time);
    const labelPosition = timeX(tick.labelTime);
    const labelY = baseline + 19;
    chart.append(element('line', { x1: position, x2: position, y1: padding.top, y2: baseline, class: 'history-time-grid' }));
    chart.append(element('line', { x1: position, x2: position, y1: baseline, y2: baseline + 5, class: 'history-time-tick' }));
    chart.append(element('text', {
      x: labelPosition, y: labelY, class: `history-axis history-time-label${dense ? ' history-time-dense' : ''}`,
      'text-anchor': dense ? 'end' : 'middle',
      ...(dense ? { transform: `rotate(-55 ${labelPosition} ${labelY})` } : {}),
    }, tick.label));
  }
  let path = '';
  let previous;
  for (const point of visible) {
    if (unpriced(point)) {
      const marker = element('circle', { cx: x(point), cy: y(point), r: 2.5, class: 'history-fallback' });
      marker.append(element('title', {}, `${point.date}: ${number.format(point[metric()])} V-Bucks known subtotal; ${unpriced(point)} unpriced listings`));
      chart.append(marker);
    }
    const gap = previous && timestamp(point.date) - timestamp(previous.date) > 86400000;
    path += `${!previous || gap ? 'M' : 'L'}${x(point).toFixed(2)},${y(point).toFixed(2)} `;
    previous = point;
  }
  chart.append(element('path', { d: path, class: 'history-line' }));
  const selected = visible.find(point => point.date === selectedDate);
  if (selected) {
    const labelWidth = 108;
    const labelX = Math.max(padding.left + labelWidth / 2, Math.min(width - padding.right - labelWidth / 2, x(selected)));
    const labelY = height - 8;
    chart.append(element('line', { x1: x(selected), x2: x(selected), y1: padding.top, y2: labelY - 16, class: 'history-guide' }));
    chart.append(element('circle', { cx: x(selected), cy: y(selected), r: 5, class: unpriced(selected) ? 'history-marker history-fallback' : 'history-marker' }));
    chart.append(element('rect', { x: labelX - labelWidth / 2, y: labelY - 16, width: labelWidth, height: 22, rx: 4, class: 'history-date-badge' }));
    chart.append(element('text', { x: labelX, y: labelY - 1, 'text-anchor': 'middle', class: 'history-selected-label' }, selectedDate));
  }
}

$('history-chart').addEventListener('click', event => {
  if (!chartBounds) return;
  const rect = $('history-chart').getBoundingClientRect();
  const position = (event.clientX - rect.left) * chartBounds.width / rect.width;
  const target = chartBounds.first + Math.max(0, Math.min(1, (position - chartBounds.left) / chartBounds.plotWidth)) * chartBounds.span;
  const nearest = visible.reduce((best, point) => Math.abs(timestamp(point.date) - target) < Math.abs(timestamp(best.date) - target) ? point : best);
  navigateDate(nearest.date);
});
$('history-chart').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !visible.length) return;
  event.preventDefault();
  const current = Math.max(0, visible.findIndex(point => point.date === selectedDate));
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : Math.max(0, Math.min(visible.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1)));
  navigateDate(visible[index].date);
});
$('history-date').addEventListener('change', () => {
  navigateDate($('history-date').value);
});
$('history-range').addEventListener('change', draw);
$('history-metric').addEventListener('change', () => { if (selectedDate) selectDate(selectedDate); });
$('history-category').addEventListener('change', () => selectCategory($('history-category').value === 'all' ? null : $('history-category').value));
document.addEventListener('shop:filters', applyCategory);
new ResizeObserver(draw).observe($('history-chart'));
document.addEventListener('shop:navigation', event => {
  const date = event.detail.date || points.at(-1)?.date;
  if (date) selectDate(date);
});

async function loadHistory() {
  try {
    const response = await fetch('/api/history?calculation=categories-v4');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'History could not be loaded.');
    fullPoints = data.points;
    const control = $('history-category');
    control.replaceChildren(new Option('Full shop', 'all'), new Option('No categories selected', ''));
    control.options[1].hidden = true;
    for (const type of data.types.sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)))) control.add(new Option(typeLabel(type), type));
    setAvailableTypes(data.types);
    applyCategory();
    control.disabled = false;
    archiveGapCount = data.gapCount;
    if (!points.length) { $('history-status').textContent = 'Historical shop data is being prepared.'; return; }
    $('history-status').textContent = `${number.format(points.length)} recorded days · ${data.earliest} onwards${data.gapCount ? ` · ${number.format(data.gapCount)} incomplete price records omitted` : ''}`;
    $('history-chart').removeAttribute('hidden');
    $('history-date').disabled = false;
    $('history-date').min = data.earliest;
    $('history-date').max = data.latest;
    selectDate(visibleDate() || data.latest);
  } catch (error) { $('history-status').textContent = `History unavailable: ${error.message}`; }
}
loadHistory();
setInterval(() => { if (!document.hidden) loadHistory(); }, 300000);
