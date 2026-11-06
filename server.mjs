import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { normalizeShop } from './public/shop.js';
import { HistoryStore, validDate, captureDue } from './history-store.mjs';
import { dateFromPath, datePath } from './public/date-route.js';

const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const url = `http://${host}:${port}`;
const source = 'https://fortnite-api.com/v2/shop?language=en';
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/public/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/public/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/public/shop.js', ['shop.js', 'text/javascript; charset=utf-8']],
  ['/public/history.js', ['history.js', 'text/javascript; charset=utf-8']],
  ['/public/date-route.js', ['date-route.js', 'text/javascript; charset=utf-8']],
]);
let history;
const hostingDomainRoot = fileURLToPath(import.meta.url).match(/^(\/home\/[^/]+\/domains\/[^/]+)\//)?.[1];
try {
  let seed;
  try { seed = JSON.parse(readFileSync(new URL('./data/history-seed.json', import.meta.url), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  history = new HistoryStore(join(process.env.HISTORY_DIR || join(hostingDomainRoot || homedir(), '.fortnite-shop-value'), 'history.sqlite'), seed);
} catch (error) { console.error('Historical storage unavailable:', error.message); }
let cached;
let cacheUntil = 0;
let pending;

async function getShop(fresh = false) {
  if (!fresh && cached && Date.now() < cacheUntil) return cached;
  if (!pending) {
    pending = (async () => {
      const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Shop provider returned HTTP ${response.status}.`);
      const result = normalizeShop(await response.json());
      cached = { ...result, fetchedAt: new Date().toISOString(), source };
      try { history?.recordLive(cached); }
      catch (error) { console.error('Could not save shop snapshot:', error.message); }
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      cacheUntil = Math.min(Date.now() + 60000, midnight.getTime());
      return cached;
    })().finally(() => { pending = undefined; });
  }
  return pending;
}

let historyResponse;
function serveHistory(request, response) {
  if (!history) { response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Historical storage is temporarily unavailable.' })); return; }
  if (!historyResponse || historyResponse.revision !== history.revision) {
    const points = history.list();
    const types = [...new Set(points.flatMap(point => Object.keys(point.categories)))].sort();
    const body = Buffer.from(JSON.stringify({ points, types, earliest: points[0]?.date || null, latest: points.at(-1)?.date || null, gapCount: history.gapCount(), captureHourUTC: 23, calculation: 'categories-v4' }));
    historyResponse = { revision: history.revision, body, gzip: gzipSync(body), etag: 'W/"' + createHash('sha256').update(body).digest('hex') + '"' };
  }
  response.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
  response.setHeader('ETag', historyResponse.etag);
  response.setHeader('Vary', 'Accept-Encoding');
  if (request.headers['if-none-match'] === historyResponse.etag) { response.writeHead(304).end(); return; }
  const compressed = /\bgzip\b/.test(request.headers['accept-encoding'] || '');
  if (compressed) response.setHeader('Content-Encoding', 'gzip');
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(compressed ? historyResponse.gzip : historyResponse.body);
}

let captureRunning = false;
async function captureScheduled() {
  if (!history || captureRunning) return;
  const now = new Date();
  if (!captureDue(history.get(now.toISOString().slice(0, 10)), now)) return;
  captureRunning = true;
  try { await getShop(true); }
  catch (error) { console.error('Scheduled shop capture failed; will retry:', error.message); }
  finally { captureRunning = false; }
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  const pathname = new URL(request.url, url).pathname;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  if (pathname === '/api/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ app: 'fortnite-shop-value', historyReady: Boolean(history), historyDays: history?.list().length || 0, historyStorage: process.env.HISTORY_DIR ? 'configured' : hostingDomainRoot ? 'domain' : 'home' }));
    return;
  }
  if (pathname === '/api/history') {
    if (history && !history.get(new Date().toISOString().slice(0, 10))) {
      try { await getShop(); } catch { /* Archived days remain available during a live-feed outage. */ }
    }
    serveHistory(request, response); return;
  }
  if (pathname.startsWith('/api/history/')) {
    const date = pathname.slice('/api/history/'.length);
    if (!validDate(date)) { response.writeHead(400).end('Invalid date'); return; }
    if (history && date === new Date().toISOString().slice(0, 10) && !history.get(date)) {
      try { await getShop(); } catch { /* A missing current capture is reported below. */ }
    }
    const row = history?.get(date);
    if (!row) { response.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'No archived shop for this date.' })); return; }
    try {
      const snapshot = history.snapshot(date) || JSON.parse(gunzipSync(await readFile(new URL(`./data/history-shops/${date}.json.gz`, import.meta.url))));
      const body = Buffer.from(JSON.stringify({ ...row, snapshot }));
      const etag = 'W/"' + createHash('sha256').update(body).digest('hex') + '"';
      response.setHeader('Cache-Control', `private, max-age=${row.finalized ? 86400 : 60}, must-revalidate`);
      response.setHeader('ETag', etag);
      response.setHeader('Vary', 'Accept-Encoding');
      if (request.headers['if-none-match'] === etag) { response.writeHead(304).end(); return; }
      const compressed = /\bgzip\b/.test(request.headers['accept-encoding'] || '');
      if (compressed) response.setHeader('Content-Encoding', 'gzip');
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(compressed ? gzipSync(body) : body);
    } catch (error) {
      console.error('Could not read historical shop:', error.message);
      response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'This archived item list is temporarily unavailable. Try Refresh again.' }));
    }
    return;
  }
  if (pathname === '/api/shop') {
    try {
      const shop = await getShop();
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(shop));
    } catch (error) {
      console.error('Shop refresh failed:', error.message);
      response.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        error: 'Could not load the current shop. Check your internet connection and try Refresh again.',
      }));
    }
    return;
  }
  let file = files.get(pathname);
  if (!file) {
    if (pathname.startsWith('/api/') || pathname.startsWith('/public/')) { response.writeHead(404).end('Not found'); return; }
    const date = dateFromPath(pathname);
    const today = new Date().toISOString().slice(0, 10);
    if (!date || (!history?.get(date) && date !== today)) { response.writeHead(302, { Location: '/' }).end(); return; }
    if (pathname !== datePath(date)) { response.writeHead(302, { Location: datePath(date) }).end(); return; }
    file = files.get('/');
  }
  try {
    const body = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1] }).end(body);
  } catch {
    response.writeHead(500).end('Could not read an application file.');
  }
});

function openBrowser() {
  if (!process.argv.includes('--open')) return;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
}

server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
      if ((await response.json()).app === 'fortnite-shop-value') {
        console.log(`Already running at ${url}`);
        openBrowser();
        return;
      }
    } catch { /* Report the occupied port below. */ }
  }
  console.error(`Could not start: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Fortnite Shop Value: ${url}\nKeep this window open. Press Ctrl+C to stop.`);
  openBrowser();
  captureScheduled();
});
setInterval(captureScheduled, 60000).unref();
