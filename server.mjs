import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { normalizeShop } from './public/shop.js';

const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const url = `http://${host}:${port}`;
const source = 'https://fortnite-api.com/v2/shop?language=en';
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/shop.js', ['shop.js', 'text/javascript; charset=utf-8']],
]);
let cached;
let cacheUntil = 0;
let pending;

async function getShop() {
  if (cached && Date.now() < cacheUntil) return cached;
  if (!pending) {
    pending = (async () => {
      const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Shop provider returned HTTP ${response.status}.`);
      const result = normalizeShop(await response.json());
      cached = { ...result, fetchedAt: new Date().toISOString(), source };
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      cacheUntil = Math.min(Date.now() + 60000, midnight.getTime());
      return cached;
    })().finally(() => { pending = undefined; });
  }
  return pending;
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
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ app: 'fortnite-shop-value' }));
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
  const file = files.get(pathname);
  if (!file) { response.writeHead(404).end('Not found'); return; }
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
});
