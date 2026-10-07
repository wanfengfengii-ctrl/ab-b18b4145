'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const { PLASMID, SEED_ANNOTATIONS } = require('./plasmid');
const { AnnotationStore } = require('./store');
const { ErrorCodes, ValidationError, validateAnnotationSet } = require('./validate');

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.map': 'application/json',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large.'), { code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Serve the static frontend (built dist/ when present, else public/). */
function createStaticHandler(roots) {
  return (req, res, pathname) => {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    // Normalize and prevent path traversal.
    const safeRel = path.posix.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    for (const root of roots) {
      const filePath = path.join(root, safeRel);
      if (!filePath.startsWith(root)) continue;
      let stat = null;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    sendError(res, 404, 'NOT_FOUND', `No such resource: ${pathname}`);
  };
}

/**
 * Build the HTTP application. Exported (not just the listener) so tests
 * can bind an ephemeral port with a temporary data file.
 *
 * @param {object} options
 * @param {string} options.dataFile path to the annotation JSON file.
 * @param {string} options.publicDir frontend source directory.
 * @param {string} [options.distDir] built frontend directory (preferred).
 */
async function createApp(options) {
  const store = new AnnotationStore(options.dataFile, SEED_ANNOTATIONS);
  await store.init();

  const roots = [];
  if (options.distDir && fs.existsSync(path.join(options.distDir, 'index.html'))) {
    roots.push(path.resolve(options.distDir));
  }
  roots.push(path.resolve(options.publicDir));
  const serveStatic = createStaticHandler(roots);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    try {
      if (pathname === '/healthz') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/plasmid' && req.method === 'GET') {
        sendJson(res, 200, {
          name: PLASMID.name,
          length: PLASMID.length,
          origin: PLASMID.origin,
          annotations: store.getAll(),
        });
        return;
      }

      if (pathname === '/api/annotations' && req.method === 'PUT') {
        let body;
        try {
          const text = await readBody(req);
          body = JSON.parse(text || 'null');
        } catch (err) {
          if (err.code === 'BODY_TOO_LARGE') {
            sendError(res, 413, ErrorCodes.INVALID_PAYLOAD, 'Request body too large.');
          } else {
            sendError(res, 400, ErrorCodes.INVALID_PAYLOAD, 'Request body is not valid JSON.');
          }
          return;
        }

        let normalized;
        try {
          normalized = validateAnnotationSet(body, PLASMID.length);
        } catch (err) {
          if (err instanceof ValidationError) {
            sendError(res, 400, err.code, err.message);
            return;
          }
          throw err;
        }

        // Validation passed for the whole set: atomically replace it.
        const saved = await store.replaceAll(normalized);
        sendJson(res, 200, { ok: true, annotations: saved });
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendError(res, 404, 'NOT_FOUND', `No such API route: ${req.method} ${pathname}`);
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', `${req.method} is not allowed here.`);
        return;
      }
      serveStatic(req, res, pathname);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Unhandled error:', err);
      if (!res.headersSent) {
        sendError(res, 500, 'INTERNAL', 'Internal server error.');
      } else {
        res.end();
      }
    }
  });

  return { server, store };
}

module.exports = { createApp };
