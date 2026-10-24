/* 主应用：独立路线图 + 全屏布线台 + 底部测试条（文案全部经 i18n） */
'use strict';

const store = {
  key: 'ternary-complete-v1',
  load() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } },
  save(o) { try { localStorage.setItem(this.key, JSON.stringify(o)); } catch {} },
};
const freshState = () => ({ done: [], cur: 't0_wire', circuits: {}, code: {}, best: {}, ts: {}, dev: false, profileOk: false });
let S = Object.assign(freshState(), store.load());
if (!LEVELS.some(l => l.id === S.cur)) S.cur = 't0_wire';
// 开发者模式（全关解锁）只在本机调试时可用：线上（Toy / 任何非本机域名）一律关闭并隐藏入口
const DEV_OK = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
if (!DEV_OK) S.dev = false;
else if (new URLSearchParams(location.search).has('dev')) S.dev = true;

let cpuSession = null;
const $ = id => document.getElementById(id);

function toast(m) { Editor.toast(m); }
function persist() { store.save(S); }
// 云存档只在关键节点同步（通关、离开布线台、页面隐藏），见 bili.js 顶部约定
function cloudSync() { saveCurrent(); Bili.cloudSave(S); }

// 应用内确认框（B站 App 的 WebView 里不用原生 confirm）
function ask(msg) {
  return new Promise(res => {
    $('ask-text').textContent = msg;
    $('ask-modal').hidden = false;
    const done = v => { $('ask-modal').hidden = true; $('btn-ask-yes').onclick = $('btn-ask-no').onclick = null; res(v); };
    $('btn-ask-yes').onclick = () => done(true);
    $('btn-ask-no').onclick = () => done(false);
  });
}

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
  // 宽屏：5 列，章节名牌在左侧；窄屏（手机）：3 列，章节名牌放在该章最上面一行的上方
  const avail = tree.clientWidth || (document.documentElement.clientWidth - 20);
  const narrow = avail < 760;
  const MW = narrow ? 560 : 1200, TOP = 100, ROW_H = 178, NW = 150, NH = 118, PER = narrow ? 3 : 5;
  const PLATE_GAP = narrow ? 40 : 0;        // 窄屏章节名牌占用的额外行距
  const COLX = c => narrow ? 110 + c * 170 : 300 + c * 200;   // 固定栅格；每行都从左往右，换行导线走行间通道
  const rowsSpec = [];                      // 自下而上：{ ci, lvs, first, last }
  CHAPTERS.forEach((ch, ci) => {
    const lvs = LEVELS.filter(l => l.ch === ch);
    for (let k = 0; k < lvs.length; k += PER) rowsSpec.push({ ci, lvs: lvs.slice(k, k + PER), first: k === 0, last: k + PER >= lvs.length });
  });
  const nRows = rowsSpec.length;
  // 每行中心 y：自下而上累加，窄屏在每章最上一行上方留出名牌位置
  const rowY = [];
  let acc = 0;
  rowsSpec.forEach((row, r) => { if (r) acc += ROW_H + (rowsSpec[r - 1].last ? PLATE_GAP : 0); rowY.push(acc); });
  const H = TOP * 2 + acc + PLATE_GAP;
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
    const cy = H - TOP - rowY[r];
    const cn = chName(row.ci).replace(/^[0-9]\s*·\s*/, '');
    if (!narrow && row.first) {
      const plate = document.createElement('div');
      plate.className = 'mplate';
      plate.style.left = '12px';
      plate.style.top = (cy - 48) + 'px';
      plate.innerHTML = `<b>CHAPTER ${row.ci} · ${cn}</b><small>${t('chDesc')[row.ci] || ''}</small>`;
      canvas.appendChild(plate);
    }
    if (narrow && row.last) {
      const plate = document.createElement('div');
      plate.className = 'mplate wide';
      plate.style.left = '24px';
      plate.style.top = (cy - NH / 2 - 34) + 'px';
      plate.innerHTML = `<b>CHAPTER ${row.ci} · ${cn}</b>`;
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
  const scale = Math.min(1, (tree.clientWidth || MW) / MW);
  if (scale < 1) {
    canvas.style.transform = `scale(${scale})`;
    canvas.style.transformOrigin = '0 0';
    canvas.style.marginBottom = `${-(H * (1 - scale))}px`;
  }
  const cr = canvas.getBoundingClientRect();
  const pinOf = (id, which) => {
    const svgEl = canvas.querySelector(`[data-lv="${id}"] .mshape svg`);
    const r = svgEl.getBoundingClientRect();
    const sh = mapShape(id), k = r.width / sh.w;
    const p = sh.pin[which];
    // 量出来的是缩放后的屏幕坐标，换回画布自身坐标
    return { x: Math.round((r.left - cr.left + p.x * k) / scale), y: Math.round((r.top - cr.top + p.y * k) / scale) };
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
    devBtn.hidden = !DEV_OK;
    devBtn.innerHTML = (S.dev ? ICONS.unlock : ICONS.lock) + `<span>${S.dev ? t('devOn') : t('devOff')}</span>`;
    devBtn.classList.toggle('on', !!S.dev);
  }
}

