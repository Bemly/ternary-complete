/* 主应用：独立路线图 + 全屏布线台 + 底部测试条（文案全部经 i18n） */
'use strict';

const store = {
  key: 'ternary-complete-v1',
  load() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } },
  save(o) { localStorage.setItem(this.key, JSON.stringify(o)); },
};
let S = Object.assign({ done: [], cur: 't0_wire', circuits: {}, code: {}, dev: false }, store.load());
if (!LEVELS.some(l => l.id === S.cur)) S.cur = 't0_wire';
if (location.search.includes('dev')) S.dev = true;

let cpuSession = null;
const $ = id => document.getElementById(id);

function toast(m) { Editor.toast(m); }
function persist() { store.save(S); }

// 关卡文案：英文模式且存在覆写则用英文
function LText(lv, f) {
  if (LANG === 'en' && LEVEL_EN[lv.id] && LEVEL_EN[lv.id][f] !== undefined) return LEVEL_EN[lv.id][f];
  return lv[f];
}
function chIndex(lv) { return Math.max(0, CHAPTERS.indexOf(lv.ch)); }
// 解锁规则：第一关、前一关已通过、或开发者模式。插入新关后老存档也能顺着接上
function isUnlocked(i) { return S.dev || i === 0 || S.done.includes(LEVELS[i - 1].id); }
function doneCount() { return S.done.filter(id => LEVELS.some(l => l.id === id)).length; }
function chName(i) { return chList()[i] || ''; }

// 路线图节点符号：各关代表元件的本体（复用布线台 shapeOf），特殊关用定制 glyph。
// 每个符号都给出真实的入钉 pin.in 与出钉 pin.out（符号坐标），关卡之间的导线从上一关出钉接到下一关入钉。
function mapShape(id) {
  const ST = 'stroke:#8b94a7;stroke-width:1.6;fill:#2b323f';
  const TXT = 'fill:#c6ccda;font-family:JetBrains Mono,monospace;text-anchor:middle';
  const LEAD = 'stroke:#6b7385;stroke-width:1.6';
  // 定制 glyph：高 66，左右引线落在中线 y=33，钉在 x=0 与 x=w
  const glyph = (w, body, x0, x1) => ({
    w, h: 66,
    svg: `<line x1="0" y1="33" x2="${x0 + 2}" y2="33" style="${LEAD}"/><line x1="${x1 - 2}" y1="33" x2="${w}" y2="33" style="${LEAD}"/>` + body,
    pin: { in: { x: 0, y: 33 }, out: { x: w, y: 33 } },
  });
  const doc = glyph(88, `<path d="M26 6 H54 L66 18 V60 H26 Z" style="${ST}"/><path d="M54 6 V18 H66" stroke="#4a5468" stroke-width="1.2" fill="none"/><rect x="33" y="27" width="24" height="3" fill="#7c869c"/><rect x="33" y="35" width="24" height="3" fill="#7c869c"/><rect x="33" y="43" width="15" height="3" fill="#7c869c"/>`, 26, 66);
  const custom = {
    t0_wire: { w: 110, h: 66, svg: `<path d="M0 33 H44 V17 H66 V33 H110" stroke="#8b94a7" stroke-width="3" fill="none"/><rect x="40" y="13" width="8" height="8" fill="#ffa726"/><rect x="62" y="29" width="8" height="8" fill="#ffa726"/>`, pin: { in: { x: 0, y: 33 }, out: { x: 110, y: 33 } } },
    t2_mul: glyph(88, `<circle cx="44" cy="33" r="20" style="${ST}"/><path d="M36 25 L52 41 M52 25 L36 41" stroke="#c6ccda" stroke-width="2.2"/>`, 24, 64),
    s3_shift: glyph(110, [16, 44, 72].map(x => `<rect x="${x}" y="21" width="22" height="24" style="${ST}"/>`).join('') + `<path d="M38 33 H44 M66 33 H72" style="${LEAD}"/>`, 16, 94),
    s3_cnt: glyph(88, `<circle cx="44" cy="33" r="22" style="${ST}"/><text x="44" y="39" style="${TXT}" font-size="16">+1</text>`, 22, 66),
    s3_acc: glyph(110, `<rect x="18" y="8" width="74" height="50" style="${ST}"/><rect x="23" y="13" width="64" height="40" stroke="#4a5468" stroke-width="1" fill="none"/><text x="55" y="40" style="${TXT}" font-size="16">Σ</text>`, 18, 92),
    s3_mem: glyph(110, `<rect x="18" y="6" width="74" height="54" style="${ST}"/><line x1="18" y1="24" x2="92" y2="24" stroke="#4a5468" stroke-width="1.2"/><line x1="18" y1="42" x2="92" y2="42" stroke="#4a5468" stroke-width="1.2"/><rect x="24" y="12" width="6" height="6" fill="#ffa726"/><rect x="24" y="30" width="6" height="6" fill="#ffa726"/><rect x="24" y="48" width="6" height="6" fill="#ffa726"/>`, 18, 92),
    c4_pc: glyph(110, `<rect x="18" y="8" width="74" height="50" style="${ST}"/><text x="55" y="38" style="${TXT}" font-size="14">PC</text><path d="M30 50 H80" stroke="#ffa726" stroke-width="2"/>`, 18, 92),
  };
  const lv = LEVELS.find(l => l.id === id);
  if (lv && lv.kind === 'program') return doc;
  if (custom[id]) return custom[id];
  const key = {
    t0_sti: 'STI', t0_min: 'TMIN', t0_max: 'TMAX', t0_thr: 'PTI',
    t1_mux: 'MUX', t1_cmp: 'CMP', t1_dec: 'DEC',
    t2_hadd: 'HADD', t2_fadd: 'FADD', t2_add2: 'ADD2', t2_sub: 'SUB2',
    s3_reg: 'REG1', c4_alu: 'ALU1',
  }[id];
  if (key && typeof Editor !== 'undefined') {
    const sh = Editor.shapeOf(key);
    // 入钉取最靠近出钉高度的那根输入，导线最直
    const out = sh.outA[0];
    const inp = sh.inA.reduce((a, b) => (Math.abs(b.y - out.y) < Math.abs(a.y - out.y) ? b : a), sh.inA[0]);
    return { w: sh.w, h: sh.h, svg: sh.svg, pin: { in: inp, out } };
  }
  return custom.t0_wire;
}

