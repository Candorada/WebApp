import { navigateDate, visibleDate } from './app.js';

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const svgNS = 'http://www.w3.org/2000/svg';
let points = [];
let selectedDate;
let visible = [];
let chartBounds;
let archiveGapCount = 0;
const metric = () => $('history-metric').value;

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
  $('history-value').textContent = point && point[metric()] !== null ? number.format(point[metric()]) : '—';
  $('history-source').hidden = !point;
  if (!point) {
    $('history-detail').textContent = 'No complete price record for this date. A total has not been estimated.';
  } else {
    const source = point.source === 'itemshop.gg' ? `https://itemshop.gg/fortnite/${point.sourceDate}` : `/api/history/${point.date}`;
    $('history-source').href = source;
    const timing = point.source === 'itemshop.gg'
      ? 'Archived shop' + (point.exact ? '' : ` · carried forward from ${point.sourceDate}`)
      : point.finalized ? `Saved ${new Date(point.capturedAt).toLocaleTimeString(undefined, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false })} UTC` : 'Provisional snapshot';
    if (point[metric()] === null) {
      $('history-detail').textContent = point.qualityReason || 'This total cannot be verified from the archived data.';
    } else {
      const count = metric() === 'value' ? point.count : point.listedCount;
      $('history-detail').textContent = `${number.format(count)} ${metric() === 'value' ? 'counted offers' : 'priced listings'} · ${timing}`;
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
  visible = points.filter(point => timestamp(point.date) >= cutoff && point[metric()] !== null);
  $('history-status').textContent = `${number.format(points.length)} archived dates · ${number.format(points.filter(point => point[metric()] !== null).length)} available totals in this view · ${points[0].date} onwards${archiveGapCount ? ` · ${archiveGapCount} unavailable source records` : ''}`;
  const width = Math.max(320, chart.clientWidth || 900);
  const height = 280;
  if (!visible.length) { chart.replaceChildren(element('text', { x: 20, y: 80, class: 'history-axis' }, 'No complete totals for this range.')); chartBounds = null; return; }
  const padding = { left: 59, right: 15, top: 21, bottom: 35 };
  const first = timestamp(visible[0].date);
  const last = timestamp(visible.at(-1).date);
  const span = Math.max(86400000, last - first);
  const maximum = Math.max(1, ...visible.map(point => point[metric()])) * 1.08;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = point => visible.length === 1 ? padding.left + plotWidth / 2 : padding.left + (timestamp(point.date) - first) / span * plotWidth;
  const y = point => padding.top + plotHeight * (1 - point[metric()] / maximum);
  chartBounds = { first, last, left: padding.left, plotWidth, span, width };
  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.replaceChildren(element('title', {}, 'Full shop value history in V-Bucks; missing dates are gaps.'));
  for (let i = 0; i <= 3; i++) {
    const value = maximum * i / 3;
    const position = padding.top + plotHeight * (1 - i / 3);
    chart.append(element('line', { x1: padding.left, x2: width - padding.right, y1: position, y2: position, class: 'history-grid' }));
    chart.append(element('text', { x: padding.left - 10, y: position + 4, 'text-anchor': 'end', class: 'history-axis' }, compact.format(value)));
  }
  let path = '';
  let previous;
  for (const point of visible) {
    const gap = previous && timestamp(point.date) - timestamp(previous.date) > 86400000;
    path += `${!previous || gap ? 'M' : 'L'}${x(point).toFixed(2)},${y(point).toFixed(2)} `;
    previous = point;
  }
  chart.append(element('path', { d: path, class: 'history-line' }));
  chart.append(element('text', { x: padding.left, y: height - 8, class: 'history-axis' }, visible[0].date));
  chart.append(element('text', { x: width - padding.right, y: height - 8, 'text-anchor': 'end', class: 'history-axis' }, visible.at(-1).date));
  const selected = visible.find(point => point.date === selectedDate);
  if (selected) {
    chart.append(element('line', { x1: x(selected), x2: x(selected), y1: padding.top, y2: height - padding.bottom, class: 'history-guide' }));
    chart.append(element('circle', { cx: x(selected), cy: y(selected), r: 5, class: 'history-marker' }));
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
new ResizeObserver(draw).observe($('history-chart'));
document.addEventListener('shop:navigation', event => {
  const date = event.detail.date || points.at(-1)?.date;
  if (date) selectDate(date);
});

async function loadHistory() {
  try {
    const response = await fetch('/api/history');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'History could not be loaded.');
    points = data.points;
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
