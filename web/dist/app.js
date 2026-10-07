// shared/geometry.js
var TAU = Math.PI * 2;
function normMod(x, n) {
  return (x % n + n) % n;
}
function displayAngle(base, origin, n) {
  return normMod(base - origin, n) / n * 360;
}
function polar(cx, cy, r, angleDeg) {
  const a = angleDeg * Math.PI / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}
function angleFromDelta(dx, dy) {
  const a = Math.atan2(dx, -dy) * 180 / Math.PI;
  return a < 0 ? a + 360 : a;
}
function baseFromAngle(angleDeg, origin, n) {
  return normMod(origin + Math.round(angleDeg / 360 * n), n);
}
function arcPath(cx, cy, r, start, length, origin, n) {
  const a0 = displayAngle(start, origin, n);
  const a1 = displayAngle(start + length, origin, n);
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
function formatRange(start, length, n) {
  const end = start + length;
  if (end <= n) {
    return `[${start}, ${end})  \u957F\u5EA6 ${length} bp`;
  }
  return `[${start}, ${n}) \u222A [0, ${end - n})  \u957F\u5EA6 ${length} bp\uFF08\u8DE8\u672B\u7AEF\uFF09`;
}

// src/app.js
var SVG_NS = "http://www.w3.org/2000/svg";
var VIEW = 640;
var C = VIEW / 2;
var R_TICK_OUT = 252;
var R_BAND = 226;
var R_ANN = 182;
var R_ANN_LABEL = 158;
var state = {
  plasmid: null,
  origin: 0,
  // 仅显示用；参考起点固定来自 plasmid.referenceStart
  draft: null,
  // { start, length } 原始序列坐标
  drag: null
};
var $ = (id) => document.getElementById(id);
var svg = $("plasmid-svg");
function svgEl(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== void 0) node.textContent = text;
  return node;
}
function tickStep(n) {
  for (const s of [100, 200, 250, 500, 1e3, 2e3, 5e3, 1e4]) {
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
    cx: p.x,
    cy: p.y,
    r: 4.5,
    fill: color,
    stroke: "#fff",
    "stroke-width": 1.5
  }));
  const lr = labelRadius ?? radius + 16;
  const lp = polar(C, C, lr, angle);
  const t = svgEl("text", {
    x: lp.x,
    y: lp.y,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-size": 10,
    "font-weight": 700,
    fill: color
  }, symbol);
  svg.appendChild(t);
}
function render() {
  const { plasmid, origin, draft } = state;
  if (!plasmid) return;
  const n = plasmid.length;
  svg.replaceChildren();
  const step = tickStep(n);
  for (let base = 0; base < n; base += step) {
    const a = displayAngle(base, origin, n);
    const p1 = polar(C, C, R_TICK_OUT, a);
    const p2 = polar(C, C, R_TICK_OUT - 12, a);
    svg.appendChild(svgEl("line", {
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      stroke: "#8aa0b2",
      "stroke-width": base === 0 ? 2 : 1
    }));
    tickLabel(a, R_TICK_OUT + 14, String(base));
  }
  svg.appendChild(svgEl("circle", {
    cx: C,
    cy: C,
    r: R_BAND,
    fill: "none",
    stroke: "#f6d99a",
    "stroke-width": 28
  }));
  svg.appendChild(svgEl("circle", {
    cx: C,
    cy: C,
    r: R_BAND,
    fill: "none",
    stroke: "#c9d2db",
    "stroke-width": 2
  }));
  const hit = svgEl("circle", {
    cx: C,
    cy: C,
    r: R_BAND,
    fill: "none",
    stroke: "transparent",
    "stroke-width": 30,
    style: "cursor:crosshair",
    class: "interactive"
  });
  hit.addEventListener("pointerdown", onBandPointerDown);
  svg.appendChild(hit);
  const ar = polar(C, C, R_BAND, 14);
  svg.appendChild(svgEl("text", {
    x: ar.x,
    y: ar.y,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-size": 15,
    fill: "#b07f1f"
  }, "\u21BB"));
  for (const ann of plasmid.annotations) {
    if (ann.kind === "fragment") {
      const { d: d2 } = arcPath(C, C, R_BAND, ann.start, ann.length, origin, n);
      svg.appendChild(svgEl("path", {
        d: d2,
        fill: "none",
        stroke: "#e8820e",
        "stroke-width": 22,
        opacity: 0.85
      }));
      const mid2 = displayAngle(ann.start + ann.length / 2, origin, n);
      const lp2 = polar(C, C, R_BAND - 26, mid2);
      svg.appendChild(svgEl("text", {
        x: lp2.x,
        y: lp2.y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": 10,
        "font-weight": 700,
        fill: "#9a4a0e"
      }, ann.name));
      continue;
    }
    const { d } = arcPath(C, C, R_ANN, ann.start, ann.length, origin, n);
    svg.appendChild(svgEl("path", {
      d,
      fill: "none",
      stroke: "#3a7bd5",
      "stroke-width": 13,
      "stroke-linecap": "butt",
      opacity: 0.9
    }));
    const mid = displayAngle(ann.start + ann.length / 2, origin, n);
    const lp = polar(C, C, R_ANN_LABEL, mid);
    const label = svgEl("text", {
      x: lp.x,
      y: lp.y,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": ann.length < 300 ? 8.5 : 10.5,
      fill: "#10334f"
    }, ann.name);
    if (ann.length < 300) {
      label.setAttribute("transform", `rotate(${mid > 180 ? mid - 90 : mid + 90} ${lp.x} ${lp.y})`);
    }
    svg.appendChild(label);
  }
  marker(displayAngle(plasmid.referenceStart, origin, n), R_ANN - 16, "#7a3fb5", "ref 0", { labelRadius: 140 });
  marker(0, 246, "#147a4c", String(origin), { labelRadius: 296 });
  if (draft && draft.length >= 1) {
    const { d } = arcPath(C, C, R_BAND, draft.start, draft.length, origin, n);
    svg.appendChild(svgEl("path", {
      d,
      fill: "none",
      stroke: "#e8820e",
      "stroke-width": 28,
      opacity: 0.9
    }));
    const a0 = displayAngle(draft.start, origin, n);
    const a1 = displayAngle(draft.start + draft.length, origin, n);
    addHandle(a0, "start");
    addHandle(a1, "end");
  }
  svg.appendChild(svgEl("text", {
    x: C,
    y: C - 12,
    "text-anchor": "middle",
    "font-size": 17,
    "font-weight": 700,
    fill: "#10334f"
  }, plasmid.name));
  svg.appendChild(svgEl("text", {
    x: C,
    y: C + 10,
    "text-anchor": "middle",
    "font-size": 12,
    fill: "#52606d"
  }, `${plasmid.length} bp \xB7 \u73AF\u72B6 \xB7 \u987A\u65F6\u9488`));
  renderSide();
}
function addHandle(angle, which) {
  const p = polar(C, C, R_BAND, angle);
  const h = svgEl("circle", {
    cx: p.x,
    cy: p.y,
    r: 7,
    fill: "#fff",
    stroke: "#c46a00",
    "stroke-width": 2.5,
    style: "cursor:grab",
    "data-handle": which,
    class: "interactive"
  });
  h.addEventListener("pointerdown", (e) => onHandlePointerDown(e, which));
  svg.appendChild(h);
}
function eventBase(evt) {
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
    draft.length = normMod(b - drag.anchor, n);
  } else if (drag.mode === "move-end") {
    const nl = normMod(b - draft.start, n);
    if (nl >= 1) draft.length = nl;
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
  try {
    svg.releasePointerCapture(evt.pointerId);
  } catch {
  }
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
  $("plasmid-meta").textContent = `${plasmid.name} \xB7 ${plasmid.length} bp \xB7 \u56FA\u5B9A\u53C2\u8003\u8D77\u70B9 ref ${plasmid.referenceStart} \xB7 ${plasmid.annotations.length} \u6761\u6CE8\u91CA`;
  const list = $("ann-list");
  list.replaceChildren();
  for (const ann of plasmid.annotations) {
    const li = document.createElement("li");
    const nm = document.createElement("span");
    nm.className = "ann-name";
    nm.textContent = ann.kind === "fragment" ? `\u25C6 ${ann.name}` : ann.name;
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
  if (!res.ok) throw new Error(`\u52A0\u8F7D\u5931\u8D25\uFF1AHTTP ${res.status}`);
  return res.json();
}
async function saveDraft() {
  const draft = state.draft;
  if (!draft || draft.length < 1) return;
  const name = $("frag-name").value.trim();
  const payload = {
    annotations: state.plasmid.annotations.concat({
      name,
      start: draft.start,
      length: draft.length,
      kind: "fragment"
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
      const code = data.error?.code ?? `HTTP_${res.status}`;
      const message = data.error?.message ?? "\u670D\u52A1\u7AEF\u672A\u63D0\u4F9B\u539F\u56E0";
      showError(code, message);
      return;
    }
    state.plasmid.annotations = data.annotations;
    state.draft = null;
    $("frag-name").value = "";
    showOk("\u4FDD\u5B58\u6210\u529F\uFF1A\u5B8C\u6574\u6CE8\u91CA\u96C6\u5DF2\u539F\u5B50\u63D0\u4EA4\uFF0C\u5237\u65B0\u9875\u9762\u5373\u53EF\u8FD8\u539F\u3002");
    render();
  } catch (err) {
    showError("NETWORK_ERROR", `\u65E0\u6CD5\u8FDE\u63A5\u670D\u52A1\u7AEF\uFF1A${err.message}`);
  } finally {
    $("save-btn").disabled = false;
  }
}
function applyOrigin() {
  if (!state.plasmid) return;
  const raw = $("origin-input").value;
  if (!/^[+-]?\d+$/.test(raw.trim())) {
    $("origin-notice").textContent = "\u8BF7\u8F93\u5165\u6574\u6570\u78B1\u57FA\u4F4D\u7F6E";
    return;
  }
  const n = state.plasmid.length;
  state.origin = normMod(Number(raw), n);
  $("origin-input").value = String(state.origin);
  $("origin-notice").textContent = state.origin === state.plasmid.referenceStart ? "" : `\u89C6\u56FE\u5DF2\u65CB\u8F6C\uFF0C\u53C2\u8003\u8D77\u70B9\u4ECD\u56FA\u5B9A\u4E3A ${state.plasmid.referenceStart}`;
  render();
}
function bind() {
  $("origin-apply").addEventListener("click", applyOrigin);
  $("origin-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyOrigin();
  });
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
    $("plasmid-meta").textContent = "\u8BB0\u5F55\u52A0\u8F7D\u5931\u8D25";
    showError("LOAD_FAILED", err.message);
  }
}
init();