function renderTree() {
  const tree = $('level-tree');
  tree.innerHTML = '';
  const order = LEVELS.map(l => l.id);
  // 布线台式路线图：章节自下而上排布，关卡蛇形走线，导线直角连接
  // 节点本体是元件符号（非矩形卡片），名牌在符号下方
  const MW = 1200, TOP = 100, ROW_H = 178, NW = 150, NH = 118, PER = 5;
  const COLX = c => 300 + c * 200;          // 5 列固定栅格；每行都从左往右，换行导线走行间通道
  const rowsSpec = [];                      // 自下而上：{ ci, lvs, first }
  CHAPTERS.forEach((ch, ci) => {
    const lvs = LEVELS.filter(l => l.ch === ch);
    for (let k = 0; k < lvs.length; k += PER) rowsSpec.push({ ci, lvs: lvs.slice(k, k + PER), first: k === 0 });
  });
  const nRows = rowsSpec.length;
  const H = TOP * 2 + (nRows - 1) * ROW_H;
  const canvas = document.createElement('div');
  canvas.id = 'map-canvas';
  canvas.style.width = MW + 'px';
  canvas.style.height = H + 'px';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', MW); svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${MW} ${H}`);
  canvas.appendChild(svg);
  const pos = {};
  rowsSpec.forEach((row, r) => {
    const cy = H - TOP - r * ROW_H;
    if (row.first) {
      const cn = chName(row.ci).replace(/^[0-9]\s*·\s*/, '');
      const plate = document.createElement('div');
      plate.className = 'mplate';
      plate.style.left = '12px';
      plate.style.top = (cy - 48) + 'px';
      plate.innerHTML = `<b>CHAPTER ${row.ci} · ${cn}</b><small>${t('chDesc')[row.ci] || ''}</small>`;
      canvas.appendChild(plate);
    }
    row.lvs.forEach((lv, i) => {
      const cx = COLX(i);
      pos[lv.id] = { x: cx, y: cy, row: r };
      const idx = order.indexOf(lv.id);
      const unlocked = isUnlocked(idx);
      const done = S.done.includes(lv.id);
      const sub = lv.kind === 'program' ? t('kProg')
        : lv.seq ? `${t('kSeq')} · ${lv.steps().length}${t('uSteps')}`
        : `${t('kComb')} · ${lv.tests().length}${t('uTests')}`;
      const b = document.createElement('button');
      b.className = 'mcell' + (done ? ' done' : '') + (S.cur === lv.id ? ' cur' : '');
      b.disabled = !unlocked;
      b.dataset.lv = lv.id;
      b.style.left = (cx - NW / 2) + 'px';
      b.style.top = (cy - NH / 2) + 'px';
      b.style.width = NW + 'px';
      const sh = mapShape(lv.id);
      const sc = Math.min(130 / sh.w, 60 / sh.h);
      const sw = Math.round(sh.w * sc), shh = Math.round(sh.h * sc);
      b.innerHTML = `<span class="mshape"><svg width="${sw}" height="${shh}" viewBox="0 0 ${sh.w} ${sh.h}">${sh.svg}</svg></span>` +
        `<span class="mcap"><b>${LText(lv, 'name')}</b><small>${sub}</small></span>` +
        `<span class="midx">${String(idx + 1).padStart(2, '0')}</span>` +
        `<span class="mst">${done ? '✓' : unlocked ? (S.cur === lv.id ? '●' : '→') : ICONS.lock}</span>`;
      b.onclick = () => loadLevel(lv.id);
      canvas.appendChild(b);
    });
  });
  // 关卡之间的连接导线（全局线性顺序）：上一关符号的出钉 → 下一关符号的入钉。
  // 钉的屏幕位置 = 符号 svg 的实测位置 + 钉坐标 × 缩放；必须先把 canvas 挂进文档再量。
  // 同行：出钉右侧拐一次直角接入钉；换行：出钉 → 右侧短引 → 行间通道 → 下一行首个元件左侧 → 入钉。
  tree.appendChild(canvas);
  const cr = canvas.getBoundingClientRect();
  const pinOf = (id, which) => {
    const svgEl = canvas.querySelector(`[data-lv="${id}"] .mshape svg`);
    const r = svgEl.getBoundingClientRect();
    const sh = mapShape(id), k = r.width / sh.w;
    const p = sh.pin[which];
    return { x: Math.round(r.left - cr.left + p.x * k), y: Math.round(r.top - cr.top + p.y * k) };
  };
  for (let i = 0; i < order.length - 1; i++) {
    const A = pos[order[i]], B = pos[order[i + 1]];
    const bDone = S.done.includes(order[i + 1]);
    const bUn = isUnlocked(i + 1);
    const p = pinOf(order[i], 'out'), q = pinOf(order[i + 1], 'in');
    let pts;
    if (A.row === B.row) {
      const mx = Math.round((p.x + q.x) / 2);
      pts = Math.abs(p.y - q.y) < 1 ? [p, q] : [p, { x: mx, y: p.y }, { x: mx, y: q.y }, q];
    } else {
      const chY = Math.round((A.y + B.y) / 2) + 2;     // 行间通道（两行之间正中）
      const ex = p.x + 16, ix = q.x - 16;
      pts = [p, { x: ex, y: p.y }, { x: ex, y: chY }, { x: ix, y: chY }, { x: ix, y: q.y }, q];
    }
    const cls = bDone ? 'ok' : bUn ? 'live' : 'dim';
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', Editor.routeThrough(pts));
    path.setAttribute('class', 'mwire ' + cls);
    svg.appendChild(path);
    for (const pt of [p, q]) {
      const j = document.createElementNS(NS, 'rect');
      j.setAttribute('x', pt.x - 4); j.setAttribute('y', pt.y - 4);
      j.setAttribute('width', 8); j.setAttribute('height', 8);
      j.setAttribute('class', 'mjunc ' + cls);
      svg.appendChild(j);
    }
  }
  $('stat-progress').textContent = `${doneCount()}/${LEVELS.length}`;
  const devBtn = $('btn-dev');
  if (devBtn) {
    devBtn.innerHTML = (S.dev ? ICONS.unlock : ICONS.lock) + `<span>${S.dev ? t('devOn') : t('devOff')}</span>`;
    devBtn.classList.toggle('on', !!S.dev);
  }
}

