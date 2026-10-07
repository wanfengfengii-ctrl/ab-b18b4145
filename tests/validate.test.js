'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ErrorCodes,
  ValidationError,
  validateAnnotationSet,
} = require('../server/validate');

const L = 4832;

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ValidationError, `expected ValidationError, got ${err}`);
    return err.code;
  }
  throw new Error('expected function to throw');
}

test('accepts a valid set including a fragment crossing the sequence end', () => {
  const out = validateAnnotationSet(
    {
      annotations: [
        { name: 'ori', start: 3187, length: 589 },
        { name: 'wrap', start: L - 100, length: 200 }, // wraps past the end
        { name: 'almost-full', start: 0, length: L - 1 }, // largest legal fragment
      ],
    },
    L
  );
  assert.equal(out.length, 3);
  assert.deepEqual(out[1], { name: 'wrap', start: L - 100, length: 200 });
});

test('trims names and accepts an empty set', () => {
  const out = validateAnnotationSet({ annotations: [{ name: '  x  ', start: 0, length: 1 }] }, L);
  assert.deepEqual(out, [{ name: 'x', start: 0, length: 1 }]);
  assert.deepEqual(validateAnnotationSet({ annotations: [] }, L), []);
});

test('rejects malformed payloads with INVALID_PAYLOAD', () => {
  assert.equal(codeOf(() => validateAnnotationSet(null, L)), ErrorCodes.INVALID_PAYLOAD);
  assert.equal(codeOf(() => validateAnnotationSet([], L)), ErrorCodes.INVALID_PAYLOAD);
  assert.equal(codeOf(() => validateAnnotationSet({}, L)), ErrorCodes.INVALID_PAYLOAD);
  assert.equal(
    codeOf(() => validateAnnotationSet({ annotations: [null] }, L)),
    ErrorCodes.INVALID_PAYLOAD
  );
  assert.equal(
    codeOf(() => validateAnnotationSet({ annotations: [{ name: 7, start: 0, length: 1 }] }, L)),
    ErrorCodes.INVALID_PAYLOAD
  );
});

test('rejects empty and over-long names with INVALID_NAME', () => {
  assert.equal(
    codeOf(() => validateAnnotationSet({ annotations: [{ name: '   ', start: 0, length: 1 }] }, L)),
    ErrorCodes.INVALID_NAME
  );
  assert.equal(
    codeOf(() =>
      validateAnnotationSet({ annotations: [{ name: 'n'.repeat(65), start: 0, length: 1 }] }, L)
    ),
    ErrorCodes.INVALID_NAME
  );
});

test('rejects out-of-range or non-integer coordinates with INVALID_COORDS', () => {
  const bad = [
    { name: 'a', start: -1, length: 10 },
    { name: 'a', start: L, length: 10 },
    { name: 'a', start: 1.5, length: 10 },
    { name: 'a', start: '10', length: 10 },
    { name: 'a', start: 0, length: 2.5 },
    { name: 'a', start: 0, length: L }, // covers the whole circle
    { name: 'a', start: 0, length: L + 50 },
  ];
  for (const ann of bad) {
    assert.equal(
      codeOf(() => validateAnnotationSet({ annotations: [ann] }, L)),
      ErrorCodes.INVALID_COORDS,
      JSON.stringify(ann)
    );
  }
});

test('rejects empty fragments with EMPTY_FRAGMENT', () => {
  for (const length of [0, -1, -100]) {
    assert.equal(
      codeOf(() =>
        validateAnnotationSet({ annotations: [{ name: 'a', start: 0, length }] }, L)
      ),
      ErrorCodes.EMPTY_FRAGMENT
    );
  }
});

test('rejects duplicate names (case-insensitive) with DUPLICATE_NAME', () => {
  assert.equal(
    codeOf(() =>
      validateAnnotationSet(
        {
          annotations: [
            { name: 'AmpR', start: 0, length: 10 },
            { name: 'ampr', start: 100, length: 10 },
          ],
        },
        L
      )
    ),
    ErrorCodes.DUPLICATE_NAME
  );
});
