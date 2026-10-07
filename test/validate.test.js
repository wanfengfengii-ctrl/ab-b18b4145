import test from "node:test";
import assert from "node:assert/strict";
import { validateAnnotations } from "../server/validate.js";

const N = 5400;

test("接受合法集合（含跨末端但非整圈）", () => {
  const r = validateAnnotations({
    annotations: [
      { name: "ori", start: 100, length: 250 },
      { name: "wrap", start: N - 100, length: 250 }
    ]
  }, N);
  assert.equal(r.error, undefined);
  assert.equal(r.value.length, 2);
});

test("名称自动去首尾空白", () => {
  const r = validateAnnotations({ annotations: [{ name: "  x  ", start: 0, length: 1 }] }, N);
  assert.equal(r.value[0].name, "x");
});

test("kind 缺省为 annotation，fragment 合法，其余非法", () => {
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: 0, length: 1 }] }, N).value[0].kind, "annotation");
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: 0, length: 1, kind: "fragment" }] }, N).value[0].kind, "fragment");
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: 0, length: 1, kind: "gene" }] }, N).error.code, "INVALID_ANNOTATION");
});

test("空名称 → EMPTY_NAME", () => {
  assert.equal(validateAnnotations({ annotations: [{ name: "  ", start: 0, length: 1 }] }, N).error.code, "EMPTY_NAME");
  assert.equal(validateAnnotations({ annotations: [{ start: 0, length: 1 }] }, N).error.code, "EMPTY_NAME");
});

test("非法坐标 → INVALID_COORDINATES", () => {
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: -1, length: 1 }] }, N).error.code, "INVALID_COORDINATES");
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: N, length: 1 }] }, N).error.code, "INVALID_COORDINATES");
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: 1.5, length: 1 }] }, N).error.code, "INVALID_COORDINATES");
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: "0", length: 1 }] }, N).error.code, "INVALID_COORDINATES");
});

test("空片段（零或负长度）→ EMPTY_FRAGMENT", () => {
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: 0, length: 0 }] }, N).error.code, "EMPTY_FRAGMENT");
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: 0, length: -3 }] }, N).error.code, "EMPTY_FRAGMENT");
});

test("覆盖整圈 → FULL_CIRCLE", () => {
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: 0, length: N }] }, N).error.code, "FULL_CIRCLE");
  assert.equal(validateAnnotations({ annotations: [{ name: "a", start: 10, length: N + 5 }] }, N).error.code, "FULL_CIRCLE");
});

test("重复名称（含大小写/空白差异后同名）→ DUPLICATE_NAME", () => {
  const r = validateAnnotations({
    annotations: [
      { name: "ori", start: 0, length: 10 },
      { name: " ori ", start: 20, length: 10 }
    ]
  }, N);
  assert.equal(r.error.code, "DUPLICATE_NAME");
});

test("非对象负载 / 缺 annotations → INVALID_PAYLOAD", () => {
  assert.equal(validateAnnotations([], N).error.code, "INVALID_PAYLOAD");
  assert.equal(validateAnnotations(null, N).error.code, "INVALID_PAYLOAD");
  assert.equal(validateAnnotations("{}", N).error.code, "INVALID_PAYLOAD");
  assert.equal(validateAnnotations({}, N).error.code, "INVALID_PAYLOAD");
  assert.equal(validateAnnotations({ annotations: {} }, N).error.code, "INVALID_PAYLOAD");
  assert.equal(validateAnnotations({ annotations: [null] }, N).error.code, "INVALID_ANNOTATION");
  assert.equal(validateAnnotations({ annotations: [42] }, N).error.code, "INVALID_ANNOTATION");
  // 元素是对象但缺坐标 -> INVALID_COORDINATES
  assert.equal(validateAnnotations({ annotations: [{ name: "a" }] }, N).error.code, "INVALID_COORDINATES");
});