function showMap() {
  saveCurrent();
  // 先显形再渲染：路线图导线端点需实测符号墨盒，藏着量全是 0
  $('map-view').hidden = false;
  $('game-view').hidden = true;
  renderTree();
  // 路线图很长：滚到当前关卡附近
  const cur = document.querySelector('.mcell.cur') || document.querySelector('.mcell:not(:disabled):not(.done)');
  if (cur) cur.scrollIntoView({ block: 'center' });
  $('level-kicker').textContent = t('crumbMap');
  $('level-name-top').textContent = t('crumbPick');
}
function showGame() {
  $('map-view').hidden = true;
  $('game-view').hidden = false;
}

function ioLegend(lv) {
  if (lv.kind === 'program') return `${t('lgProg')} · ${lv.progTests().length} ${t('uTests')}`;
  if (lv.seq) return `${t('lgSeq')} · ${lv.steps().length} ${t('uSteps')} · ${lv.inputs.join(' ')} → ${lv.outputs.join(' ')}`;
  const n = lv.tests ? lv.tests().length : 0;
  return `${t('lgComb')} · ${n} ${t('uTests')} · ${lv.inputs.join(' ')} → ${lv.outputs.join(' ')}`;
}

function loadLevel(id) {
  const lv = LEVELS.find(l => l.id === id);
  if (!lv) return;
  saveCurrent();
  S.cur = id; persist();
  showGame();
  const nn = String(LEVELS.indexOf(lv) + 1).padStart(2, '0');
  const ch = chName(chIndex(lv));
  $('level-kicker').textContent = `${t('chTag')}${ch} · ${nn}/${LEVELS.length}`;
  $('level-name-top').textContent = LText(lv, 'name');
  $('level-kicker2').textContent = `${t('chTag')}${ch}`;
  $('level-name').textContent = LText(lv, 'name');
  $('level-desc').textContent = LText(lv, 'desc');
  $('theory').innerHTML = LText(lv, 'theory');
  $('level-hint').textContent = LText(lv, 'hint');
  $('info-kicker').textContent = `${t('chTag')}${ch} · ${ioLegend(lv)}`;
  $('info-title').textContent = LText(lv, 'name');
  $('info-theory').innerHTML = LText(lv, 'theory');
  $('info-hint').textContent = LText(lv, 'hint');
  $('io-sub').textContent = ioLegend(lv);
  $('io-legend').innerHTML =
    lv.kind === 'circuit'
      ? `${t('inLbl')} <b>${lv.inputs.join(' · ')}</b> → ${t('outLbl')} <b>${lv.outputs.join(' · ')}</b>`
      : t('cpuRegs');
  $('test-summary').textContent = t('noRun');
  $('test-summary').className = '';
  $('test-table').innerHTML = '';
  $('drawer-body').hidden = true;
  $('drawer-toggle').innerHTML = `<span>${t('expand')}</span>`;
  const isProg = lv.kind === 'program';
  $('board-wrap').style.display = isProg ? 'none' : '';
  $('palette-rail').style.display = isProg ? 'none' : '';
  $('timeline-strip').style.display = (isProg || !lv.seq || !Editor.tlOn) ? 'none' : '';
  $('cpu-panel').hidden = !isProg;
  $('game-view').classList.toggle('comb', isProg || !lv.seq);
  $('game-view').classList.toggle('prog', isProg);
  if (!isProg) {
    Editor.loadLevel(lv);
    const saved = S.circuits[id];
    if (saved) Editor.restore(saved);
  } else {
    const en = (LANG === 'en' && LEVEL_EN[id] && LEVEL_EN[id].starter) ? LEVEL_EN[id].starter : null;
    const codeEl = $('cpu-code');
    codeEl.value = S.code[id] || en || lv.starter || '';
    cpuReset();
    renderCpuTestsPreview(lv);
  }
  renderTree();
  if (!isProg) requestAnimationFrame(() => { Editor.fitView(); Editor.refresh(); });
}

