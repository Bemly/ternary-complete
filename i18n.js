/* 界面语言字典与切换。新增界面文案必须同时给出中英两份，禁止在逻辑文件里硬编码中文。 */
'use strict';

const I18N = {
zh: {
  title: '三进制完备 · Ternary Complete · 平衡三进制计算机',
  tagline: '平衡三进制 · 从一个门到一台计算机 · 致敬 Сетунь Setun (1958)',
  navMap: '路线图', done: '已完成', gatesW: '门数', converter: '换算', helpQ: '？', reset: '重置', langBtn: 'EN',
  crumbMap: '路线图', crumbPick: '选择一个任务进入布线台',
  mapTitle: '任务路线', mapSub: '从一个门到一台三进制计算机 · 致敬 Сетунь Setun (1958)',
  mapDesc: '点任意已解锁节点进入布线台。通关电路会变成标准件，用于后续关卡。',
  legDone: '已通过', legCur: '当前位置', legLock: '未解锁',
  devOff: '开发者模式：关', devOn: '开发者模式：开',
  devToastOn: '开发者模式已开：全部 18 关解锁', devToastOff: '开发者模式已关',
  setunB: '为什么是三进制？',
  setunP: '单个与非门在二进制里是完备的，在三值逻辑里<strong>不是</strong>。平衡三进制需要<strong>阈值门 NTI / PTI</strong>才能表达全部函数，这正是苏联 Setun 用阈值逻辑的原因，也是第一章要亲手验证的事。',
  kProg: '汇编编程', kSeq: '时序', kComb: '组合', uSteps: '步', uTests: '组',
  chapters: ['0 · 平衡三进制', '1 · 选择与判断', '2 · 算术', '3 · 存储', '4 · 完备'],
  chDesc: [
    '三态 −/0/+，取反取小取大，亲手证明 TNAND 不完备',
    '阈值之后的世界：MUX 万能门、比较天平、地址译码',
    '半加 → 全加 → 行波 → 减法，没有补码的算术',
    'MUX + 触发器 + 反馈 = 寄存器、计数器、内存',
    'ALU + TRIT-3 汇编：写出循环的那一刻即完备',
  ],
  back: '返回路线图', tickBtn: '滴答', autoBtn: '自动', clearWires: '清空连线', delSel: '删除选中',
  refBtn: '参考解', refConfirm: '载入参考解会覆盖当前内容，继续？',
  infoBtn: '说明与提示', runTests: '运行测试', tlBtn: '时间轴', paletteT: '元件',
  noGates: '本关无需元件，直接连线',
  boardHint: '输出钉按住<b>拖到</b>输入钉连线 · 按住导线<b>拖拽</b>改走向 · 双击加节点 · 右键删线 · 空白拖拽框选 · 空格/中键/右键拖拽平移 · 滚轮缩放 · 点输入端切换 −/0/+',
  tlTitle: '时间轴', tlClear: '清空波形', tlEmpty: '滴答一次开始记录波形（T 每 +1 记一拍）',
  testsT: '测试用例', infoT: '说明',
  expand: '展开 ▴', collapse: '收起 ▾', noRun: '尚未运行测试',
  cpuAsm: 'TRIT-3 汇编器', cpuSub: '3-trit 字 · −13…+13', cpuRun: '运行程序', cpuStep: '单步',
  cpuReset: '复位 CPU', cpuStateT: 'CPU 状态', isaT: '指令集',
  isa: 'LIT Rd, 立即数(−13…13, 可写 +0− / 十进制)\nADD Rd,Ra,Rb   MIN Rd,Ra,Rb   MAX Rd,Ra,Rb\nNEG Rd,Ra      MOV Rd,Ra      INP Rd / OUT Ra\nLD Rd,[a]  ST Ra,[a]   (a = 0…8)\nJMP L  JPZ Ra,L  JPP Ra,L  JPN Ra,L\nHLT   标签写为  L:  注释用 #',
  convT: '⇄ 平衡三进制换算', convDecPh: '十进制，如 11', convBalPh: '平衡三进制，如 +0−',
  convNeedInt: '输入整数', convBadFmt: '格式如 +0−（用 + 0 -）', convPending: '待换算',
  convNote: '符号：+ 表示 +1，−/- 可作 −1，0 为零。高位在左，权重 …9,3,1。如 +0− = 9+0−1 = 8。',
  infoKicker: '关卡说明', infoBack: '回到布线台',
  winKicker: '✓ 验证通过', winMap: '路线图', winNext: '下一关 →', winClear: '通过',
  helpKicker: '玩法说明', helpTitle: '从逻辑门搭到 CPU，只是这里是三进制', helpStart: '开始搭建',
  h0: '<b>三态：</b>每根线都是 <span class="t neg">−</span> / <span class="t zero">0</span> / <span class="t pos">+</span>。点输入端切换。',
  h1: '<b>连线：</b>按住<b>输出钉</b>拖到<b>输入钉</b>松手（点两下也行），直角走线。',
  h2: '<b>改线：</b>按住导线拖拽直接改走向；双击添加可拖动的导线节点；右键点导线删除；节点右键删除该节点。',
  h3: '<b>选择：</b>空白处拖拽框选，Shift 加选；Delete 删除选中；Esc 取消连线/选择。',
  h4: '<b>视图：</b>空格/中键/右键拖拽平移，滚轮缩放。Ctrl+Z/Y 撤销/重做，Ctrl+C/V 复制粘贴。',
  h5: '<b>过关：</b>底部测试条列出全部用例，点右上「运行测试」全绿即过关，解锁新标准件。',
  h6: '<b>时钟：</b>含触发器的关用「滴答」推进，序列测试每步自动滴答。自动档位 1/2/5/10 TPS，拍数记在工具条；每次滴答都会记进下方<b>时间轴</b>波形。',
  h7: '<b>调试：</b>左上输入输出总览条点输入可切换；右下「开发者模式」可直接全开 18 关。',
  h8: '<b>布线规矩：</b>任何两根导线只允许交叉穿过，不允许共线重叠，没有例外；重叠标红并拦住测试。分叉请各自走道。',
  lgComb: '组合', lgSeq: '时序', lgProg: 'TRIT-3',
  chTag: '第 ', inLbl: '输入', outLbl: '输出',
  thStep: '步', thExp: '期望', thGot: '实际', thIn: '输入',
  omitRow: '… 省略 {0} 行 …', winDefault: '验证通过！',
  useIn: '点击端子切换 −/0/+', useOut: '实时输出', ioToggle: '点击切换',
  tlInfo: '共 {0} 拍 · {1}输入 {2}输出 {3}寄存器',
  nextLbl: '下一条', endLbl: '(越界/结束)', execLbl: '执行', hltDone: 'HLT 停机 ✓',
  sumPassC: '✓ 全部通过 {0}/{1}', sumFailC: '✗ {0}/{1}，红色行为失败',
  sumPassS: '✓ 时序全部通过 {0}/{1}', sumFailS: '✗ {0}/{1}（每步：置输入，滴答，检查）',
  sumPassP: '✓ 程序全部通过 {0}/{1}', sumFailP: '✗ 通过 {0}/{1}',
  sumProgN: '共 {0} 组程序测试，点「运行程序」验证',
  cpuRegs: 'R0–R3 · M0–M8 · 3-trit（−13…+13）',
  cpuReady: '已复位，待运行', cpuHalted: '已停机，请复位', cpuIpOor: 'IP 越界',
  cpuAsmErr: '汇编错误：', cpuRanTests: '已运行 {0} 组测试',
  confirmReset: '清空全部进度与存档？', resetDone: '已重置',
  tCleared: '连线已清空', tNoDelIO: '输入/输出端子不能删除',
  tInUse: '该输入已连线（右键点线删除）', tNoSelf: '不能连回同一元件',
  tFirstOut: '先按住输出钉拖到这里（或先点输出钉再点这里）',
  tWpDel: '已删除导线节点（右键点导线本体删除整根线）',
  tRed: '还有红色用例，点「说明与提示」看看',
  tCopied: '已复制 {0} 个元件',
  simLoop: '组合环', simRun: '运行中 ✓', simFloat: '运行中 · {0}悬空', simTick: '滴答 ✓',
  simOverlap: '导线重叠 {0} 处：只允许交叉穿过', overlapBlock: '存在重叠导线：只允许交叉穿过，请先改线',
  selWp: '选中：导线节点', selWire: '选中：导线', selN: '选中 {0} 个', selNone: '未选中',
  eUnknown: '第{0}行：未知指令 {1}', eArgc: '第{0}行：{1} 需要 {2} 个参数',
  eIp: 'IP 越界 {0}', eLit: '第{0}行 LIT 参数错', eReg: '第{0}行 寄存器错',
  eImm: '第{0}行 第三个参数应为寄存器或立即数', eAddr: '第{0}行 地址须 0..8',
  eLabel: '第{0}行 未知标签 {1}', eJump: '第{0}行 跳转参数错', eSteps: '步数超限（死循环？缺 HLT？）',
},
en: {
  title: 'Ternary Complete · Balanced-Ternary Computer',
  tagline: 'Balanced ternary · from one gate to a computer · tribute to Setun (1958)',
  navMap: 'Map', done: 'done', gatesW: 'gates', converter: 'Convert', helpQ: '?', reset: 'Reset', langBtn: '中文',
  crumbMap: 'Roadmap', crumbPick: 'Pick a mission to enter the wiring bench',
  mapTitle: 'Roadmap', mapSub: 'From one gate to a ternary computer · tribute to Setun (1958)',
  mapDesc: 'Click any unlocked node to enter the bench. Beaten circuits become standard parts for later levels.',
  legDone: 'beaten', legCur: 'current', legLock: 'locked',
  devOff: 'Dev mode: off', devOn: 'Dev mode: on',
  devToastOn: 'Dev mode on: all 18 levels unlocked', devToastOff: 'Dev mode off',
  setunB: 'Why ternary?',
  setunP: 'A single NAND is complete in binary logic, but <strong>not</strong> in three-valued logic. Balanced ternary needs <strong>threshold gates NTI / PTI</strong> to express every function. That is why Soviet Setun used threshold logic, and what Chapter 0 proves by hand.',
  kProg: 'assembly', kSeq: 'sequential', kComb: 'combo', uSteps: 'steps', uTests: 'tests',
  chapters: ['0 · Balanced Ternary', '1 · Select & Decide', '2 · Arithmetic', '3 · Storage', '4 · Complete'],
  chDesc: [
    'Three states −/0/+, negate/min/max, prove TNAND incomplete by hand',
    'Past thresholds: the universal MUX, comparison scales, address decoding',
    'Half add → full add → ripple → subtract, arithmetic with no complement',
    'MUX + flip-flop + feedback = registers, counters, memory',
    'ALU + TRIT-3 assembly: the moment your loop runs, it is complete',
  ],
  back: 'Back to map', tickBtn: 'Tick', autoBtn: 'Auto', clearWires: 'Clear wires', delSel: 'Delete',
  refBtn: 'Reference', refConfirm: 'Loading the reference overwrites your work. Continue?',
  infoBtn: 'Guide & hints', runTests: 'Run tests', tlBtn: 'Timeline', paletteT: 'Parts',
  noGates: 'No parts needed: just wire it up',
  boardHint: 'Hold an <b>output pin</b> and <b>drag</b> to an input pin · hold a wire and <b>drag</b> to reroute · double-click adds nodes · right-click deletes · drag empty space to select · space/middle/right-drag pans · wheel zooms · click an input to cycle −/0/+',
  tlTitle: 'Timeline', tlClear: 'Clear', tlEmpty: 'Tick once to start recording (one frame per T)',
  testsT: 'Test cases', infoT: 'About',
  expand: 'Expand ▴', collapse: 'Fold ▾', noRun: 'Tests not run yet',
  cpuAsm: 'TRIT-3 Assembler', cpuSub: '3-trit words · −13…+13', cpuRun: 'Run', cpuStep: 'Step',
  cpuReset: 'Reset CPU', cpuStateT: 'CPU state', isaT: 'ISA',
  isa: 'LIT Rd, imm(−13…+13, +0− or decimal)\nADD Rd,Ra,Rb   MIN Rd,Ra,Rb   MAX Rd,Ra,Rb\nNEG Rd,Ra      MOV Rd,Ra      INP Rd / OUT Ra\nLD Rd,[a]  ST Ra,[a]   (a = 0…8)\nJMP L  JPZ Ra,L  JPP Ra,L  JPN Ra,L\nHLT   labels as  L:  comments with #',
  convT: '⇄ Balanced-ternary converter', convDecPh: 'decimal, e.g. 11', convBalPh: 'balanced, e.g. +0−',
  convNeedInt: 'enter an integer', convBadFmt: 'shape like +0− (use + 0 -)', convPending: 'pending',
  convNote: '+ means +1, −/- means −1, 0 is zero. MSB left, weights …9,3,1. e.g. +0− = 9+0−1 = 8.',
  infoKicker: 'Level briefing', infoBack: 'Back to bench',
  winKicker: '✓ All green', winMap: 'Map', winNext: 'Next →', winClear: 'cleared',
  helpKicker: 'How to play', helpTitle: 'From logic gates to CPU, except ternary', helpStart: 'Start building',
  h0: '<b>Three states:</b> every wire is <span class="t neg">−</span> / <span class="t zero">0</span> / <span class="t pos">+</span>. Click an input terminal to cycle.',
  h1: '<b>Wiring:</b> hold an <b>output pin</b>, drag onto an <b>input pin</b> and release (or click both). Right-angle routing.',
  h2: '<b>Editing wires:</b> hold a wire and drag to reroute it; double-click adds a draggable node; right-click a wire to delete it; right-click a node to drop just that node.',
  h3: '<b>Select:</b> drag empty space to box-select, Shift adds; Delete removes; Esc cancels.',
  h4: '<b>View:</b> space/middle/right-drag pans, wheel zooms. Ctrl+Z/Y undo/redo, Ctrl+C/V copy/paste.',
  h5: '<b>Passing:</b> the bottom strip lists every case. Hit Run tests up right: all green unlocks new standard parts.',
  h6: '<b>Clock:</b> tick levels with flip-flops forward with Tick; sequence tests tick automatically. Auto gears 1/2/5/10 TPS, beats counted in the toolbar, every tick lands on the <b>timeline</b> below.',
  h7: '<b>Debug:</b> the top-left IO strip toggles inputs on click; dev mode opens all 18 levels at once.',
  h8: '<b>Wiring rule:</b> any two wires may cross but never overlap, no exceptions; overlaps glow red and block tests. Give each fan-out branch its own lane.',
  lgComb: 'COMBO', lgSeq: 'SEQ', lgProg: 'TRIT-3',
  chTag: 'Ch ', inLbl: 'in', outLbl: 'out',
  thStep: 'step', thExp: 'exp', thGot: 'got', thIn: 'in',
  omitRow: '… {0} rows omitted …', winDefault: 'Checks green!',
  useIn: 'click terminal to cycle −/0/+', useOut: 'live output', ioToggle: 'toggle',
  tlInfo: '{0} ticks · {1} in {2} out {3} regs',
  nextLbl: 'next', endLbl: '(out of range)', execLbl: 'run', hltDone: 'HLT halted ✓',
  sumPassC: '✓ all {0}/{1} green', sumFailC: '✗ {0}/{1}, red rows fail',
  sumPassS: '✓ sequence {0}/{1} green', sumFailS: '✗ {0}/{1} (each step: drive, tick, check)',
  sumPassP: '✓ program {0}/{1} green', sumFailP: '✗ {0}/{1} pass',
  sumProgN: '{0} program tests: hit Run to verify',
  cpuRegs: 'R0–R3 · M0–M8 · 3-trit (−13…+13)',
  cpuReady: 'Reset, ready', cpuHalted: 'Halted, please reset', cpuIpOor: 'IP out of range',
  cpuAsmErr: 'Asm errors: ', cpuRanTests: 'ran {0} test groups',
  confirmReset: 'Wipe all progress and saves?', resetDone: 'Reset done',
  tCleared: 'Wires cleared', tNoDelIO: 'IO terminals cannot be deleted',
  tInUse: 'That input is wired already (right-click the wire to drop it)', tNoSelf: 'Cannot loop back into the same part',
  tFirstOut: 'Hold an output pin first, then drop it here (or click output, then here)',
  tWpDel: 'Node dropped (right-click the wire body to delete the whole wire)',
  tRed: 'Red rows remain, check the guide & hints',
  tCopied: 'Copied {0} parts',
  simLoop: 'COMB LOOP', simRun: 'running ✓', simFloat: 'running · {0} floating', simTick: 'ticked ✓',
  simOverlap: 'wire overlap ×{0}: crossing only', overlapBlock: 'Overlapping wires: crossing only, reroute first',
  selWp: 'selected: wire node', selWire: 'selected: wire', selN: '{0} selected', selNone: 'nothing selected',
  eUnknown: 'line {0}: unknown op {1}', eArgc: 'line {0}: {1} needs {2} args',
  eIp: 'IP out of range {0}', eLit: 'line {0}: bad LIT args', eReg: 'line {0}: bad register',
  eImm: 'line {0}: third arg must be register or immediate', eAddr: 'line {0}: address must be 0..8',
  eLabel: 'line {0}: unknown label {1}', eJump: 'line {0}: bad jump args', eSteps: 'step limit hit (infinite loop? missing HLT?)',
},
};

