// 前端唯一数据源是“原始序列碱基坐标”。旋转（origin）只传入角度映射函数，
// 窗口尺寸变化由 SVG getScreenCTM 处理，二者都不会改写 draft 的 {start,length}。
import {
  normMod,
  displayAngle,
  polar,
  angleFromDelta,
  baseFromAngle,
  arcPath,
  formatRange
} from "../shared/geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW = 640;
const C = VIEW / 2;
const R_TICK_OUT = 252;
const R_BAND = 226;
const R_ANN = 182;
const R_ANN_LABEL = 158;

const state = {
  plasmid: null,
  origin: 0, // 仅显示用；参考起点固定来自 plasmid.referenceStart
  draft: null, // { start, length } 原始序列坐标
  drag: null
};

const $ = (id) => document.getElementById(id);
const svg = $("plasmid-svg");

function svgEl(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function tickStep(n) {
  for (const s of [100, 200, 250, 500, 1000, 2000, 5000, 10000]) {
    if (n / s <= 16) return s;
  }
  return n;
}

function tickLabel(angle, radius, text, attrs = {}) {
  const p = polar(C, C, radius, angle);
  const label = svgEl("text", {
    x: p.x.toFixed(2),
    y: p.y.toFixed(2),
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-size": 11,
    fill: "#52606d",
    ...attrs
  }, text);
  svg.appendChild(label);
}

function marker(angle, radius, color, symbol, { labelRadius } = {}) {
  const p = polar(C, C, radius, angle);
  svg.appendChild(svgEl("circle", {
    cx: p.x, cy: p.y, r: 4.5, fill: color, stroke: "#fff", "stroke-width": 1.5
  }));
  const lr = labelRadius ?? radius + 16;
  const lp = polar(C, C, lr, angle);
  const t = svgEl("text", {
    x: lp.x, y: lp.y, "text-anchor": "middle", "dominant-baseline": "middle",
    "font-size": 10, "font-weight": 700, fill: color
  }, symbol);
  svg.appendChild(t);
}

function render() {
  const { plasmid, origin, draft } = state;
  if (!plasmid) return;
  const n = plasmid.length;
  svg.replaceChildren();

  // 碱基刻度
  const step = tickStep(n);
  for (let base = 0; base < n; base += step) {
    const a = displayAngle(base, origin, n);
    const p1 = polar(C, C, R_TICK_OUT, a);
    const p2 = polar(C, C, R_TICK_OUT - 12, a);
    svg.appendChild(svgEl("line", {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      stroke: "#8aa0b2", "stroke-width": base === 0 ? 2 : 1
    }));
    tickLabel(a, R_TICK_OUT + 14, String(base));
  }

  // 质粒骨架与拖动热区（琥珀色环带）
  svg.appendChild(svgEl("circle", {
    cx: C, cy: C, r: R_BAND, fill: "none", stroke: "#f6d99a", "stroke-width": 28
  }));
  svg.appendChild(svgEl("circle", {
    cx: C, cy: C, r: R_BAND, fill: "none", stroke: "#c9d2db", "stroke-width": 2
  }));
  const hit = svgEl("circle", {
    cx: C, cy: C, r: R_BAND, fill: "none", stroke: "transparent", "stroke-width": 30,
    style: "cursor:crosshair", class: "interactive"
  });
  hit.addEventListener("pointerdown", onBandPointerDown);
  svg.appendChild(hit);

  // 顺时针方向箭头（顶部右侧提示）
  const ar = polar(C, C, R_BAND, 14);
  svg.appendChild(svgEl("text", {
    x: ar.x, y: ar.y, "text-anchor": "middle", "dominant-baseline": "middle",
    "font-size": 15, fill: "#b07f1f"
  }, "↻"));

  // 已保存的待验证片段（外环，琥珀色）与既有注释（内环，蓝色）
  for (const ann of plasmid.annotations) {
    if (ann.kind === "fragment") {
      const { d } = arcPath(C, C, R_BAND, ann.start, ann.length, origin, n);
      svg.appendChild(svgEl("path", {
        d, fill: "none", stroke: "#e8820e", "stroke-width": 22, opacity: 0.85
      }));
      const mid = displayAngle(ann.start + ann.length / 2, origin, n);
      const lp = polar(C, C, R_BAND - 26, mid);
      svg.appendChild(svgEl("text", {
        x: lp.x, y: lp.y, "text-anchor": "middle", "dominant-baseline": "middle",
        "font-size": 10, "font-weight": 700, fill: "#9a4a0e"
      }, ann.name));
      continue;
    }
    const { d } = arcPath(C, C, R_ANN, ann.start, ann.length, origin, n);
    svg.appendChild(svgEl("path", {
      d, fill: "none", stroke: "#3a7bd5", "stroke-width": 13,
      "stroke-linecap": "butt", opacity: 0.9
    }));
    const mid = displayAngle(ann.start + ann.length / 2, origin, n);
    const lp = polar(C, C, R_ANN_LABEL, mid);
    const label = svgEl("text", {
      x: lp.x, y: lp.y, "text-anchor": "middle", "dominant-baseline": "middle",
      "font-size": ann.length < 300 ? 8.5 : 10.5, fill: "#10334f"
    }, ann.name);
    if (ann.length < 300) {
      label.setAttribute("transform", `rotate(${mid > 180 ? mid - 90 : mid + 90} ${lp.x} ${lp.y})`);
    }
    svg.appendChild(label);
  }

  // 固定参考起点（实验室登记序列的 0 号碱基），标签向内避开注释环
  marker(displayAngle(plasmid.referenceStart, origin, n), R_ANN - 16, "#7a3fb5", "ref 0", { labelRadius: 140 });

  // 显示起点标记（永远在 12 点位置），标签向外避开刻度数字
  marker(0, 246, "#147a4c", String(origin), { labelRadius: 296 });

  // 正在创建/已框选的待验证片段
  if (draft && draft.length >= 1) {
    const { d } = arcPath(C, C, R_BAND, draft.start, draft.length, origin, n);
    svg.appendChild(svgEl("path", {
      d, fill: "none", stroke: "#e8820e", "stroke-width": 28, opacity: 0.9
    }));
    const a0 = displayAngle(draft.start, origin, n);
    const a1 = displayAngle(draft.start + draft.length, origin, n);
    addHandle(a0, "start");
    addHandle(a1, "end");
  }

  // 中心信息
  svg.appendChild(svgEl("text", {
    x: C, y: C - 12, "text-anchor": "middle", "font-size": 17, "font-weight": 700, fill: "#10334f"
  }, plasmid.name));
  svg.appendChild(svgEl("text", {
    x: C, y: C + 10, "text-anchor": "middle", "font-size": 12, fill: "#52606d"
  }, `${plasmid.length} bp · 环状 · 顺时针`));

  renderSide();
}

function addHandle(angle, which) {
  const p = polar(C, C, R_BAND, angle);
  const h = svgEl("circle", {
    cx: p.x, cy: p.y, r: 7, fill: "#fff", stroke: "#c46a00", "stroke-width": 2.5,
    style: "cursor:grab", "data-handle": which, class: "interactive"
  });
  h.addEventListener("pointerdown", (e) => onHandlePointerDown(e, which));
  svg.appendChild(h);
}

function eventBase(evt) {
  // 通过 SVG 自身 CTM 把客户端坐标映射进 viewBox 坐标系：
  // 窗口任意尺寸/缩放只改变像素，不改变角度，吸附结果恒定。
  const ctm = svg.getScreenCTM();
  const pt = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(ctm.inverse());
  const ang = angleFromDelta(pt.x - C, pt.y - C);
  return baseFromAngle(ang, state.origin, state.plasmid.length);
}

function onBandPointerDown(evt) {
  evt.preventDefault();
  hideBanners();
  const anchor = eventBase(evt);
  state.drag = { mode: "create", anchor };
  state.draft = { start: anchor, length: 0 };
  svg.setPointerCapture(evt.pointerId);
  render();
}

function onHandlePointerDown(evt, which) {
  evt.preventDefault();
  evt.stopPropagation();
  if (!state.draft || state.draft.length < 1) return;
  state.drag = { mode: which === "start" ? "move-start" : "move-end" };
  svg.setPointerCapture(evt.pointerId);
}

svg.addEventListener("pointermove", (evt) => {
  const drag = state.drag;
  if (!drag || !state.draft) return;
  const b = eventBase(evt);
  const n = state.plasmid.length;
  const draft = state.draft;

  if (drag.mode === "create") {
    draft.length = normMod(b - drag.anchor, n); // 0 表示尚未拖出
  } else if (drag.mode === "move-end") {
    const nl = normMod(b - draft.start, n);
    if (nl >= 1) draft.length = nl; // 防止缩成空片段/整圈
  } else if (drag.mode === "move-start") {
    const endBoundary = normMod(draft.start + draft.length, n);
    const ns = b;
    const nl = normMod(endBoundary - ns, n);
    if (nl >= 1) {
      draft.start = ns;
      draft.length = nl;
    }
  }
  render();
});

svg.addEventListener("pointerup", (evt) => {
  if (!state.drag) return;
  try { svg.releasePointerCapture(evt.pointerId); } catch { /* 忽略 */ }
  state.drag = null;
  if (state.draft && state.draft.length < 1) state.draft = null;
  render();
  if (state.draft) $("frag-name").focus();
});

svg.addEventListener("pointercancel", () => {
  state.drag = null;
  if (state.draft && draftIsUntouched()) state.draft = null;
  render();
});

function draftIsUntouched() {
  return state.draft && state.draft.length === 0;
}

function renderSide() {
  const { plasmid, draft } = state;
  $("plasmid-meta").textContent =
    `${plasmid.name} · ${plasmid.length} bp · 固定参考起点 ref ${plasmid.referenceStart} · ${plasmid.annotations.length} 条注释`;

  const list = $("ann-list");
  list.replaceChildren();
  for (const ann of plasmid.annotations) {
    const li = document.createElement("li");
    const nm = document.createElement("span");
    nm.className = "ann-name";
    nm.textContent = ann.kind === "fragment" ? `◆ ${ann.name}` : ann.name;
    if (ann.kind === "fragment") nm.style.color = "#9a4a0e";
    const rg = document.createElement("span");
    rg.className = "ann-range";
    rg.textContent = formatRange(ann.start, ann.length, plasmid.length);
    li.append(nm, rg);
    list.appendChild(li);
  }
  $("ann-count").textContent = `(${plasmid.annotations.length})`;

  const box = $("draft-box");
  if (draft && draft.length >= 1) {
    box.classList.remove("hidden");
    $("no-draft").classList.add("hidden");
    $("frag-range").textContent = formatRange(draft.start, draft.length, plasmid.length);
    $("frag-wrap").classList.toggle("hidden", draft.start + draft.length <= plasmid.length);
  } else {
    box.classList.add("hidden");
    $("no-draft").classList.remove("hidden");
  }
}

function showError(code, message) {
  const ok = $("ok-banner");
  ok.classList.add("hidden");
  const banner = $("error-banner");
  banner.innerHTML = "";
  const c = document.createElement("code");
  c.textContent = `[${code}] `;
  banner.append(c, document.createTextNode(message));
  banner.classList.remove("hidden");
}

function showOk(message) {
  $("error-banner").classList.add("hidden");
  const ok = $("ok-banner");
  ok.textContent = message;
  ok.classList.remove("hidden");
}

function hideBanners() {
  $("error-banner").classList.add("hidden");
  $("ok-banner").classList.add("hidden");
}

async function loadPlasmid() {
  const res = await fetch("/api/plasmid");
  if (!res.ok) throw new Error(`加载失败：HTTP ${res.status}`);
  return res.json();
}

async function saveDraft() {
  const draft = state.draft;
  if (!draft || draft.length < 1) return;
  const name = $("frag-name").value.trim();
  const payload = {
    annotations: state.plasmid.annotations.concat({
      name, start: draft.start, length: draft.length, kind: "fragment"
    })
  };
  $("save-btn").disabled = true;
  try {
    const res = await fetch("/api/annotations", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      // 保存失败：draft、名称输入与环形选区全部保留，明确展示服务端稳定错误码与原因。
      const code = data.error?.code ?? `HTTP_${res.status}`;
      const message = data.error?.message ?? "服务端未提供原因";
      showError(code, message);
      return;
    }
    state.plasmid.annotations = data.annotations;
    state.draft = null;
    $("frag-name").value = "";
    showOk("保存成功：完整注释集已原子提交，刷新页面即可还原。");
    render();
  } catch (err) {
    showError("NETWORK_ERROR", `无法连接服务端：${err.message}`);
  } finally {
    $("save-btn").disabled = false;
  }
}

function applyOrigin() {
  if (!state.plasmid) return;
  const raw = $("origin-input").value;
  if (!/^[+-]?\d+$/.test(raw.trim())) {
    $("origin-notice").textContent = "请输入整数碱基位置";
    return;
  }
  const n = state.plasmid.length;
  state.origin = normMod(Number(raw), n);
  $("origin-input").value = String(state.origin);
  $("origin-notice").textContent =
    state.origin === state.plasmid.referenceStart ? "" : `视图已旋转，参考起点仍固定为 ${state.plasmid.referenceStart}`;
  render(); // 只重绘；draft 的碱基集合原封不动
}

function bind() {
  $("origin-apply").addEventListener("click", applyOrigin);
  $("origin-input").addEventListener("keydown", (e) => { if (e.key === "Enter") applyOrigin(); });
  $("origin-reset").addEventListener("click", () => {
    state.origin = state.plasmid.referenceStart;
    $("origin-input").value = String(state.origin);
    $("origin-notice").textContent = "";
    render();
  });
  $("save-btn").addEventListener("click", saveDraft);
  $("cancel-btn").addEventListener("click", () => {
    state.draft = null;
    hideBanners();
    render();
  });
}

async function init() {
  bind();
  try {
    state.plasmid = await loadPlasmid();
    state.origin = normMod(state.plasmid.referenceStart, state.plasmid.length);
    $("origin-input").value = String(state.origin);
    $("origin-input").max = String(state.plasmid.length - 1);
    render();
  } catch (err) {
    $("plasmid-meta").textContent = "记录加载失败";
    showError("LOAD_FAILED", err.message);
  }
}

init();
