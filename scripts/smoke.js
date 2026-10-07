'use strict';

/**
 * API smoke test, focused on fragments that cross the end of the
 * registered sequence. Runs against a live server (APP_URL, default
 * http://127.0.0.1:8080) and reports via exit code.
 */

const APP_URL = (process.env.APP_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

let failures = 0;

function pass(name) {
  console.log(`  PASS ${name}`);
}

function fail(name, detail) {
  failures += 1;
  console.error(`  FAIL ${name}: ${detail}`);
}

async function getJson(pathname) {
  const res = await fetch(`${APP_URL}${pathname}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function putAnnotations(annotations) {
  const res = await fetch(`${APP_URL}/api/annotations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function expectErrorCode(result, status, code) {
  return (
    result.status === status &&
    result.body &&
    result.body.error &&
    result.body.error.code === code
  );
}

async function main() {
  console.log(`smoke test against ${APP_URL}`);

  // 1. Health check.
  const health = await getJson('/healthz');
  if (health.status === 200 && health.body && health.body.ok === true) {
    pass('GET /healthz');
  } else {
    fail('GET /healthz', `status=${health.status}`);
    throw new Error('server not healthy; aborting smoke test');
  }

  // 2. Plasmid record shape.
  const plasmid = await getJson('/api/plasmid');
  const L = plasmid.body && plasmid.body.length;
  if (
    plasmid.status === 200 &&
    Number.isInteger(L) &&
    L > 1 &&
    plasmid.body.origin === 0 &&
    Array.isArray(plasmid.body.annotations)
  ) {
    pass(`GET /api/plasmid (length=${L}, origin=0)`);
  } else {
    fail('GET /api/plasmid', JSON.stringify(plasmid.body));
    throw new Error('plasmid record malformed; aborting smoke test');
  }
  const original = plasmid.body.annotations;

  try {
    // 3. Save a fragment that crosses the end of the registered sequence.
    const wrap = { name: 'smoke-wrap-fragment', start: L - 120, length: 240 };
    const putWrap = await putAnnotations(original.concat([wrap]));
    if (putWrap.status === 200 && putWrap.body && putWrap.body.ok === true) {
      pass(`PUT cross-end fragment (start=${wrap.start}, length=${wrap.length}, L=${L})`);
    } else {
      fail('PUT cross-end fragment', JSON.stringify(putWrap.body));
    }

    // 4. It must come back intact on a fresh read.
    const after = await getJson('/api/plasmid');
    const found =
      after.body &&
      after.body.annotations.find(
        (a) => a.name === wrap.name && a.start === wrap.start && a.length === wrap.length
      );
    if (after.body.annotations.length === original.length + 1 && found) {
      pass('cross-end fragment persisted verbatim');
    } else {
      fail('cross-end fragment persisted verbatim', JSON.stringify(after.body.annotations));
    }

    // 5. Duplicate name rejected with a stable code, data unchanged.
    const dup = await putAnnotations(
      original.concat([wrap, { name: wrap.name, start: 10, length: 20 }])
    );
    if (expectErrorCode(dup, 400, 'DUPLICATE_NAME')) {
      pass('duplicate name -> 400 DUPLICATE_NAME');
    } else {
      fail('duplicate name', `status=${dup.status} body=${JSON.stringify(dup.body)}`);
    }

    // 6. Empty fragment rejected.
    const empty = await putAnnotations(
      original.concat([{ name: 'smoke-empty', start: 0, length: 0 }])
    );
    if (expectErrorCode(empty, 400, 'EMPTY_FRAGMENT')) {
      pass('empty fragment -> 400 EMPTY_FRAGMENT');
    } else {
      fail('empty fragment', `status=${empty.status} body=${JSON.stringify(empty.body)}`);
    }

    // 7. Invalid coordinates rejected (negative start; whole-circle length).
    const badStart = await putAnnotations(
      original.concat([{ name: 'smoke-bad-start', start: -1, length: 10 }])
    );
    const fullCircle = await putAnnotations(
      original.concat([{ name: 'smoke-full-circle', start: 0, length: L }])
    );
    if (
      expectErrorCode(badStart, 400, 'INVALID_COORDS') &&
      expectErrorCode(fullCircle, 400, 'INVALID_COORDS')
    ) {
      pass('invalid coordinates -> 400 INVALID_COORDS');
    } else {
      fail(
        'invalid coordinates',
        `badStart=${badStart.status}:${JSON.stringify(badStart.body)} ` +
          `fullCircle=${fullCircle.status}:${JSON.stringify(fullCircle.body)}`
      );
    }

    // 8. None of the rejected writes may have changed the stored set.
    const afterFailures = await getJson('/api/plasmid');
    const stillThere =
      afterFailures.body.annotations.length === original.length + 1 &&
      afterFailures.body.annotations.some((a) => a.name === wrap.name);
    if (stillThere) {
      pass('rejected writes left existing data unchanged');
    } else {
      fail(
        'rejected writes left existing data unchanged',
        JSON.stringify(afterFailures.body.annotations)
      );
    }
  } finally {
    // 9. Restore the original set so the smoke test is idempotent.
    const restore = await putAnnotations(original);
    if (restore.status === 200) {
      pass('original annotation set restored');
    } else {
      fail('restore original set', JSON.stringify(restore.body));
    }
  }
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`smoke test FAILED (${failures} failure(s))`);
      process.exit(1);
    }
    console.log('smoke test OK');
  })
  .catch((err) => {
    console.error(`smoke test ERROR: ${err.message}`);
    process.exit(1);
  });