let LANG = 'zh';
try { LANG = localStorage.getItem('tc-lang') || 'zh'; } catch {}
if (!I18N[LANG]) LANG = 'zh';

function t(k, ...a) {
  let s = (I18N[LANG] && I18N[LANG][k] !== undefined) ? I18N[LANG][k] : (I18N.zh[k] !== undefined ? I18N.zh[k] : k);
  if (typeof s !== 'string') return s;
  a.forEach((v, i) => { s = s.split('{' + i + '}').join(v); });
  return s;
}
function chList() { return I18N[LANG].chapters || I18N.zh.chapters; }
function compName(k) {
  if (LANG === 'en' && typeof NAME_EN !== 'undefined' && NAME_EN[k]) return NAME_EN[k];
  if (typeof COMP_DEFS !== 'undefined' && COMP_DEFS[k]) return COMP_DEFS[k].name;
  return k;
}
function compDesc(k) {
  if (LANG === 'en' && typeof DESC_EN !== 'undefined' && DESC_EN[k]) return DESC_EN[k];
  if (typeof COMP_DEFS !== 'undefined' && COMP_DEFS[k]) return COMP_DEFS[k].desc || '';
  return '';
}
function applyI18n() {
  document.title = t('title');
  try { document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en'; } catch {}
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}
function setLang(l) {
  LANG = (l === 'en') ? 'en' : 'zh';
  try { localStorage.setItem('tc-lang', LANG); } catch {}
  applyI18n();
  if (document.getElementById('map-view').hidden) loadLevel(S.cur);
  else showMap();
  const b = document.getElementById('btn-lang');
  if (b) b.textContent = t('langBtn');
}
