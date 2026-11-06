import test from 'node:test';
import assert from 'node:assert/strict';
import { timeTicks } from '../public/history-axis.js';

const utc = date => Date.parse(date + 'T00:00:00Z');

test('all-history ticks label each year including the partial first year', () => {
  const ticks = timeTicks(utc('2017-10-26'), utc('2026-11-06'), 'all');
  assert.deepEqual(ticks.map(tick => tick.label), Array.from({ length: 10 }, (_,i) => String(2017 + i)));
  assert.equal(ticks[1].time, utc('2018-01-01'));
  assert.equal(ticks[0].labelTime, (utc('2017-10-26') + utc('2018-01-01')) / 2);
});

test('past-year ticks label months in UTC and distinguish year changes', () => {
  const ticks = timeTicks(utc('2025-11-07'), utc('2026-11-06'), '365');
  assert.equal(ticks.length, 13);
  assert.equal(ticks[0].label, 'Nov 25');
  assert.equal(ticks[1].label, 'Dec');
  assert.equal(ticks[2].label, 'Jan 26');
  assert.equal(ticks[2].time, utc('2026-01-01'));
  assert.equal(ticks.at(-1).label, 'Nov');
});

test('past-month ticks include every calendar day across leap days and month boundaries', () => {
  const ticks = timeTicks(utc('2024-02-02'), utc('2024-03-02'), '30');
  assert.equal(ticks.length, 30);
  assert.deepEqual(ticks.slice(-3).map(tick => tick.label), ['29', '1', '2']);
  assert.ok(ticks.every((tick, i) => !i || tick.time - ticks[i - 1].time === 86400000));
  assert.deepEqual(timeTicks(utc('2026-11-06'), utc('2026-11-06'), '30').map(tick => tick.label), ['6']);
});
