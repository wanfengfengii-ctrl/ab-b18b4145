import test from "node:test";
import assert from "node:assert/strict";
import {
  normMod,
  displayAngle,
  baseFromAngle,
  angleFromDelta,
  arcPath,
  formatRange
} from "../shared/geometry.js";

const N = 5400;

test("normMod 对负数也归一化到 [0,n)", () => {
  assert.equal(normMod(0, N), 0);
  assert.equal(normMod(N, N), 0);
  assert.equal(normMod(-1, N), N - 1);
  assert.equal(normMod(-N - 1, N), N - 1);
});

test("显示角度：零基碱基 0 在无旋转时位于 12 点", () => {
  assert.equal(displayAngle(0, 0, N), 0);
  assert.equal(displayAngle(N / 4, 0, N), 90);
});

test("任意整数碱基经角度映射后吸附回同一碱基（整数吸附）", () => {
  for (const origin of [0, 137, 2700, N - 1]) {
    for (let base = 0; base < N; base += 337) {
      const angle = displayAngle(base, origin, N);
      assert.equal(baseFromAngle(angle, origin, N), base, `origin=${origin} base=${base}`);
    }
  }
});

test("角度只取决于方向，与缩放无关", () => {
  // 同方向不同半径（模拟窗口尺寸变化）得到相同角度。
  const a1 = angleFromDelta(30, 0);
  const a2 = angleFromDelta(300, 0);
  assert.ok(Math.abs(a1 - a2) < 1e-9);
  assert.equal(Math.round(a1), 90);
  assert.equal(Math.round(angleFromDelta(0, -50)), 0);
});

test("跨末端片段在起点位于片段内部时仍是单条连续顺时针弧", () => {
  const start = N - 150;
  const length = 300; // 覆盖 [5250,5400) ∪ [0,150)
  const origin = N - 100; // 显示起点落在片段内部
  const arc = arcPath(320, 320, 200, start, length, origin, N);
  const expectedSweep = (length / N) * 360;
  assert.ok(Math.abs(arc.sweep - expectedSweep) < 1e-9);
  // 起始角接近 12 点左侧、终止角在右侧，弧跨过 0°
  assert.ok(arc.startAngle > 270 && arc.startAngle < 360);
  assert.ok(arc.endAngle >= 0 && arc.endAngle < 90);
  assert.match(arc.d, /^M .* A 200 200 0 0 1/);
});

test("旋转视图只旋转弧的角度位置，扫过角度不变 => 碱基集合不变", () => {
  const start = N - 150;
  const length = 300;
  const a = arcPath(320, 320, 200, start, length, 0, N);
  const b = arcPath(320, 320, 200, start, length, 2700, N);
  assert.ok(Math.abs(a.sweep - b.sweep) < 1e-9);
  assert.equal(a.largeArc, b.largeArc);
  const delta = normMod(b.startAngle - a.startAngle, 360);
  assert.ok(Math.abs(delta - 180) < 1e-9);
});

test("大于半圈的合法片段使用大弧标志", () => {
  const arc = arcPath(320, 320, 200, 100, 4000, 0, N);
  assert.equal(arc.largeArc, 1);
  assert.ok(Math.abs(arc.sweep - (4000 / N) * 360) < 1e-9);
});

test("formatRange 标注跨末端", () => {
  assert.match(formatRange(10, 20, N), /\[10, 30\)/);
  assert.match(formatRange(N - 100, 250, N), /跨末端/);
});
