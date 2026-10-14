/* 电路编辑器 + 仿真器 */
'use strict';

const Editor = {
  circuit: null, level: null,
  pending: null, selected: null, autoTimer: null,
  nidSeq: 1, widSeq: 1,

  elBoard: null, elWires: null, elWrap: null,

  init() {
    this.elBoard = document.getElementById('board');
    this.elWires = document.getElementById('wires');
    this.elWrap = document.getElementById('board-wrap');
    this.mouse = null;
    document.getElementById('btn-clear').onclick = () => {
      if (!this.circuit) return;
      this.circuit.wires = []; this.pending = null;
      this.refresh(); this.toast('连线已清空');
    };
    document.getElementById('btn-del').onclick = () => this.deleteSelected();
    document.getElementById('btn-tick').onclick = () => { this.tick(); };
    document.getElementById('btn-auto').onclick = (e) => this.toggleAuto(e);
    this.elWires.addEventListener('click', (e) => {
      const g = e.target.closest('[data-wid]');
      if (g) {
        this.circuit.wires = this.circuit.wires.filter(w => String(w.wid) !== g.dataset.wid);
        this.refresh();
      }
    });
    this.elWrap.addEventListener('mousemove', (e) => {
      if (!this.pending) return;
      const r = this.elWrap.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.drawWires();
    });
    this.elWrap.addEventListener('mouseleave', () => { this.mouse = null; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'textarea' || tag === 'input') return;
        this.deleteSelected();
      }
      if (e.key === 'Escape') { this.pending = null; this.refresh(); }
    });
    window.addEventListener('resize', () => this.drawWires());
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
    this.pending = null; this.selected = null;
    this.stopAuto();
    this.nidSeq = 1; this.widSeq = 1;
    this.elBoard.innerHTML = '';
    // 放置 IO：输入左轨 / 输出右轨（仿图灵完备边缘端子）
    if (level.kind === 'circuit') {
      const n = level.inputs.length, m = level.outputs.length;
      const W = Math.max(700, this.elWrap.clientWidth || 800);
      level.inputs.forEach((nm, i) => {
        const y = 70 + i * Math.max(64, Math.min(104, 400 / Math.max(1, n)));
        this.addNode('INPUT', 24, y, { ioName: nm, val: 0 }, true);
      });
      level.outputs.forEach((nm, i) => {
        const y = 70 + i * Math.max(64, Math.min(104, 400 / Math.max(1, m)));
        this.addNode('OUTPUT', W - 130, y, { ioName: nm }, true);
      });
    }
    this.buildPalette(level);
    this.refresh();
  },

  defOf(node) {
    if (node.type === 'INPUT') return { name: node.ioName || '输入', en: 'IN', inputs: [], outputs: ['Q'] };
    if (node.type === 'OUTPUT') return { name: node.ioName || '输出', en: 'OUT', inputs: ['A'], outputs: [] };
    return COMP_DEFS[node.type];
  },

  addNode(type, x, y, extra = {}, silent = false) {
    const node = Object.assign({ nid: this.nidSeq++, type, x, y, val: 0, state: 0 }, extra);
    if (COMP_DEFS[type] && COMP_DEFS[type].constVal !== undefined) node.constVal = COMP_DEFS[type].constVal;
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
      b.innerHTML = `${d.name} <small>${d.en}</small>`;
      b.title = d.desc || '';
      b.onclick = () => {
        const r = this.elWrap.getBoundingClientRect();
        const x = 200 + Math.random() * 200, y = 80 + Math.random() * 300;
        const n = this.addNode(k, x, y);
        this.selected = n.nid; this.refresh();
      };
      pal.appendChild(b);
    });
    if (!(level.palette || []).length && level.kind === 'circuit') {
      pal.innerHTML = '<span style="font-size:12px;color:var(--dim)">本关无需元件，直接连线</span>';
    }
  },

  nodeById(nid) { return this.circuit.nodes.find(n => n.nid === nid); },

  deleteSelected() {
    if (!this.selected) { this.toast('先点选一个元件'); return; }
    const n = this.nodeById(this.selected);
    if (!n) return;
    if (n.type === 'INPUT' || n.type === 'OUTPUT') { this.toast('输入/输出端不能删除'); return; }
    this.circuit.nodes = this.circuit.nodes.filter(x => x.nid !== this.selected);
    this.circuit.wires = this.circuit.wires.filter(w => w.from.nid !== this.selected && w.to.nid !== this.selected);
    this.selected = null; this.refresh();
  },

  // —— 求值 ——
  evaluate() {
    const C = this.circuit;
    const vals = {}; // nid -> {pin:val|null}
    for (const n of C.nodes) {
      vals[n.nid] = {};
      if (n.type === 'INPUT') vals[n.nid]['Q'] = n.val;
      else if (n.type === 'OUTPUT') vals[n.nid]['A'] = null;
      else {
        const d = COMP_DEFS[n.type];
        if (!d) continue;
        if (d.constVal !== undefined) vals[n.nid]['Y'] = d.constVal;
        else if (n.type === 'DFF') vals[n.nid]['Q'] = (n.state ?? 0);
        else if (n.type === 'REG1') vals[n.nid]['Q'] = (n.state ?? 0);
        else { d.inputs.forEach(p => vals[n.nid][p] = null); d.outputs.forEach(p => vals[n.nid][p] = null); }
        if (n.type === 'DFF') vals[n.nid]['D'] = vals[n.nid]['D'] ?? null;
        if (n.type === 'REG1') { vals[n.nid]['EN'] = null; vals[n.nid]['D'] = null; }
      }
    }
    // 邻接：input pin -> wire?
    const drivenBy = {};
    for (const w of C.wires) drivenBy[w.to.nid + '::' + w.to.pin] = w;
    let unstable = false;
    for (let iter = 0; iter < 120; iter++) {
      let changed = false;
      // 传线
      for (const w of C.wires) {
        const src = vals[w.from.nid]?.[w.from.pin];
        if (src === undefined) continue;
        if (src !== null && vals[w.to.nid][w.to.pin] !== src) { vals[w.to.nid][w.to.pin] = src; changed = true; }
      }
      // 算门
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
    // 检查悬空输入
    let floating = 0;
    for (const n of C.nodes) {
      if (n.type === 'INPUT') continue;
      const d = this.defOf(n);
      for (const p of (d.inputs || [])) {
        const has = C.wires.some(w => w.to.nid === n.nid && w.to.pin === p);
        if (!has) floating++;
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
      } else if (COMP_DEFS[n.type]?.stateful) {
        // 未来自定义状态件
      }
    }
    this.refresh();
    if (any) document.getElementById('sim-state').textContent = '仿真：滴答 ✓ 状态已推进';
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
    // 同步节点 DOM
    const existing = new Set([...this.elBoard.children].map(el => Number(el.dataset.nid)));
    for (const n of this.circuit.nodes) {
      if (!existing.has(n.nid)) this.renderNode(n);
    }
    // 删多余
    [...this.elBoard.children].forEach(el => {
      if (!this.circuit.nodes.some(n => n.nid === Number(el.dataset.nid))) el.remove();
    });
    // 更新每个节点
    const { vals, unstable, floating } = this.evaluate();
    for (const n of this.circuit.nodes) {
      const el = this.elBoard.querySelector(`[data-nid="${n.nid}"]`);
      if (!el) continue;
      el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
      el.classList.toggle('sel', this.selected === n.nid);
      // 值徽标
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
      // pin 颜色
      el.querySelectorAll('.pin').forEach(pe => {
        const pin = pe.dataset.pin, dir = pe.dataset.dir;
        const v = vals[n.nid]?.[pin];
        const dot = pe.querySelector('.pdot');
        dot.className = 'pdot ' + (v === null || v === undefined ? '' : T.cls(v));
        pe.classList.toggle('pending', !!(this.pending && this.pending.nid === n.nid && this.pending.pin === pin));
      });
    }
    this.drawWires(vals);
    const gates = this.circuit.nodes.filter(n => n.type !== 'INPUT' && n.type !== 'OUTPUT').length;
    document.getElementById('stat-gates').textContent = gates;
    const sel = this.selected ? this.nodeById(this.selected) : null;
    const selEl = document.getElementById('sel-info');
    if (selEl) selEl.textContent = sel ? `选中：${sel.type === 'INPUT' || sel.type === 'OUTPUT' ? sel.ioName : (COMP_DEFS[sel.type]?.name || sel.type)}` : '未选中（点元件选中，Del删除）';
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
    el.innerHTML = `<div class="nh"><span>${title} <span class="en">${en}</span></span><span class="val">…</span></div>
      <div class="pins"></div>${isIO ? `<div class="use">${n.type === 'INPUT' ? '点击端子切换 −/0/+' : '实时输出'}</div>` : ''}`;
    const pinsBox = el.querySelector('.pins');
    (d.inputs || []).forEach(p => {
      const pe = document.createElement('div');
      pe.className = 'pin in'; pe.dataset.pin = p; pe.dataset.dir = 'in'; pe.dataset.nid = n.nid;
      pe.innerHTML = `<span class="pdot"></span><span class="pl">${p}</span>`;
      pe.onclick = (e) => { e.stopPropagation(); this.onPin(n.nid, p, 'in'); };
      pinsBox.appendChild(pe);
    });
    (d.outputs || []).forEach(p => {
      const pe = document.createElement('div');
      pe.className = 'pin out'; pe.dataset.pin = p; pe.dataset.dir = 'out'; pe.dataset.nid = n.nid;
      pe.innerHTML = `<span class="pl">${p}</span><span class="pdot"></span>`;
      pe.onclick = (e) => { e.stopPropagation(); this.onPin(n.nid, p, 'out'); };
      pinsBox.appendChild(pe);
    });
    // 拖拽（网格吸附 8px，仿图灵完备摆放感）
    const snap = v => Math.round(v / 8) * 8;
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pin')) return;
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY; ox = n.x; oy = n.y;
      try { el.setPointerCapture(e.pointerId); } catch {}
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      const W = this.elWrap.clientWidth || 800, H = this.elWrap.clientHeight || 520;
      n.x = snap(Math.max(-20, Math.min(W - 110, ox + dx)));
      n.y = snap(Math.max(0, Math.min(H - 60, oy + dy)));
      el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
      this.drawWires();
    });
    el.addEventListener('pointerup', (e) => {
      dragging = false;
      if (!moved) {
        this.selected = n.nid;
        if (n.type === 'INPUT') { n.val = n.val === -1 ? 0 : n.val === 0 ? 1 : -1; }
        this.refresh();
      }
    });
    this.elBoard.appendChild(el);
  },

  onPin(nid, pin, dir) {
    const n = this.nodeById(nid);
    if (!this.pending) {
      if (dir !== 'out') { this.toast('先点输出钉（右侧），再点输入钉'); return; }
      this.pending = { nid, pin };
      this.refresh(); return;
    }
    // 已有 pending，需点输入钉
    if (dir !== 'in') { this.pending = { nid, pin }; this.refresh(); return; }
    const from = this.pending;
    // 校验：输入钉只能连一根
    if (this.circuit.wires.some(w => w.to.nid === nid && w.to.pin === pin)) {
      this.toast('该输入已连线（点线可删）'); this.pending = null; this.refresh(); return;
    }
    if (from.nid === nid) { this.toast('不能自环到同一元件'); this.pending = null; this.refresh(); return; }
    this.circuit.wires.push({ wid: this.widSeq++, from: { ...from }, to: { nid, pin } });
    this.pending = null;
    this.refresh();
  },

  pinPos(nid, pin, dir) {
    const el = this.elBoard.querySelector(`[data-nid="${nid}"]`);
    if (!el) return null;
    const pe = [...el.querySelectorAll('.pin')].find(x => x.dataset.pin === pin && x.dataset.dir === dir);
    if (!pe) return null;
    const dot = pe.querySelector('.pdot');
    const wr = this.elWrap.getBoundingClientRect();
    const r = dot.getBoundingClientRect();
    return { x: r.left - wr.left + r.width / 2, y: r.top - wr.top + r.height / 2 };
  },

  // 曼哈顿直角走线（仿图灵完备）：水平出 → 垂直 → 水平入，圆角
  manhattan(a, b) {
    const R = 10;
    let mx;
    if (b.x >= a.x + 24) mx = (a.x + b.x) / 2;
    else mx = a.x + 28; // 回绕：先向右再折返
    const pts = [[a.x, a.y], [mx, a.y], [mx, b.y], [b.x, b.y]];
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const dx = nx - x, dy = ny - y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const r = Math.min(R, len / 2);
      const ux = dx / len, uy = dy / len;
      d += ` L ${x - ux * r} ${y - uy * r} Q ${x} ${y} ${x + ux * r} ${y + uy * r}`;
    }
    d += ` L ${b.x} ${b.y}`;
    return d;
  },

  drawWires(vals) {
    const svg = this.elWires;
    const W = this.elWrap.clientWidth, H = this.elWrap.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';
    if (!this.circuit) return;
    if (!vals) vals = this.evaluate().vals;
    const NS = 'http://www.w3.org/2000/svg';
    const colorOf = v => (v === 1 ? '#ffa726' : v === -1 ? '#4fc3f7' : v === 0 ? '#9aa0b0' : '#3a4356');
    for (const w of this.circuit.wires) {
      const a = this.pinPos(w.from.nid, w.from.pin, 'out');
      const b = this.pinPos(w.to.nid, w.to.pin, 'in');
      if (!a || !b) continue;
      const v = vals[w.from.nid]?.[w.from.pin];
      const col = colorOf(v);
      const d = this.manhattan(a, b);
      const live = v !== null && v !== undefined;
      const halo = document.createElementNS(NS, 'path');
      halo.setAttribute('d', d); halo.setAttribute('class', 'halo'); halo.setAttribute('stroke', col);
      svg.appendChild(halo);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d); p.setAttribute('class', 'wire');
      p.setAttribute('stroke', col);
      p.setAttribute('opacity', live ? '.95' : '.55');
      if (live) p.style.filter = `drop-shadow(0 0 5px ${col})`;
      p.style.cursor = 'pointer';
      p.dataset.wid = w.wid;
      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('d', d); hit.setAttribute('class', 'hit'); hit.dataset.wid = w.wid;
      svg.appendChild(hit); svg.appendChild(p);
      // 焊点
      for (const pt of [a, b]) {
        const j = document.createElementNS(NS, 'circle');
        j.setAttribute('cx', pt.x); j.setAttribute('cy', pt.y); j.setAttribute('r', live ? '4' : '3');
        j.setAttribute('fill', live ? col : '#20262f');
        j.setAttribute('stroke', live ? '#fff' : '#4a5468'); j.setAttribute('stroke-width', '1.2');
        j.style.pointerEvents = 'none';
        svg.appendChild(j);
      }
    }
    // pending：起点光环 + 跟随鼠标的直角预览线
    if (this.pending) {
      const a = this.pinPos(this.pending.nid, this.pending.pin, 'out');
      if (a) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', a.x); c.setAttribute('cy', a.y); c.setAttribute('r', '8');
        c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#8f7bff'); c.setAttribute('stroke-width', '2');
        c.setAttribute('stroke-dasharray', '4 3');
        svg.appendChild(c);
        const m = this.mouse || { x: a.x + 90, y: a.y + 30 };
        const pv = document.createElementNS(NS, 'path');
        pv.setAttribute('d', this.manhattan(a, m));
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
    return JSON.stringify({ nodes: this.circuit.nodes, wires: this.circuit.wires, nidSeq: this.nidSeq, widSeq: this.widSeq });
  },
  restore(json) {
    try {
      const o = JSON.parse(json);
      this.circuit = { nodes: o.nodes, wires: o.wires };
      this.nidSeq = o.nidSeq; this.widSeq = o.widSeq;
      this.elBoard.innerHTML = '';
      for (const n of this.circuit.nodes) this.renderNode(n);
      this.refresh();
      return true;
    } catch { return false; }
  },
};