function showMap() {
  const fromGame = !$('game-view').hidden;
  saveCurrent();
  if (fromGame) Bili.cloudSave(S);
  // 先显形再渲染：路线图导线端点需实测符号墨盒，藏着量全是 0
  $('map-view').hidden = false;
  $('game-view').hidden = true;
  document.body.classList.remove('in-game');
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
  document.body.classList.add('in-game');
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
  // 只有内容真的变了才更新时间戳（云端合并按每关时间戳取较新的一份）
  const stamp = (kind, v) => { if (S[kind][S.cur] !== v) { S[kind][S.cur] = v; S.ts[S.cur] = Date.now(); } };
  if (lv.kind === 'circuit' && Editor.circuit) stamp('circuits', Editor.serialize());
  if (lv.kind === 'program') {
    const el = $('cpu-code');
    if (el) stamp('code', el.value);
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

// 精简分：每个通过的电路关 10 分，比参考解每少 1 个元件 +5、多 1 个 -5，单关最低 1 分
function leanScore() {
  let s = 0;
  for (const id of S.done) {
    const spec = REF_SPEC[id];
    if (!spec || S.best[id] === undefined) continue;
    s += Math.max(1, 10 + 5 * (spec.nodes.length - S.best[id]));
  }
  return s;
}

function win(lv) {
  if (!S.done.includes(lv.id)) S.done.push(lv.id);
  if (lv.kind === 'circuit' && Editor.circuit) {
    const n = Editor.circuit.nodes.filter(x => x.type !== 'INPUT' && x.type !== 'OUTPUT').length;
    if (S.best[lv.id] === undefined || n < S.best[lv.id]) S.best[lv.id] = n;
  }
  persist();
  cloudSync();
  // 排行榜只在通关时提交（服务端只保留最高分，重复提交不会覆盖）
  Bili.submit(1, doneCount());
  Bili.submit(2, leanScore());
  rankCache = {};
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
  $('btn-share').hidden = !Bili.can('share');
  $('btn-win-qr').hidden = Bili.can('share') || !Bili.can('getQrCode');
  $('win-modal').hidden = false;
}

$('btn-ref').onclick = async () => {
  const lv = LEVELS.find(l => l.id === S.cur);
  if (!lv) return;
  if (!(await ask(t('refConfirm')))) return;
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
$('btn-reset').onclick = async () => {
  if (!(await ask(t('confirmReset')))) return;
  const keep = { dev: S.dev, profileOk: S.profileOk };
  S = Object.assign(freshState(), keep);
  persist();
  Bili.cloudSave(S);   // 云端也清空，否则下次打开会被合并回来
  showMap(); toast(t('resetDone'));
};
$('btn-dev').onclick = () => {
  if (!DEV_OK) return;
  S.dev = !S.dev; persist(); renderTree();
  toast(S.dev ? t('devToastOn') : t('devToastOff'));
};
$('btn-lang').onclick = () => setLang(LANG === 'zh' ? 'en' : 'zh');

window.addEventListener('beforeunload', saveCurrent);
document.addEventListener('visibilitychange', () => { if (document.hidden) cloudSync(); });
// 窗口尺寸变了（转屏、拉窗口）路线图要按新宽度重排
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!$('map-view').hidden) renderTree(); }, 150);
});

