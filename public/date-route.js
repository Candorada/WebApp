// Routes use Unix seconds; every timestamp in a UTC day shares its midnight URL.
export function dateFromPath(pathname) {
  if (pathname === '/') return null;
  if (!/^\/[1-9]\d{0,10}$/.test(pathname)) return undefined;
  const milliseconds = Number(pathname.slice(1)) * 1000;
  if (!Number.isSafeInteger(milliseconds)) return undefined;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
}

export function datePath(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '/';
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? `/${time / 1000}` : '/';
}
