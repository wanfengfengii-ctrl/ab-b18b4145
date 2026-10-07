'use strict';

const path = require('path');

const { createApp } = require('./app');

const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const DATA_FILE =
  process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'annotations.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DIST_DIR = path.join(__dirname, '..', 'dist');

createApp({ dataFile: DATA_FILE, publicDir: PUBLIC_DIR, distDir: DIST_DIR })
  .then(({ server }) => {
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`plasmid-mapper listening on http://0.0.0.0:${PORT}`);
      console.log(`annotations file: ${DATA_FILE}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
