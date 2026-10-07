'use strict';

/**
 * Validation for the annotation set accepted by PUT /api/annotations.
 *
 * Error codes are part of the stable API contract; clients may rely on
 * them. A ValidationError always carries one of these codes and the
 * store must not be modified when one is thrown.
 */
const ErrorCodes = Object.freeze({
  INVALID_PAYLOAD: 'INVALID_PAYLOAD', // malformed body / wrong types
  INVALID_NAME: 'INVALID_NAME', // empty or over-long name
  INVALID_COORDS: 'INVALID_COORDS', // start/length out of range or non-integer
  EMPTY_FRAGMENT: 'EMPTY_FRAGMENT', // length <= 0
  DUPLICATE_NAME: 'DUPLICATE_NAME', // same name twice (case-insensitive)
});

class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

const MAX_NAME_LENGTH = 64;

function invalidPayload(message) {
  return new ValidationError(ErrorCodes.INVALID_PAYLOAD, message);
}

/**
 * Validate a decoded request body against the plasmid length.
 *
 * A fragment is `{ name, start, length }`:
 *   - start:  integer, 0 <= start < plasmidLength (zero-based, original
 *             sequence coordinates);
 *   - length: integer, 1 <= length <= plasmidLength - 1. A fragment may
 *             cross the end of the registered sequence (start + length
 *             may exceed plasmidLength) but must never cover the whole
 *             circle.
 *
 * Returns a normalized array (names trimmed) on success.
 * Throws ValidationError on the first problem found.
 */
function validateAnnotationSet(body, plasmidLength) {
  if (!Number.isInteger(plasmidLength) || plasmidLength < 2) {
    throw new Error('plasmidLength must be an integer >= 2');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalidPayload('Request body must be a JSON object.');
  }
  if (!Array.isArray(body.annotations)) {
    throw invalidPayload('Body must contain an "annotations" array.');
  }

  const seenNames = new Set();
  const normalized = [];

  body.annotations.forEach((raw, index) => {
    const where = `annotations[${index}]`;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw invalidPayload(`${where} must be an object.`);
    }

    if (typeof raw.name !== 'string') {
      throw invalidPayload(`${where}.name must be a string.`);
    }
    const name = raw.name.trim();
    if (name.length === 0) {
      throw new ValidationError(
        ErrorCodes.INVALID_NAME,
        `${where}.name must not be empty.`
      );
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new ValidationError(
        ErrorCodes.INVALID_NAME,
        `${where}.name must be at most ${MAX_NAME_LENGTH} characters.`
      );
    }

    if (!Number.isInteger(raw.start)) {
      throw new ValidationError(
        ErrorCodes.INVALID_COORDS,
        `${where}.start must be an integer (got ${JSON.stringify(raw.start)}).`
      );
    }
    if (raw.start < 0 || raw.start >= plasmidLength) {
      throw new ValidationError(
        ErrorCodes.INVALID_COORDS,
        `${where}.start ${raw.start} is out of range [0, ${plasmidLength - 1}].`
      );
    }

    if (!Number.isInteger(raw.length)) {
      throw new ValidationError(
        ErrorCodes.INVALID_COORDS,
        `${where}.length must be an integer (got ${JSON.stringify(raw.length)}).`
      );
    }
    if (raw.length <= 0) {
      throw new ValidationError(
        ErrorCodes.EMPTY_FRAGMENT,
        `${where} ("${name}") has length ${raw.length}; a fragment must cover at least one base.`
      );
    }
    if (raw.length >= plasmidLength) {
      throw new ValidationError(
        ErrorCodes.INVALID_COORDS,
        `${where} ("${name}") has length ${raw.length}; a fragment must not cover the entire ${plasmidLength} bp circle.`
      );
    }

    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) {
      throw new ValidationError(
        ErrorCodes.DUPLICATE_NAME,
        `Duplicate annotation name "${name}".`
      );
    }
    seenNames.add(nameKey);

    normalized.push({ name, start: raw.start, length: raw.length });
  });

  return normalized;
}

module.exports = { ErrorCodes, ValidationError, validateAnnotationSet, MAX_NAME_LENGTH };