function saveCurrent() {
  const lv = LEVELS.find(l => l.id === S.cur);
  if (!lv) return;
  if (lv.kind === 'circuit' && Editor.circuit) S.circuits[S.cur] = Editor.serialize();
  if (lv.kind === 'program') {
    const el = $('cpu-code');
    if (el) S.code[S.cur] = el.value;
  }
  persist();
}
setInterval(saveCurrent, 4000);

function fmtT(v) { return v === null || v === undefined ? '·' : (v === -1 ? '−' : v === 0 ? '0' : '+'); }

function showRowsCombin(lv, res) {
  const tEl = $('test-table');
  const ih = lv.inputs.map(x => `<th>${x}</th>`).join('');
  const oh = lv.outputs.map(x => `<th>${x} ${t('thExp')}</th>`).join('');
  const gh = lv.outputs.map(x => `<th>${x} ${t('thGot')}</th>`).join('');
  let html = `<tr><th>#</th>${ih}${oh}${gh}<th></th></tr>`;
  const show = res.rows.length > 40 ? [...res.rows.slice(0, 20), null, ...res.rows.slice(-10)] : res.rows;
  show.forEach((r) => {
    if (!r) { html += `<tr><td colspan="20" style="color:var(--dim)">${t('omitRow', res.rows.length - 30)}</td></tr>`; return; }
    html += `<tr class="${r.ok ? 'pass' : 'fail'}"><td>${res.rows.indexOf(r) + 1}</td>${r.in.map(v => `<td>${fmtT(v)}</td>`).join('')}${r.want.map(v => `<td>${fmtT(v)}</td>`).join('')}${r.got.map(v => `<td>${fmtT(v)}</td>`).join('')}<td class="${r.ok ? 'c-ok' : 'c-bad'}">${r.ok ? '✓' : '✗'}</td></tr>`;
  });
  tEl.innerHTML = html;
  const s = $('test-summary');
  s.textContent = res.pass === res.total ? t('sumPassC', res.pass, res.total) : t('sumFailC', res.pass, res.total);
  s.className = res.pass === res.total ? 'ok' : 'bad';
  expandDrawer();
}

