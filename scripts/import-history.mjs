import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { normalizeArchiveShop } from '../history-source.mjs';

const cachedOnly = process.argv.includes('--cached');
let key = process.env.ITEMSHOP_API_KEY;
if (!cachedOnly && !key) {
  if (process.stdin.isTTY) throw new Error('Set ITEMSHOP_API_KEY or supply it privately on stdin.');
  const input = createInterface({ input: process.stdin });
  key = await new Promise(resolve => input.once('line', resolve));
  input.close(); process.stdin.pause();
}
if (!cachedOnly && !key?.trim()) throw new Error('A history API key is required.');
const headers = cachedOnly ? undefined : { Authorization: `Bearer ${key.trim()}`, 'User-Agent': 'FortniteShopValue/1.0 (https://justasite.xyz)' };
const root = join(homedir(), '.fortnite-shop-value', 'source-archive');
await mkdir(root, { recursive: true });
let nextRequest = 0;
async function request(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const start = Math.max(Date.now(), nextRequest);
    nextRequest = start + 170;
    await delay(Math.max(0, start - Date.now()));
    const response = await fetch(`https://itemshop.gg/api/v1/${path}`, { headers, signal: AbortSignal.timeout(25000) });
    if (response.ok) return response.json();
    if (response.status === 429 || response.status >= 500) {
      await delay(Math.max(2, Number(response.headers.get('retry-after')) || 0) * 1000 * (attempt + 1));
      continue;
    }
    throw new Error(`History provider returned HTTP ${response.status}.`);
  }
  throw new Error('History provider did not respond after retries.');
}
const index = cachedOnly ? { data: (await readdir(root)).filter(file => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(file)).map(file => file.slice(0,10)) } : await request('history/fortnite');
if (!Array.isArray(index.data)) throw new Error('Invalid history date index.');
const today = new Date().toISOString().slice(0, 10);
const dates = [...new Set(index.data)].filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today).sort();
if (!dates.length || dates[0] > '2017-10-31') throw new Error('The provider did not return the promised 2017 archive.');
console.log(JSON.stringify({ stage: 'importing', dates: dates.length, earliest: dates[0], latest: dates.at(-1) }));
const rows = []; const gaps = []; let cursor = 0; let completed = 0;
async function worker() {
  while (cursor < dates.length) {
    const date = dates[cursor++];
    try {
      const file = join(root, `${date}.json.gz`);
      let payload;
      try { payload = JSON.parse(gunzipSync(await readFile(file))); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (cachedOnly) throw new Error('Cached source snapshot is missing.');
        payload = await request(`history/fortnite/${date}`);
        await writeFile(file, gzipSync(JSON.stringify(payload)));
      }
      rows.push(normalizeArchiveShop(payload, date));
    } catch (error) { gaps.push({ date, reason: error.message }); }
    completed++;
    if (completed % 100 === 0 || completed === dates.length) console.log(JSON.stringify({ completed, total: dates.length, imported: rows.length, gaps: gaps.length }));
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
rows.sort((a, b) => a.date.localeCompare(b.date));
const output = new URL('../data/history-seed.json', import.meta.url);
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
const seed = { version: 1, provider: 'itemshop.gg', importedAt: new Date().toISOString(), rows, gaps };
await writeFile(new URL('../data/history-seed.json.tmp', import.meta.url), JSON.stringify(seed));
await rename(new URL('../data/history-seed.json.tmp', import.meta.url), output);
console.log(JSON.stringify({ stage: 'complete', imported: rows.length, gaps: gaps.length, earliest: rows[0]?.date, latest: rows.at(-1)?.date }));
if (!rows.length) process.exitCode = 1;
