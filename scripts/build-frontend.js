'use strict';

/**
 * Frontend build: bundle public/{index.html, styles.css, app.js} into a
 * single self-contained dist/index.html (CSS/JS inlined) plus a manifest
 * with content hashes. Exits non-zero on any failure so `npm run build`
 * can gate the verify pipeline.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function main() {
  const htmlPath = path.join(PUBLIC_DIR, 'index.html');
  const cssPath = path.join(PUBLIC_DIR, 'styles.css');
  const jsPath = path.join(PUBLIC_DIR, 'app.js');

  for (const p of [htmlPath, cssPath, jsPath]) {
    if (!fs.existsSync(p)) {
      throw new Error(`missing frontend source: ${path.relative(ROOT, p)}`);
    }
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  if (!html.includes('href="styles.css"')) {
    throw new Error('index.html does not reference styles.css as expected');
  }
  if (!html.includes('src="app.js"')) {
    throw new Error('index.html does not reference app.js as expected');
  }

  // Inline CSS and JS into a single self-contained HTML file.
  const bundled = html
    .replace(
      '<link rel="stylesheet" href="styles.css">',
      () => `<style>\n${stripCssComments(css)}\n</style>`
    )
    .replace(
      '<script src="app.js" defer></script>',
      () => `<script>\n${js}\n</script>`
    );

  if (bundled.includes('src="app.js"') || bundled.includes('href="styles.css"')) {
    throw new Error('bundling failed: external references remain');
  }

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), bundled, 'utf8');

  const manifest = {
    builtAt: new Date().toISOString(),
    files: {
      'index.html': { bytes: Buffer.byteLength(bundled), sha256: sha256(bundled) },
    },
    sources: {
      'public/index.html': { bytes: Buffer.byteLength(html), sha256: sha256(html) },
      'public/styles.css': { bytes: Buffer.byteLength(css), sha256: sha256(css) },
      'public/app.js': { bytes: Buffer.byteLength(js), sha256: sha256(js) },
    },
  };
  fs.writeFileSync(
    path.join(DIST_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log(
    `frontend build ok: dist/index.html (${manifest.files['index.html'].bytes} bytes, ` +
      `sha256 ${manifest.files['index.html'].sha256.slice(0, 12)}…)`
  );
}

try {
  main();
} catch (err) {
  console.error(`frontend build failed: ${err.message}`);
  process.exit(1);
}
