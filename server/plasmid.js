'use strict';

/**
 * Built-in deterministic plasmid record.
 *
 * The laboratory registers exactly one reference sequence for this demo
 * plasmid. All coordinates served and accepted by the API are expressed
 * against this registered sequence: zero-based start plus a positive
 * integer length, measured clockwise. The reference origin is fixed at
 * base 0 and never moves; any rotation applied in the UI is display-only.
 */
const PLASMID = Object.freeze({
  name: 'pMCL-DEMO-1',
  // Deterministic registered sequence length (bp).
  length: 4832,
  // Fixed reference origin: coordinates are always relative to base 0 of
  // the registered sequence.
  origin: 0,
});

/**
 * Deterministic seed annotations, written to the data file on first boot.
 * `AmpR` intentionally crosses the end of the linear registered sequence
 * (4210 + 861 = 5071 > 4832), i.e. it wraps around the origin.
 */
const SEED_ANNOTATIONS = Object.freeze([
  Object.freeze({ name: 'lacZ-alpha', start: 1200, length: 300 }),
  Object.freeze({ name: 'ori', start: 3187, length: 589 }),
  Object.freeze({ name: 'AmpR', start: 4210, length: 861 }),
]);

module.exports = { PLASMID, SEED_ANNOTATIONS };
