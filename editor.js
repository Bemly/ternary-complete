/* 电路编辑器 + 仿真器
 *
 * 键鼠操作（对标《图灵完备》）：
 * - 按住输出钉 → 拖到输入钉松手：连线（点两下也行）；Esc 取消
 * - 按住导线本体拖拽：抓取点即时弯折改走向；双击加节点；右键点节点删该节点
 * - 右键点导线：删除该导线；单击导线：选中（Delete 删除）
 * - 空白处拖拽：框选（Shift 加选）；单击空白：取消选择；拖动元件：多选一起搬（22px 网格吸附）
 * - 空格/中键/右键拖拽：平移画布；滚轮：以光标为中心缩放
 * - Delete：删除选中；Ctrl+Z / Ctrl+Y（Shift+Z）：撤销/重做；Ctrl+C/V：复制粘贴；Ctrl+A：全选
 */
'use strict';

const WORLD = 4000;
const GRID = 22; // 点阵间距：元件、导线节点、走线弯折全部严格吸附
const snapG = v => Math.round(v / GRID) * GRID;

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
    this.elBoard = document.getElementById('board');
    this.elWires = document.getElementById('wires');
    this.elWrap = document.getElementById('board-wrap');
    this.elStage = document.getElementById('stage');
    this.elBox = document.getElementById('select-box');
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
      this.pending = null; this.clearSelection(); this.refresh();
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
      const z2 = Math.min(2.5, Math.max(0.35, this.zoom * Math.exp(-e.deltaY * 0.0012)));
      this.pan.x = cx - (cx - this.pan.x) * (z2 / this.zoom);
      this.pan.y = cy - (cy - this.pan.y) * (z2 / this.zoom);
      this.zoom = z2;
      this.applyView(); this.drawWires();
    }, { passive: false });

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
    });
    document.addEventListener('keyup', (e) => { if (e.key === ' ') this.spaceDown = false; });
    // 拖拽连线松手落在输入钉上时完成（与 click-click 共存）
    window.addEventListener('pointerup', (e) => {
      if (!this.wiring) return;
      this.wiring = false;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const pin = el && el.closest ? el.closest('.pin.in') : null;
      if (pin) {
        this.suppressClick = true;
        setTimeout(() => this.suppressClick = false, 0);
        this.completeWire(Number(pin.dataset.nid), pin.dataset.pin);
      }
    });
    window.addEventListener('resize', () => this.drawWires());
  },

  // 视图变换
  applyView() {
    if (this.elStage) this.elStage.style.transform = `translate(${this.pan.x}px,${this.pan.y}px) scale(${this.zoom})`;
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
      const n = level.inputs.length, m = level.outputs.length;
      level.inputs.forEach((nm, i) => {
        const y = 80 + i * Math.max(72, Math.min(110, 400 / Math.max(1, n)));
        this.addNode('INPUT', 40, y, { ioName: nm, val: 0 }, true, true);
      });
      level.outputs.forEach((nm, i) => {
        const y = 80 + i * Math.max(72, Math.min(110, 400 / Math.max(1, m)));
        this.addNode('OUTPUT', 720, y, { ioName: nm }, true, true);
      });
    }
    this.buildPalette(level);
    this.applyView();
    this.refresh();
    this.updateTickUI();
    this.sampleTimeline();
    this.renderTimeline();
  },

  defOf(node) {
    if (node.type === 'INPUT') return { name: node.ioName || t('inLbl'), en: 'IN', inputs: [], outputs: ['Q'] };
    if (node.type === 'OUTPUT') return { name: node.ioName || t('outLbl'), en: 'OUT', inputs: ['A'], outputs: [] };
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
    (level.palette || []).forEach(k => {
      const d = COMP_DEFS[k]; if (!d) return;
      const b = document.createElement('button');
      b.className = 'pal-btn';
      b.innerHTML = `<span>${compName(k)}</span><small>${d.en}</small>`;
      b.title = compDesc(k);
      b.onclick = () => {
        const w = this.toWorld(
          this.elWrap.getBoundingClientRect().left + this.elWrap.clientWidth / 2,
          this.elWrap.getBoundingClientRect().top + this.elWrap.clientHeight / 2 - 40
        );
        const n = this.addNode(k, snapG(w.x - 60 + Math.random() * 80), snapG(w.y + Math.random() * 80));
        this.selected = [n.nid]; this.selectedWire = null; this.refresh();
      };
      pal.appendChild(b);
    });
    if (!(level.palette || []).length && level.kind === 'circuit') {
      pal.innerHTML = `<span style="font-size:12px;color:var(--dim)">${t('noGates')}</span>`;
    }
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
    this.refresh();
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
    const ins = this.circuit.nodes.filter(n => n.type === 'INPUT').map(n => [n.ioName || 'IN', n.val]);
    const outs = this.circuit.nodes.filter(n => n.type === 'OUTPUT').map(n => [n.ioName || 'OUT', vals[n.nid]['A']]);
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
    F[0].ins.forEach(([nm]) => sigs.push({ k: 'i:' + nm, label: 'IN ' + nm }));
    F[0].outs.forEach(([nm]) => sigs.push({ k: 'o:' + nm, label: 'OUT ' + nm }));
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
      `<span class="io-group"><span class="glab">IN</span>` +
      ins.map((n, i) => `<span class="io-chip in ${cls(n.val)}" data-io="${i}" title="${t('ioToggle')} ${n.ioName}">${n.ioName}=${sym(n.val)}</span>`).join('') + `</span>` +
      `<span class="io-group"><span class="glab">OUT</span>` +
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
        pe.classList.toggle('pending', !!(this.pending && this.pending.nid === n.nid && this.pending.pin === pin));
      });
    }
    this.applyView();
    this.drawWires(vals);
    this.renderIoPanel();
    const gates = this.circuit.nodes.filter(n => n.type !== 'INPUT' && n.type !== 'OUTPUT').length;
    document.getElementById('stat-gates').textContent = gates;
    this.updateSelInfo();
    document.getElementById('sim-state').innerHTML =
      unstable ? `${ICONS.warn} ${t('simLoop')}` :
      floating ? `● ${t('simFloat', floating)}` : `● ${t('simRun')}`;
  },

  // 标准逻辑符号（ANSI Distinctive Shape），复合块用矩形、常量用圆形端子
  shapeOf(type) {
    const ST = 'stroke:#8b94a7;stroke-width:1.6;fill:#2b323f';
    const BUB = 'stroke:#8b94a7;stroke-width:1.6;fill:#171a20';
    const TXT = 'fill:#c6ccda;font-family:JetBrains Mono,monospace;font-size:11px;text-anchor:middle';
    const spread = (n, lo, hi) => n === 1 ? [(lo + hi) / 2] : Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
    // 2 输入门：AND 系 D 形 / OR 系尖拱形（+ 反相圈 = NAND / NOR）
    if (['TMIN', 'TNAND', 'TMAX', 'TNOR'].includes(type)) {
      const isOr = type === 'TMAX' || type === 'TNOR';
      const bub = type === 'TNAND' || type === 'TNOR';
      const body = isOr
        ? `<path class="bd" d="M14 8 Q34 32 14 56 Q46 56 64 32 Q46 8 14 8 Z" style="${ST}"/>`
        : `<path class="bd" d="M12 8 H40 A24 24 0 0 1 40 56 H12 Z" style="${ST}"/>`;
      const outX = bub ? 72 : 64;
      return {
        w: 84, h: 64,
        svg: body + (bub ? `<circle cx="68" cy="32" r="4" style="${BUB}"/>` : ''),
        inA: spread(2, 22, 42).map(y => ({ x: isOr ? 22 : 12, y })),
        outA: [{ x: outX, y: 32 }],
      };
    }
    // 1 输入门：三角反相（STI 带圈）/ 阈值缓冲（NTI/PTI）/ 判别器（ISP/ISN/ISZ，阈值横杆位置不同）
    if (['STI', 'NTI', 'PTI', 'ISP', 'ISN', 'ISZ'].includes(type)) {
      const bub = type === 'STI';
      const barY = { NTI: 40, ISN: 40, PTI: 16, ISP: 16, ISZ: 28 }[type];
      const outX = bub ? 62 : 54;
      return {
        w: 76, h: 56,
        svg: `<path class="bd" d="M14 8 L54 28 L14 48 Z" style="${ST}"/>` +
          (bub ? `<circle cx="58" cy="28" r="4" style="${BUB}"/>` : '') +
          (barY != null ? `<line x1="24" y1="${barY}" x2="36" y2="${barY}" stroke="#ffa726" stroke-width="2.5"/>` : ''),
        inA: [{ x: 14, y: 28 }],
        outA: [{ x: outX, y: 28 }],
      };
    }
    // MUX：梯形 + 内部汇流线（三路并一路）
    if (type === 'MUX') {
      return {
        w: 84, h: 72,
        svg: `<polygon class="bd" points="12,6 62,14 62,58 12,66" style="${ST}"/>` +
          `<path d="M38 29 L47 36 L38 43 M47 36 L53 36" stroke="#55617a" stroke-width="1.4" fill="none"/>`,
        inA: spread(4, 18, 57).map(y => ({ x: 12, y })),
        outA: [{ x: 62, y: 36 }],
      };
    }
    // CMP：比较器三角 + =?
    if (type === 'CMP') {
      return {
        w: 76, h: 64,
        svg: `<path class="bd" d="M14 8 L60 32 L14 56 Z" style="${ST}"/>` +
          `<text x="33" y="37" style="${TXT}" font-size="12">= ?</text>`,
        inA: spread(2, 22, 42).map(y => ({ x: 14, y })),
        outA: [{ x: 60, y: 32 }],
      };
    }
    // DEC：扩口梯形（一路扇出三路）+ 扇形线
    if (type === 'DEC') {
      return {
        w: 66, h: 84,
        svg: `<polygon class="bd" points="14,26 54,6 54,78 14,58" style="${ST}"/>` +
          `<path d="M30 42 L44 22 M30 42 L44 42 M30 42 L44 62" stroke="#55617a" stroke-width="1.4" fill="none"/>`,
        inA: [{ x: 14, y: 42 }],
        outA: spread(3, 20, 64).map(y => ({ x: 54, y })),
      };
    }
    // 常量：圆形端子
    if (['C_M', 'C_Z', 'C_P'].includes(type)) {
      const sym = type === 'C_M' ? '−' : type === 'C_Z' ? '0' : '+';
      return {
        w: 56, h: 56,
        svg: `<circle class="bd" cx="28" cy="28" r="18" style="${ST}"/><text x="28" y="33" style="${TXT}">${sym}</text>`,
        inA: [],
        outA: [{ x: 46, y: 28 }],
      };
    }
    // 算术块：八角形 + 求和 glyph（HADD Σ / FADD Σ+ / ADD2 Σ2 / SUB2 Σ−）
    if (['HADD', 'FADD', 'ADD2', 'SUB2'].includes(type)) {
      const d = COMP_DEFS[type];
      const ni = d.inputs.length, no = d.outputs.length;
      const H = Math.max(64, Math.max(ni, no) * 20 + 24);
      const c = 12;
      const glyph = { HADD: 'Σ', FADD: 'Σ+', ADD2: 'Σ2', SUB2: 'Σ−' }[type];
      return {
        w: 120, h: H,
        svg: `<polygon class="bd" points="${10 + c},6 ${110 - c},6 110,${6 + c} 110,${H - 6 - c} ${110 - c},${H - 6} ${10 + c},${H - 6} 10,${H - 6 - c} 10,${6 + c}" style="${ST}"/>` +
          `<text x="62" y="${H / 2 + 7}" style="${TXT}" font-size="17">${glyph}</text>`,
        inA: spread(ni, 24, H - 24).map(y => ({ x: 10, y })),
        outA: spread(no, 24, H - 24).map(y => ({ x: 110, y })),
      };
    }
    // 时序块：双线框 + 数据流 glyph（DFF：D→Q / REG：EN 门控 D→Q）
    if (['DFF', 'REG1'].includes(type)) {
      const d = COMP_DEFS[type];
      const ni = d.inputs.length, no = d.outputs.length;
      const H = Math.max(56, Math.max(ni, no) * 20 + 24);
      const glyph = type === 'DFF'
        ? `<text x="60" y="${H / 2 + 4}" style="${TXT}" font-size="12">D→Q</text>`
        : `<text x="60" y="${H / 2 - 6}" style="${TXT}" font-size="9">EN</text>` +
          `<text x="60" y="${H / 2 + 9}" style="${TXT}" font-size="12">D→Q</text>`;
      return {
        w: 120, h: H,
        svg: `<rect class="bd" x="10" y="6" width="100" height="${H - 12}" style="${ST}"/>` +
          `<rect x="15" y="11" width="90" height="${H - 22}" stroke="#4a5468" stroke-width="1" fill="none"/>` +
          glyph,
        inA: spread(ni, 24, H - 24).map(y => ({ x: 10, y })),
        outA: spread(no, 24, H - 24).map(y => ({ x: 110, y })),
      };
    }
    // ALU：高梯形 + 运算 glyph
    if (type === 'ALU1') {
      const d = COMP_DEFS[type];
      const ni = d.inputs.length, no = d.outputs.length;
      const H = Math.max(84, Math.max(ni, no) * 20 + 24);
      return {
        w: 120, h: H,
        svg: `<polygon class="bd" points="12,6 66,14 66,${H - 14} 12,${H - 6}" style="${ST}"/>`,
        inA: spread(ni, 26, H - 26).map(y => ({ x: 12, y })),
        outA: spread(no, 26, H - 26).map(y => ({ x: 66, y })),
      };
    }
    // 兜底：矩形块
    const d = COMP_DEFS[type];
    const ni = d.inputs.length, no = d.outputs.length;
    const H = Math.max(56, Math.max(ni, no) * 20 + 24);
    return {
      w: 120, h: H,
      svg: `<rect class="bd" x="10" y="6" width="100" height="${H - 12}" style="${ST}"/>` +
        `<text x="60" y="${H / 2 + 4}" style="${TXT}">${d.en}</text>`,
      inA: spread(ni, 18, H - 18).map(y => ({ x: 10, y })),
      outA: spread(no, 18, H - 18).map(y => ({ x: 110, y })),
    };
  },

  pinEl(n, p, dir, edge, anchor) {
    const pe = document.createElement('div');
    pe.className = 'pin ' + dir; pe.dataset.pin = p; pe.dataset.dir = dir; pe.dataset.nid = n.nid;
    pe.innerHTML = dir === 'in'
      ? `<span class="pdot"></span><span class="pl">${p}</span>`
      : `<span class="pl">${p}</span><span class="pdot"></span>`;
    if (edge && anchor) { pe.style.left = anchor.x + 'px'; pe.style.top = anchor.y + 'px'; }
    if (dir === 'in') {
      pe.addEventListener('pointerdown', (e) => e.stopPropagation());
      pe.onclick = (e) => { e.stopPropagation(); this.onPin(n.nid, p, 'in'); };
    } else {
      pe.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        this.startWire(n.nid, p);
      });
      pe.onclick = (e) => { e.stopPropagation(); this.onPin(n.nid, p, 'out'); };
    }
    return pe;
  },

  renderNode(n) {
    const d = this.defOf(n);
    const isIO = n.type === 'INPUT' || n.type === 'OUTPUT';
    const el = document.createElement('div');
    if (isIO) {
      el.className = 'node io' + (n.type === 'INPUT' ? ' io-in clickable' : ' io-out');
      el.dataset.nid = n.nid;
      el.innerHTML = `<div class="nh"><span>${n.ioName} <span class="en">${n.type === 'INPUT' ? 'IN −/0/+' : 'OUT'}</span></span><span class="val">…</span></div>` +
        `<div class="pins"></div>${n.type === 'INPUT' ? `<div class="use">${t('useIn')}</div>` : `<div class="use">${t('useOut')}</div>`}`;
      const pinsBox = el.querySelector('.pins');
      (d.inputs || []).forEach(p => pinsBox.appendChild(this.pinEl(n, p, 'in', false)));
      (d.outputs || []).forEach(p => pinsBox.appendChild(this.pinEl(n, p, 'out', false)));
    } else {
      // 门符号：浮动名牌 + 值 + SVG 符号体 + 边缘钉
      const s = this.shapeOf(n.type);
      el.className = 'node gate';
      el.dataset.nid = n.nid;
      el.style.width = s.w + 'px';
      el.innerHTML = `<div class="nhead"><span class="ntag" title="${compName(n.type)} ${d.en}">${compName(n.type)}</span><span class="nval val">…</span></div>` +
        `<svg width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">${s.svg}</svg>`;
      const PT = 24; // 名牌条高度，钉坐标整体下移
      (d.inputs || []).forEach((p, i) => el.appendChild(this.pinEl(n, p, 'in', true, { x: s.inA[i].x, y: s.inA[i].y + PT })));
      (d.outputs || []).forEach((p, i) => el.appendChild(this.pinEl(n, p, 'out', true, { x: s.outA[i].x, y: s.outA[i].y + PT })));
    }
    // 拖动（多选联动，8px 吸附）
    const snap = snapG;
    let sx = 0, sy = 0, startPos = null, dragging = false, moved = false, histPushed = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pin') || e.button !== 0) return;
      if (e.shiftKey) {
        if (!this.selected.includes(n.nid)) this.selected.push(n.nid);
        this.selectedWire = null; this.refresh(); return;
      }
      if (!this.selected.includes(n.nid)) {
        this.selected = [n.nid]; this.selectedWire = null; this.selectedWp = null;
        this.refresh();
      }
      dragging = true; moved = false; histPushed = false;
      sx = e.clientX; sy = e.clientY;
      startPos = new Map(this.selected.map(id => { const m = this.nodeById(id); return [id, { x: m.x, y: m.y }]; }));
      try { el.setPointerCapture(e.pointerId); } catch {}
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = (e.clientX - sx) / this.zoom, dy = (e.clientY - sy) / this.zoom;
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) {
        moved = true;
        if (!histPushed) { this.pushHistory(); histPushed = true; }
      }
      if (!moved) return;
      for (const [id, o] of startPos) {
        const m = this.nodeById(id);
        if (!m) continue;
        m.x = snap(Math.max(-30, o.x + dx));
        m.y = snap(Math.max(0, o.y + dy));
        const mel = this.elBoard.querySelector(`[data-nid="${id}"]`);
        if (mel) { mel.style.left = m.x + 'px'; mel.style.top = m.y + 'px'; }
      }
      this.drawWires();
    });
    el.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      if (!moved) {
        this.selected = [n.nid]; this.selectedWire = null;
        if (n.type === 'INPUT') { n.val = n.val === -1 ? 0 : n.val === 0 ? 1 : -1; }
        this.refresh();
      } else this.refresh();
    });
    this.elBoard.appendChild(el);
  },

  // 连线（拖拽 + 点选两用）
  startWire(nid, pin) {
    this.pending = { nid, pin };
    this.wiring = true;
    const wr = this.elWrap.getBoundingClientRect();
    this.mouse = null;
    const move = (e) => {
      this.mouse = { x: (e.clientX - wr.left - this.pan.x) / this.zoom, y: (e.clientY - wr.top - this.pan.y) / this.zoom };
      this.drawWires();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.refresh();
  },
  onPin(nid, pin, dir) {
    if (this.suppressClick) return;
    if (dir === 'out') {
      // click-click 模式起点
      this.pending = { nid, pin };
      this.refresh(); return;
    }
    // 输入钉：完成连线
    if (!this.pending) { this.toast(t('tFirstOut')); return; }
    this.completeWire(nid, pin);
  },
  completeWire(nid, pin) {
    const from = this.pending;
    this.pending = null; this.wiring = false; this.mouse = null;
    if (!from) { this.refresh(); return; }
    if (this.circuit.wires.some(w => w.to.nid === nid && w.to.pin === pin)) {
      this.toast(t('tInUse')); this.refresh(); return;
    }
    if (from.nid === nid) { this.toast(t('tNoSelf')); this.refresh(); return; }
    this.pushHistory();
    this.circuit.wires.push({ wid: this.widSeq++, from: { ...from }, to: { nid, pin }, pts: [] });
    this.refresh();
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
    this.pushHistory();
    w.pts.splice(best, 0, { x: snapG(pt.x), y: snapG(pt.y) });
    this.selectedWp = { wid, idx: best };
    this.selectedWire = null;
    this.refresh();
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
    this.pushHistory();
    this.selectedWp = { wid, idx }; this.selectedWire = null;
    const move = (ev) => {
      const p = this.toWorld(ev.clientX, ev.clientY);
      w.pts[idx] = { x: snapG(p.x), y: snapG(p.y) };
      this.drawWires();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.refresh();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },
  // 按住导线本体拖拽：抓取点即时变成可拖的弯折点（对标图灵完备的手感）
  bendWireAt(wid, e) {
    const w = this.circuit.wires.find(x => x.wid === wid);
    if (!w) return;
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
      w.pts[idx] = { x: snapG(p.x), y: snapG(p.y) };
      this.drawWires();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) this.refresh();
      // 未拖动：放手，后续 click 事件走选中逻辑
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },

  // 背景手势：框选 / 平移
  bgGesture(e) {
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
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) this.panned = true;
      this.pan.x = ox + (ev.clientX - sx);
      this.pan.y = oy + (ev.clientY - sy);
      this.applyView(); this.drawWires();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTimeout(() => this.panned = false, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },

  wirePoint(nid, pin, dir) {
    const el = this.elBoard.querySelector(`[data-nid="${nid}"]`);
    if (!el) return null;
    const pe = [...el.querySelectorAll('.pin')].find(x => x.dataset.pin === pin && x.dataset.dir === dir);
    if (!pe) return null;
    const dot = pe.querySelector('.pdot');
    const wr = this.elWrap.getBoundingClientRect();
    const r = dot.getBoundingClientRect();
    return {
      x: (r.left - wr.left + r.width / 2 - this.pan.x) / this.zoom,
      y: (r.top - wr.top + r.height / 2 - this.pan.y) / this.zoom,
    };
  },
  pinPos(nid, pin, dir) { return this.wirePoint(nid, pin, dir); },

  // 严格直角走线（无圆角），经过导线节点
  routeThrough(pts) {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.abs(b.x - a.x) < 0.5 || Math.abs(b.y - a.y) < 0.5) d += ` L ${b.x} ${b.y}`;
      else d += ` L ${b.x} ${a.y} L ${b.x} ${b.y}`;
    }
    return d;
  },

  drawWires(vals) {
    const svg = this.elWires;
    svg.innerHTML = '';
    if (!this.circuit) return;
    if (!vals) vals = this.evaluate().vals;
    const NS = 'http://www.w3.org/2000/svg';
    const colorOf = v => (v === 1 ? '#ffa726' : v === -1 ? '#4fc3f7' : v === 0 ? '#9aa0b0' : '#3a4356');
    for (const w of this.circuit.wires) {
      const a = this.wirePoint(w.from.nid, w.from.pin, 'out');
      const b = this.wirePoint(w.to.nid, w.to.pin, 'in');
      if (!a || !b) continue;
      const v = vals[w.from.nid]?.[w.from.pin];
      const col = colorOf(v);
      const live = v !== null && v !== undefined;
      const d = this.routeThrough([a, ...(w.pts || []), b]);
      const isSel = this.selectedWire === w.wid;
      const halo = document.createElementNS(NS, 'path');
      halo.setAttribute('d', d); halo.setAttribute('class', 'halo'); halo.setAttribute('stroke', isSel ? '#fff' : col);
      svg.appendChild(halo);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d); p.setAttribute('class', 'wire' + (isSel ? ' sel' : ''));
      p.setAttribute('stroke', isSel ? '#fff' : col);
      p.setAttribute('opacity', live || isSel ? '.95' : '.55');
      if (live && !isSel) p.style.filter = `drop-shadow(0 0 5px ${col})`;
      p.style.cursor = 'pointer';
      p.dataset.wid = w.wid;
      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('d', d); hit.setAttribute('class', 'hit'); hit.dataset.wid = w.wid;
      svg.appendChild(hit); svg.appendChild(p);
      for (const pt of [a, b]) {
        const j = document.createElementNS(NS, 'rect');
        const s = live ? 9 : 7;
        j.setAttribute('x', pt.x - s / 2); j.setAttribute('y', pt.y - s / 2);
        j.setAttribute('width', s); j.setAttribute('height', s);
        j.setAttribute('fill', live ? col : '#20262f');
        j.setAttribute('stroke', live ? '#fff' : '#4a5468'); j.setAttribute('stroke-width', '1.5');
        j.style.pointerEvents = 'none';
        svg.appendChild(j);
      }
      (w.pts || []).forEach((pt, idx) => {
        const r = document.createElementNS(NS, 'rect');
        const s = 12;
        const sel = this.selectedWp && this.selectedWp.wid === w.wid && this.selectedWp.idx === idx;
        r.setAttribute('x', pt.x - s / 2); r.setAttribute('y', pt.y - s / 2);
        r.setAttribute('width', s); r.setAttribute('height', s);
        r.setAttribute('class', 'wp' + (sel ? ' sel' : ''));
        r.dataset.wid = w.wid; r.dataset.wp = '1'; r.dataset.idx = idx;
        svg.appendChild(r);
      });
    }
    // 连线预览：起点 → 鼠标，直角虚线
    if (this.pending) {
      const a = this.wirePoint(this.pending.nid, this.pending.pin, 'out');
      if (a) {
        const c = document.createElementNS(NS, 'rect');
        c.setAttribute('x', a.x - 7); c.setAttribute('y', a.y - 7);
        c.setAttribute('width', 14); c.setAttribute('height', 14);
        c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#8f7bff'); c.setAttribute('stroke-width', '2');
        c.setAttribute('stroke-dasharray', '4 3');
        svg.appendChild(c);
        const m = this.mouse || { x: a.x + 90, y: a.y + 30 };
        const pv = document.createElementNS(NS, 'path');
        pv.setAttribute('d', this.routeThrough([a, m]));
        pv.setAttribute('fill', 'none'); pv.setAttribute('stroke', '#8f7bff');
        pv.setAttribute('stroke-width', '2.5'); pv.setAttribute('stroke-dasharray', '7 5');
        pv.setAttribute('opacity', '.9'); pv.style.pointerEvents = 'none';
        svg.appendChild(pv);
      }
    }
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
