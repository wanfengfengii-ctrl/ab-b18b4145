/*
 * 环状质粒片段标记前端。
 *
 * 核心不变量：
 *  - state.selection 与所有注释一律使用原始序列坐标（零基起点 + 正整数长度）；
 *  - state.rotation（显示起点）只影响渲染角度，绝不改写任何坐标；
 *  - 因此旋转视图或改变窗口尺寸后，片段覆盖的碱基集合保持不变；
 *  - 片段弧按“起点角 + 跨度角”绘制（不对终点角取模），即使显示起点
 *    位于片段内部，弧也连续呈现。
 */
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // 几何参数（viewBox 单位，圆心在原点）
  const R_BACKBONE = 200; // 主链圆环半径，选区画在其上
  const R_ANNOTATION = 170; // 注释弧半径
  const R_TICK_OUTER = 236; // 刻度外沿
  const R_TICK_LABEL = 254; // 刻度标签半径
  const R_ANN_LABEL = 142; // 注释标签半径

  const PALETTE = [
    '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6',
    '#ef4444', '#14b8a6', '#f97316', '#6366f1',
  ];

  const state = {
    plasmid: null, // { name, length, origin, annotations }
    rotation: 0, // 显示起点（原始坐标系中的碱基序号），仅用于显示
    selection: null, // { start, length }，原始坐标
    drag: null, // { anchor, pointerId } 拖动中的锚点（显示坐标）
    saving: false,
  };

  const els = {
    svg: document.getElementById('plasmid-map'),
    rotationNumber: document.getElementById('rotation-number'),
    rotationRange: document.getElementById('rotation-range'),
    name: document.getElementById('fragment-name'),
    saveBtn: document.getElementById('save-btn'),
    clearBtn: document.getElementById('clear-btn'),
    readout: document.getElementById('selection-readout'),
    statusOk: document.getElementById('status-ok'),
    statusError: document.getElementById('status-error'),
    list: document.getElementById('annotation-list'),
  };

  // ---------- 坐标换算 ----------

  function plasmidLength() {
    return state.plasmid.length;
  }

  // 原始碱基序号 -> 显示角度（度，0 在正上方，顺时针增大）
  function baseAngle(base) {
    const L = plasmidLength();
    const d = (((base - state.rotation) % L) + L) % L;
    return (d / L) * 360;
  }

  function polar(radius, deg) {
    const rad = (deg * Math.PI) / 180;
    return [radius * Math.sin(rad), -radius * Math.cos(rad)];
  }

  // 顺时针圆弧路径。终点角 = 起点角 + 跨度角（不取模），
  // 因此跨过显示 0° 位置的片段仍是一条连续弧。
  function arcPath(radius, startBase, lengthBases) {
    const L = plasmidLength();
    const a0 = baseAngle(startBase);
    const span = (lengthBases / L) * 360;
    const a1 = a0 + span;
    const [x0, y0] = polar(radius, a0);
    const [x1, y1] = polar(radius, a1);
    const large = span > 180 ? 1 : 0;
    return (
      `M ${x0.toFixed(3)} ${y0.toFixed(3)} ` +
      `A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`
    );
  }

  // ---------- SVG 构建 ----------

  function svgEl(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function niceStep(raw) {
    const pow = 10 ** Math.floor(Math.log10(raw));
    const n = raw / pow;
    if (n <= 1) return pow;
    if (n <= 2) return 2 * pow;
    if (n <= 5) return 5 * pow;
    return 10 * pow;
  }

  function renderTicks(g) {
    const L = plasmidLength();
    const minor = niceStep(L / 72);
    const major = minor * 5;
    for (let b = 0; b < L; b += minor) {
      const isMajor = b % major === 0;
      const deg = baseAngle(b);
      const [x0, y0] = polar(R_TICK_OUTER, deg);
      const [x1, y1] = polar(R_TICK_OUTER - (isMajor ? 14 : 8), deg);
      svgEl('line', {
        x1: x0, y1: y0, x2: x1, y2: y1,
        stroke: isMajor ? '#64748b' : '#b6c0cf',
        'stroke-width': isMajor ? 1.6 : 1,
      }, g);
      if (isMajor) {
        const [tx, ty] = polar(R_TICK_LABEL, deg);
        const label = svgEl('text', {
          x: tx, y: ty,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': 12,
          fill: '#475569',
        }, g);
        // 刻度标签显示原始序列坐标，与保存坐标一致
        label.textContent = String(b);
      }
    }
  }

  function renderAnnotations(g) {
    const L = plasmidLength();
    state.plasmid.annotations.forEach((ann, i) => {
      const color = PALETTE[i % PALETTE.length];
      svgEl('path', {
        d: arcPath(R_ANNOTATION, ann.start, ann.length),
        fill: 'none',
        stroke: color,
        'stroke-width': 14,
        'stroke-linecap': 'butt',
        opacity: 0.9,
      }, g);
      const midDeg = baseAngle(ann.start) + (ann.length / L) * 180;
      const [tx, ty] = polar(R_ANN_LABEL, midDeg);
      const label = svgEl('text', {
        x: tx, y: ty,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-size': 12,
        fill: '#334155',
      }, g);
      label.textContent = ann.name;
    });
  }

  function renderSelection(g) {
    if (!state.selection) return;
    const { start, length } = state.selection;
    svgEl('path', {
      d: arcPath(R_BACKBONE, start, length),
      fill: 'none',
      stroke: 'rgba(37, 99, 235, 0.35)',
      'stroke-width': 22,
      'stroke-linecap': 'butt',
    }, g);
    svgEl('path', {
      d: arcPath(R_BACKBONE, start, length),
      fill: 'none',
      stroke: '#2563eb',
      'stroke-width': 3,
      'stroke-dasharray': '6 4',
    }, g);
    // 起点标记
    const [sx, sy] = polar(R_BACKBONE, baseAngle(start));
    svgEl('circle', { cx: sx, cy: sy, r: 5, fill: '#2563eb' }, g);
    // 终点箭头（沿顺时针切线方向）
    const endDeg = baseAngle(start) + (length / plasmidLength()) * 360;
    const [ex, ey] = polar(R_BACKBONE, endDeg);
    svgEl('path', {
      d: 'M -3 -7 L 9 0 L -3 7 Z',
      fill: '#2563eb',
      transform: `translate(${ex.toFixed(3)} ${ey.toFixed(3)}) rotate(${endDeg.toFixed(3)})`,
    }, g);
  }

  function renderCenter(g) {
    const p = state.plasmid;
    const lines = [
      { text: p.name, size: 18, weight: 'bold', dy: -16 },
      { text: `${p.length.toLocaleString('en-US')} bp`, size: 13, dy: 6 },
      { text: `显示起点 ${state.rotation} bp（参考起点固定为 ${p.origin}）`, size: 11, dy: 26 },
    ];
    for (const line of lines) {
      const t = svgEl('text', {
        x: 0, y: line.dy,
        'text-anchor': 'middle',
        'font-size': line.size,
        'font-weight': line.weight || 'normal',
        fill: '#334155',
      }, g);
      t.textContent = line.text;
    }
  }

  function render() {
    if (!state.plasmid) return;
    els.svg.textContent = '';

    // 主链
    svgEl('circle', {
      cx: 0, cy: 0, r: R_BACKBONE,
      fill: 'none', stroke: '#cbd5e1', 'stroke-width': 4,
    }, els.svg);

    renderTicks(svgEl('g', {}, els.svg));
    renderAnnotations(svgEl('g', {}, els.svg));
    renderSelection(svgEl('g', {}, els.svg));
    renderCenter(svgEl('g', {}, els.svg));

    // 参考起点（原始坐标 0）标记
    const [ox, oy] = polar(R_BACKBONE, baseAngle(state.plasmid.origin));
    svgEl('circle', {
      cx: ox, cy: oy, r: 4,
      fill: '#0f172a', stroke: '#fff', 'stroke-width': 1.5,
    }, els.svg);

    // 命中环（透明粗描边，仅在其描边上响应拖动开始；
    // 拖动过程中的 move/up 监听挂在 window 上，因为 render() 会重建
    // 本元素，元素级指针捕获会在重建时丢失）。
    const hit = svgEl('circle', {
      cx: 0, cy: 0, r: R_BACKBONE,
      fill: 'none', stroke: 'transparent', 'stroke-width': 48,
      'pointer-events': 'stroke',
      cursor: 'crosshair',
    }, els.svg);
    hit.addEventListener('pointerdown', onDragStart);
  }

  // ---------- 拖动创建选区 ----------

  // 指针位置 -> 显示坐标系中的碱基位置（浮点）
  function eventToDisplayBase(evt) {
    const pt = els.svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const m = els.svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    let deg = (Math.atan2(p.x, -p.y) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return (deg / 360) * plasmidLength();
  }

  function snapDisplayBase(evt) {
    const frac = eventToDisplayBase(evt);
    if (frac === null) return null;
    const L = plasmidLength();
    return ((Math.round(frac) % L) + L) % L; // 吸附到整数碱基
  }

  function onDragStart(evt) {
    if (!state.plasmid || state.saving) return;
    const anchor = snapDisplayBase(evt);
    if (anchor === null) return;
    state.drag = { anchor, pointerId: evt.pointerId };
    evt.preventDefault();
  }

  function onDragMove(evt) {
    if (!state.drag || evt.pointerId !== state.drag.pointerId) return;
    const cur = snapDisplayBase(evt);
    if (cur === null) return;
    const L = plasmidLength();
    // 顺时针方向从锚点到当前点的跨度；对 L 取模保证 0 <= span <= L-1，
    // 因此选区可跨越序列末端，但永远无法覆盖整圈。
    const span = (((cur - state.drag.anchor) % L) + L) % L;
    if (span === 0) {
      state.selection = null;
    } else {
      // 显示坐标 -> 原始序列坐标
      const start = (state.drag.anchor + state.rotation) % L;
      state.selection = { start, length: span };
    }
    render();
    updateReadout();
  }

  function onDragEnd(evt) {
    if (!state.drag || evt.pointerId !== state.drag.pointerId) return;
    state.drag = null;
    render();
    updateReadout();
    if (state.selection) els.name.focus();
  }

  // ---------- 侧栏 ----------

  function updateReadout() {
    if (!state.selection) {
      els.readout.textContent = '尚未选择片段。';
      return;
    }
    const L = plasmidLength();
    const { start, length } = state.selection;
    const end = (start + length - 1) % L;
    const wraps = start + length > L;
    els.readout.textContent =
      `起点 start = ${start}\n` +
      `长度 length = ${length} bp\n` +
      `末端 end = ${end}${wraps ? '（跨越序列末端）' : ''}`;
  }

  function renderList() {
    els.list.textContent = '';
    const anns = state.plasmid.annotations;
    if (anns.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '暂无注释。';
      els.list.appendChild(li);
      return;
    }
    const L = plasmidLength();
    anns.forEach((ann, i) => {
      const li = document.createElement('li');
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = PALETTE[i % PALETTE.length];
      const meta = document.createElement('span');
      meta.className = 'meta';
      const end = (ann.start + ann.length - 1) % L;
      const wraps = ann.start + ann.length > L;
      meta.textContent =
        `${ann.name}: ${ann.start}..${end} (${ann.length} bp)${wraps ? ' 跨末端' : ''}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'danger';
      del.textContent = '删除';
      del.addEventListener('click', () => deleteAnnotation(ann.name));
      li.append(swatch, meta, del);
      els.list.appendChild(li);
    });
  }

  function showOk(msg) {
    els.statusOk.textContent = msg;
    els.statusOk.hidden = false;
    els.statusError.hidden = true;
  }

  function showError(msg) {
    els.statusError.textContent = msg;
    els.statusError.hidden = false;
    els.statusOk.hidden = true;
  }

  function clearStatus() {
    els.statusOk.hidden = true;
    els.statusError.hidden = true;
  }

  function setSaving(saving) {
    state.saving = saving;
    els.saveBtn.disabled = saving;
    els.saveBtn.textContent = saving ? '保存中…' : '保存片段';
  }

  // ---------- 与服务端交互 ----------

  async function putAnnotations(annotations) {
    const res = await fetch('/api/annotations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations }),
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, body };
  }

  function serverReason(body) {
    if (body && body.error) return `[${body.error.code}] ${body.error.message}`;
    return '服务器返回了无法解析的响应。';
  }

  async function saveSelection() {
    clearStatus();
    if (!state.selection) {
      showError('请先在圆环上沿顺时针拖动选择片段。');
      return;
    }
    const name = els.name.value.trim();
    if (!name) {
      showError('请输入片段名称。');
      return;
    }
    const annotations = state.plasmid.annotations.concat([{
      name,
      start: state.selection.start,
      length: state.selection.length,
    }]);
    setSaving(true);
    try {
      const { ok, body } = await putAnnotations(annotations);
      if (ok) {
        state.plasmid.annotations = body.annotations;
        state.selection = null;
        els.name.value = '';
        showOk(`已保存片段 "${name}"。重新载入页面后将恢复同一批注释。`);
        render();
        renderList();
        updateReadout();
      } else {
        // 保存失败：保留未提交的选择，仅提示服务端原因。
        showError(`保存失败：${serverReason(body)}`);
      }
    } catch (err) {
      showError(`保存失败：网络错误（${err.message}）。未提交的选择已保留。`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnotation(name) {
    clearStatus();
    const annotations = state.plasmid.annotations.filter((a) => a.name !== name);
    setSaving(true);
    try {
      const { ok, body } = await putAnnotations(annotations);
      if (ok) {
        state.plasmid.annotations = body.annotations;
        showOk(`已删除注释 "${name}"。`);
        render();
        renderList();
      } else {
        showError(`删除失败：${serverReason(body)}`);
      }
    } catch (err) {
      showError(`删除失败：网络错误（${err.message}）。`);
    } finally {
      setSaving(false);
    }
  }

  // ---------- 显示起点（旋转） ----------

  function setRotation(value, source) {
    const L = plasmidLength();
    let v = Math.round(Number(value));
    if (!Number.isFinite(v)) v = 0;
    v = ((v % L) + L) % L;
    state.rotation = v; // 仅改变显示；state.selection 与注释坐标不受影响
    if (source !== els.rotationNumber) els.rotationNumber.value = String(v);
    if (source !== els.rotationRange) els.rotationRange.value = String(v);
    render();
  }

  // ---------- 初始化 ----------

  async function init() {
    let data;
    try {
      const res = await fetch('/api/plasmid');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      showError(`加载质粒数据失败：${err.message}`);
      return;
    }
    state.plasmid = data;
    document.title = `${data.name} · 环状质粒片段标记`;
    els.rotationNumber.max = String(data.length - 1);
    els.rotationRange.max = String(data.length - 1);

    els.rotationNumber.addEventListener('change', (e) => setRotation(e.target.value, els.rotationNumber));
    els.rotationRange.addEventListener('input', (e) => setRotation(e.target.value, els.rotationRange));
    els.saveBtn.addEventListener('click', saveSelection);
    els.clearBtn.addEventListener('click', () => {
      state.selection = null;
      clearStatus();
      render();
      updateReadout();
    });
    els.name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveSelection();
    });
    // 拖动过程监听挂在 window：render() 会重建 SVG 内容，
    // 元素级监听/指针捕获无法在拖动中存活。
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
    window.addEventListener('blur', () => {
      if (state.drag) {
        state.drag = null;
        render();
        updateReadout();
      }
    });
    // 改变窗口尺寸只触发重绘；选区以原始坐标保存，碱基集合不变。
    window.addEventListener('resize', render);

    render();
    renderList();
    updateReadout();
  }

  init();
})();