function showRowsSeq(lv, res) {
  const tEl = $('test-table');
  let html = `<tr><th>${t('thStep')}</th>${lv.inputs.map(x => `<th>${x}</th>`).join('')}${lv.outputs.map(x => `<th>${x} ${t('thExp')}</th>`).join('')}${lv.outputs.map(x => `<th>${x} ${t('thGot')}</th>`).join('')}<th></th></tr>`;
  res.rows.forEach(r => {
    html += `<tr class="${r.ok ? 'pass' : 'fail'}"><td>${r.idx + 1}</td>${r.in.map(v => `<td>${fmtT(v)}</td>`).join('')}${r.want.map(v => `<td>${fmtT(v)}</td>`).join('')}${r.got.map(v => `<td>${fmtT(v)}</td>`).join('')}<td class="${r.ok ? 'c-ok' : 'c-bad'}">${r.ok ? '✓' : '✗'}</td></tr>`;
  });
  tEl.innerHTML = html;
  const s = $('test-summary');
  s.textContent = res.pass === res.total ? t('sumPassS', res.pass, res.total) : t('sumFailS', res.pass, res.total);
  s.className = res.pass === res.total ? 'ok' : 'bad';
  expandDrawer();
}

function progTestsOf(lv) {
  if (LANG === 'en' && LEVEL_EN[lv.id] && LEVEL_EN[lv.id].progTests) return LEVEL_EN[lv.id].progTests();
  return lv.progTests();
}

function win(lv) {
  if (!S.done.includes(lv.id)) { S.done.push(lv.id); persist(); }
  renderTree();
  $('win-title').textContent = LText(lv, 'name') + ' ' + t('winClear');
  $('win-text').textContent = LText(lv, 'win') || t('winDefault');
  const extra = [];
  if (lv.kind === 'circuit' && Editor.circuit) extra.push(t('winGates', Editor.circuit.nodes.filter(n => n.type !== 'INPUT' && n.type !== 'OUTPUT').length));
  const i = LEVELS.indexOf(lv), nx = LEVELS[i + 1];
  if (nx && nx.palette) {
    const fresh = nx.palette.filter(k => !(lv.palette || []).includes(k) && COMP_DEFS[k]);
    if (fresh.length) extra.push(t('winUnlock', fresh.map(compName).join(' · ')));
  }
  $('win-extra').innerHTML = extra.map(x => `<span>${x}</span>`).join('');
  $('win-modal').hidden = false;
}

