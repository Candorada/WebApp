const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

export function timeTicks(first, last, range) {
  const mode = range === 'all' ? 'year' : Number(range) <= 31 ? 'day' : 'month';
  const date = new Date(first);
  const ticks = [];
  while (date.getTime() <= last) {
    const label = mode === 'year' ? String(date.getUTCFullYear())
      : mode === 'day' ? String(date.getUTCDate())
      : month.format(date) + (!ticks.length || date.getUTCMonth() === 0 ? ` ${String(date.getUTCFullYear()).slice(-2)}` : '');
    ticks.push({ time: date.getTime(), label });
    if (mode === 'year') date.setUTCFullYear(date.getUTCFullYear() + 1, 0, 1);
    else if (mode === 'month') date.setUTCMonth(date.getUTCMonth() + 1, 1);
    else date.setUTCDate(date.getUTCDate() + 1);
  }
  return ticks.map((tick, i) => ({ ...tick, labelTime: mode === 'day' ? tick.time : (tick.time + (ticks[i + 1]?.time ?? last)) / 2 }));
}
