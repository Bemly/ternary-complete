/* 电路编辑器 + 仿真器
 *
 * 键鼠操作（对标《图灵完备》）：
 * - 按住输出钉 → 拖到输入钉松手：连线（点两下也行）；Esc 取消
 * - 双击导线：添加可拖动的导线节点；拖动节点改线；右键点节点删除该节点
 * - 右键点导线：删除该导线；单击导线：选中（Delete 删除）
 * - 空白处拖拽：框选（Shift 加选）；单击空白：取消选择；拖动元件：多选一起搬（8px 吸附）
 * - 空格/中键/右键拖拽：平移画布；滚轮：以光标为中心缩放
 * - Delete：删除选中；Ctrl+Z / Ctrl+Y（Shift+Z）：撤销/重做；Ctrl+C/V：复制粘贴；Ctrl+A：全选
 */
'use strict';

const WORLD = 4000;

const Editor = {
  circuit: null, level: null,
  pending: null, selected: [], selectedWire: null, selectedWp: null,
  autoTimer: null, nidSeq: 1, widSeq: 1,
  pan: { x: 20, y: 10 }, zoom: 1,
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
      this.refresh(); this.toast('连线已清空');
    };
    document.getElementById('btn-del').onclick = () => this.deleteSelected();
    document.getElementById('btn-tick').onclick = () => { this.tick(); };
    document.getElementById('btn-auto').onclick = (e) => this.toggleAuto(e);

    // 导线：单击选中 / 双击加节点
    this.elWires.addEventListener('click', (e) => {
      const g = e.target.closest('[data-wid]');
      if (this.suppressClick) return;
      if (g && !e.target.closest('[data-wp]')) {
        this.selected = []; this.selectedWp = null;
        this.selectedWire = Number(g.dataset.wid);
        this.refresh();
      }
    });
    this.elWires.addEventListener('dblclick', (e) => {
      const g = e.target.closest('[data-wid]');
      if (g) this.addWaypoint(Number(g.dataset.wid), this.toWorld(e.clientX, e.clientY));
    });
    // 导线节点拖拽（委托）
    this.elWires.addEventListener('pointerdown', (e) => {
      const wp = e.target.closest('[data-wp]');
      if (wp) {
        e.stopPropagation();
        this.dragWaypoint(Number(wp.dataset.wid), Number(wp.dataset.idx), e);
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
        this.selectedWp = null; this.refresh(); return;
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

  // —— 视图变换 ——
  applyView() {
    if (this.elStage) this.elStage.style.transform = `translate(${this.pan.x}px,${this.pan.y}px) scale(${this.zoom})`;
  },
  toWorld(cx, cy) {
    const wr = this.elWrap.getBoundingClientRect();
    return { x: (cx - wr.left - this.pan.x) / this.zoom, y: (cy - wr.top - this.pan.y) / this.zoom };
  },

  // —— 历史（撤销/重做，只记录结构编辑） ——
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
  },

  defOf(node) {
    if (node.type === 'INPUT') return { name: node.ioName || '输入', en: 'IN', inputs: [], outputs: ['Q'] };
    if (node.type === 'OUTPUT') return { name: node.ioName || '输出', en: 'OUT', inputs: ['A'], outputs: [] };
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
      b.innerHTML = `<span>${d.name}</span><small>${d.en}</small>`;
      b.title = d.desc || '';
      b.onclick = () => {
        const w = this.toWorld(
          this.elWrap.getBoundingClientRect().left + this.elWrap.clientWidth / 2,
          this.elWrap.getBoundingClientRect().top + this.elWrap.clientHeight / 2 - 40
        );
        const n = this.addNode(k, Math.round(w.x - 60 + Math.random() * 60), Math.round(w.y + Math.random() * 60));
        this.selected = [n.nid]; this.selectedWire = null; this.refresh();
      };
      pal.appendChild(b);
    });
    if (!(level.palette || []).length && level.kind === 'circuit') {
      pal.innerHTML = '<span style="font-size:12px;color:var(--dim)">本关无需元件，直接连线</span>';
    }
  },

  nodeById(nid) { return this.circuit.nodes.find(n => n.nid === nid); },
  clearSelection() { this.selected = []; this.selectedWire = null; this.selectedWp = null; },
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
    if (locked) { this.toast('输入/输出端子不能删除'); return; }
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
    this.toast(`已复制 ${nodes.length} 个元件`);
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
      const c = { ...n, nid: this.nidSeq++, x: Math.round(w0.x + n.x - 60), y: Math.round(w0.y + n.y - 40) };
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
        pts: w.pts.map(p => ({ x: Math.round(w0.x + p.x - 60), y: Math.round(w0.y + p.y - 40) })),
      });
    }
    this.selected = fresh; this.selectedWire = null;
    this.refresh();
  },

  // —— 求值（组合不动点；DFF/REG1 经 state 跨滴答） ——
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
    this.refresh();
    if (any) document.getElementById('sim-state').textContent = '● 滴答 ✓';
  },

  resetStates() {
    for (const n of this.circuit.nodes) if (n.type === 'DFF' || n.type === 'REG1') n.state = 0;
  },

  toggleAuto(e) {
    if (this.autoTimer) this.stopAuto();
    else {
      this.autoTimer = setInterval(() => this.tick(), 900);
      e.target.classList.add('on'); e.target.textContent = '⏸ 停止';
    }
  },
  stopAuto() {
    if (this.autoTimer) clearInterval(this.autoTimer);
    this.autoTimer = null;
    const b = document.getElementById('btn-auto');
    if (b) { b.classList.remove('on'); b.textContent = '▶ 自动'; }
  },

  // —— 渲染 ——
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
        else if (n.type === 'DFF' || n.type === 'REG1') { v = (n.state ?? 0); txt = T.sym(v) + ' ⌛'; }
        else {
          const d = COMP_DEFS[n.type];
          const outs = (d.outputs || []).map(o => vals[n.nid][o]);
          if (outs.length === 1) { v = outs[0]; txt = v === null ? '…' : T.sym(v); }
          else { txt = outs.map(x => x === null ? '·' : T.sym(x)).join(' '); v = null; }
        }
        badge.textContent = txt;
        badge.className = 'val ' + (v === null ? '' : T.cls(v));
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
    const gates = this.circuit.nodes.filter(n => n.type !== 'INPUT' && n.type !== 'OUTPUT').length;
    document.getElementById('stat-gates').textContent = gates;
    const selEl = document.getElementById('sel-info');
    if (selEl) {
      selEl.textContent =
        this.selectedWp ? '选中：导线节点' :
        this.selectedWire != null ? '选中：导线' :
        this.selected.length ? `选中 ${this.selected.length} 个` : '未选中';
    }
    document.getElementById('sim-state').textContent =
      unstable ? '⚠ 组合环' :
      floating ? `● 运行中 · ${floating}悬空` : '● 运行中 ✓';
  },

  renderNode(n) {
    const d = this.defOf(n);
    const isIO = n.type === 'INPUT' || n.type === 'OUTPUT';
    const el = document.createElement('div');
    el.className = 'node' + (isIO ? ' io' : '') + (n.type === 'INPUT' ? ' io-in clickable' : n.type === 'OUTPUT' ? ' io-out' : '');
    el.dataset.nid = n.nid;
    const title = isIO ? n.ioName : d.name;
    const en = isIO ? (n.type === 'INPUT' ? 'IN −/0/+' : 'OUT') : (d.en || '');
    el.innerHTML = `<div class="nh"><span>${title} <span class="en">${en}</span></span><span class="val">…</span></div>` +
      `<div class="pins"></div>${isIO ? `<div class="use">${n.type === 'INPUT' ? '点击端子切换 −/0/+' : '实时输出'}</div>` : ''}`;
    const pinsBox = el.querySelector('.pins');
    (d.inputs || []).forEach(p => {
      const pe = document.createElement('div');
      pe.className = 'pin in'; pe.dataset.pin = p; pe.dataset.dir = 'in'; pe.dataset.nid = n.nid;
      pe.innerHTML = `<span class="pdot"></span><span class="pl">${p}</span>`;
      pe.addEventListener('pointerdown', (e) => e.stopPropagation());
      pe.onclick = (e) => { e.stopPropagation(); this.onPin(n.nid, p, 'in'); };
      pinsBox.appendChild(pe);
    });
    (d.outputs || []).forEach(p => {
      const pe = document.createElement('div');
      pe.className = 'pin out'; pe.dataset.pin = p; pe.dataset.dir = 'out'; pe.dataset.nid = n.nid;
      pe.innerHTML = `<span class="pl">${p}</span><span class="pdot"></span>`;
      pe.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        this.startWire(n.nid, p);
      });
      pe.onclick = (e) => { e.stopPropagation(); this.onPin(n.nid, p, 'out'); };
      pinsBox.appendChild(pe);
    });
    // 拖动（多选联动，8px 吸附）
    const snap = v => Math.round(v / 8) * 8;
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

  // —— 连线（拖拽 + 点选两用） ——
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
    if (!this.pending) { this.toast('先按住输出钉拖到这里（或先点输出钉再点这里）'); return; }
    this.completeWire(nid, pin);
  },
  completeWire(nid, pin) {
    const from = this.pending;
    this.pending = null; this.wiring = false; this.mouse = null;
    if (!from) { this.refresh(); return; }
    if (this.circuit.wires.some(w => w.to.nid === nid && w.to.pin === pin)) {
      this.toast('该输入已连线（右键点线删除）'); this.refresh(); return;
    }
    if (from.nid === nid) { this.toast('不能连回同一元件'); this.refresh(); return; }
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
    w.pts.splice(best, 0, { x: Math.round(pt.x / 4) * 4, y: Math.round(pt.y / 4) * 4 });
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
      w.pts[idx] = { x: Math.round(p.x / 4) * 4, y: Math.round(p.y / 4) * 4 };
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

  // —— 背景手势：框选 / 平移 ——
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

  // —— 测试 ——
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
