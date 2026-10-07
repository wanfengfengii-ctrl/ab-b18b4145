// 环形几何纯函数：所有显示都以“原始序列碱基坐标”为唯一数据源，
// 显示起点 origin 只影响角度映射，绝不改变片段覆盖的碱基集合。
//
// 角度约定：0° 在 12 点钟方向，顺时针为正（与质粒序列方向一致）。

export const TAU = Math.PI * 2;

// 欧几里得取模，结果始终落在 [0, n)。
export function normMod(x, n) {
  return ((x % n) + n) % n;
}

// 原始序列碱基位置 base 在当前旋转视图下的角度（度）。
export function displayAngle(base, origin, n) {
  return (normMod(base - origin, n) / n) * 360;
}

// 角度（度，12 点顺时针）对应的笛卡尔坐标。
export function polar(cx, cy, r, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

// 从相对圆心的像素位移求角度（度，12 点顺时针，结果 [0,360)）。
// 只依赖方向，与缩放无关 —— 窗口尺寸变化不影响吸附到的碱基。
export function angleFromDelta(dx, dy) {
  const a = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

// 角度吸附到整数碱基：零基，结果 [0, n)。
export function baseFromAngle(angleDeg, origin, n) {
  return normMod(origin + Math.round((angleDeg / 360) * n), n);
}

// 生成一段顺时针环形弧 path。片段可跨越原始序列末端：
// 直接用 start 与 start+length（不归一化）计算角度，
// 因此即使显示起点位于片段内部，弧依然是单条连续弧。
// 调用方须保证 0 < length < n。
export function arcPath(cx, cy, r, start, length, origin, n) {
  const a0 = displayAngle(start, origin, n);
  const a1 = displayAngle(start + length, origin, n);
  // displayAngle 把两端各自归一化；跨末端时 a1 < a0，sweep 仍取顺时针。
  const sweep = normMod(a1 - a0, 360);
  const largeArc = sweep > 180 ? 1 : 0;
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  return {
    d: `M ${p0.x.toFixed(3)} ${p0.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
    startAngle: a0,
    endAngle: a1,
    sweep,
    largeArc
  };
}

export function formatRange(start, length, n) {
  const end = start + length;
  if (end <= n) {
    return `[${start}, ${end})  长度 ${length} bp`;
  }
  return `[${start}, ${n}) ∪ [0, ${end - n})  长度 ${length} bp（跨末端）`;
}
