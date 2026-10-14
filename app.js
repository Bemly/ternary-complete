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
function chName(i) { return chList()[i] || ''; }

function renderTree() {
  const tree = $('level-tree');
  tree.innerHTML = '';
  const order = LEVELS.map(l => l.id);
  // 布线台式路线图：章节自下而上排布，关卡蛇形走线，导线直角连接
  const MW = 1160, TOP = 100, ROW_H = 200, NW = 184, NH = 78;
  const nCh = CHAPTERS.length;
  const H = TOP * 2 + (nCh - 1) * ROW_H;
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
  CHAPTERS.forEach((ch, ci) => {
    const r = nCh - 1 - ci; // 0 = 最底行
    const cy = TOP + r * ROW_H;
    const cn = chName(ci).replace(/^[0-9]\s*·\s*/, '');
    const plate = document.createElement('div');
    plate.className = 'mplate';
    plate.style.left = '12px';
    plate.style.top = (cy - 48) + 'px';
    plate.innerHTML = `<b>CHAPTER ${ci} · ${cn}</b><small>${t('chDesc')[ci] || ''}</small>`;
    canvas.appendChild(plate);
    const lvs = LEVELS.filter(l => l.ch === ch);
    const k = lvs.length;
    const span = k > 1 ? Math.min(740, (k - 1) * 220) : 0;
    const x0 = 690 - span / 2;
    const dir = (r % 2 === 0) ? 1 : -1; // 蛇形：偶数行左→右，奇数行右→左
    lvs.forEach((lv, i) => {
      const seq = dir === 1 ? i : (k - 1 - i);
      const cx = k === 1 ? 690 : x0 + seq * (span / (k - 1));
      pos[lv.id] = { x: cx, y: cy };
      const idx = order.indexOf(lv.id);
      const unlocked = S.dev || idx <= S.done.length;
      const done = S.done.includes(lv.id);
      const sub = lv.kind === 'program' ? t('kProg')
        : lv.seq ? `${t('kSeq')} · ${lv.steps().length}${t('uSteps')}`
        : `${t('kComb')} · ${lv.tests().length}${t('uTests')}`;
      const b = document.createElement('button');
      b.className = 'mnode' + (done ? ' done' : '') + (S.cur === lv.id ? ' cur' : '');
      b.disabled = !unlocked;
      b.style.left = (cx - NW / 2) + 'px';
      b.style.top = (cy - NH / 2) + 'px';
      b.style.width = NW + 'px';
      b.innerHTML = `<span class="midx">${String(idx + 1).padStart(2, '0')}</span>` +
        `<span class="mbody"><b>${LText(lv, 'name')}</b><small>${sub}</small></span>` +
        `<span class="st">${done ? '✓' : unlocked ? (S.cur === lv.id ? '●' : '→') : ICONS.lock}</span>`;
      b.onclick = () => loadLevel(lv.id);
      canvas.appendChild(b);
    });
  });
  // 关卡之间的连接导线（全局线性顺序）
  for (let i = 0; i < order.length - 1; i++) {
    const A = pos[order[i]], B = pos[order[i + 1]];
    const bDone = S.done.includes(order[i + 1]);
    const bUn = S.dev || (i + 1) <= S.done.length;
    let p, q;
    if (Math.abs(A.y - B.y) < 1) {
      if (B.x >= A.x) { p = [A.x + NW / 2, A.y]; q = [B.x - NW / 2, B.y]; }
      else { p = [A.x - NW / 2, A.y]; q = [B.x + NW / 2, B.y]; }
    } else if (B.y < A.y) { p = [A.x, A.y - NH / 2]; q = [B.x, B.y + NH / 2]; }
    else { p = [A.x, A.y + NH / 2]; q = [B.x, B.y - NH / 2]; }
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M ${p[0]} ${p[1]} L ${mx} ${p[1]} L ${mx} ${q[1]} L ${q[0]} ${q[1]}`);
    path.setAttribute('class', 'mwire ' + (bDone ? 'ok' : bUn ? 'live' : 'dim'));
    svg.appendChild(path);
    for (const pt of [p, q]) {
      const j = document.createElementNS(NS, 'rect');
      j.setAttribute('x', pt[0] - 4); j.setAttribute('y', pt[1] - 4);
      j.setAttribute('width', 8); j.setAttribute('height', 8);
      j.setAttribute('class', 'mjunc ' + (bDone ? 'ok' : bUn ? 'live' : 'dim'));
      svg.appendChild(j);
    }
  }
  tree.appendChild(canvas);
  $('stat-progress').textContent = `${S.done.length}/${LEVELS.length}`;
  const devBtn = $('btn-dev');
  if (devBtn) {
    devBtn.innerHTML = (S.dev ? ICONS.unlock : ICONS.lock) + `<span>${S.dev ? t('devOn') : t('devOff')}</span>`;
    devBtn.classList.toggle('on', !!S.dev);
  }
}

function showMap() {
  saveCurrent();
  renderTree();
  $('map-view').hidden = false;
  $('game-view').hidden = true;
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
  $('timeline-strip').style.display = (isProg || !Editor.tlOn) ? 'none' : '';
  $('cpu-panel').hidden = !isProg;
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
  requestAnimationFrame(() => Editor.drawWires());
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
  $('win-modal').hidden = false;
}

$('btn-run').onclick = () => {
  const lv = LEVELS.find(l => l.id === S.cur);
  if (!lv) return;
  saveCurrent();
  if (lv.kind === 'circuit') {
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
function cpuReset() {
  const src = $('cpu-code').value;
  const { prog, labels, errs } = CPU.parse(src);
  cpuSession = { prog, labels, errs, ip: 0, R: [0,0,0,0], M: new Array(9).fill(0), inp: [], inpIdx: 0, out: [], halted: false };
  renderCpuState(t('cpuReady'));
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