$('btn-ref').onclick = () => {
  const lv = LEVELS.find(l => l.id === S.cur);
  if (!lv) return;
  if (!confirm(t('refConfirm'))) return;
  saveCurrent();
  if (lv.kind === 'program') {
    if (!loadRefSolution(lv.id)) return;
    S.code[S.cur] = $('cpu-code').value; persist();
    cpuReset(); renderCpuTestsPreview(lv);
    $('btn-run').click();
  } else if (loadRefSolution(S.cur)) {
    Editor.fitView();
    $('btn-run').click();
  }
};

$('btn-run').onclick = () => {
  const lv = LEVELS.find(l => l.id === S.cur);
  if (!lv) return;
  saveCurrent();
  if (lv.kind === 'circuit') {
    Editor.refresh();
    if (Editor._badCount > 0) { toast(t('overlapBlock')); return; }
    let res;
    if (lv.seq) res = Editor.runSeqTests(lv.steps()), showRowsSeq(lv, res);
    else res = Editor.runCombinTests(lv.tests()), showRowsCombin(lv, res);
    if (res.pass === res.total) setTimeout(() => win(lv), 350);
    else toast(t('tRed'));
  } else {
    runCpuTests(lv);
  }
};
$('btn-next').onclick = () => {
  $('win-modal').hidden = true;
  const order = LEVELS.map(l => l.id);
  const i = order.indexOf(S.cur);
  if (i >= 0 && i < order.length - 1) loadLevel(order[i + 1]);
  else showMap();
};
$('btn-map2').onclick = () => { $('win-modal').hidden = true; showMap(); };
$('btn-map').onclick = showMap;
$('btn-back').onclick = showMap;
$('drawer-toggle').onclick = () => {
  const b = $('drawer-body');
  b.hidden = !b.hidden;
  $('drawer-toggle').innerHTML = `<span>${b.hidden ? t('expand') : t('collapse')}</span>`;
};
$('drawer-bar').ondblclick = () => $('drawer-toggle').click();
$('btn-info').onclick = () => { $('info-modal').hidden = false; };
$('btn-info-close').onclick = () => { $('info-modal').hidden = true; };
function expandDrawer() {
  $('drawer-body').hidden = false;
  $('drawer-toggle').innerHTML = `<span>${t('collapse')}</span>`;
}

// CPU 面板
// 汇编编辑器行号栏：单步时标出下一条要执行的指令所在行
function renderGutter() {
  const ta = $('cpu-code'), g = $('cpu-gutter');
  if (!ta || !g) return;
  const n = ta.value.split('\n').length;
  const ses = cpuSession;
  const ipLine = ses && !ses.halted && ses.prog[ses.ip] ? ses.prog[ses.ip].line : -1;
  let h = '';
  for (let i = 1; i <= n; i++) h += `<span class="ln${i === ipLine ? ' ip' : ''}">${i === ipLine ? '→' : ''}${i}</span>`;
  g.innerHTML = h;
  g.scrollTop = ta.scrollTop;
}
$('cpu-code').addEventListener('input', () => { cpuSession = null; renderGutter(); });
$('cpu-code').addEventListener('scroll', () => { $('cpu-gutter').scrollTop = $('cpu-code').scrollTop; });
$('cpu-code').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const ta = e.target, a = ta.selectionStart;
  ta.setRangeText('    ', a, ta.selectionEnd, 'end');
  renderGutter();
});

