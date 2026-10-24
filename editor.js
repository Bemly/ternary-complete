/* 电路编辑器 + 仿真器
 *
 * 键鼠操作约定：
 * - 按住输出钉 → 拖到输入钉松手：连线（点两下也行）；靠近钉 28px 内自动吸附；Esc 取消
 * - 也可从输入钉反向拖到输出钉；按住已连线的输入钉拖走：拎起这根线改接，拖到空白松手即断开
 * - 落到已占用的输入钉：替换旧线；落到元件本体：接到最近的空闲钉
 * - 按住导线本体拖拽：抓取点即时弯折改走向；双击加节点；右键点节点删该节点
 * - 右键点导线/元件：删除；单击导线：选中（Delete 删除）；悬停导线：整网高亮
 * - 空白处拖拽：框选（Shift 加选）；单击空白：取消选择；拖动元件：多选一起搬（22px 网格吸附）
 * - 元件箱：点击放到视野中央空位，或直接拖到画布上指定位置
 * - 空格/中键/右键拖拽：平移画布；滚轮：以光标为中心缩放；F：适应画布
 * - Delete：删除选中；Ctrl+Z / Ctrl+Y（Shift+Z）：撤销/重做；Ctrl+C/V：复制粘贴；Ctrl+A：全选
 * - 重叠处理：手势收尾新增重叠先挤旁边空位，无位可挤才 undo 回上一步并清空 redo
 *
 * 性能约定：钉坐标与包络盒全部由几何（geomOf）算出，不读 DOM；
 * 拖拽类手势只请求下一帧重绘（requestDraw），平移缩放只改舞台变换，不重算走线。
 */
'use strict';

const WORLD = 4000;
const GRID = 22; // 点阵间距：元件、导线节点、走线弯折全部严格吸附
const PT = 22;   // 门符号名牌条高度，钉坐标整体下移一格，保证钉落在 11px 半格上
const snapG = v => Math.round(v / GRID) * GRID;
const IO_W = 110, IO_H = 44;
// 关卡输入输出端子布局（布线台与参考解共用，钉位落在网格上）
function ioLayout(level, outX) {
  const ins = level.inputs.map((nm, i) => ({ nm, x: 44, y: 88 + i * 88 }));
  const outs = level.outputs.map((nm, i) => ({ nm, x: outX || 792, y: 88 + i * 88 }));
  return { ins, outs };
}

