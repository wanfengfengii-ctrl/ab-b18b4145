'use strict';

/**
 * Headless frontend test: executes public/app.js against a minimal DOM
 * stub and verifies the UI invariants end to end:
 *   - clockwise drag creates a zero-based-start + positive-length selection;
 *   - rotation and window resize never change the covered bases;
 *   - selections may cross the sequence end but never cover the whole circle;
 *   - a fragment whose interior contains the display origin renders as one
 *     continuous arc;
 *   - a failed save keeps the uncommitted selection and shows the server's
 *     reason; a successful save persists and clears the pending selection.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const L = 4832;

class El {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.hidden = false;
    this.value = '';
    this.style = {};
    this.className = '';
    this._text = '';
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  dispatch(t, e = {}) {
    e.target = this;
    if (!('currentTarget' in e)) e.currentTarget = this;
    (this.listeners[t] || []).forEach((f) => f(e));
  }
  focus() {}
}

function makeSvg() {
  const svg = new El('svg');
  svg.createSVGPoint = () => ({
    x: 0,
    y: 0,
    matrixTransform() { return { x: this.x, y: this.y }; },
  });
  svg.getScreenCTM = () => ({ inverse: () => ({}) });
  return svg;
}

function boot() {
  const byId = {};
  for (const id of [
    'rotation-number', 'rotation-range', 'fragment-name', 'save-btn',
    'clear-btn', 'selection-readout', 'status-ok', 'status-error', 'annotation-list',
  ]) {
    byId[id] = new El('div');
  }
  byId['plasmid-map'] = makeSvg();

  const plasmid = {
    name: 'pMCL-DEMO-1',
    length: L,
    origin: 0,
    annotations: [
      { name: 'lacZ-alpha', start: 1200, length: 300 },
      { name: 'ori', start: 3187, length: 589 },
      { name: 'AmpR', start: 4210, length: 861 },
    ],
  };

  const env = {
    byId,
    plasmid,
    putBehavior: { status: 200, body: null },
    lastPutBody: null,
  };

  const documentStub = {
    title: '',
    getElementById: (id) => byId[id],
    createElementNS: (_ns, tag) => new El(tag),
    createElement: (tag) => new El(tag),
  };
  const windowStub = new El('window');

  const fetchStub = async (url, opts = {}) => {
    if (url === '/api/plasmid') {
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(plasmid)) };
    }
    if (url === '/api/annotations' && opts.method === 'PUT') {
      env.lastPutBody = JSON.parse(opts.body);
      if (env.putBehavior.status === 200) {
        plasmid.annotations = env.lastPutBody.annotations;
        return { ok: true, status: 200, json: async () => ({ ok: true, annotations: plasmid.annotations }) };
      }
      return { ok: false, status: env.putBehavior.status, json: async () => env.putBehavior.body };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const sandbox = {
    document: documentStub,
    window: windowStub,
    fetch: fetchStub,
    console,
  };
  vm.createContext(sandbox);
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(appJs, sandbox);

  env.window = windowStub;
  return env;
}

const tick = () => new Promise((r) => setImmediate(r));
const flush = async () => { for (let i = 0; i < 12; i += 1) await tick(); };

function pointForDisplayBase(d, r = 200) {
  const rad = ((d / L) * 360 * Math.PI) / 180;
  return [r * Math.sin(rad), -r * Math.cos(rad)];
}

function hitRing(env) {
  const kids = env.byId['plasmid-map'].children;
  return kids[kids.length - 1]; // hit ring is appended last
}

function drag(env, d0, d1, steps = 8) {
  const [x0, y0] = pointForDisplayBase(d0);
  hitRing(env).dispatch('pointerdown', {
    pointerId: 1, clientX: x0, clientY: y0, preventDefault() {},
  });
  for (let i = 1; i <= steps; i += 1) {
    const d = d0 + (((d1 - d0 + L) % L) * i) / steps;
    const [x, y] = pointForDisplayBase(((d % L) + L) % L);
    env.window.dispatch('pointermove', { pointerId: 1, clientX: x, clientY: y });
  }
  env.window.dispatch('pointerup', { pointerId: 1 });
}

function findByStroke(node, stroke, out = []) {
  for (const c of node.children) {
    if (c.attrs && c.attrs.stroke === stroke) out.push(c);
    findByStroke(c, stroke, out);
  }
  return out;
}

function setRotation(env, value) {
  env.byId['rotation-number'].value = String(value);
  env.byId['rotation-number'].dispatch('change');
}

test('frontend: drag, rotation/resize invariance, save flow, wrap and continuity', async () => {
  const env = boot();
  await flush();
  const readout = () => env.byId['selection-readout'].textContent;

  // Seed annotations are listed.
  assert.equal(env.byId['annotation-list'].children.length, 3);

  // Clockwise drag 1000 -> 1300 (rotation 0) snaps to integer bases.
  drag(env, 1000, 1300);
  assert.match(readout(), /start = 1000/);
  assert.match(readout(), /length = 300 bp/);

  // Rotation and resize never change the covered bases.
  setRotation(env, 2000);
  assert.match(readout(), /start = 1000/);
  assert.match(readout(), /length = 300 bp/);
  env.window.dispatch('resize');
  assert.match(readout(), /start = 1000/);

  // Failed save: keeps the uncommitted selection, shows the server's reason.
  env.byId['fragment-name'].value = 'frag-a';
  env.putBehavior = {
    status: 400,
    body: { error: { code: 'DUPLICATE_NAME', message: 'Duplicate annotation name "frag-a".' } },
  };
  env.byId['save-btn'].dispatch('click');
  await flush();
  assert.equal(env.byId['status-error'].hidden, false);
  assert.match(env.byId['status-error'].textContent, /DUPLICATE_NAME/);
  assert.match(readout(), /start = 1000/);

  // Successful save: sends zero-based start + positive length, clears selection.
  env.putBehavior = { status: 200, body: null };
  env.byId['save-btn'].dispatch('click');
  await flush();
  const sent = env.lastPutBody.annotations[env.lastPutBody.annotations.length - 1];
  assert.deepEqual(sent, { name: 'frag-a', start: 1000, length: 300 });
  assert.equal(env.byId['status-ok'].hidden, false);
  assert.match(readout(), /尚未选择/);
  assert.equal(env.byId['annotation-list'].children.length, 4);

  // Drag across the sequence end (rotation 2000):
  // original 4700 -> display 2700, original 100 -> display 2932.
  drag(env, 2700, 2932);
  assert.match(readout(), /start = 4700/);
  assert.match(readout(), /length = 232 bp/);
  assert.match(readout(), /跨越序列末端/);

  // Display origin inside the fragment: still one continuous arc.
  setRotation(env, 4800);
  const arcs = findByStroke(env.byId['plasmid-map'], 'rgba(37, 99, 235, 0.35)');
  assert.equal(arcs.length, 1);
  assert.equal((arcs[0].attrs.d.match(/A 200 200/g) || []).length, 1);
  assert.match(readout(), /start = 4700/);

  // A drag returning to its anchor (whole circle) yields no selection.
  setRotation(env, 0);
  drag(env, 500, 500);
  assert.match(readout(), /尚未选择/);
});