function cpuReset() {
  const src = $('cpu-code').value;
  const { prog, labels, errs } = CPU.parse(src);
  cpuSession = { prog, labels, errs, ip: 0, R: [0,0,0,0], M: new Array(9).fill(0), inp: [], inpIdx: 0, out: [], halted: false };
  renderCpuState(t('cpuReady'));
  renderGutter();
}
function fmtW(v) { return `${decToBal(v, 3)} (${v})`; }
function renderCpuState(msg) {
  const el = $('cpu-state');
  if (!cpuSession) { el.textContent = '·'; return; }
  const { R, M, ip, prog, out } = cpuSession;
  el.textContent =
    (msg ? msg + '\n' : '') +
    `IP=${ip}${ip < prog.length ? `  ${t('nextLbl')}: ${prog[ip].op} ${prog[ip].a.join(' ')}` : `  ${t('endLbl')}`}\n` +
    R.map((v, i) => `R${i}=${fmtW(v)}`).join('  ') + '\n' +
    `M=[${M.join(', ')}]\nOUT=[${out.join(', ')}]`;
}
function renderCpuTestsPreview(lv) {
  const tEl = $('test-table');
  const ts = progTestsOf(lv);
  tEl.innerHTML = `<tr><th>#</th><th>${t('thIn')}</th><th>${t('thExp')}</th><th>${t('thGot')}</th><th>✓</th></tr>` +
    ts.map((x, i) => `<tr><td>${i + 1}</td><td>${x.in.join(',')}</td><td>${x.want.join(',')}</td><td>·</td><td>·</td></tr>`).join('');
  $('test-summary').textContent = t('sumProgN', ts.length);
}
function runCpuTests(lv) {
  const src = $('cpu-code').value;
  S.code[lv.id] = src; persist();
  const ts = progTestsOf(lv);
  const tEl = $('test-table');
  let pass = 0;
  let html = `<tr><th>#</th><th>${t('thIn')}</th><th>${t('thExp')}</th><th>${t('thGot')}</th><th>✓</th></tr>`;
  ts.forEach((x, i) => {
    const r = CPU.run(src, x.in);
    const got = r.ok ? r.out : [`ERR:${(r.errs || []).join(';')}`];
    const ok = r.ok && got.length === x.want.length && got.every((v, k) => v === x.want[k]);
    if (ok) pass++;
    html += `<tr class="${ok ? 'pass' : 'fail'}"><td>${i + 1}</td><td>${x.in.join(',')}</td><td>${x.want.join(',')}</td><td>${got.join(',')}</td><td class="${ok ? 'c-ok' : 'c-bad'}">${ok ? '✓' : '✗'}</td></tr>`;
  });
  tEl.innerHTML = html;
  const s = $('test-summary');
  s.textContent = pass === ts.length ? t('sumPassP', pass, ts.length) : t('sumFailP', pass, ts.length);
  s.className = pass === ts.length ? 'ok' : 'bad';
  expandDrawer();
  cpuReset(); renderCpuState(t('cpuRanTests', ts.length));
  if (pass === ts.length) setTimeout(() => win(lv), 350);
}
$('btn-cpu-run').onclick = () => {
  const lv = LEVELS.find(l => l.id === S.cur);
  if (lv && lv.kind === 'program') runCpuTests(lv);
};
$('btn-cpu-reset').onclick = () => { cpuReset(); };
$('btn-cpu-step').onclick = () => {
  const src = $('cpu-code').value;
  if (!cpuSession || cpuSession.prog.length === 0) cpuReset();
  const ses = cpuSession;
  if (ses.errs.length) { renderCpuState(t('cpuAsmErr') + ses.errs.join('; ')); return; }
  if (ses.halted) { renderCpuState(t('cpuHalted')); return; }
  const ins = ses.prog[ses.ip];
  if (!ins) { renderCpuState(t('cpuIpOor')); return; }
  const lv = LEVELS.find(l => l.id === S.cur);
  const demoIn = (progTestsOf(lv)[0] || { in: [] }).in;
  if (ses.inp.length === 0 && demoIn) { ses.inp = [...demoIn]; }
  renderCpuState(stepOnce(ses));
  renderGutter();
};
function stepOnce(ses) {
  const ins = ses.prog[ses.ip];
  if (!ins) return t('cpuIpOor');
  const { op, a } = ins;
  const rv = s => ['R0','R1','R2','R3'].indexOf(s.toUpperCase());
  const nv = s => { s = s.trim().replace(/−/g, '-'); if (/^[+\-0]+$/.test(s)) return balToDec(s); return parseInt(s, 10); };
  const nxt = () => ses.ip++;
  if (op === 'HLT') { ses.halted = true; return t('hltDone'); }
  else if (op === 'LIT') { ses.R[rv(a[0])] = CPU.clampW(nv(a[1])); nxt(); }
  else if (op === 'MOV') { ses.R[rv(a[0])] = ses.R[rv(a[1])]; nxt(); }
  else if (op === 'NEG') { ses.R[rv(a[0])] = CPU.clampW(-ses.R[rv(a[1])]); nxt(); }
  else if (['ADD','SUB','MIN','MAX'].includes(op)) {
    const d = rv(a[0]), s1 = rv(a[1]); let s2;
    const ri = rv(a[2]); s2 = ri >= 0 ? ses.R[ri] : nv(a[2]);
    let v = op === 'ADD' ? ses.R[s1] + s2 : op === 'SUB' ? ses.R[s1] - s2 : op === 'MIN' ? Math.min(ses.R[s1], s2) : Math.max(ses.R[s1], s2);
    ses.R[d] = CPU.clampW(v); nxt();
  }
  else if (op === 'INP') { ses.R[rv(a[0])] = CPU.clampW(ses.inpIdx < ses.inp.length ? ses.inp[ses.inpIdx++] : 0); nxt(); }
  else if (op === 'OUT') { ses.out.push(CPU.clampW(ses.R[rv(a[0])])); nxt(); }
  else if (op === 'LD') { ses.R[rv(a[0])] = ses.M[nv(a[1].replace(/[\[\]]/g, ''))]; nxt(); }
  else if (op === 'ST') { ses.M[nv(a[1].replace(/[\[\]]/g, ''))] = ses.R[rv(a[0])]; nxt(); }
  else if (op === 'JMP') { ses.ip = ses.labels[a[0].toUpperCase()] ?? ses.ip + 1; }
  else if (['JPZ','JPP','JPN'].includes(op)) {
    const c = ses.R[rv(a[0])]; const t2 = ses.labels[a[1].toUpperCase()];
    if ((op === 'JPZ' && c === 0) || (op === 'JPP' && c > 0) || (op === 'JPN' && c < 0)) ses.ip = t2; else nxt();
  }
  return `${t('execLbl')}: ${op} ${a.join(' ')}`;
}