// ---------- B站 Toy 平台 ----------
let rankCache = {};
const rankSel = { board: 1, period: 'all' };
async function renderRank(force) {
  const key = rankSel.board + ':' + rankSel.period;
  $('rank-note').textContent = t(rankSel.board === 1 ? 'rankNote1' : 'rankNote2');
  const list = $('rank-list'), mine = $('rank-mine');
  if (force || !rankCache[key]) {
    list.innerHTML = `<li class="rank-msg">${t('rankLoading')}</li>`; mine.textContent = '';
    try {
      const [rows, me] = await Promise.all([Bili.rankList(rankSel.board, rankSel.period), Bili.myRank(rankSel.board, rankSel.period)]);
      rankCache[key] = { rows, me };
    } catch {
      list.innerHTML = `<li class="rank-msg">${t('rankErr')}</li>`;
      return;
    }
  }
  const { rows, me } = rankCache[key];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  list.innerHTML = rows.length
    ? rows.map(r => `<li class="${r.rank <= 3 ? 'top' : ''}"><b>${r.rank}</b><img src="${esc(r.avatar)}" alt="" referrerpolicy="no-referrer"><span>${esc(r.nickname)}</span><em>${r.score}</em></li>`).join('')
    : `<li class="rank-msg">${t('rankEmpty')}</li>`;
  mine.textContent = me ? (me.ranked ? t('rankMine', me.rank, me.score) : t('rankMineNo')) : t('rankMineLogin');
}
$('btn-rank').onclick = () => { $('rank-modal').hidden = false; renderRank(false); };
$('btn-rank-close').onclick = () => { $('rank-modal').hidden = true; };
$('btn-rank-refresh').onclick = () => renderRank(true);
$('rank-board').onclick = (e) => {
  const b = e.target.closest('[data-board]'); if (!b) return;
  rankSel.board = Number(b.dataset.board);
  $('rank-board').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderRank(false);
};
$('rank-period').onclick = (e) => {
  const b = e.target.closest('[data-period]'); if (!b) return;
  rankSel.period = b.dataset.period;
  $('rank-period').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderRank(false);
};

function showProfile(p) {
  if (!p) return;
  $('profile-ava').innerHTML = p.avatar ? `<img src="${p.avatar}" alt="" referrerpolicy="no-referrer">` : '';
  $('profile-name').textContent = p.nickname || t('profileBtn');
  $('btn-profile').classList.add('on');
}
$('btn-profile').onclick = async () => {
  try {
    const p = await Bili.getProfile();
    if (!p) throw new Error('none');
    S.profileOk = true; persist();
    showProfile(p);
  } catch { toast(t('profileFail')); }
};

// 分享 / 二维码：都指向某一关的深链 index.html?lv=<id>
const levelPath = id => `index.html?lv=${encodeURIComponent(id)}`;
function nextLevelId() {
  const i = LEVELS.findIndex(l => l.id === S.cur);
  return (LEVELS[i + 1] || LEVELS[i] || LEVELS[0]).id;
}
async function showQr(path) {
  try {
    const { base64 } = await Bili.qr(path);
    $('qr-img').src = base64;
    $('qr-modal').hidden = false;
  } catch { toast(t('qrFail')); }
}
$('btn-share').onclick = async () => { try { await Bili.share(levelPath(nextLevelId())); } catch { toast(t('shareFail')); } };
$('btn-win-qr').onclick = () => { cloudSync(); showQr(levelPath(nextLevelId())); };
$('btn-relay').onclick = () => { cloudSync(); showQr(levelPath(S.cur)); };
$('btn-qr-close').onclick = () => { $('qr-modal').hidden = true; };

