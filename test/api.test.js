import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/server.js";
import { PLASMID } from "../server/data.js";

function startServer() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function getPlasmid(base) {
  const res = await fetch(`${base}/api/plasmid`);
  assert.equal(res.status, 200);
  return res.json();
}

async function putAnnotations(base, body, raw = false) {
  const res = await fetch(`${base}/api/annotations`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: raw ? body : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test("GET /api/plasmid 返回长度、注释与固定参考起点", async () => {
  const { server, base } = await startServer();
  try {
    const p = await getPlasmid(base);
    assert.equal(p.length, PLASMID.length);
    assert.equal(p.referenceStart, 0);
    assert.equal(p.circular, true);
    assert.deepEqual(p.annotations, PLASMID.annotations);
  } finally {
    server.close();
  }
});

test("PUT 非法坐标/空片段/整圈返回稳定错误码且不改变既有数据", async () => {
  const { server, base } = await startServer();
  try {
    const before = await getPlasmid(base);

    let r = await putAnnotations(base, {
      annotations: before.annotations.concat({ name: "bad", start: PLASMID.length, length: 10 })
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error.code, "INVALID_COORDINATES");

    r = await putAnnotations(base, {
      annotations: before.annotations.concat({ name: "bad", start: 0, length: 0 })
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error.code, "EMPTY_FRAGMENT");

    r = await putAnnotations(base, {
      annotations: before.annotations.concat({ name: "bad", start: 0, length: PLASMID.length })
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error.code, "FULL_CIRCLE");

    // 整集合中任意一条非法 → 全部不生效
    r = await putAnnotations(base, {
      annotations: [{ name: "ok", start: 0, length: 10 }, { name: "", start: 5, length: 5 }]
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error.code, "EMPTY_NAME");

    const after = await getPlasmid(base);
    assert.deepEqual(after.annotations, before.annotations);
  } finally {
    server.close();
  }
});

test("PUT 重复名称返回 409 且不改变既有数据", async () => {
  const { server, base } = await startServer();
  try {
    const before = await getPlasmid(base);
    const r = await putAnnotations(base, {
      annotations: before.annotations.concat({ name: "ori", start: 5000, length: 10 })
    });
    assert.equal(r.status, 409);
    assert.equal(r.data.error.code, "DUPLICATE_NAME");
    const after = await getPlasmid(base);
    assert.deepEqual(after.annotations, before.annotations);
  } finally {
    server.close();
  }
});

test("PUT 非 JSON → INVALID_PAYLOAD 且数据不变", async () => {
  const { server, base } = await startServer();
  try {
    const before = await getPlasmid(base);
    const r = await putAnnotations(base, "{not json", true);
    assert.equal(r.status, 400);
    assert.equal(r.data.error.code, "INVALID_PAYLOAD");
    const after = await getPlasmid(base);
    assert.deepEqual(after.annotations, before.annotations);
  } finally {
    server.close();
  }
});

test("跨末端片段保存后“重新载入”（再次 GET）还原同一坐标", async () => {
  const { server, base } = await startServer();
  try {
    const before = await getPlasmid(base);
    const fragment = { name: "verify-wrap", start: PLASMID.length - 150, length: 300, kind: "fragment" };
    const r = await putAnnotations(base, { annotations: before.annotations.concat(fragment) });
    assert.equal(r.status, 200);

    const reloaded = await getPlasmid(base);
    const saved = reloaded.annotations.find((a) => a.name === "verify-wrap");
    assert.deepEqual(saved, fragment);
    assert.ok(fragment.start + fragment.length > PLASMID.length); // 确为跨末端
  } finally {
    server.close();
  }
});

test("GET /healthz 与静态页面可用", async () => {
  const { server, base } = await startServer();
  try {
    const h = await fetch(`${base}/healthz`);
    assert.equal(h.status, 200);
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /环状质粒/);
  } finally {
    server.close();
  }
});
