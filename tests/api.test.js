'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createApp } = require('../server/app');
const { PLASMID, SEED_ANNOTATIONS } = require('../server/plasmid');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

async function startApp(dataFile) {
  const { server, store } = await createApp({ dataFile, publicDir: PUBLIC_DIR });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    store,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function put(base, payload) {
  const res = await fetch(`${base}/api/annotations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

test('GET /api/plasmid returns length, fixed origin and seeded annotations', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plasmid-test-'));
  const app = await startApp(path.join(dir, 'annotations.json'));
  t.after(() => app.close());

  const res = await fetch(`${app.base}/api/plasmid`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.name, PLASMID.name);
  assert.equal(body.length, PLASMID.length);
  assert.equal(body.origin, 0);
  assert.deepEqual(body.annotations, SEED_ANNOTATIONS);

  const health = await fetch(`${app.base}/healthz`);
  assert.equal(health.status, 200);
});

test('PUT saves a cross-end fragment atomically and survives restart', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plasmid-test-'));
  const dataFile = path.join(dir, 'annotations.json');
  const app = await startApp(dataFile);
  t.after(() => app.close());

  const L = PLASMID.length;
  const wrap = { name: 'insert-1', start: L - 150, length: 400 }; // crosses the end
  const next = SEED_ANNOTATIONS.concat([wrap]);

  const res = await put(app.base, { annotations: next });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.annotations, next);

  // Fresh read returns the same set.
  const reread = await (await fetch(`${app.base}/api/plasmid`)).json();
  assert.deepEqual(reread.annotations, next);

  // A brand-new server over the same file restores the same set.
  await app.close();
  const app2 = await startApp(dataFile);
  t.after(() => app2.close());
  const restored = await (await fetch(`${app2.base}/api/plasmid`)).json();
  assert.deepEqual(restored.annotations, next);
});

test('rejected PUTs return stable error codes and never change stored data', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plasmid-test-'));
  const dataFile = path.join(dir, 'annotations.json');
  const app = await startApp(dataFile);
  t.after(() => app.close());

  const L = PLASMID.length;
  const before = (await (await fetch(`${app.base}/api/plasmid`)).json()).annotations;
  const fileBefore = fs.readFileSync(dataFile, 'utf8');

  const cases = [
    [{ name: 'dup', start: 0, length: 5 }, { name: 'DUP', start: 9, length: 5 }, 'DUPLICATE_NAME'],
    [{ name: 'empty', start: 0, length: 0 }, null, 'EMPTY_FRAGMENT'],
    [{ name: 'neg', start: -1, length: 5 }, null, 'INVALID_COORDS'],
    [{ name: 'too-big', start: 0, length: L }, null, 'INVALID_COORDS'],
    [{ name: '', start: 0, length: 5 }, null, 'INVALID_NAME'],
  ];
  for (const [a1, a2, expected] of cases) {
    const anns = before.concat([a1]).concat(a2 ? [a2] : []);
    const res = await put(app.base, { annotations: anns });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.error.code, expected, JSON.stringify(res.body));
  }

  // Malformed JSON body.
  const badJson = await put(app.base, '{not json');
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.error.code, 'INVALID_PAYLOAD');

  // Data unchanged in memory and on disk.
  const after = (await (await fetch(`${app.base}/api/plasmid`)).json()).annotations;
  assert.deepEqual(after, before);
  assert.equal(fs.readFileSync(dataFile, 'utf8'), fileBefore);
});

test('static frontend is served', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plasmid-test-'));
  const app = await startApp(path.join(dir, 'annotations.json'));
  t.after(() => app.close());

  const res = await fetch(`${app.base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /plasmid-map/);

  const js = await fetch(`${app.base}/app.js`);
  assert.equal(js.status, 200);

  const missing = await fetch(`${app.base}/nope.txt`);
  assert.equal(missing.status, 404);
});
