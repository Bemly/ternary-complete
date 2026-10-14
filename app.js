/* 主应用：独立路线图 + 全屏布线台 + 底部测试条 */
'use strict';

const store = {
  key: 'ternary-complete-v1',
  load() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } },
  save(o) { localStorage.setItem(this.key, JSON.stringify(o)); },
};
let S = Object.assign({ done: [], cur: 't0_wire', circuits: {}, code: {}, dev: false }, store.load());
if (location.search.includes('dev')) S.dev = true;
if (!LEVELS.some(l => l.id === S.cur)) S.cur = 't0_wire';

let cpuSession = null;
const $ = id => document.getElementById(id);

function toast(m) { Editor.toast(m); }
function persist() { store.save(S); }

const CH_DESC = {
  '0 · 平衡三进制': '三态 −/0/+，取反取小取大，亲手证明 TNAND 不完备',
  '1 · 选择与判断': '阈值之后的世界：MUX 万能门、比较天平、地址译码',
  '2 · 算术': '半加 → 全加 → 行波 → 减法，没有补码的算术',
  '3 · 存储': 'MUX + 触发器 + 反馈 = 寄存器、计数器、内存',
  '4 · 完备': 'ALU + TRIT-3 汇编：写出循环的那一刻即完备',
};

function renderTree() {
  const tree = $('level-tree');
  tree.innerHTML = '';
  const order = LEVELS.map(l => l.id);
  CHAPTERS.forEach((ch, ci) => {
    const box = document.createElement('div');
    box.className = 'map-chapter';
    box.innerHTML = `<h3>CHAPTER ${ci} · ${ch}</h3><p class="cdesc">${CH_DESC[ch] || ''}</p><div class="map-nodes"></div>`;
    const grid = box.querySelector('.map-nodes');
    LEVELS.filter(l => l.ch === ch).forEach(lv => {
      const idx = order.indexOf(lv.id);
      const unlocked = S.dev || idx <= S.done.length;
      const done = S.done.includes(lv.id);
      const b = document.createElement('button');
      b.className = 'map-node' + (done ? ' done' : '') + (S.cur === lv.id ? ' cur' : '');
      b.disabled = !unlocked;
      b.innerHTML = `<span class="idx">${String(idx + 1).padStart(2, '0')}</span>` +
        `<span><b>${lv.name}</b><small>${lv.kind === 'program' ? '✎ 汇编编程' : lv.seq ? '⏱ 时序 · ' + lv.steps().length + '步' : '⚡ 组合 · ' + lv.tests().length + '组'}</small></span>` +
        `<span class="st">${done ? '✓' : unlocked ? (S.cur === lv.id ? '●' : '→') : '🔒'}</span>`;
      b.onclick = () => loadLevel(lv.id);
      grid.appendChild(b);
    });
    tree.appendChild(box);
  });
  $('stat-progress').textContent = `${S.done.length}/${LEVELS.length}`;
  const devBtn = $('btn-dev');
  if (devBtn) {
    devBtn.textContent = S.dev ? '🔓 开发者模式：开' : '🔓 开发者模式：关';
    devBtn.classList.toggle('on', !!S.dev);
  }
}

function showMap() {
  saveCurrent();
  renderTree();
  $('map-view').hidden = false;
  $('game-view').hidden = true;
  $('level-kicker').textContent = '路线图';
  $('level-name-top').textContent = '选择一个任务进入布线台';
}
function showGame() {
  $('map-view').hidden = true;
  $('game-view').hidden = false;
}

function ioLegend(lv) {
  if (lv.kind === 'program') return `TRIT-3 · ${lv.progTests().length} 组程序测试`;
  if (lv.seq) return `时序 · ${lv.steps().length} 步 · ${lv.inputs.join(' ')} → ${lv.outputs.join(' ')}`;
  const n = lv.tests ? lv.tests().length : 0;
  return `组合 · ${n} 组 · ${lv.inputs.join(' ')} → ${lv.outputs.join(' ')}`;
}