const Editor = {
  circuit: null, level: null,
  pending: null, selected: [], selectedWire: null, selectedWp: null,
  autoTimer: null, nidSeq: 1, widSeq: 1,
  pan: { x: 20, y: 10 }, zoom: 1,
  tickCount: 0, tlFrames: [], tlOn: true,
  mouse: null, spaceDown: false, clipboard: null,
  undoStack: [], redoStack: [],

  elBoard: null, elWires: null, elWrap: null, elStage: null, elBox: null,

  init() {
    this._geo = {};
    this.elBoard = document.getElementById('board');
    this.elWires = document.getElementById('wires');
    // 导线层与连线预览层分开：拖线预览只重画预览层
    this.elWires.innerHTML = '<g class="wl"></g><g class="pl"></g>';
    this.elWL = this.elWires.querySelector('.wl');
    this.elPL = this.elWires.querySelector('.pl');
    this.elWrap = document.getElementById('board-wrap');
    this.elStage = document.getElementById('stage');
    this.elBox = document.getElementById('select-box');
    this.initTouch();
    // 手机转屏：画布形状大变，重新适应一次
    try {
      matchMedia('(orientation: portrait)').addEventListener('change', () => {
        if (this.level && this.level.kind === 'circuit' && this.elWrap.clientWidth) setTimeout(() => this.fitView(), 60);
      });
    } catch {}
    document.getElementById('btn-clear').onclick = () => {
      if (!this.circuit) return;
      this.pushHistory();
      this.circuit.wires = []; this.pending = null;
      this.selectedWire = null; this.selectedWp = null;
      this.refresh(); this.toast(t('tCleared'));
    };
    document.getElementById('btn-del').onclick = () => this.deleteSelected();
    document.getElementById('btn-tick').onclick = () => { this.tick(); };
    document.getElementById('btn-auto').onclick = (e) => this.toggleAuto(e);
    document.getElementById('tps-sel').onchange = () => {
      if (this.autoTimer) { this.stopAuto(); this.toggleAuto(document.getElementById('btn-auto')); }
    };
    document.getElementById('btn-timeline').onclick = (e) => {
      this.tlOn = !this.tlOn;
      document.getElementById('timeline-strip').style.display = this.tlOn ? '' : 'none';
      e.target.classList.toggle('on', this.tlOn);
      if (this.tlOn) this.renderTimeline();
    };
    document.getElementById('btn-tl-clear').onclick = () => {
      this.tlFrames = []; this.tickCount = 0;
      this.sampleTimeline(); this.renderTimeline(); this.updateTickUI();
    };
    document.getElementById('io-panel').onclick = (e) => {
      const c = e.target.closest && e.target.closest('[data-io]');
      if (!c) return;
      const ins = this.circuit.nodes.filter(n => n.type === 'INPUT');
      const n = ins[Number(c.dataset.io)];
      if (n) { n.val = n.val === -1 ? 0 : n.val === 0 ? 1 : -1; this.refresh(); }
    };

    // 导线：单击选中 / 双击加节点（选中只换 class 不重建 SVG，否则两次点击落在不同 DOM 节点上、dblclick 永不触发）
    this.elWires.addEventListener('click', (e) => {
      const g = e.target.closest('[data-wid]');
      if (this.suppressClick) return;
      if (g && !e.target.closest('[data-wp]')) {
        this.selected = []; this.selectedWp = null;
        this.selectedWire = Number(g.dataset.wid);
        this.markSelection();
      }
    });
    this.elWires.addEventListener('dblclick', (e) => {
      const g = e.target.closest('[data-wid]');
      if (g) this.addWaypoint(Number(g.dataset.wid), this.toWorld(e.clientX, e.clientY));
    });
    // 导线节点拖拽（委托）；导线本体按下拖拽 = 抓取改走向
    this.elWires.addEventListener('pointerdown', (e) => {
      const wp = e.target.closest('[data-wp]');
      if (wp) {
        e.stopPropagation();
        this.dragWaypoint(Number(wp.dataset.wid), Number(wp.dataset.idx), e);
        return;
      }
      const g = e.target.closest('[data-wid]');
      if (g && e.button === 0) {
        e.stopPropagation();
        this.bendWireAt(Number(g.dataset.wid), e);
      }
    });
    // 右键：点线删线 / 点节点删节点 / 否则取消
    this.elWrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.panned) return;
      const wp = e.target.closest && e.target.closest('[data-wp]');
      if (wp) {
        this.pushHistory();
        const w = this.circuit.wires.find(x => x.wid === Number(wp.dataset.wid));
        if (w) w.pts.splice(Number(wp.dataset.idx), 1);
        this.selectedWp = null; this.refresh();
        this.toast(t('tWpDel'));
        return;
      }
      const g = e.target.closest && e.target.closest('[data-wid]');
      if (g) {
        this.pushHistory();
        this.circuit.wires = this.circuit.wires.filter(w => w.wid !== Number(g.dataset.wid));
        if (this.selectedWire === Number(g.dataset.wid)) this.selectedWire = null;
        this.refresh(); return;
      }
      const nd = e.target.closest && e.target.closest('.node');
      if (nd) {
        const n = this.nodeById(Number(nd.dataset.nid));
        if (n && n.type !== 'INPUT' && n.type !== 'OUTPUT') {
          const nid = n.nid;
          this.pushHistory();
          this.circuit.nodes = this.circuit.nodes.filter(x => x.nid !== nid);
          this.circuit.wires = this.circuit.wires.filter(w => w.from.nid !== nid && w.to.nid !== nid);
          this.selected = this.selected.filter(id => id !== nid);
          if (this.selectedWire != null && !this.circuit.wires.some(w => w.wid === this.selectedWire)) this.selectedWire = null;
          this.selectedWp = null;
          this.refresh();
          try { this.toast(t('tDeleted', compName(n.type))); } catch {}
          return;
        }
        if (n) { try { this.toast(t('tNoDelIO')); } catch {} return; }
      }
      this.pending = null; this.clearSelection(); this.refresh();
    });

    this.elWrap.addEventListener('pointermove', (e) => {
      if (!this.pending || this.wiring) return;
      this.mouse = this.toWorld(e.clientX, e.clientY);
      this.snapTarget = this.findSnap(e);
      if (!this._pvRaf) this._pvRaf = requestAnimationFrame(() => { this._pvRaf = 0; this.drawPreview(); });
    });
    // 背景：框选 / 平移（svg 空白处也要能框选，只排除节点/钉子/已有导线）
    this.elWrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.node') || e.target.closest('.pin')) return;
      if (e.target.closest('[data-wid]') || e.target.closest('[data-wp]')) return;
      if (e.target.closest('#board-hint') || e.target.closest('.tri-legend')) return;
      this.bgGesture(e);
    });
    // 滚轮缩放（光标锚定）
    this.elWrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const wr = this.elWrap.getBoundingClientRect();
      const cx = e.clientX - wr.left, cy = e.clientY - wr.top;
      const z2 = Math.min(2.5, Math.max(0.2, this.zoom * Math.exp(-e.deltaY * 0.0012)));
      this.pan.x = cx - (cx - this.pan.x) * (z2 / this.zoom);
      this.pan.y = cy - (cy - this.pan.y) * (z2 / this.zoom);
      this.zoom = z2;
      this.applyView();
    }, { passive: false });
    // 悬停导线：整网高亮（同一输出钉出发的全部导线）
    this.elWires.addEventListener('pointerover', (e) => {
      const g = e.target.closest && e.target.closest('[data-net]');
      const net = g ? g.dataset.net : null;
      if (net === this._hotNet) return;
      this._hotNet = net;
      this.elWL.querySelectorAll('.net-hot').forEach(x => x.classList.remove('net-hot'));
      if (net) this.elWL.querySelectorAll(`[data-net="${net}"]`).forEach(x => x.classList.add('net-hot'));
    });
    this.elWires.addEventListener('pointerleave', () => {
      this._hotNet = null;
      this.elWL.querySelectorAll('.net-hot').forEach(x => x.classList.remove('net-hot'));
    });
    const zc = document.getElementById('zoom-ctl');
    if (zc) zc.addEventListener('click', (e) => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      if (b.dataset.z === 'fit') this.fitView();
      else this.zoomBy(b.dataset.z === 'in' ? 1.2 : 1 / 1.2);
    });

    document.addEventListener('keydown', (e) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input') return;
      if (e.key === ' ') this.spaceDown = true;
      if ((e.key === 'Delete' || e.key === 'Backspace')) this.deleteSelected();
      if (e.key === 'Escape') { this.pending = null; this.clearSelection(); this.mouse = null; this.refresh(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copySel(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); this.pasteSel(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); this.selectAll(); }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f' && this.level && this.level.kind === 'circuit') this.fitView();
    });
    document.addEventListener('keyup', (e) => { if (e.key === ' ') this.spaceDown = false; });
  },

  // 双指捏合缩放 + 平移（两指都落在画布上时接管，单指手势让位）
  initTouch() {
    const pts = new Map();
    let base = null;
    const span = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
    this.elWrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const wr = this.elWrap.getBoundingClientRect(), sp = span();
        base = { ...sp, zoom: this.zoom, pan: { ...this.pan }, wr };
        this._pinch = true;
      }
    }, true);
    window.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size !== 2 || !base) return;
      const sp = span(), wr = base.wr;
      const z = Math.min(2.5, Math.max(0.2, base.zoom * sp.d / Math.max(base.d, 1)));
      // 以双指中点为锚：中点下的世界坐标保持不动，同时跟随中点平移
      const wx = (base.cx - wr.left - base.pan.x) / base.zoom, wy = (base.cy - wr.top - base.pan.y) / base.zoom;
      this.zoom = z;
      this.pan.x = sp.cx - wr.left - wx * z;
      this.pan.y = sp.cy - wr.top - wy * z;
      this.applyView();
    });
    const end = (e) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size < 2) { base = null; setTimeout(() => { this._pinch = false; }, 0); }
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  },

  // 视图变换
  applyView() {
    if (this.elStage) this.elStage.style.transform = `translate(${this.pan.x}px,${this.pan.y}px) scale(${this.zoom})`;
    const zl = document.getElementById('zoom-lbl');
    if (zl) zl.textContent = Math.round(this.zoom * 100) + '%';
  },
  zoomBy(k, cx, cy) {
    if (cx === undefined) { cx = this.elWrap.clientWidth / 2; cy = this.elWrap.clientHeight / 2; }
    const z2 = Math.min(2.5, Math.max(0.2, this.zoom * k));
    this.pan.x = cx - (cx - this.pan.x) * (z2 / this.zoom);
    this.pan.y = cy - (cy - this.pan.y) * (z2 / this.zoom);
    this.zoom = z2;
    this.applyView();
  },
  // 适应画布：把全部元件框进视野（留边距，最大 1.4 倍）
  fitView() {
    if (!this.circuit || !this.circuit.nodes.length) return;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const n of this.circuit.nodes) {
      const g = this.geomOf(n);
      l = Math.min(l, n.x); t = Math.min(t, n.y - 4);
      r = Math.max(r, n.x + g.w); b = Math.max(b, n.y + g.h);
    }
    for (const pts of this.planAllRoutes().values()) for (const p of pts) { l = Math.min(l, p.x - 8); r = Math.max(r, p.x + 8); t = Math.min(t, p.y - 8); b = Math.max(b, p.y + 8); }
    const W = this.elWrap.clientWidth, H = this.elWrap.clientHeight;
    const padX = 60, padTop = 56, padBot = 44;
    const z = Math.min(1.4, Math.max(0.2, Math.min((W - padX * 2) / (r - l), (H - padTop - padBot) / (b - t))));
    this.zoom = z;
    this.pan.x = (W - (r - l) * z) / 2 - l * z;
    this.pan.y = padTop + (H - padTop - padBot - (b - t) * z) / 2 - t * z;
    this.applyView();
  },
  // 合并同一帧内的多次重绘请求（拖拽类手势用）
  requestDraw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.drawWires(); });
  },
  toWorld(cx, cy) {
    const wr = this.elWrap.getBoundingClientRect();
    return { x: (cx - wr.left - this.pan.x) / this.zoom, y: (cy - wr.top - this.pan.y) / this.zoom };
  },

  // 历史（撤销/重做，只记录结构编辑）
  snapshot() { return JSON.stringify({ nodes: this.circuit.nodes, wires: this.circuit.wires, nidSeq: this.nidSeq, widSeq: this.widSeq }); },
  pushHistory() {
    if (!this.circuit) return;
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  },
  restoreSnapshot(s) {
    const o = JSON.parse(s);
    this.circuit = { nodes: o.nodes, wires: o.wires };
    this.nidSeq = o.nidSeq; this.widSeq = o.widSeq;
    for (const w of this.circuit.wires) if (!Array.isArray(w.pts)) w.pts = [];
    this.pending = null; this.selected = []; this.selectedWire = null; this.selectedWp = null;
    this.elBoard.innerHTML = '';
    for (const n of this.circuit.nodes) this.renderNode(n);
    this.refresh();
  },
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restoreSnapshot(this.undoStack.pop());
  },
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restoreSnapshot(this.redoStack.pop());
  },
  overlapCount() {
    try { return this.findOverlaps().length; } catch { return 0; }
  },
  // 把刚动过的导线节点挤到附近空位：GRID 步进同心扩散，首个重叠数回到 before 的即采纳
  nudgeWaypoint(wid, idx, before) {
    let w = null;
    try { w = this.circuit.wires.find(x => x.wid === wid); } catch { return false; }
    if (!w || !w.pts || !w.pts[idx]) return false;
    const orig = { x: w.pts[idx].x, y: w.pts[idx].y };
    let boxes = [];
    try {
      for (const n of this.circuit.nodes) {
        if (n.nid === w.from.nid || n.nid === w.to.nid) continue;
        const b = this.nodeBox(n.nid);
        if (b) boxes.push(b);
      }
    } catch { boxes = []; }
    const inBox = (x, y) => boxes.some(r => x > r.l && x < r.r && y > r.t && y < r.b);
    const cands = [];
    for (let d = 1; d <= 3; d++) {
      for (let i = -d; i <= d; i++) { cands.push([i * GRID, d * GRID]); cands.push([i * GRID, -d * GRID]); }
      for (let i = -d + 1; i <= d - 1; i++) { cands.push([d * GRID, i * GRID]); cands.push([-d * GRID, i * GRID]); }
    }
    for (const [dx, dy] of cands) {
      const x = orig.x + dx, y = orig.y + dy;
      if (x < 0 || y < 0 || x > WORLD || y > WORLD || inBox(x, y)) continue;
      w.pts[idx] = { x, y };
      let ok = false;
      try { ok = this.findOverlaps(null, before).length <= before; } catch { ok = false; }
      if (ok) return true;
    }
    w.pts[idx] = orig;
    return false;
  },
  // 落线结算：干净则保留；新增重叠先挤空位，实在没空位才 undo 回上一步（redo 清空）
  settleOverlap(before, wid, idx) {
    let cur = this.overlapCount();
    if (cur <= before) { this.refresh(); return; }
    if (wid != null && idx != null && this.nudgeWaypoint(wid, idx, before)) {
      this.refresh();
      try { this.toast(t('overlapNudged')); } catch {}
      return;
    }
    const snap = this.undoStack.pop();
    if (snap !== undefined) {
      try { this.restoreSnapshot(snap); }
      catch {
        try {
          const o = JSON.parse(snap);
          this.circuit = { nodes: o.nodes, wires: o.wires };
          this.nidSeq = o.nidSeq; this.widSeq = o.widSeq;
        } catch {}
      }
      this.redoStack = [];
      try { this.toast(t('overlapRevert')); } catch {}
      return;
    }
    this.refresh();
  },
  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 1800);
  },

  newCircuit() { return { nodes: [], wires: [] }; },

  loadLevel(level) {
    this.level = level;
    this.circuit = this.newCircuit();
    this.pending = null; this.selected = []; this.selectedWire = null; this.selectedWp = null;
    this.undoStack = []; this.redoStack = [];
    this.stopAuto();
    this.nidSeq = 1; this.widSeq = 1;
    this.pan = { x: 20, y: 10 }; this.zoom = 1;
    this.tickCount = 0; this.tlFrames = [];
    this.elBoard.innerHTML = '';
    if (level.kind === 'circuit') {
      const io = ioLayout(level);
      io.ins.forEach(p => this.addNode('INPUT', p.x, p.y, { ioName: p.nm, val: 0 }, true, true));
      io.outs.forEach(p => this.addNode('OUTPUT', p.x, p.y, { ioName: p.nm }, true, true));
    }
    this.buildPalette(level);
    this.applyView();
    this.refresh();
    this.updateTickUI();
    this.sampleTimeline();
    this.renderTimeline();
  },

  defOf(node) {
    if (node.type === 'INPUT') return { name: node.ioName || t('inLbl'), en: '', inputs: [], outputs: ['Q'] };
    if (node.type === 'OUTPUT') return { name: node.ioName || t('outLbl'), en: '', inputs: ['A'], outputs: [] };
    return COMP_DEFS[node.type];
  },

  addNode(type, x, y, extra = {}, silent = false, noHist = false) {
    const node = Object.assign({ nid: this.nidSeq++, type, x, y, val: 0, state: 0 }, extra);
    if (COMP_DEFS[type] && COMP_DEFS[type].constVal !== undefined) node.constVal = COMP_DEFS[type].constVal;
    if (!noHist) this.pushHistory();
    this.circuit.nodes.push(node);
    if (!silent) this.refresh();
    else this.renderNode(node);
    return node;
  },

  buildPalette(level) {
    const pal = document.getElementById('palette');
    pal.innerHTML = '';
    const keys = (level.palette || []).filter(k => COMP_DEFS[k]);
    // 按类别分组：门 / 阈值 / 选择 / 算术 / 时序 / 常量
    const groups = [
      ['pgGate', ['TNAND', 'TNOR', 'STI', 'TMIN', 'TMAX']],
      ['pgThr', ['NTI', 'PTI', 'ISP', 'ISN', 'ISZ']],
      ['pgSel', ['MUX', 'CMP', 'DEC']],
      ['pgArith', ['HADD', 'FADD', 'ADD2', 'SUB2', 'ALU1']],
      ['pgSeq', ['DFF', 'REG1']],
      ['pgConst', ['C_M', 'C_Z', 'C_P']],
    ];
    const seen = new Set();
    for (const [gk, members] of groups) {
      const ks = keys.filter(k => members.includes(k));
      if (!ks.length) continue;
      const h = document.createElement('div');
      h.className = 'pal-group';
      h.textContent = t(gk);
      pal.appendChild(h);
      const box = document.createElement('div');
      box.className = 'pal-grid' + (gk === 'pgConst' ? ' consts' : '');
      for (const k of ks) { box.appendChild(this.palButton(k)); seen.add(k); }
      pal.appendChild(box);
    }
    const rest = keys.filter(k => !seen.has(k));
    if (rest.length) { const box = document.createElement('div'); box.className = 'pal-grid'; rest.forEach(k => box.appendChild(this.palButton(k))); pal.appendChild(box); }
    if (!keys.length && level.kind === 'circuit') {
      pal.innerHTML = `<span class="pal-empty">${t('noGates')}</span>`;
    }
  },
  palButton(k) {
    const d = COMP_DEFS[k];
    const b = document.createElement('button');
    b.className = 'pal-btn';
    // 元件箱显示该元件的真实形状微缩图，不再是干文字方块
    let prev = '';
    try {
      const s = this.shapeOf(k);
      const dots = s.inA.map(p => `<rect x="${p.x - 3}" y="${p.y - 3}" width="6" height="6" fill="#8b94a7"/>`).join('') +
        s.outA.map(p => `<rect x="${p.x - 3}" y="${p.y - 3}" width="6" height="6" fill="#ffb74d"/>`).join('');
      prev = `<span class="pal-prev"><svg viewBox="-4 -2 ${s.w + 8} ${s.h + 4}" width="52" height="34" preserveAspectRatio="xMidYMid meet">${s.svg}${dots}</svg></span>`;
    } catch { prev = ''; }
    b.innerHTML = `${prev}<span class="pal-name">${compName(k)}<small>${d.en}</small></span>`;
    b.title = compName(k) + ' · ' + compDesc(k);
    b.addEventListener('pointerdown', (e) => this.palDrag(k, e));
    return b;
  },
  // 元件箱拖放：拖到画布松手即放在落点（网格吸附、自动避开已有元件）；原地松手 = 点击，放到视野中央空位
  palDrag(type, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let ghost = null, moved = false;
    const g = this.geomOf({ type });
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 5) return;
      if (!moved) {
        moved = true;
        const s = this.shapeOf(type);
        ghost = document.createElement('div');
        ghost.className = 'pal-ghost';
        ghost.innerHTML = `<svg width="${s.w * this.zoom}" height="${s.h * this.zoom}" viewBox="0 0 ${s.w} ${s.h}">${s.svg}</svg>`;
        document.body.appendChild(ghost);
      }
      ghost.style.left = (ev.clientX - g.w * this.zoom / 2) + 'px';
      ghost.style.top = (ev.clientY - (g.h - PT) * this.zoom / 2) + 'px';
      const wr = this.elWrap.getBoundingClientRect();
      ghost.classList.toggle('off', !(ev.clientX > wr.left && ev.clientX < wr.right && ev.clientY > wr.top && ev.clientY < wr.bottom));
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      if (ghost) ghost.remove();
      const wr = this.elWrap.getBoundingClientRect();
      let p;
      if (!moved) {
        const c = this.toWorld(wr.left + wr.width / 2, wr.top + wr.height / 2);
        p = this.freeSpot(snapG(c.x - g.w / 2), snapG(c.y - g.h / 2), g);
      } else {
        if (!(ev.clientX > wr.left && ev.clientX < wr.right && ev.clientY > wr.top && ev.clientY < wr.bottom)) return;
        const c = this.toWorld(ev.clientX, ev.clientY);
        p = this.freeSpot(snapG(c.x - g.w / 2), snapG(c.y - g.h / 2 - PT / 2), g);
      }
      const n = this.addNode(type, p.x, p.y);
      this.selected = [n.nid]; this.selectedWire = null; this.refresh();
    };
    // 触屏上纵向滑动交给元件栏滚动：浏览器接管后会发 pointercancel，收掉拖影即可
    const cancel = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); if (ghost) ghost.remove(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  },
  // 从 (x,y) 起按网格同心扩散，找第一个与现有元件包络不相交的位置
  freeSpot(x, y, g) {
    const hit = (px, py) => this.circuit.nodes.some(n => {
      const b = this.nodeBox(n.nid, 12);
      return px < b.r && px + g.w > b.l && py < b.b && py + g.h > b.t;
    });
    if (!hit(x, y)) return { x, y };
    for (let d = 1; d <= 12; d++) {
      for (let i = -d; i <= d; i++) for (const [dx, dy] of [[i, -d], [i, d], [-d, i], [d, i]]) {
        const px = x + dx * GRID, py = y + dy * GRID;
        if (px >= 0 && py >= 0 && !hit(px, py)) return { x: px, y: py };
      }
    }
    return { x, y };
  },

  nodeById(nid) { return this.circuit.nodes.find(n => n.nid === nid); },
  clearSelection() { this.selected = []; this.selectedWire = null; this.selectedWp = null; },
  updateSelInfo() {
    const selEl = document.getElementById('sel-info');
    if (selEl) {
      selEl.textContent =
        this.selectedWp ? t('selWp') :
        this.selectedWire != null ? t('selWire') :
        this.selected.length ? t('selN', this.selected.length) : t('selNone');
    }
  },
  // 轻量选中：只切换高亮类，不重建 DOM（保 dblclick 可用）
  markSelection() {
    this.elWires.querySelectorAll('path.wire').forEach(p => {
      p.classList.toggle('sel', Number(p.dataset.wid) === this.selectedWire);
    });
    this.elWires.querySelectorAll('rect.wp').forEach(r => {
      r.classList.toggle('sel', !!(this.selectedWp && Number(r.dataset.wid) === this.selectedWp.wid && Number(r.dataset.idx) === this.selectedWp.idx));
    });
    this.elBoard.querySelectorAll('.node').forEach(el => {
      el.classList.toggle('sel', this.selected.includes(Number(el.dataset.nid)));
    });
    this.updateSelInfo();
  },
  selectAll() {
    if (!this.circuit) return;
    this.selected = this.circuit.nodes.filter(n => n.type !== 'INPUT' && n.type !== 'OUTPUT').map(n => n.nid);
    this.refresh();
  },

  deleteSelected() {
    if (!this.circuit) return;
    if (this.selectedWp) {
      this.pushHistory();
      const { wid, idx } = this.selectedWp;
      const w = this.circuit.wires.find(x => x.wid === wid);
      if (w) w.pts.splice(idx, 1);
      this.selectedWp = null; this.refresh(); return;
    }
    if (this.selectedWire != null) {
      this.pushHistory();
      this.circuit.wires = this.circuit.wires.filter(w => w.wid !== this.selectedWire);
      this.selectedWire = null; this.refresh(); return;
    }
    if (!this.selected.length) return;
    const locked = this.selected.some(nid => {
      const n = this.nodeById(nid);
      return n && (n.type === 'INPUT' || n.type === 'OUTPUT');
    });
    if (locked) { this.toast(t('tNoDelIO')); return; }
    this.pushHistory();
    const del = new Set(this.selected);
    this.circuit.nodes = this.circuit.nodes.filter(x => !del.has(x.nid));
    this.circuit.wires = this.circuit.wires.filter(w => !del.has(w.from.nid) && !del.has(w.to.nid));
    this.selected = []; this.refresh();
  },

  copySel() {
    if (!this.circuit || !this.selected.length) return;
    const set = new Set(this.selected);
    const nodes = this.circuit.nodes.filter(n => set.has(n.nid) && n.type !== 'INPUT' && n.type !== 'OUTPUT');
    if (!nodes.length) return;
    const minX = Math.min(...nodes.map(n => n.x)), minY = Math.min(...nodes.map(n => n.y));
    const wires = this.circuit.wires.filter(w => set.has(w.from.nid) && set.has(w.to.nid));
    this.clipboard = {
      nodes: nodes.map(n => ({ ...n, x: n.x - minX, y: n.y - minY })),
      wires: wires.map(w => ({ ...w, pts: (w.pts || []).map(p => ({ x: p.x - minX, y: p.y - minY })) })),
    };
    this.toast(t('tCopied', nodes.length));
  },
  pasteSel() {
    if (!this.circuit || !this.clipboard) return;
    const before = this.overlapCount();
    this.pushHistory();
    const w0 = this.toWorld(
      this.elWrap.getBoundingClientRect().left + this.elWrap.clientWidth / 2,
      this.elWrap.getBoundingClientRect().top + this.elWrap.clientHeight / 2
    );
    const map = {};
    const fresh = [];
    for (const n of this.clipboard.nodes) {
      const c = { ...n, nid: this.nidSeq++, x: snapG(w0.x + n.x - 60), y: snapG(w0.y + n.y - 40) };
      delete c.ioName;
      map[n.nid] = c.nid;
      this.circuit.nodes.push(c); fresh.push(c.nid);
      this.renderNode(c);
    }
    for (const w of this.clipboard.wires) {
      if (map[w.from.nid] == null || map[w.to.nid] == null) continue;
      this.circuit.wires.push({
        wid: this.widSeq++,
        from: { nid: map[w.from.nid], pin: w.from.pin },
        to: { nid: map[w.to.nid], pin: w.to.pin },
        pts: w.pts.map(p => ({ x: snapG(w0.x + p.x - 60), y: snapG(w0.y + p.y - 40) })),
      });
    }
    this.selected = fresh; this.selectedWire = null;
    this.settleOverlap(before, null, null);
  },

  // 求值（组合不动点；DFF/REG1 经 state 跨滴答）
  evaluate() {
    const C = this.circuit;
    const vals = {};
    for (const n of C.nodes) {
      vals[n.nid] = {};
      if (n.type === 'INPUT') vals[n.nid]['Q'] = n.val;
      else if (n.type === 'OUTPUT') vals[n.nid]['A'] = null;
      else {
        const d = COMP_DEFS[n.type];
        if (!d) continue;
        if (d.constVal !== undefined) vals[n.nid]['Y'] = d.constVal;
        else if (n.type === 'DFF') { vals[n.nid]['Q'] = (n.state ?? 0); vals[n.nid]['D'] = null; }
        else if (n.type === 'REG1') { vals[n.nid]['Q'] = (n.state ?? 0); vals[n.nid]['EN'] = null; vals[n.nid]['D'] = null; }
        else { d.inputs.forEach(p => vals[n.nid][p] = null); d.outputs.forEach(p => vals[n.nid][p] = null); }
      }
    }
    let unstable = false;
    for (let iter = 0; iter < 120; iter++) {
      let changed = false;
      for (const w of C.wires) {
        const src = vals[w.from.nid]?.[w.from.pin];
        if (src === undefined) continue;
        if (src !== null && vals[w.to.nid][w.to.pin] !== src) { vals[w.to.nid][w.to.pin] = src; changed = true; }
      }
      for (const n of C.nodes) {
        if (n.type === 'INPUT' || n.type === 'OUTPUT') continue;
        const d = COMP_DEFS[n.type];
        if (!d || d.constVal !== undefined) continue;
        if (n.type === 'DFF' || n.type === 'REG1') continue;
        const args = d.inputs.map(p => vals[n.nid][p]);
        if (args.some(v => v === null || v === undefined)) continue;
        for (const o of d.outputs) {
          const f = d.fn[o]; if (!f) continue;
          const v = f(...args);
          if (vals[n.nid][o] !== v) { vals[n.nid][o] = v; changed = true; }
        }
      }
      if (!changed) { unstable = false; break; }
      if (iter === 119) unstable = true;
    }
    let floating = 0;
    for (const n of C.nodes) {
      if (n.type === 'INPUT') continue;
      const d = this.defOf(n);
      for (const p of (d.inputs || [])) {
        if (!C.wires.some(w => w.to.nid === n.nid && w.to.pin === p)) floating++;
      }
    }
    return { vals, unstable, floating };
  },

  tick() {
    if (!this.circuit) return;
    const { vals } = this.evaluate();
    let any = false;
    for (const n of this.circuit.nodes) {
      if (n.type === 'DFF') {
        const d = vals[n.nid]['D'];
        if (d !== null && d !== undefined) { n.state = d; any = true; }
      } else if (n.type === 'REG1') {
        const en = vals[n.nid]['EN'], d = vals[n.nid]['D'];
        if (en !== null && d !== null && en !== undefined && d !== undefined) {
          n.state = (en === 1 ? d : (n.state ?? 0)); any = true;
        }
      }
    }
    this.tickCount++;
    this.updateTickUI();
    this.sampleTimeline();
    this.refresh();
    this.renderTimeline();
    if (any) document.getElementById('sim-state').textContent = '● ' + t('simTick');
  },

  updateTickUI() {
    const el = document.getElementById('tick-count');
    if (el) el.textContent = 'T=' + this.tickCount;
  },
  curTps() {
    const v = parseInt((document.getElementById('tps-sel') || {}).value, 10);
    return [1, 2, 5, 10].includes(v) ? v : 2;
  },

  // 时间轴：每次滴答采样输入/输出/寄存器状态
  sampleTimeline() {
    if (!this.circuit || !this.level || this.level.kind !== 'circuit') return;
    const { vals } = this.evaluate();
    const ins = this.circuit.nodes.filter(n => n.type === 'INPUT').map(n => [n.ioName || t('inLbl'), n.val]);
    const outs = this.circuit.nodes.filter(n => n.type === 'OUTPUT').map(n => [n.ioName || t('outLbl'), vals[n.nid]['A']]);
    const regs = this.circuit.nodes
      .filter(n => n.type === 'DFF' || n.type === 'REG1')
      .map(n => [(COMP_DEFS[n.type].en + '#' + n.nid), (n.state ?? 0)]);
    this.tlFrames.push({ t: this.tickCount, ins, outs, regs });
    if (this.tlFrames.length > 240) this.tlFrames.shift();
  },
  clearTimeline() {
    this.tlFrames = []; this.tickCount = 0;
    this.sampleTimeline(); this.renderTimeline(); this.updateTickUI();
  },
  renderTimeline() {
    const box = document.getElementById('timeline');
    const info = document.getElementById('tl-info');
    if (!box) return;
    const F = this.tlFrames;
    if (!F.length) { box.innerHTML = `<div class="tl-empty">${t('tlEmpty')}</div>`; if (info) info.textContent = ''; return; }
    const sigs = [];
    F[0].ins.forEach(([nm]) => sigs.push({ k: 'i:' + nm, label: t('inLbl') + ' ' + nm }));
    F[0].outs.forEach(([nm]) => sigs.push({ k: 'o:' + nm, label: t('outLbl') + ' ' + nm }));
    F[0].regs.forEach(([nm]) => sigs.push({ k: 'r:' + nm, label: nm }));
    const step = 22, rowH = 26, labW = 96;
    const W = labW + F.length * step + 26;
    const H = sigs.length * rowH + 20;
    const yOf = (r, v) => r * rowH + 5 + (1 - (v ?? 0)) * (rowH - 10) / 2;
    const xOf = i => labW + 8 + i * step;
    const col = v => (v === 1 ? '#ffa726' : v === -1 ? '#4fc3f7' : '#9aa0b0');
    const at = (f, sg) => {
      const arr = sg.k[0] === 'i' ? f.ins : sg.k[0] === 'o' ? f.outs : f.regs;
      const hit = arr.find(x => (sg.k[0] + ':' + x[0]) === sg.k);
      return hit ? hit[1] : null;
    };
    const symT = v => (v == null ? '·' : v === -1 ? '−' : v === 0 ? '0' : '+');
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    sigs.forEach((sg, r) => {
      const yT = r * rowH + 5, yM = r * rowH + rowH / 2, yB = (r + 1) * rowH - 5;
      s += `<line x1="${labW}" y1="${yT}" x2="${W - 8}" y2="${yT}" stroke="#2a3040" stroke-width="1"/>` +
        `<line x1="${labW}" y1="${yM}" x2="${W - 8}" y2="${yM}" stroke="#2a3040" stroke-width="1" stroke-dasharray="3 3"/>` +
        `<line x1="${labW}" y1="${yB}" x2="${W - 8}" y2="${yB}" stroke="#2a3040" stroke-width="1"/>`;
      const lv = at(F[F.length - 1], sg);
      s += `<text x="4" y="${yM + 4}" fill="#9aa1b2" font-size="11">${sg.label}</text>` +
        `<text x="${labW - 22}" y="${yM + 4}" fill="${col(lv)}" font-size="11">${symT(lv)}</text>`;
      let d = '';
      F.forEach((f, i) => {
        const v = at(f, sg);
        const x = xOf(i), y = yOf(r, v == null ? 0 : v);
        if (!i) d += `M ${x} ${y}`;
        else {
          const pv = at(F[i - 1], sg);
          d += ` L ${x} ${yOf(r, pv == null ? 0 : pv)} L ${x} ${y}`;
        }
      });
      s += `<path d="${d}" fill="none" stroke="${col(lv)}" stroke-width="2"/>`;
      F.forEach((f, i) => {
        const v = at(f, sg);
        const y = yOf(r, v == null ? 0 : v);
        s += `<rect x="${xOf(i) - 3}" y="${y - 3}" width="6" height="6" fill="${col(v)}" stroke="#0c0e12" stroke-width="1"><title>T=${f.t} ${sg.label}=${v}</title></rect>`;
      });
    });
    F.forEach((f, i) => { s += `<text x="${xOf(i) - 3}" y="${H - 5}" fill="#6b7385" font-size="9">${f.t}</text>`; });
    s += '</svg>';
    box.innerHTML = s;
    box.scrollLeft = box.scrollWidth;
    if (info) info.textContent = t('tlInfo', F.length, F[0].ins.length, F[0].outs.length, F[0].regs.length);
  },

  // 输入输出总览条
  renderIoPanel() {
    const box = document.getElementById('io-panel');
    if (!box || !this.circuit) return;
    const { vals } = this.evaluate();
    const ins = this.circuit.nodes.filter(n => n.type === 'INPUT');
    const outs = this.circuit.nodes.filter(n => n.type === 'OUTPUT');
    const sym = v => (v == null ? '·' : v === -1 ? '−' : v === 0 ? '0' : '+');
    const cls = v => (v === -1 ? 'v-1' : v === 0 ? 'v0' : v === 1 ? 'v1' : '');
    box.innerHTML =
      `<span class="io-group"><span class="glab">${t('inLbl')}</span>` +
      ins.map((n, i) => `<span class="io-chip in ${cls(n.val)}" data-io="${i}" title="${t('ioToggle')} ${n.ioName}">${n.ioName}=${sym(n.val)}</span>`).join('') + `</span>` +
      `<span class="io-group"><span class="glab">${t('outLbl')}</span>` +
      outs.map(n => { const v = vals[n.nid]['A']; return `<span class="io-chip ${cls(v)}">${n.ioName}=${sym(v)}</span>`; }).join('') + `</span>`;
  },

  resetStates() {
    for (const n of this.circuit.nodes) if (n.type === 'DFF' || n.type === 'REG1') n.state = 0;
  },

  toggleAuto(e) {
    if (this.autoTimer) this.stopAuto();
    else {
      const ms = Math.round(1000 / this.curTps());
      this.autoTimer = setInterval(() => this.tick(), ms);
      const b = e.target || document.getElementById('btn-auto');
      b.classList.add('on'); b.innerHTML = `${ICONS.pause} ${this.curTps()}TPS`;
    }
  },
  stopAuto() {
    if (this.autoTimer) clearInterval(this.autoTimer);
    this.autoTimer = null;
    const b = document.getElementById('btn-auto');
    if (b) { b.classList.remove('on'); b.innerHTML = `${ICONS.play} ${t('autoBtn')}`; }
  },

  // 渲染
  refresh() {
    if (!this.level || this.level.kind !== 'circuit') return;
    const existing = new Set([...this.elBoard.children].map(el => Number(el.dataset.nid)));
    for (const n of this.circuit.nodes) {
      if (!existing.has(n.nid)) this.renderNode(n);
    }
    [...this.elBoard.children].forEach(el => {
      if (!this.circuit.nodes.some(n => n.nid === Number(el.dataset.nid))) el.remove();
    });
    const { vals, unstable, floating } = this.evaluate();
    for (const n of this.circuit.nodes) {
      const el = this.elBoard.querySelector(`[data-nid="${n.nid}"]`);
      if (!el) continue;
      el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
      el.classList.toggle('sel', this.selected.includes(n.nid));
      const badge = el.querySelector('.val');
      if (badge) {
        let v = null, txt = '';
        if (n.type === 'INPUT') { v = n.val; txt = T.sym(v); }
        else if (n.type === 'OUTPUT') { v = vals[n.nid]['A']; txt = v === null ? '…' : T.sym(v); }
        else if (n.type === 'DFF' || n.type === 'REG1') { v = (n.state ?? 0); txt = T.sym(v); }
        else {
          const d = COMP_DEFS[n.type];
          const outs = (d.outputs || []).map(o => vals[n.nid][o]);
          if (outs.length === 1) { v = outs[0]; txt = v === null ? '…' : T.sym(v); }
          else { txt = outs.map(x => x === null ? '·' : T.sym(x)).join(' '); v = null; }
        }
        badge.textContent = txt;
        // 门符号的值牌靠 .nval 绝对定位，重写类名时必须保留，否则会掉进文档流把符号体顶下去
        badge.className = (el.classList.contains('gate') ? 'nval ' : '') + 'val ' + (v === null ? '' : T.cls(v));
      }
      el.querySelectorAll('.pin').forEach(pe => {
        const pin = pe.dataset.pin;
        const v = vals[n.nid]?.[pin];
        const dot = pe.querySelector('.pdot');
        dot.className = 'pdot ' + (v === null || v === undefined ? '' : T.cls(v));
        pe.classList.toggle('pending', !!(this.pending && this.pending.nid === n.nid && this.pending.pin === pin && this.pending.dir === pe.dataset.dir));
      });
    }
    this.applyView();
    this.drawWires(vals, this.planAllRoutes());
    this.renderIoPanel();
    const gates = this.circuit.nodes.filter(n => n.type !== 'INPUT' && n.type !== 'OUTPUT').length;
    const hint = document.getElementById('board-hint');
    if (hint) hint.classList.toggle('quiet', this.circuit.wires.length > 0);
    document.getElementById('stat-gates').textContent = gates;
    this.updateSelInfo();
    const nBad = this._badCount || 0;
    document.getElementById('sim-state').innerHTML =
      nBad ? `${ICONS.warn} ${t('simOverlap', nBad)}` :
      unstable ? `${ICONS.warn} ${t('simLoop')}` :
      floating ? `● ${t('simFloat', floating)}` : `● ${t('simRun')}`;
  },

  // 标准逻辑符号（ANSI Distinctive Shape）。几何约定：
  // 输入钉全在 x=0、输出钉全在 x=w（w 为 22 的倍数），钉间距一格 22px，
  // 钉与符号本体之间画引线，节点吸附网格后钉位必落在网格或半格上，走线天然对齐。
  shapeOf(type) {
    const ST = 'stroke:#8b94a7;stroke-width:1.6;fill:#2b323f';
    const BUB = 'stroke:#8b94a7;stroke-width:1.6;fill:#171a20';
    const TXT = 'fill:#c6ccda;font-family:JetBrains Mono,monospace;font-size:11px;text-anchor:middle';
    const LEAD = 'stroke:#6b7385;stroke-width:1.6';
    const G = GRID;
    const d = COMP_DEFS[type];
    const ni = d.inputs.length, no = d.outputs.length;
    const nr = Math.max(ni, no, 1);
    let h = (nr + 1) * G;
    if (type === 'DFF') h = 3 * G;
    // n 个钉在高 h 的符号上居中排布，间距一格
    const rows = (n) => Array.from({ length: n }, (_, i) => h / 2 + (i - (n - 1) / 2) * G);
    const inY = rows(ni), outY = rows(no);
    let w = 88, body = '', bx0 = 18, bx1 = 70;
    const k = type;
    if (['TMIN', 'TNAND', 'TMAX', 'TNOR'].includes(k)) {
      const isOr = k === 'TMAX' || k === 'TNOR', bub = k === 'TNAND' || k === 'TNOR';
      const c = h / 2, t0 = c - 25, b0 = c + 25;
      body = isOr
        ? `<path class="bd" d="M16 ${t0} Q34 ${c} 16 ${b0} Q50 ${b0} 70 ${c} Q50 ${t0} 16 ${t0} Z" style="${ST}"/>`
        : `<path class="bd" d="M18 ${t0} H44 A25 25 0 0 1 44 ${b0} H18 Z" style="${ST}"/>`;
      bx0 = isOr ? 24 : 18; bx1 = isOr ? 70 : 69;
      if (bub) { body += `<circle cx="${bx1 + 4}" cy="${c}" r="4" style="${BUB}"/>`; bx1 += 8; }
    } else if (['STI', 'NTI', 'PTI', 'ISP', 'ISN', 'ISZ'].includes(k)) {
      const c = h / 2;
      body = `<path class="bd" d="M20 ${c - 16} L60 ${c} L20 ${c + 16} Z" style="${ST}"/>`;
      bx0 = 20; bx1 = 60;
      if (k === 'STI') { body += `<circle cx="64" cy="${c}" r="4" style="${BUB}"/>`; bx1 = 68; }
      const barY = { NTI: c + 7, ISN: c + 7, PTI: c - 7, ISP: c - 7, ISZ: c }[k];
      if (barY !== undefined) body += `<line x1="27" y1="${barY}" x2="37" y2="${barY}" stroke="#ffa726" stroke-width="2.5"/>`;
      if (k === 'ISP' || k === 'ISN' || k === 'ISZ') body += `<circle cx="64" cy="${c}" r="2.5" fill="#ffa726"/>`;
    } else if (k === 'MUX' || k === 'ALU1') {
      body = `<polygon class="bd" points="18,8 66,22 66,${h - 22} 18,${h - 8}" style="${ST}"/>`;
      body += k === 'MUX'
        ? `<path d="M36 ${h / 2 - 9} L46 ${h / 2} L36 ${h / 2 + 9} M46 ${h / 2} L54 ${h / 2}" stroke="#55617a" stroke-width="1.4" fill="none"/>`
        : `<text x="42" y="${h / 2 + 4}" style="${TXT}" font-size="12">ALU</text>`;
      bx0 = 18; bx1 = 66;
    } else if (k === 'CMP') {
      body = `<path class="bd" d="M18 8 L66 ${h / 2} L18 ${h - 8} Z" style="${ST}"/><text x="35" y="${h / 2 + 4}" style="${TXT}" font-size="11">=?</text>`;
      bx0 = 18; bx1 = 66;
    } else if (k === 'DEC') {
      body = `<polygon class="bd" points="20,${h / 2 - 14} 66,8 66,${h - 8} 20,${h / 2 + 14}" style="${ST}"/>` +
        `<path d="M34 ${h / 2} L52 ${outY[0]} M34 ${h / 2} L52 ${outY[1]} M34 ${h / 2} L52 ${outY[2]}" stroke="#55617a" stroke-width="1.4" fill="none"/>`;
      bx0 = 20; bx1 = 66;
    } else if (['C_M', 'C_Z', 'C_P'].includes(k)) {
      const sym = k === 'C_M' ? '−' : k === 'C_Z' ? '0' : '+';
      const col = k === 'C_M' ? '#4fc3f7' : k === 'C_Z' ? '#9aa0b0' : '#ffa726';
      w = 66;
      body = `<circle class="bd" cx="28" cy="${h / 2}" r="15" style="${ST}"/><text x="28" y="${h / 2 + 5}" style="${TXT};fill:${col}" font-size="15">${sym}</text>`;
      bx0 = 13; bx1 = 43;
    } else if (['HADD', 'FADD', 'ADD2', 'SUB2'].includes(k)) {
      w = 132; const c = 12;
      const glyph = { HADD: 'Σ', FADD: 'Σ+', ADD2: 'Σ2', SUB2: 'Σ−' }[k];
      body = `<polygon class="bd" points="${18 + c},4 ${114 - c},4 114,${4 + c} 114,${h - 4 - c} ${114 - c},${h - 4} ${18 + c},${h - 4} 18,${h - 4 - c} 18,${4 + c}" style="${ST}"/>` +
        `<text x="66" y="${h / 2 + 6}" style="${TXT}" font-size="17">${glyph}</text>`;
      bx0 = 18; bx1 = 114;
    } else if (k === 'DFF' || k === 'REG1') {
      w = 110;
      body = `<rect class="bd" x="18" y="4" width="74" height="${h - 8}" style="${ST}"/>` +
        `<rect x="23" y="9" width="64" height="${h - 18}" stroke="#4a5468" stroke-width="1" fill="none"/>` +
        (k === 'DFF'
          ? `<text x="55" y="${h / 2 + 4}" style="${TXT}" font-size="12">D→Q</text>`
          : `<text x="55" y="${h / 2 - 5}" style="${TXT}" font-size="9">EN</text><text x="55" y="${h / 2 + 10}" style="${TXT}" font-size="12">D→Q</text>`);
      bx0 = 18; bx1 = 92;
    } else {
      w = 132;
      body = `<rect class="bd" x="18" y="4" width="96" height="${h - 8}" style="${ST}"/><text x="66" y="${h / 2 + 4}" style="${TXT}">${d.en}</text>`;
      bx0 = 18; bx1 = 114;
    }
    const leads = inY.map(y => `<line x1="0" y1="${y}" x2="${bx0 + 2}" y2="${y}" style="${LEAD}"/>`).join('') +
      outY.map(y => `<line x1="${bx1 - 2}" y1="${y}" x2="${w}" y2="${y}" style="${LEAD}"/>`).join('');
    return {
      w, h,
      svg: leads + body,
      inA: inY.map(y => ({ x: 0, y })),
      outA: outY.map(y => ({ x: w, y })),
    };
  },
  // 元件几何（节点局部坐标）：钉位与包络全部由此算出，不读 DOM
  geomOf(n) {
    if (n.type === 'INPUT') return { w: IO_W, h: IO_H, ins: {}, outs: { Q: { x: IO_W, y: IO_H / 2 } } };
    if (n.type === 'OUTPUT') return { w: IO_W, h: IO_H, ins: { A: { x: 0, y: IO_H / 2 } }, outs: {} };
    if (!this._geo) this._geo = {};
    if (this._geo[n.type]) return this._geo[n.type];
    const s = this.shapeOf(n.type), d = COMP_DEFS[n.type];
    const g = { w: s.w, h: s.h + PT, ins: {}, outs: {} };
    d.inputs.forEach((p, i) => { g.ins[p] = { x: s.inA[i].x, y: s.inA[i].y + PT }; });
    d.outputs.forEach((p, i) => { g.outs[p] = { x: s.outA[i].x, y: s.outA[i].y + PT }; });
    return (this._geo[n.type] = g);
  },

  pinEl(n, p, dir, anchor) {
    const pe = document.createElement('div');
    pe.className = 'pin ' + dir; pe.dataset.pin = p; pe.dataset.dir = dir; pe.dataset.nid = n.nid;
    pe.innerHTML = `<span class="pdot"></span><span class="pl">${p}</span>`;
    pe.style.left = anchor.x + 'px'; pe.style.top = anchor.y + 'px';
    pe.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      this.pinDown(n.nid, p, dir, e);
    });
    return pe;
  },

  renderNode(n) {
    const d = this.defOf(n);
    const isIO = n.type === 'INPUT' || n.type === 'OUTPUT';
    const g = this.geomOf(n);
    const el = document.createElement('div');
    el.dataset.nid = n.nid;
    if (isIO) {
      // 紧凑端子：名字 + 值牌，钉在边缘中线上（输入端点击切换 −/0/+）
      const isIn = n.type === 'INPUT';
      el.className = 'node io' + (isIn ? ' io-in clickable' : ' io-out');
      el.style.width = IO_W + 'px'; el.style.height = IO_H + 'px';
      el.title = isIn ? t('useIn') : t('useOut');
      el.innerHTML = `<span class="ioname">${n.ioName}</span><span class="iokind">${isIn ? t('inLbl') : t('outLbl')}</span><span class="val">…</span>`;
      for (const [p, a] of Object.entries(isIn ? g.outs : g.ins)) el.appendChild(this.pinEl(n, p, isIn ? 'out' : 'in', a));
    } else {
      // 门符号：浮动名牌 + 值 + SVG 符号体 + 边缘钉
      const s = this.shapeOf(n.type);
      el.className = 'node gate';
      el.style.width = s.w + 'px';
      el.innerHTML = `<div class="nhead"><span class="ntag" title="${compName(n.type)} ${d.en}">${compName(n.type)}</span><span class="nval val">…</span></div>` +
        `<svg width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">${s.svg}</svg>`;
      for (const [p, a] of Object.entries(g.ins)) el.appendChild(this.pinEl(n, p, 'in', a));
      for (const [p, a] of Object.entries(g.outs)) el.appendChild(this.pinEl(n, p, 'out', a));
    }
    // 拖动（多选联动，网格吸附；收尾新增重叠先挤空位，无位才回滚）
    let sx = 0, sy = 0, startPos = null, dragging = false, moved = false, histPushed = false, beforeOv = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pin') || e.button !== 0) return;
      if (this.pending && !this.wiring) {
        // 点选连线模式下点到元件本体：接到最近的空闲钉
        const tgt = this.pinNearNode(n, this.toWorld(e.clientX, e.clientY), this.pending.dir === 'out' ? 'in' : 'out');
        if (tgt) { e.stopPropagation(); this.completeTo(tgt); return; }
      }
      if (e.shiftKey) {
        if (!this.selected.includes(n.nid)) this.selected.push(n.nid);
        this.selectedWire = null; this.markSelection(); return;
      }
      if (!this.selected.includes(n.nid)) {
        this.selected = [n.nid]; this.selectedWire = null; this.selectedWp = null;
        this.markSelection();
      }
      dragging = true; moved = false; histPushed = false;
      sx = e.clientX; sy = e.clientY;
      beforeOv = this._badCount || 0;
      startPos = new Map(this.selected.map(id => { const m = this.nodeById(id); return [id, { x: m.x, y: m.y }]; }));
      try { el.setPointerCapture(e.pointerId); } catch {}
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) {
        moved = true;
        if (!histPushed) { this.pushHistory(); histPushed = true; }
        el.classList.add('dragging');
      }
      if (!moved) return;
      const dx = (e.clientX - sx) / this.zoom, dy = (e.clientY - sy) / this.zoom;
      let changed = false;
      for (const [id, o] of startPos) {
        const m = this.nodeById(id);
        if (!m) continue;
        const nx = snapG(Math.max(0, o.x + dx)), ny = snapG(Math.max(0, o.y + dy));
        if (nx === m.x && ny === m.y) continue;
        m.x = nx; m.y = ny; changed = true;
        const mel = this.elBoard.querySelector(`[data-nid="${id}"]`);
        if (mel) { mel.style.left = m.x + 'px'; mel.style.top = m.y + 'px'; }
      }
      // 只在跨格时重绘，且合并到下一帧
      if (changed) this.requestDraw();
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      if (!moved) {
        this.selected = [n.nid]; this.selectedWire = null;
        if (n.type === 'INPUT') { n.val = n.val === -1 ? 0 : n.val === 0 ? 1 : -1; }
        this.refresh();
      } else this.settleNodes(beforeOv, [...startPos.keys()]);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    this.elBoard.appendChild(el);
  },
  // 元件搬动收尾：新增重叠先把这批元件整体挪到附近空位，无位才回滚
  settleNodes(before, ids) {
    const cur = this.overlapCount();
    if (cur <= before) { this.refresh(); return; }
    const orig = ids.map(id => { const m = this.nodeById(id); return m ? [m, m.x, m.y] : null; }).filter(Boolean);
    for (let d = 1; d <= 2; d++) {
      for (let i = -d; i <= d; i++) for (const [dx, dy] of [[i, -d], [i, d], [-d, i], [d, i]]) {
        for (const [m, x, y] of orig) { m.x = Math.max(0, x + dx * GRID); m.y = Math.max(0, y + dy * GRID); }
        if (this.findOverlaps(null, before).length <= before) {
          this.refresh();
          try { this.toast(t('overlapNudged')); } catch {}
          return;
        }
      }
    }
    for (const [m, x, y] of orig) { m.x = x; m.y = y; }
    this.settleOverlap(before, null, null);
  },

  // 连线：按住钉拖到对端（正反向都行），点选两用；靠近对端钉自动吸附
  pinDown(nid, pin, dir, e) {
    // 点选模式第二下：已有起点且方向相反，直接完成
    if (this.pending && !this.wiring && this.pending.dir !== dir && !(this.pending.nid === nid && this.pending.pin === pin)) {
      this.completeTo({ nid, pin, dir });
      return;
    }
    // 已连线的输入钉：拖动 = 拎起这根线从源头改接；原地点 = 选中这根线
    const occupied = dir === 'in' ? (this.circuit.wires.find(w => w.to.nid === nid && w.to.pin === pin) || null) : null;
    let picked = null;
    const before = this._badCount || 0;
    this.pending = occupied ? null : { nid, pin, dir };
    this.wiring = true;
    this.snapTarget = null;
    this.mouse = this.toWorld(e.clientX, e.clientY);
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    if (!occupied) { this.markPending(); this.drawPreview(); }
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) {
        moved = true;
        if (occupied) {
          picked = occupied;
          this.pushHistory();
          this.circuit.wires = this.circuit.wires.filter(w => w !== picked);
          this.pending = { nid: picked.from.nid, pin: picked.from.pin, dir: 'out' };
          this.refresh();
        }
      }
      if (!this.pending) return;
      this.mouse = this.toWorld(ev.clientX, ev.clientY);
      this.snapTarget = this.findSnap(ev);
      if (!this._pvRaf) this._pvRaf = requestAnimationFrame(() => { this._pvRaf = 0; this.drawPreview(); });
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.wiring = false;
      const tgt = moved ? this.findSnap(ev) : null;
      if (tgt) { this.completeTo(tgt, !!picked, before); return; }
      if (!moved && occupied) {
        this.pending = null;
        this.selected = []; this.selectedWp = null; this.selectedWire = occupied.wid;
        this.drawWires(); this.markSelection(); return;
      }
      if (!moved) {
        // 原地点一下：进入点选模式，等第二下（指针移动时预览跟随）
        this.mouse = null; this.drawPreview(); return;
      }
      this.pending = null; this.mouse = null; this.snapTarget = null;
      if (picked) { try { this.toast(t('tUnplug')); } catch {} }
      this.refresh();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },
  // 吸附目标：指针下的对端钉 > 28px 内最近的对端钉 > 指针下元件本体上最近的空闲对端钉
  findSnap(ev) {
    if (!this.pending) return null;
    const want = this.pending.dir === 'out' ? 'in' : 'out';
    const m = this.toWorld(ev.clientX, ev.clientY);
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const pe = el && el.closest ? el.closest('.pin') : null;
    if (pe && pe.dataset.dir === want && this.validTarget(Number(pe.dataset.nid), pe.dataset.pin, want)) {
      return { nid: Number(pe.dataset.nid), pin: pe.dataset.pin, dir: want };
    }
    const R = 28 / this.zoom;
    let best = null, bd = R;
    for (const n of this.circuit.nodes) {
      const g = this.geomOf(n);
      if (m.x < n.x - R || m.x > n.x + g.w + R || m.y < n.y - R || m.y > n.y + g.h + R) continue;
      for (const [p, a] of Object.entries(want === 'in' ? g.ins : g.outs)) {
        const dd = Math.hypot(n.x + a.x - m.x, n.y + a.y - m.y);
        if (dd < bd && this.validTarget(n.nid, p, want)) { bd = dd; best = { nid: n.nid, pin: p, dir: want }; }
      }
    }
    if (best) return best;
    const ne = el && el.closest ? el.closest('.node') : null;
    if (ne) {
      const n = this.nodeById(Number(ne.dataset.nid));
      if (n) return this.pinNearNode(n, m, want);
    }
    return null;
  },
  validTarget(nid, pin, dir) {
    const P = this.pending;
    if (!P) return false;
    if (P.nid === nid) {
      // 只有状态件允许自环（如 DFF.Q → 自己的 D）
      const n = this.nodeById(nid);
      if (!n || !(n.type === 'DFF' || n.type === 'REG1')) return false;
    }
    return true;
  },
  // 元件本体上离 m 最近的对端钉（输入钉优先空闲的）
  pinNearNode(n, m, want) {
    const g = this.geomOf(n);
    let best = null, bd = Infinity;
    for (const [p, a] of Object.entries(want === 'in' ? g.ins : g.outs)) {
      if (!this.validTarget(n.nid, p, want)) continue;
      const busy = want === 'in' && this.circuit.wires.some(w => w.to.nid === n.nid && w.to.pin === p);
      const dd = Math.hypot(n.x + a.x - m.x, n.y + a.y - m.y) + (busy ? 1000 : 0);
      if (dd < bd) { bd = dd; best = { nid: n.nid, pin: p, dir: want }; }
    }
    return best;
  },
  // 完成连线：落到已占用的输入钉则替换旧线
  completeTo(tgt, histDone = false, before) {
    const P = this.pending;
    this.pending = null; this.wiring = false; this.mouse = null; this.snapTarget = null;
    if (!P || !tgt || P.dir === tgt.dir) { this.refresh(); return; }
    const from = P.dir === 'out' ? { nid: P.nid, pin: P.pin } : { nid: tgt.nid, pin: tgt.pin };
    const to = P.dir === 'out' ? { nid: tgt.nid, pin: tgt.pin } : { nid: P.nid, pin: P.pin };
    if (from.nid === to.nid) {
      const n = this.nodeById(from.nid);
      if (!n || !(n.type === 'DFF' || n.type === 'REG1')) { this.toast(t('tNoSelf')); this.refresh(); return; }
    }
    if (before === undefined) before = this._badCount || 0;
    if (!histDone) this.pushHistory();
    const old = this.circuit.wires.find(w => w.to.nid === to.nid && w.to.pin === to.pin);
    if (old) this.circuit.wires = this.circuit.wires.filter(w => w !== old);
    this.circuit.wires.push({ wid: this.widSeq++, from, to, pts: [] });
    if (old) { try { this.toast(t('tReplaced')); } catch {} }
    this.settleOverlap(before, null, null);
  },
  markPending() {
    this.elBoard.querySelectorAll('.pin.pending').forEach(p => p.classList.remove('pending'));
    if (!this.pending) return;
    const el = this.elBoard.querySelector(`[data-nid="${this.pending.nid}"] .pin[data-pin="${this.pending.pin}"][data-dir="${this.pending.dir}"]`);
    if (el) el.classList.add('pending');
  },
  // 连线预览：起点 → 吸附钉或指针，直角虚线；只重画预览层
  drawPreview() {
    const L = this.elPL;
    if (!L) return;
    if (!this.pending) { L.innerHTML = ''; return; }
    const P = this.pending;
    const a = this.wirePoint(P.nid, P.pin, P.dir);
    if (!a) { L.innerHTML = ''; return; }
    const tg = this.snapTarget;
    const b = tg ? this.wirePoint(tg.nid, tg.pin, tg.dir) : (this.mouse || null);
    let s = `<rect x="${a.x - 8}" y="${a.y - 8}" width="16" height="16" fill="none" stroke="#8f7bff" stroke-width="2" stroke-dasharray="4 3"/>`;
    if (b) {
      const pts = P.dir === 'out' ? [a, b] : [b, a];
      s += `<path d="${this.routeThrough(pts)}" fill="none" stroke="${tg ? '#c9bcff' : '#8f7bff'}" stroke-width="2.5" stroke-dasharray="7 5" opacity=".95"/>`;
      if (tg) s += `<rect x="${b.x - 10}" y="${b.y - 10}" width="20" height="20" fill="rgba(143,123,255,.25)" stroke="#c9bcff" stroke-width="2"/>`;
    }
    L.innerHTML = s;
  },

  addWaypoint(wid, pt) {
    const w = this.circuit.wires.find(x => x.wid === wid);
    if (!w) return;
    if (!Array.isArray(w.pts)) w.pts = [];
    const a = this.wirePoint(w.from.nid, w.from.pin, 'out');
    const b = this.wirePoint(w.to.nid, w.to.pin, 'in');
    if (!a || !b) return;
    const poly = [a, ...w.pts, b];
    let best = 0, bd = Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
      const d = this.segDist(pt, poly[i], poly[i + 1]);
      if (d < bd) { bd = d; best = i; }
    }
    const before = this.overlapCount();
    this.pushHistory();
    w.pts.splice(best, 0, { x: snapG(pt.x), y: snapG(pt.y) });
    this.selectedWp = { wid, idx: best };
    this.selectedWire = null;
    this.settleOverlap(before, wid, best);
  },
  segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  },
  dragWaypoint(wid, idx, e) {
    const w = this.circuit.wires.find(x => x.wid === wid);
    if (!w || !w.pts[idx]) return;
    e.stopPropagation();
    const before = this._badCount || 0;
    this.pushHistory();
    this.selectedWp = { wid, idx }; this.selectedWire = null;
    const move = (ev) => {
      const p = this.toWorld(ev.clientX, ev.clientY);
      const q = { x: snapG(p.x), y: snapG(p.y) };
      if (w.pts[idx] && w.pts[idx].x === q.x && w.pts[idx].y === q.y) return;
      w.pts[idx] = q;
      this.requestDraw();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.settleOverlap(before, wid, idx);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },
  // 按住导线本体拖拽：抓取点即时变成可拖的弯折点
  bendWireAt(wid, e) {
    const w = this.circuit.wires.find(x => x.wid === wid);
    if (!w) return;
    const before = this._badCount || 0;
    if (!Array.isArray(w.pts)) w.pts = [];
    const a = this.wirePoint(w.from.nid, w.from.pin, 'out');
    const b = this.wirePoint(w.to.nid, w.to.pin, 'in');
    if (!a || !b) return;
    const grab = this.toWorld(e.clientX, e.clientY);
    const poly = [a, ...w.pts, b];
    let best = 0, bd = Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
      const d = this.segDist(grab, poly[i], poly[i + 1]);
      if (d < bd) { bd = d; best = i; }
    }
    const sx = e.clientX, sy = e.clientY;
    let moved = false, idx = -1;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) <= 4) return;
      if (!moved) {
        moved = true;
        this.pushHistory();
        w.pts.splice(best, 0, { x: snapG(grab.x), y: snapG(grab.y) });
        idx = best;
        this.selectedWp = { wid, idx }; this.selectedWire = null;
        this.selected = [];
        this.suppressClick = true;
        setTimeout(() => this.suppressClick = false, 0);
      }
      const p = this.toWorld(ev.clientX, ev.clientY);
      const q = { x: snapG(p.x), y: snapG(p.y) };
      if (w.pts[idx].x === q.x && w.pts[idx].y === q.y) return;
      w.pts[idx] = q;
      this.requestDraw();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) this.settleOverlap(before, wid, idx);
      // 未拖动：放手，后续 click 事件走选中逻辑
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },

  // 背景手势：框选 / 平移
  bgGesture(e) {
    // 触屏：单指拖空白 = 平移（框选留给鼠标），双指捏合由 initTouch 处理
    if (e.pointerType === 'touch') {
      if (this.pending && !this.wiring) { this.pending = null; this.mouse = null; this.snapTarget = null; this.refresh(); }
      this.panGesture(e); return;
    }
    if (e.button === 1 || e.button === 2 || this.spaceDown) { this.panGesture(e); return; }
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    const wr = this.elWrap.getBoundingClientRect();
    const x0 = sx - wr.left, y0 = sy - wr.top;
    let moved = false;
    const box = this.elBox;
    const move = (ev) => {
      const x1 = ev.clientX - wr.left, y1 = ev.clientY - wr.top;
      if (Math.abs(x1 - x0) + Math.abs(y1 - y0) > 5) moved = true;
      if (!moved) return;
      box.hidden = false;
      const l = Math.min(x0, x1), t = Math.min(y0, y1);
      box.style.left = l + 'px'; box.style.top = t + 'px';
      box.style.width = Math.abs(x1 - x0) + 'px'; box.style.height = Math.abs(y1 - y0) + 'px';
      this._box = { l, t, r: l + Math.abs(x1 - x0), b: t + Math.abs(y1 - y0) };
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      box.hidden = true;
      if (!moved) {
        if (!e.shiftKey) this.clearSelection();
        this.pending = null; this.mouse = null; this.snapTarget = null;
        this.refresh(); return;
      }
      const bb = this._box;
      const hit = [];
      for (const n of this.circuit.nodes) {
        const el = this.elBoard.querySelector(`[data-nid="${n.nid}"]`);
        if (!el) continue;
        // 世界坐标 → 屏幕坐标
        const nx = n.x * this.zoom + this.pan.x, ny = n.y * this.zoom + this.pan.y;
        const nw = el.offsetWidth * this.zoom, nh = el.offsetHeight * this.zoom;
        if (nx < bb.r && nx + nw > bb.l && ny < bb.b && ny + nh > bb.t) hit.push(n.nid);
      }
      this.selected = e.shiftKey ? [...new Set([...this.selected, ...hit])] : hit;
      this.selectedWire = null;
      this.refresh();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },
  panGesture(e) {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ox = this.pan.x, oy = this.pan.y;
    this.panned = false;
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId || this._pinch) return;
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) this.panned = true;
      this.pan.x = ox + (ev.clientX - sx);
      this.pan.y = oy + (ev.clientY - sy);
      this.applyView();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTimeout(() => this.panned = false, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },

  // 钉的世界坐标：纯几何计算（节点坐标 + 钉偏移），不触发布局
  wirePoint(nid, pin, dir) {
    const n = this.nodeById(nid);
    if (!n) return null;
    const a = (dir === 'in' ? this.geomOf(n).ins : this.geomOf(n).outs)[pin];
    return a ? { x: n.x + a.x, y: n.y + a.y } : null;
  },
  pinPos(nid, pin, dir) { return this.wirePoint(nid, pin, dir); },

  // 严格直角走线（无圆角），经过导线节点
  // 直角走线拐点展开（与 routeThrough 同逻辑，供重叠检测复用）
  routePoints(a, pts, b) {
    const out = [{ x: a.x, y: a.y }];
    for (const q of [...(pts || []), b]) {
      const p = out[out.length - 1];
      if (Math.abs(q.x - p.x) < 0.5 || Math.abs(q.y - p.y) < 0.5) out.push({ x: q.x, y: q.y });
      else { out.push({ x: q.x, y: p.y }); out.push({ x: q.x, y: q.y }); }
    }
    return out;
  },
  routeThrough(pts) {
    return this.routePoints(pts[0], pts.slice(1, -1), pts[pts.length - 1])
      .map((p, i) => (i ? 'L' : 'M') + ` ${p.x} ${p.y}`).join(' ');
  },
  // 两段轴对齐线段的共线重叠长度（0 = 不共线/仅交叉）
  overlapLen(s, t) {
    const EPS = 0.5;
    const sH = Math.abs(s.p.y - s.q.y) < EPS, tH = Math.abs(t.p.y - t.q.y) < EPS;
    if (sH && tH && Math.abs(s.p.y - t.p.y) < EPS) {
      const lo = Math.max(Math.min(s.p.x, s.q.x), Math.min(t.p.x, t.q.x));
      const hi = Math.min(Math.max(s.p.x, s.q.x), Math.max(t.p.x, t.q.x));
      return Math.max(0, hi - lo);
    }
    if (!sH && !tH && Math.abs(s.p.x - t.p.x) < EPS) {
      const lo = Math.max(Math.min(s.p.y, s.q.y), Math.min(t.p.y, t.q.y));
      const hi = Math.min(Math.max(s.p.y, s.q.y), Math.max(t.p.y, t.q.y));
      return Math.max(0, hi - lo);
    }
    return 0;
  },
  // 两段轴对齐线段是否构成真正的交叉（垂直相交于内部，端点相接不算）
  segCross(s, t) {
    const EPS = 0.5;
    const sH = Math.abs(s.p.y - s.q.y) < EPS, tH = Math.abs(t.p.y - t.q.y) < EPS;
    if (sH === tH) return false;
    const h = sH ? s : t, v = sH ? t : s;
    const hx1 = Math.min(h.p.x, h.q.x), hx2 = Math.max(h.p.x, h.q.x);
    const vy1 = Math.min(v.p.y, v.q.y), vy2 = Math.max(v.p.y, v.q.y);
    return v.p.x > hx1 + EPS && v.p.x < hx2 - EPS && h.p.y > vy1 + EPS && h.p.y < vy2 - EPS;
  },
  // 两段平行线的间距（不平行或投影不交叠返回 Infinity）
  segGap(s, t) {
    const EPS = 0.5;
    const sH = Math.abs(s.p.y - s.q.y) < EPS, tH = Math.abs(t.p.y - t.q.y) < EPS;
    if (sH && tH) {
      const lo = Math.max(Math.min(s.p.x, s.q.x), Math.min(t.p.x, t.q.x));
      const hi = Math.min(Math.max(s.p.x, s.q.x), Math.max(t.p.x, t.q.x));
      if (hi - lo <= 0) return Infinity;
      return Math.abs(s.p.y - t.p.y);
    }
    if (!sH && !tH) {
      const lo = Math.max(Math.min(s.p.y, s.q.y), Math.min(t.p.y, t.q.y));
      const hi = Math.min(Math.max(s.p.y, s.q.y), Math.max(t.p.y, t.q.y));
      if (hi - lo <= 0) return Infinity;
      return Math.abs(s.p.x - t.p.x);
    }
    return Infinity;
  },
  // 合并判定：两段线算“重叠在一起”当且仅当异网且平行且（共线 >6px / 间距 <6px 并行 >24px）。
  // 同网（同一输出钉出发）的线电气上就是一根，允许共用主干，分叉处画焊点。
  // 交叉、点触、短 stub 一律不算。返回 null 或 {at}（标红点）。
  mergeInfo(s, t) {
    if (s.wid === t.wid || s.net === t.net) return null;
    const EPS = 0.5;
    const sH = Math.abs(s.p.y - s.q.y) < EPS, tH = Math.abs(t.p.y - t.q.y) < EPS;
    if (sH !== tH) return null;
    let gap, run, at;
    if (sH) {
      gap = Math.abs(s.p.y - t.p.y);
      const lo = Math.max(Math.min(s.p.x, s.q.x), Math.min(t.p.x, t.q.x));
      const hi = Math.min(Math.max(s.p.x, s.q.x), Math.max(t.p.x, t.q.x));
      run = hi - lo;
      if (run <= 0) return null;
      at = [(lo + hi) / 2, (s.p.y + t.p.y) / 2];
    } else {
      gap = Math.abs(s.p.x - t.p.x);
      const lo = Math.max(Math.min(s.p.y, s.q.y), Math.min(t.p.y, t.q.y));
      const hi = Math.min(Math.max(s.p.y, s.q.y), Math.max(t.p.y, t.q.y));
      run = hi - lo;
      if (run <= 0) return null;
      at = [(s.p.x + t.p.x) / 2, (lo + hi) / 2];
    }
    if (gap <= EPS) return run > 6 ? { at } : null;
    if (gap < 6 && run > 24) return { at };
    return null;
  },
  segMerged(s, t) { return !!this.mergeInfo(s, t); },
  wireSegsOf(w, pts) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      if (Math.hypot(q.x - p.x, q.y - p.y) < 0.5) continue;
      segs.push({ wid: w.wid, net: w.from.nid + ':' + w.from.pin, p, q });
    }
    return segs;
  },
  // 节点包络盒（世界坐标，往外扩 pad），走线避让障碍用
  nodeBox(nid, pad = 10) {
    const n = this.nodeById(nid);
    if (!n) return null;
    const g = this.geomOf(n);
    return { l: n.x - pad, t: n.y - pad, r: n.x + g.w + pad, b: n.y + g.h + pad };
  },
  // 轴对齐线段是否穿入矩形内部（擦边、点触不算）。
  // esc：引脚逃逸点表（本线两端钉坐标）。端点落在逃逸点 2.5px 内时，该端向内 24px 免检，
  // 于是引脚 stub 永远干净，而穿符号体必被抓住。esc 缺省时行为与旧版一致。
  segHitsBox(s, r, esc) {
    let p = s.p, q = s.q;
    if (esc && esc.length) {
      const trim = (pt, other) => {
        for (const e of esc) {
          if (Math.hypot(pt.x - e.x, pt.y - e.y) < 2.5) {
            const len = Math.hypot(other.x - pt.x, other.y - pt.y);
            if (len <= 24) return null;
            const t = 24 / len;
            return { x: pt.x + (other.x - pt.x) * t, y: pt.y + (other.y - pt.y) * t };
          }
        }
        return pt;
      };
      const p2 = trim(p, q);
      if (!p2) return false;
      const q2 = trim(q, p);
      if (!q2) return false;
      p = p2; q = q2;
    }
    const x1 = p.x, y1 = p.y, x2 = q.x, y2 = q.y;
    if (y1 === y2) {
      if (!(y1 > r.t && y1 < r.b)) return false;
      return Math.min(Math.max(x1, x2), r.r) - Math.max(Math.min(x1, x2), r.l) > 0;
    }
    if (x1 === x2) {
      if (!(x1 > r.l && x1 < r.r)) return false;
      return Math.min(Math.max(y1, y2), r.b) - Math.max(Math.min(y1, y2), r.t) > 0;
    }
    return !(Math.min(x1, x2) > r.r || Math.max(x1, x2) < r.l || Math.min(y1, y2) > r.b || Math.max(y1, y2) < r.t);
  },
  // 自动走线：无手工节点的导线在候选走道里挑一条与异网零重叠的。
  // 有手工节点的线固定不动（用户负责）。返回 Map(wid → 拐点表，含首尾）。
  planAllRoutes() {
    const plan = new Map();
    if (!this.circuit) return plan;
    const W = this.circuit.wires;
    const pinsOf = (w) => {
      const a = this.wirePoint(w.from.nid, w.from.pin, 'out');
      const b = this.wirePoint(w.to.nid, w.to.pin, 'in');
      return (a && b) ? [a, b] : null;
    };
    const pool = [];
    for (const w of W) {
      const ab = pinsOf(w);
      if (!ab) continue;
      if ((w.pts || []).length) {
        const pts = this.routePoints(ab[0], w.pts, ab[1]);
        plan.set(w.wid, pts);
        for (const s of this.wireSegsOf(w, pts)) pool.push(s);
      }
    }
    const boxes = new Map();
    for (const n of this.circuit.nodes) {
      const b = this.nodeBox(n.nid);
      if (b) boxes.set(n.nid, b);
    }
    for (const w of [...W].sort((a, b) => a.wid - b.wid)) {
      if (plan.has(w.wid)) continue;
      const ab = pinsOf(w);
      if (!ab) continue;
      const [A, B] = ab;
      const net = w.from.nid + ':' + w.from.pin;
      // 引脚逃逸：端点盒全部参检（含起止元件），只豁免本线两端钉周 24px。
      // 于是 stub 永远干净，穿符号体必被抓住，逼出紧贴的局部环线而非绕全场。
      const esc = [A, B];
      const obs = [...boxes.values()];
      const midX = (A.x + B.x) / 2, midY = (A.y + B.y) / 2;
      const cands = [
        { pts: [{ x: A.x, y: A.y }, { x: B.x, y: A.y }, { x: B.x, y: B.y }], pen: 0 },
        { pts: [{ x: A.x, y: A.y }, { x: A.x, y: B.y }, { x: B.x, y: B.y }], pen: 1 },
      ];
      const laneSet = new Set();
      const nearPin = (v) => Math.min(Math.abs(v - A.x), Math.abs(v - B.x)) < 8;
      const addLane = (L, basePen) => {
        L = Math.round(L);
        if (laneSet.has(L) || nearPin(L)) return;
        if (laneSet.size > 48) return;
        laneSet.add(L);
        const dist = Math.min(Math.abs(L - midX), Math.abs(L - A.x), Math.abs(L - B.x));
        cands.push({ pts: [{ x: A.x, y: A.y }, { x: L, y: A.y }, { x: L, y: B.y }, { x: B.x, y: B.y }], pen: basePen + dist / GRID });
      };
      const laneSetV = new Set();
      const nearPinV = (v) => Math.min(Math.abs(v - A.y), Math.abs(v - B.y)) < 8;
      const addLaneV = (M, basePen) => {
        M = Math.round(M);
        if (laneSetV.has(M) || nearPinV(M)) return;
        if (laneSetV.size > 48) return;
        laneSetV.add(M);
        const dist = Math.min(Math.abs(M - midY), Math.abs(M - A.y), Math.abs(M - B.y));
        cands.push({ pts: [{ x: A.x, y: A.y }, { x: A.x, y: M }, { x: B.x, y: M }, { x: B.x, y: B.y }], pen: basePen + dist / GRID });
      };
      for (const k of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) addLane(midX + k * GRID, 2);
      for (const k of [1, 2, 3]) { addLane(A.x + k * GRID, 2); addLane(A.x - k * GRID, 2); addLane(B.x + k * GRID, 2); addLane(B.x - k * GRID, 2); }
      for (const k of [1, -1, 2, -2, 3, -3]) addLaneV(midY + k * GRID, 2);
      for (const k of [1, 2, 3]) { addLaneV(A.y + k * GRID, 2); addLaneV(A.y - k * GRID, 2); addLaneV(B.y + k * GRID, 2); addLaneV(B.y - k * GRID, 2); }
      // 障碍边走道：绕行通常贴着障碍边，与 A-B 包络相交的障碍各贡献四条边走道
      const bb = { l: Math.min(A.x, B.x) - 88, t: Math.min(A.y, B.y) - 88, r: Math.max(A.x, B.x) + 88, b: Math.max(A.y, B.y) + 88 };
      for (const r of obs) {
        if (r.r < bb.l || r.l > bb.r || r.b < bb.t || r.t > bb.b) continue;
        addLane(r.l - 12, 3); addLane(r.r + 12, 3);
        addLaneV(r.t - 12, 3); addLaneV(r.b + 12, 3);
      }
      // 外环总线：实在没道就从所有障碍的外面绕（上下左右各一条）
      let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
      for (const [, r] of boxes) {
        if (r.l < minL) minL = r.l; if (r.t < minT) minT = r.t;
        if (r.r > maxR) maxR = r.r; if (r.b > maxB) maxB = r.b;
      }
      if (isFinite(minL)) {
        const T = minT - GRID, Bo = maxB + GRID, L = minL - GRID, R = maxR + GRID;
        cands.push({ pts: [{ x: A.x, y: A.y }, { x: A.x, y: T }, { x: B.x, y: T }, { x: B.x, y: B.y }], pen: 8 });
        cands.push({ pts: [{ x: A.x, y: A.y }, { x: A.x, y: Bo }, { x: B.x, y: Bo }, { x: B.x, y: B.y }], pen: 8 });
        cands.push({ pts: [{ x: A.x, y: A.y }, { x: L, y: A.y }, { x: L, y: B.y }, { x: B.x, y: B.y }], pen: 8 });
        cands.push({ pts: [{ x: A.x, y: A.y }, { x: R, y: A.y }, { x: R, y: B.y }, { x: B.x, y: B.y }], pen: 8 });
      }
      const W8 = this.routeW || (this.routeW = { bad: 1000, body: 150, xing: 30, sep: 60 });
      const scoreOf = (pts) => {
        let bad = 0, crossBody = 0, xing = 0, sep = 0, len = 0, shared = 0;
        const segs = this.wireSegsOf(w, pts);
        for (const s of segs) len += Math.hypot(s.q.x - s.p.x, s.q.y - s.p.y);
        for (const s of segs) {
          for (const o of pool) {
            if (o.net === net) { shared += this.overlapLen(s, o); continue; }
            if (this.segMerged(s, o)) { bad++; break; }
          }
          for (const o of pool) {
            if (o.net !== net && this.segCross(s, o)) { xing++; break; }
          }
          for (const o of pool) {
            if (o.net !== net && this.segGap(s, o) < 20) { sep++; break; }
          }
          for (const r of obs) {
            if (this.segHitsBox(s, r, esc)) { crossBody++; break; }
          }
        }
        return { v: bad * W8.bad + crossBody * W8.body + (len - Math.min(len, shared) * 0.85) / 40 + segs.length * 2 + xing * W8.xing + sep * W8.sep, bad, crossBody, xing };
      };
      let best = cands[0], bestScore = Infinity, bestHard = null;
      for (const c of cands) {
        const sc = scoreOf(c.pts);
        const score = sc.v + c.pen;
        if (score < bestScore) { bestScore = score; best = c; bestHard = sc; }
      }
      // 疑难补救：贪心仍有交叉/穿体时跑一次 A*，赢了才采纳（且不得引入新重叠）
      if (bestHard && (bestHard.xing > 0 || bestHard.crossBody > 0)) {
        const ar = this.astarRoute(A, B, obs, pool, net);
        if (ar) {
          const sc = scoreOf(ar);
          if (sc.bad === 0 && sc.v < bestScore) { best = { pts: ar }; bestScore = sc.v; }
        }
      }
      plan.set(w.wid, best.pts);
      for (const s of this.wireSegsOf(w, best.pts)) pool.push({ ...s, net });
    }
    return plan;
  },
  // 网格 A* 疑难补救：贪心走道仍有交叉/穿体时，对该线做一次方向感知最优搜索。
  // 节点体不可进（起终点格豁免），异网线交叉/贴近按代价绕行。失败返回 null。
  astarRoute(A, B, obsAll, poolSegs, net) {
    const P = 11, BEND = 10, CROSS = 25, NEAR = 6, CAP = 30000;
    const gx = v => Math.round(v / P);
    const x0 = Math.min(A.x, B.x) - 220, y0 = Math.min(A.y, B.y) - 220;
    const x1 = Math.max(A.x, B.x) + 220, y1 = Math.max(A.y, B.y) + 220;
    const C0x = gx(x0), C0y = gx(y0);
    const W = gx(x1) - C0x + 1, H = gx(y1) - C0y + 1;
    if (W <= 1 || H <= 1 || W * H > 60000) return null;
    const N = W * H;
    const blocked = new Uint8Array(N);
    const pen = new Float32Array(N);
    const toC = (wx, wy) => [gx(wx) - C0x, gx(wy) - C0y];
    for (const r of obsAll) {
      const [ax, ay] = toC(r.l, r.t), [bx, by] = toC(r.r, r.b);
      for (let cx = Math.max(0, ax); cx <= Math.min(W - 1, bx); cx++)
        for (let cy = Math.max(0, ay); cy <= Math.min(H - 1, by); cy++)
          blocked[cy * W + cx] = 1;
    }
    const paint = (cx, cy, v) => {
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
      const i = cy * W + cx;
      if (v > pen[i]) pen[i] = v;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const jx = cx + dx, jy = cy + dy;
        if (jx < 0 || jy < 0 || jx >= W || jy >= H) continue;
        const j = jy * W + jx;
        if (NEAR > pen[j]) pen[j] = NEAR;
      }
    };
    for (const s of poolSegs) {
      if (s.net === net) continue;
      const steps = Math.ceil(Math.hypot(s.q.x - s.p.x, s.q.y - s.p.y) / (P / 2)) || 1;
      for (let i = 0; i <= steps; i++) {
        const [cx, cy] = toC(s.p.x + (s.q.x - s.p.x) * i / steps, s.p.y + (s.q.y - s.p.y) * i / steps);
        paint(cx, cy, CROSS);
      }
    }
    const [sx, sy] = toC(A.x, A.y), [ex, ey] = toC(B.x, B.y);
    const si = sy * W + sx, ei = ey * W + ex;
    blocked[si] = 0; blocked[ei] = 0; pen[si] = 0; pen[ei] = 0;
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
    const best = new Float64Array(N * 4).fill(Infinity);
    const parent = new Int32Array(N * 4).fill(-1);
    const heap = [];
    let seq = 0;
    const push = (f, k) => {
      heap.push([f, seq++, k]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] < heap[i][0] || (heap[p][0] === heap[i][0] && heap[p][1] <= heap[i][1])) break;
        const tmp = heap[p]; heap[p] = heap[i]; heap[i] = tmp; i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          const less = (a, b2) => heap[a][0] < heap[b2][0] || (heap[a][0] === heap[b2][0] && heap[a][1] < heap[b2][1]);
          if (l < heap.length && less(l, m)) m = l;
          if (r < heap.length && less(r, m)) m = r;
          if (m === i) break;
          const tmp = heap[m]; heap[m] = heap[i]; heap[i] = tmp; i = m;
        }
      }
      return top;
    };
    const h = (x, y) => Math.abs(x - ex) + Math.abs(y - ey);
    for (let d = 0; d < 4; d++) {
      const k = si * 4 + d;
      best[k] = 0; parent[k] = -2;
      push(h(sx, sy), k);
    }
    let ops = 0, found = -1;
    while (heap.length && ops++ < CAP) {
      const [f, , k] = pop();
      const d = k & 3, pp = k >> 2, cx = pp % W, cy = (pp / W) | 0;
      if (f !== best[k] + h(cx, cy)) continue;
      if (cx === ex && cy === ey) { found = k; break; }
      for (let nd = 0; nd < 4; nd++) {
        const nx = cx + DX[nd], ny = cy + DY[nd];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (blocked[ni]) continue;
        const nk = ni * 4 + nd;
        const g = best[k] + 1 + (nd !== d ? BEND : 0) + pen[ni];
        if (g < best[nk]) { best[nk] = g; parent[nk] = k; push(g + h(nx, ny), nk); }
      }
    }
    if (found < 0) return null;
    const cells = [];
    for (let k = found; k >= 0; k = parent[k]) {
      const d = k & 3, pp = k >> 2;
      cells.push([(pp % W), (pp / W) | 0]);
      if (parent[k] === -2) break;
    }
    cells.reverse();
    // 格点天然直角：方向变化处即拐角，首尾锚定精确引脚并修直角接头
    const wpt = ([cx, cy]) => ({ x: (C0x + cx) * P + P / 2, y: (C0y + cy) * P + P / 2 });
    const corners = [];
    let cdir = -1;
    for (let i = 1; i < cells.length; i++) {
      const dx = cells[i][0] - cells[i - 1][0], dy = cells[i][1] - cells[i - 1][1];
      const nd = dx !== 0 ? 0 : 1;
      if (nd !== cdir) { corners.push(wpt(cells[i - 1])); cdir = nd; }
    }
    corners.push(wpt(cells[cells.length - 1]));
    const raw = [{ x: A.x, y: A.y }, ...corners, { x: B.x, y: B.y }];
    const out = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      const p = out[out.length - 1], q = raw[i];
      const dx = Math.abs(q.x - p.x) < 0.01, dy = Math.abs(q.y - p.y) < 0.01;
      if (dx || dy) {
        if (Math.hypot(q.x - p.x, q.y - p.y) > 0.01) out.push(q);
      } else {
        const j = { x: q.x, y: p.y };
        if (Math.hypot(j.x - p.x, j.y - p.y) > 0.01) out.push(j);
        out.push(q);
      }
    }
    return out;
  },
  // 合并检测：只允许交叉穿过；共线长共干、近距长并行都算“叠在一起”。
  // 同网仅允许钉根部 ≤24px 短共干。返回 [{a, b, at}]（线 wid 对）。
  // cap：找到超过 cap 对即早停（挤位搜索只关心是否超标）。
  findOverlaps(plan, cap) {
    if (!this.circuit) return [];
    if (!plan) plan = this.planAllRoutes();
    if (cap === undefined) cap = Infinity;
    const segs = [];
    for (const w of this.circuit.wires) {
      if (!plan.has(w.wid)) continue;
      for (const s of this.wireSegsOf(w, plan.get(w.wid))) segs.push(s);
    }
    const ov = [];
    const seen = new Set();
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i], t = segs[j];
      const mi = this.mergeInfo(s, t);
      if (!mi) continue;
      const key = s.wid < t.wid ? s.wid + '-' + t.wid : t.wid + '-' + s.wid;
      if (!seen.has(key)) {
        seen.add(key); ov.push({ a: s.wid, b: t.wid, at: mi.at });
        if (ov.length > cap) return ov;
      }
    }
    return ov;
  },
  // 导线审计：每根线的路径首尾必须精确落在两端钉中心（2.5px 内），否则报坏线
  auditWires() {
    if (!this.circuit) return [];
    const bad = [];
    for (const w of this.circuit.wires) {
      const a = this.wirePoint(w.from.nid, w.from.pin, 'out');
      const b = this.wirePoint(w.to.nid, w.to.pin, 'in');
      if (!a || !b) { bad.push({ wid: w.wid, missing: true, ends: ['from', 'to'] }); continue; }
      const d = this.routeThrough([a, ...(w.pts || []), b]);
      const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
      const p0 = [nums[0], nums[1]], p1 = [nums[nums.length - 2], nums[nums.length - 1]];
      const ends = [];
      if (Math.hypot(p0[0] - a.x, p0[1] - a.y) > 2.5) ends.push('from');
      if (Math.hypot(p1[0] - b.x, p1[1] - b.y) > 2.5) ends.push('to');
      if (ends.length) bad.push({ wid: w.wid, missing: false, ends });
    }
    return bad;
  },

  // 导线层整体用字符串一次写入；不用 CSS filter（大画布上逐帧重绘滤镜是拖拽卡顿的主因），
  // 发光改由底层宽描边 halo 承担。
  drawWires(vals, plan) {
    const L = this.elWL;
    if (!L) return;
    if (!this.circuit) { L.innerHTML = ''; return; }
    if (!vals) vals = this.evaluate().vals;
    if (!plan) plan = this.planAllRoutes();
    const colorOf = v => (v === 1 ? '#ffa726' : v === -1 ? '#4fc3f7' : v === 0 ? '#9aa0b0' : '#3a4356');
    const badSet = new Set();
    const badPairs = this.findOverlaps(plan);
    for (const o of badPairs) { badSet.add(o.a); badSet.add(o.b); }
    this._badWires = badSet;
    this._badCount = badPairs.length;
    let halos = '', wires = '', joints = '', wps = '';
    for (const w of this.circuit.wires) {
      if (!plan.has(w.wid)) continue;
      const pts = plan.get(w.wid);
      const a = pts[0], b = pts[pts.length - 1];
      const v = vals[w.from.nid]?.[w.from.pin];
      const col = colorOf(v);
      const live = v !== null && v !== undefined;
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
      const isSel = this.selectedWire === w.wid;
      const isBad = badSet.has(w.wid);
      const stroke = isBad ? '#ff5d5d' : isSel ? '#fff' : col;
      const net = w.from.nid + '-' + w.from.pin;
      halos += `<path d="${d}" class="halo${live || isBad ? ' live' : ''}" stroke="${stroke}"/>`;
      wires += `<path d="${d}" class="hit" data-wid="${w.wid}" data-net="${net}"/>` +
        `<path d="${d}" class="wire${isSel ? ' sel' : ''}${isBad ? ' bad' : ''}${live ? '' : ' dead'}" stroke="${stroke}" data-wid="${w.wid}" data-net="${net}"/>`;
      for (const pt of [a, b]) {
        const s = live ? 8 : 6;
        joints += `<rect x="${pt.x - s / 2}" y="${pt.y - s / 2}" width="${s}" height="${s}" fill="${live ? col : '#20262f'}" stroke="${live ? '#0c0e12' : '#4a5468'}" stroke-width="1.5"/>`;
      }
      (w.pts || []).forEach((pt, idx) => {
        const sel = this.selectedWp && this.selectedWp.wid === w.wid && this.selectedWp.idx === idx;
        wps += `<rect x="${pt.x - 6}" y="${pt.y - 6}" width="12" height="12" class="wp${sel ? ' sel' : ''}" data-wid="${w.wid}" data-wp="1" data-idx="${idx}"/>`;
      });
    }
    // 同网分叉焊点：某个拐点上同网线段合计出现 ≥3 个走向即画实心焊点
    const byNet = new Map();
    for (const w of this.circuit.wires) {
      if (!plan.has(w.wid)) continue;
      const k = w.from.nid + '-' + w.from.pin;
      if (!byNet.has(k)) byNet.set(k, { v: vals[w.from.nid]?.[w.from.pin], segs: [] });
      for (const sg of this.wireSegsOf(w, plan.get(w.wid))) byNet.get(k).segs.push(sg);
    }
    let dots = '';
    for (const { v, segs } of byNet.values()) {
      if (segs.length < 2) continue;
      const seen = new Set();
      for (const sg of segs) for (const pt of [sg.p, sg.q]) {
        const key = Math.round(pt.x) + ',' + Math.round(pt.y);
        if (seen.has(key)) continue;
        seen.add(key);
        const dirs = new Set();
        for (const o of segs) {
          const h = Math.abs(o.p.y - o.q.y) < 0.5;
          const lo = h ? Math.min(o.p.x, o.q.x) : Math.min(o.p.y, o.q.y), hi = h ? Math.max(o.p.x, o.q.x) : Math.max(o.p.y, o.q.y);
          const on = h ? Math.abs(pt.y - o.p.y) < 0.5 && pt.x >= lo - 0.5 && pt.x <= hi + 0.5
            : Math.abs(pt.x - o.p.x) < 0.5 && pt.y >= lo - 0.5 && pt.y <= hi + 0.5;
          if (!on) continue;
          const c = h ? pt.x : pt.y;
          if (c > lo + 0.5) dirs.add(h ? 'L' : 'U');
          if (c < hi - 0.5) dirs.add(h ? 'R' : 'D');
        }
        if (dirs.size >= 3) dots += `<rect x="${pt.x - 5}" y="${pt.y - 5}" width="10" height="10" fill="${colorOf(v)}" stroke="#0c0e12" stroke-width="1.5"/>`;
      }
    }
    L.innerHTML = `<g class="halos">${halos}</g>${wires}<g class="joints">${joints}${dots}</g>${wps}`;
    if (this._hotNet) L.querySelectorAll(`[data-net="${this._hotNet}"]`).forEach(x => x.classList.add('net-hot'));
    this.drawPreview();
  },
  // 测试
  setInputs(arr) {
    const ins = this.circuit.nodes.filter(n => n.type === 'INPUT');
    arr.forEach((v, i) => { if (ins[i]) ins[i].val = v; });
  },
  getOutputs() {
    const { vals } = this.evaluate();
    return this.circuit.nodes.filter(n => n.type === 'OUTPUT').map(n => vals[n.nid]['A']);
  },

  runCombinTests(tests) {
    this.resetStates();
    const rows = [];
    let pass = 0;
    for (const t of tests) {
      this.setInputs(t.in);
      const got = this.getOutputs();
      const ok = got.length === t.out.length && got.every((v, i) => v === t.out[i]);
      if (ok) pass++;
      rows.push({ in: [...t.in], want: [...t.out], got: [...got], ok });
    }
    this.refresh();
    return { pass, total: tests.length, rows };
  },
  runSeqTests(steps) {
    this.resetStates();
    const rows = [];
    let pass = 0;
    // 语义：每步 = 置输入 → 滴答 → 检查输出（滴答后状态）
    steps.forEach((s, idx) => {
      this.setInputs(s.in);
      this.tickSilent();
      const got = this.getOutputs();
      const ok = got.length === s.out.length && got.every((v, i) => v === s.out[i]);
      if (ok) pass++;
      rows.push({ idx, in: [...s.in], want: [...s.out], got: [...got], ok });
    });
    this.refresh();
    return { pass, total: steps.length, rows };
  },
  tickSilent() {
    const { vals } = this.evaluate();
    for (const n of this.circuit.nodes) {
      if (n.type === 'DFF') { const d = vals[n.nid]['D']; if (d !== null && d !== undefined) n.state = d; }
      else if (n.type === 'REG1') { const en = vals[n.nid]['EN'], d = vals[n.nid]['D']; if (en !== null && d !== null && en !== undefined && d !== undefined) n.state = (en === 1 ? d : (n.state ?? 0)); }
    }
  },

  serialize() {
    return JSON.stringify({ v: 2, nodes: this.circuit.nodes, wires: this.circuit.wires, nidSeq: this.nidSeq, widSeq: this.widSeq, pan: this.pan, zoom: this.zoom });
  },
  restore(json) {
    try {
      const o = JSON.parse(json);
      this.circuit = { nodes: o.nodes, wires: o.wires };
      this.nidSeq = o.nidSeq; this.widSeq = o.widSeq;
      for (const w of this.circuit.wires) if (!Array.isArray(w.pts)) w.pts = [];
      if (o.pan) this.pan = o.pan;
      if (o.zoom) this.zoom = o.zoom;
      this.pending = null; this.selected = []; this.selectedWire = null; this.selectedWp = null;
      this.undoStack = []; this.redoStack = [];
      this.elBoard.innerHTML = '';
      for (const n of this.circuit.nodes) this.renderNode(n);
      this.applyView();
      this.refresh();
      return true;
    } catch { return false; }
  },
};
