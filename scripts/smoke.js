// 跨原始序列末端片段的 API 冒烟（verify 服务在应用健康后执行）。
// 覆盖：加载记录 -> 保存跨末端片段 -> 重新 GET 还原同一坐标 ->
//       非法坐标稳定错误码且不改动数据 -> 还原初始注释集。
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

function fail(msg) {
  console.error(`✗ 冒烟失败：${msg}`);
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

console.log(`→ 目标 ${BASE_URL}`);

let r = await api("GET", "/healthz");
if (r.status !== 200) fail(`/healthz 返回 ${r.status}`);
console.log("✓ 健康检查通过");

r = await api("GET", "/api/plasmid");
if (r.status !== 200) fail(`GET /api/plasmid 返回 ${r.status}`);
const plasmid = r.data;
const { length: L, referenceStart, annotations: initial } = plasmid;
if (!Number.isInteger(L) || L <= 0) fail("序列长度非法");
if (referenceStart !== 0) fail(`固定参考起点应为 0，实际 ${referenceStart}`);
if (!Array.isArray(initial)) fail("annotations 不是数组");
console.log(`✓ 记录 ${plasmid.name}：${L} bp，参考起点 ${referenceStart}，${initial.length} 条注释`);

// 跨末端片段：起点靠近末端、长度跨过 0 号碱基但不覆盖整圈。
const fragment = {
  name: `smoke-wrap-${Date.now()}`,
  start: L - 150,
  length: 300,
  kind: "fragment"
};
if (fragment.start + fragment.length <= L) fail("测试设计错误：片段并未跨越末端");

r = await api("PUT", "/api/annotations", { annotations: initial.concat(fragment) });
if (r.status !== 200 || r.data?.error) {
  fail(`保存跨末端片段被拒：${r.status} ${JSON.stringify(r.data)}`);
}
console.log(`✓ 跨末端片段已保存：start=${fragment.start} length=${fragment.length}`);

// 模拟“保存成功后重新载入页面”：再次 GET 必须还原同一坐标。
r = await api("GET", "/api/plasmid");
const saved = r.data.annotations.find((a) => a.name === fragment.name);
if (!saved) fail("重新载入后找不到刚保存的片段");
if (saved.start !== fragment.start || saved.length !== fragment.length) {
  fail(`坐标不一致：期望 ${JSON.stringify(fragment)}，实际 ${JSON.stringify(saved)}`);
}
console.log("✓ 重新载入还原同一片段（零基起点 + 正整数长度，跨末端）");

// 非法坐标必须返回稳定错误码，且既有数据保持不变。
r = await api("PUT", "/api/annotations", {
  annotations: initial.concat({ name: "smoke-bad", start: L, length: 10 })
});
if (r.status !== 400 || r.data?.error?.code !== "INVALID_COORDINATES") {
  fail(`非法坐标未返回 INVALID_COORDINATES：${r.status} ${JSON.stringify(r.data)}`);
}
r = await api("GET", "/api/plasmid");
if (JSON.stringify(r.data.annotations) !== JSON.stringify(initial.concat(fragment))) {
  fail("非法请求后既有数据发生变化");
}
console.log("✓ 非法坐标返回 INVALID_COORDINATES，既有数据未改变");

// 还原初始注释集，保证记录确定性。
r = await api("PUT", "/api/annotations", { annotations: initial });
if (r.status !== 200) fail(`还原初始注释集失败：${r.status}`);
console.log("✓ 已还原初始注释集");

console.log("冒烟全部通过 ✔");