function loadLevel(id) {
  const lv = LEVELS.find(l => l.id === id);
  if (!lv) return;
  saveCurrent();
  S.cur = id; persist();
  showGame();
  $('level-kicker').textContent = `第 ${lv.ch} · ${String(LEVELS.indexOf(lv) + 1).padStart(2, '0')}/${LEVELS.length}`;
  $('level-name-top').textContent = lv.name;
  $('level-kicker2').textContent = `第 ${lv.ch} 关`;
  $('level-name').textContent = lv.name;
  $('level-desc').textContent = lv.desc;
  $('theory').innerHTML = lv.theory;
  $('level-hint').textContent = lv.hint;
  $('info-kicker').textContent = `第 ${lv.ch} 关 · ${ioLegend(lv)}`;
  $('info-title').textContent = lv.name;
  $('info-theory').innerHTML = lv.theory;
  $('info-hint').textContent = lv.hint;
  $('io-sub').textContent = ioLegend(lv);
  $('io-legend').innerHTML =
    lv.kind === 'circuit'
      ? `输入 <b>${lv.inputs.join(' · ')}</b> → 输出 <b>${lv.outputs.join(' · ')}</b>`
      : `R0–R3 · M0–M8 · 3-trit（−13…+13）`;
  $('test-summary').textContent = '尚未运行测试';
  $('test-summary').className = '';
  $('test-table').innerHTML = '';
  $('drawer-body').hidden = true;
  $('drawer-toggle').textContent = '展开 ▴';
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
    const codeEl = $('cpu-code');
    codeEl.value = S.code[id] || lv.starter || '';
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

function expandDrawer() {
  $('drawer-body').hidden = false;
  $('drawer-toggle').textContent = '收起 ▾';
}

function showRowsCombin(lv, res) {
  const t = $('test-table');
  const ih = lv.inputs.map(x => `<th>${x}</th>`).join('');
  const oh = lv.outputs.map(x => `<th>${x}* </th>`).join('');
  const gh = lv.outputs.map(x => `<th>${x}✓</th>`).join('');
  let html = `<tr><th>#</th>${ih}${oh}${gh}<th></th></tr>`;
  const show = res.rows.length > 40 ? [...res.rows.slice(0, 20), null, ...res.rows.slice(-10)] : res.rows;
  show.forEach((r) => {
    if (!r) { html += `<tr><td colspan="20" style="color:var(--dim)">… 省略 ${res.rows.length - 30} 行 …</td></tr>`; return; }
    html += `<tr class="${r.ok ? 'pass' : 'fail'}"><td>${res.rows.indexOf(r) + 1}</td>${r.in.map(v => `<td>${fmtT(v)}</td>`).join('')}${r.want.map(v => `<td>${fmtT(v)}</td>`).join('')}${r.got.map(v => `<td>${fmtT(v)}</td>`).join('')}<td class="${r.ok ? 'c-ok' : 'c-bad'}">${r.ok ? '✓' : '✗'}</td></tr>`;
  });
  t.innerHTML = html;
  const s = $('test-summary');
  s.textContent = res.pass === res.total ? `✓ 全部通过 ${res.pass}/${res.total}` : `✗ ${res.pass}/${res.total}，红色行为失败`;
  s.className = res.pass === res.total ? 'ok' : 'bad';
  expandDrawer();
}

function showRowsSeq(lv, res) {
  const t = $('test-table');
  let html = `<tr><th>步</th>${lv.inputs.map(x => `<th>${x}</th>`).join('')}${lv.outputs.map(x => `<th>${x}*</th>`).join('')}${lv.outputs.map(x => `<th>${x}✓</th>`).join('')}<th></th></tr>`;
  res.rows.forEach(r => {
    html += `<tr class="${r.ok ? 'pass' : 'fail'}"><td>${r.idx + 1}</td>${r.in.map(v => `<td>${fmtT(v)}</td>`).join('')}${r.want.map(v => `<td>${fmtT(v)}</td>`).join('')}${r.got.map(v => `<td>${fmtT(v)}</td>`).join('')}<td class="${r.ok ? 'c-ok' : 'c-bad'}">${r.ok ? '✓' : '✗'}</td></tr>`;
  });
  t.innerHTML = html;
  const s = $('test-summary');
  s.textContent = res.pass === res.total ? `✓ 时序全部通过 ${res.pass}/${res.total}` : `✗ ${res.pass}/${res.total}（每步：置输入→滴答→检查）`;
  s.className = res.pass === res.total ? 'ok' : 'bad';
  expandDrawer();
}

function win(lv) {
  if (!S.done.includes(lv.id)) { S.done.push(lv.id); persist(); }
  renderTree();
  $('win-title').textContent = lv.name + ' —— 完成';
  $('win-text').textContent = lv.win || '验证通过！';
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
    else toast('还有红色用例，点「说明与提示」看看');
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
  $('drawer-toggle').textContent = b.hidden ? '展开 ▴' : '收起 ▾';
};
$('drawer-bar').ondblclick = () => $('drawer-toggle').click();
$('btn-info').onclick = () => { $('info-modal').hidden = false; };
$('btn-info-close').onclick = () => { $('info-modal').hidden = true; };

// —— CPU 面板 ——
function cpuReset() {
  const src = $('cpu-code').value;
  const { prog, labels, errs } = CPU.parse(src);
  cpuSession = { prog, labels, errs, ip: 0, R: [0,0,0,0], M: new Array(9).fill(0), inp: [], inpIdx: 0, out: [], halted: false };
  renderCpuState('已复位，待运行');
}
function fmtW(v) { return `${decToBal(v, 3)} (${v})`; }
function renderCpuState(msg) {
  const el = $('cpu-state');
  if (!cpuSession) { el.textContent = '—'; return; }
  const { R, M, ip, prog, out } = cpuSession;
  el.textContent =
    (msg ? msg + '\n' : '') +
    `IP=${ip}${ip < prog.length ? `  下一条: ${prog[ip].op} ${prog[ip].a.join(' ')}` : '  (越界/结束)'}\n` +
    R.map((v, i) => `R${i}=${fmtW(v)}`).join('  ') + '\n' +
    `M=[${M.join(', ')}]\nOUT=[${out.join(', ')}]`;
}
function renderCpuTestsPreview(lv) {
  const t = $('test-table');
  const ts = lv.progTests();
  t.innerHTML = `<tr><th>#</th><th>输入</th><th>期望</th><th>实际</th><th>✓</th></tr>` +
    ts.map((x, i) => `<tr><td>${i + 1}</td><td>${x.in.join(',')}</td><td>${x.want.join(',')}</td><td>—</td><td>—</td></tr>`).join('');
  $('test-summary').textContent = `共 ${ts.length} 组程序测试，点「运行程序」验证`;
}
function runCpuTests(lv) {
  const src = $('cpu-code').value;
  S.code[lv.id] = src; persist();
  const ts = lv.progTests();
  const t = $('test-table');
  let pass = 0;
  let html = `<tr><th>#</th><th>输入</th><th>期望</th><th>实际</th><th>✓</th></tr>`;
  ts.forEach((x, i) => {
    const r = CPU.run(src, x.in);
    const got = r.ok ? r.out : [`ERR:${(r.errs || []).join(';')}`];
    const ok = r.ok && got.length === x.want.length && got.every((v, k) => v === x.want[k]);
    if (ok) pass++;
    html += `<tr class="${ok ? 'pass' : 'fail'}"><td>${i + 1}</td><td>${x.in.join(',')}</td><td>${x.want.join(',')}</td><td>${got.join(',')}</td><td class="${ok ? 'c-ok' : 'c-bad'}">${ok ? '✓' : '✗'}</td></tr>`;
  });
  t.innerHTML = html;
  const s = $('test-summary');
  s.textContent = pass === ts.length ? `✓ 程序全部通过 ${pass}/${ts.length}` : `✗ 通过 ${pass}/${ts.length}`;
  s.className = pass === ts.length ? 'ok' : 'bad';
  expandDrawer();
  cpuReset(); renderCpuState(`已运行 ${ts.length} 组测试`);
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
  if (ses.errs.length) { renderCpuState('汇编错误：' + ses.errs.join('；')); return; }
  if (ses.halted) { renderCpuState('已停机，请复位'); return; }
  const ins = ses.prog[ses.ip];
  if (!ins) { renderCpuState('IP 越界'); return; }
  const lv = LEVELS.find(l => l.id === S.cur);
  const demoIn = (lv.progTests()[0] || { in: [] }).in;
  if (ses.inp.length === 0 && demoIn) { ses.inp = [...demoIn]; }
  renderCpuState(stepOnce(ses));
};
function stepOnce(ses) {
  const ins = ses.prog[ses.ip];
  if (!ins) return 'IP 越界';
  const { op, a } = ins;
  const rv = s => ['R0','R1','R2','R3'].indexOf(s.toUpperCase());
  const nv = s => { s = s.trim().replace(/−/g, '-'); if (/^[+\-0]+$/.test(s)) return balToDec(s); return parseInt(s, 10); };
  const nxt = () => ses.ip++;
  if (op === 'HLT') { ses.halted = true; return 'HLT 停机 ✓'; }
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
    const c = ses.R[rv(a[0])]; const t = ses.labels[a[1].toUpperCase()];
    if ((op === 'JPZ' && c === 0) || (op === 'JPP' && c > 0) || (op === 'JPN' && c < 0)) ses.ip = t; else nxt();
  }
  return `执行: ${op} ${a.join(' ')}`;
}