// App 容器：安全区留白；手机竖屏进布线台时提示横屏
let container = null;
// 系统安全区（刘海 / 底部横条），需要 viewport-fit=cover 才有值
function envInsets() {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  const r = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  p.remove();
  return r;
}
// B站 App 竖屏非沉浸时，状态栏和平台胶囊栏（关注 / 分享 / 关闭）浮在网页上方，
// 顶部必须让出这一条，否则工具条点不到。Toy 预览框（iframe）里同样模拟了这一条。
const CAPSULE_H = 48, OVERLAY_MIN = 88;
function onToyHost() { return /(^|\.)bilibili\.com$/.test(location.hostname) || /\/toy\//.test(location.pathname); }
function inFrame() { try { return window.top !== window.self; } catch { return true; } }
function applyContainer() {
  const st = container;
  const root = document.documentElement.style;
  const sa = (st && st.safeArea) || { top: 0, right: 0, bottom: 0, left: 0 };
  const env = envInsets();
  const portrait = st ? st.orientation === 'portrait' : innerHeight > innerWidth;
  const overlay = (Bili.can('closeBrowser') || (inFrame() && onToyHost())) && portrait && !(st && st.immersive);
  // SDK 报的顶部安全区若只有状态栏高（< 70），胶囊栏还要另外加上；已经含胶囊栏则直接用
  const sdkTop = sa.top || 0;
  const top = overlay
    ? Math.max(OVERLAY_MIN, sdkTop < 70 ? sdkTop + CAPSULE_H : sdkTop, env.top + CAPSULE_H)
    : Math.max(sdkTop, env.top);
  root.setProperty('--sat', top + 'px');
  root.setProperty('--sar', Math.max(sa.right || 0, env.right) + 'px');
  root.setProperty('--sab', Math.max(sa.bottom || 0, env.bottom) + 'px');
  root.setProperty('--sal', Math.max(sa.left || 0, env.left) + 'px');
  const portraitPhone = st && st.deviceType === 'phone' && st.orientation === 'portrait';
  $('landscape-tip').hidden = !(portraitPhone && !$('game-view').hidden && !S.landDismiss);
}
$('btn-landscape').onclick = () => Bili.landscape();
$('btn-land-x').onclick = () => { S.landDismiss = true; applyContainer(); };
new MutationObserver(applyContainer).observe($('game-view'), { attributes: true, attributeFilter: ['hidden'] });

window.addEventListener('resize', () => applyContainer());
async function bootPlatform() {
  applyContainer();
  await Bili.init();
  applyContainer();
  if (!Bili.sdk) return;
  $('btn-rank').hidden = !Bili.can('getRankList');
  $('btn-profile').hidden = !Bili.can('getUserProfile');
  $('btn-relay').hidden = Bili.can('share') || !Bili.can('getQrCode');
  Bili.onLimit = () => toast(t('cloudLimit'));
  Bili.watchContainer(st => { container = st; applyContainer(); });
  // 之前授权过就直接复用，平台不会再弹窗；从没授权过则等玩家自己点
  if (S.profileOk) { try { showProfile(await Bili.getProfile()); } catch {} }
  const C = await Bili.cloudLoad();
  if (Bili.merge(S, C)) {
    persist();
    if (!$('map-view').hidden) renderTree();
    $('stat-progress').textContent = `${doneCount()}/${LEVELS.length}`;
    toast(t('cloudMerged'));
  }
  // 本地有、云端没有的进度（比如接入前玩的）补传一次
  if (Bili.cloud === 'on') Bili.cloudSave(S);
}

// 启动：先停在独立路线图
Editor.init();
applyI18n();
$('btn-lang').textContent = t('langBtn');
renderTree();
showMap();
if (!store.load().done?.length) $('help-modal').hidden = false;
// 深链 ?lv=<id>：分享 / 扫码进来直接打开那一关（未解锁则停在路线图）
{
  const q = new URLSearchParams(location.search).get('lv');
  const i = LEVELS.findIndex(l => l.id === q);
  if (i >= 0 && isUnlocked(i)) { $('help-modal').hidden = true; loadLevel(q); }
}
bootPlatform().then(() => {
  const q = new URLSearchParams(location.search).get('lv');
  const i = LEVELS.findIndex(l => l.id === q);
  // 云端进度到了以后才解锁的深链关卡，补开一次
  if (i >= 0 && S.cur !== q && isUnlocked(i) && !$('map-view').hidden) { $('help-modal').hidden = true; loadLevel(q); }
});
// webfont 异步到达会改变端子高度，就绪后重排一次走线，避免几何漂移
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    try { Editor.refresh(); } catch {}
    try { renderTree(); } catch {}
  });
}