// 换算器
$('btn-converter').onclick = () => {
  const b = $('converter-box');
  b.hidden = !b.hidden;
  if (!b.hidden) expandDrawer();
};
$('conv-d2b').onclick = () => {
  const v = parseInt($('conv-dec').value, 10);
  $('conv-b-out').textContent = Number.isFinite(v) ? decToBal(v) + `  (${v})` : t('convNeedInt');
};
$('conv-b2d').onclick = () => {
  const v = balToDec($('conv-bal').value);
  $('conv-d-out').textContent = Number.isNaN(v) ? t('convBadFmt') : String(v);
};

// 帮助 / 重置 / 语言
$('btn-help').onclick = () => { $('help-modal').hidden = false; };
$('btn-help-close').onclick = () => { $('help-modal').hidden = true; };
$('btn-reset').onclick = () => {
  if (confirm(t('confirmReset'))) { const dev = S.dev; S = { done: [], cur: 't0_wire', circuits: {}, code: {}, dev }; persist(); showMap(); toast(t('resetDone')); }
};
$('btn-dev').onclick = () => {
  S.dev = !S.dev; persist(); renderTree();
  toast(S.dev ? t('devToastOn') : t('devToastOff'));
};
$('btn-lang').onclick = () => setLang(LANG === 'zh' ? 'en' : 'zh');

window.addEventListener('beforeunload', saveCurrent);

// 启动：先停在独立路线图
Editor.init();
applyI18n();
$('btn-lang').textContent = t('langBtn');
renderTree();
showMap();
if (!store.load().done?.length) $('help-modal').hidden = false;
// webfont 异步到达会改变端子高度，就绪后重排一次走线，避免几何漂移
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    try { Editor.refresh(); } catch {}
    try { renderTree(); } catch {}
  });
}