// —— 换算器 ——
$('btn-converter').onclick = () => {
  const b = $('converter-box');
  b.hidden = !b.hidden;
  if (!b.hidden) expandDrawer();
};
$('conv-d2b').onclick = () => {
  const v = parseInt($('conv-dec').value, 10);
  $('conv-b-out').textContent = Number.isFinite(v) ? decToBal(v) + `  (${v})` : '输入整数';
};
$('conv-b2d').onclick = () => {
  const v = balToDec($('conv-bal').value);
  $('conv-d-out').textContent = Number.isNaN(v) ? '格式如 +0−（用 + 0 -）' : String(v);
};

// —— 帮助 / 重置 ——
$('btn-help').onclick = () => { $('help-modal').hidden = false; };
$('btn-help-close').onclick = () => { $('help-modal').hidden = true; };
$('btn-reset').onclick = () => {
  if (confirm('清空全部进度与存档？')) { const dev = S.dev; S = { done: [], cur: 't0_wire', circuits: {}, code: {}, dev }; persist(); showMap(); toast('已重置'); }
};
$('btn-dev').onclick = () => {
  S.dev = !S.dev; persist(); renderTree();
  toast(S.dev ? '开发者模式已开：全部 18 关解锁' : '开发者模式已关');
};

window.addEventListener('beforeunload', saveCurrent);

// 启动：先停在独立路线图（不再常驻左侧）
Editor.init();
renderTree();
showMap();
if (!store.load().done?.length) $('help-modal').hidden = false;
