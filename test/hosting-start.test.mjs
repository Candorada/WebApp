import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

test('the app starts through the hosting CommonJS loader and serves its historical archive', async () => {
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const directory = await mkdtemp(join(tmpdir(), 'fortnite-hosting-test-'));
  const child = spawn(process.execPath, ['-e', "require('./server.js')"], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PORT: String(port), HISTORY_DIR: directory },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  try {
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Hosting startup timed out: ' + output)), 10000);
      child.stdout.on('data', () => { if (output.includes('Fortnite Shop Value:')) { clearTimeout(deadline); resolve(); } });
      child.once('exit', code => { clearTimeout(deadline); reject(new Error('Hosting startup exited ' + code + ': ' + output)); });
    });
    const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
    assert.equal(health.historyReady, true);
    assert.ok(health.historyDays > 3000);
    const archive = await (await fetch(`http://127.0.0.1:${port}/api/history/2017-10-26`)).json();
    assert.equal(archive.value, 5600);
    assert.equal(archive.snapshot.offers.length, 6);
    assert.ok(archive.snapshot.offers.some(offer => offer.name === 'Ghoul Trooper' && offer.types.includes('outfit')));
    const headers = await fetch(`http://127.0.0.1:${port}/api/history/2017-10-26`);
    assert.match(headers.headers.get('cache-control'), /max-age=86400/);
    const unchanged = await fetch(headers.url, { headers: { 'If-None-Match': headers.headers.get('etag') } });
    assert.equal(unchanged.status, 304);
    const page = await fetch(`http://127.0.0.1:${port}/1508976000`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /id="hero-title"/);
    for (const path of ['/bad-date', '/1', '/99999999999', '/1508976000000']) {
      const invalid = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
      assert.equal(invalid.status, 302);
      assert.equal(invalid.headers.get('location'), '/');
    }
    const canonical = await fetch(`http://127.0.0.1:${port}/1508976001`, { redirect: 'manual' });
    assert.equal(canonical.headers.get('location'), '/1508976000');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise(resolve => child.once('exit', resolve));
    }
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary cleanup path.');
    await rm(directory, { recursive: true, force: true });
  }
});
