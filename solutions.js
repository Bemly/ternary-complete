/* 18 关参考解：16 关电路规格 + 2 关汇编（复用已验证的 starter）。
 * 规格格式：nodes: [{t:元件类型, x, y}]（门编号 g0…），
 * wires: [{f:['in'|'g'|'out', 序号, 引脚], t:[...]}]，in/out 序号与关卡 inputs/outputs 同序。
 * specToCircuit() 为纯函数（无 DOM），浏览器载入走 loadRefSolution()，
 * scripts/check_solutions.js 用同一份规格做全关 headless 回归。
 */
'use strict';

const REF_SPEC = {
// t0_wire: 直连
t0_wire: { nodes: [], wires: [
  { f: ['in', 0, 'Q'], t: ['out', 0, 'A'] },
] },
// t0_sti: TNAND(A,A)
t0_sti: { nodes: [{ t: 'TNAND', x: 220, y: 132 }], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 0, 'Q'], t: ['g', 0, 'B'] },
  { f: ['g', 0, 'Y'], t: ['out', 0, 'A'] },
] },
// t0_min: STI(TNAND(A,B))
t0_min: { nodes: [{ t: 'TNAND', x: 220, y: 132 }, { t: 'STI', x: 418, y: 132 }], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 1, 'Q'], t: ['g', 0, 'B'] },
  { f: ['g', 0, 'Y'], t: ['g', 1, 'A'] },
  { f: ['g', 1, 'Y'], t: ['out', 0, 'A'] },
] },
// t0_max: STI(TMIN(STI(A),STI(B)))，德·摩根
t0_max: { nodes: [
  { t: 'STI', x: 198, y: 88 }, { t: 'STI', x: 198, y: 220 },
  { t: 'TMIN', x: 396, y: 154 }, { t: 'STI', x: 572, y: 154 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 1, 'Q'], t: ['g', 1, 'A'] },
  { f: ['g', 0, 'Y'], t: ['g', 2, 'A'] },
  { f: ['g', 1, 'Y'], t: ['g', 2, 'B'] },
  { f: ['g', 2, 'Y'], t: ['g', 3, 'A'] },
  { f: ['g', 3, 'Y'], t: ['out', 0, 'A'] },
] },
// t0_thr: ISP = STI(PTI(A))
t0_thr: { nodes: [{ t: 'PTI', x: 220, y: 132 }, { t: 'STI', x: 418, y: 132 }], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['g', 0, 'Y'], t: ['g', 1, 'A'] },
  { f: ['g', 1, 'Y'], t: ['out', 0, 'A'] },
] },
// t1_mux: n=NTI, z=TMIN(PTI,STI(NTI)), p=STI(PTI)，三路门控后取大
t1_mux: { nodes: [
  { t: 'NTI', x: 198, y: 88 }, { t: 'PTI', x: 198, y: 220 },
  { t: 'STI', x: 374, y: 132 }, { t: 'TMIN', x: 550, y: 176 },
  { t: 'STI', x: 374, y: 308 }, { t: 'TMIN', x: 198, y: 396 },
  { t: 'TMIN', x: 374, y: 418 }, { t: 'TMIN', x: 550, y: 440 },
  { t: 'TMAX', x: 374, y: 550 }, { t: 'TMAX', x: 550, y: 550 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 0, 'Q'], t: ['g', 1, 'A'] },
  { f: ['g', 0, 'Y'], t: ['g', 2, 'A'] },
  { f: ['g', 1, 'Y'], t: ['g', 3, 'A'] },
  { f: ['g', 2, 'Y'], t: ['g', 3, 'B'] },
  { f: ['g', 1, 'Y'], t: ['g', 4, 'A'] },
  { f: ['in', 1, 'Q'], t: ['g', 5, 'A'] },
  { f: ['g', 0, 'Y'], t: ['g', 5, 'B'] },
  { f: ['in', 2, 'Q'], t: ['g', 6, 'A'] },
  { f: ['g', 3, 'Y'], t: ['g', 6, 'B'] },
  { f: ['in', 3, 'Q'], t: ['g', 7, 'A'] },
  { f: ['g', 4, 'Y'], t: ['g', 7, 'B'] },
  { f: ['g', 5, 'Y'], t: ['g', 8, 'A'] },
  { f: ['g', 6, 'Y'], t: ['g', 8, 'B'] },
  { f: ['g', 8, 'Y'], t: ['g', 9, 'A'] },
  { f: ['g', 7, 'Y'], t: ['g', 9, 'B'] },
  { f: ['g', 9, 'Y'], t: ['out', 0, 'A'] },
] },
// t1_cmp: 4×MUX 查表嵌套（3 行 + 1 总选）
t1_cmp: { nodes: [
  { t: 'C_Z', x: 176, y: 110 }, { t: 'C_M', x: 176, y: 220 }, { t: 'C_P', x: 176, y: 330 },
  { t: 'MUX', x: 352, y: 110 }, { t: 'MUX', x: 352, y: 264 }, { t: 'MUX', x: 352, y: 418 },
  { t: 'MUX', x: 550, y: 264 },
], wires: [
  { f: ['in', 1, 'Q'], t: ['g', 3, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 4, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 5, 'S'] },
  { f: ['g', 0, 'Y'], t: ['g', 3, 'Dm'] },
  { f: ['g', 1, 'Y'], t: ['g', 3, 'Dz'] },
  { f: ['g', 1, 'Y'], t: ['g', 3, 'Dp'] },
  { f: ['g', 2, 'Y'], t: ['g', 4, 'Dm'] },
  { f: ['g', 0, 'Y'], t: ['g', 4, 'Dz'] },
  { f: ['g', 1, 'Y'], t: ['g', 4, 'Dp'] },
  { f: ['g', 2, 'Y'], t: ['g', 5, 'Dm'] },
  { f: ['g', 2, 'Y'], t: ['g', 5, 'Dz'] },
  { f: ['g', 0, 'Y'], t: ['g', 5, 'Dp'] },
  { f: ['in', 0, 'Q'], t: ['g', 6, 'S'] },
  { f: ['g', 3, 'Y'], t: ['g', 6, 'Dm'] },
  { f: ['g', 4, 'Y'], t: ['g', 6, 'Dz'] },
  { f: ['g', 5, 'Y'], t: ['g', 6, 'Dp'] },
  { f: ['g', 6, 'Y'], t: ['out', 0, 'A'] },
] },
// t1_dec: Ym=ISN, Yz=ISZ, Yp=ISP
t1_dec: { nodes: [
  { t: 'NTI', x: 220, y: 88 }, { t: 'PTI', x: 220, y: 242 },
  { t: 'STI', x: 396, y: 132 }, { t: 'TMIN', x: 572, y: 176 },
  { t: 'STI', x: 396, y: 330 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 0, 'Q'], t: ['g', 1, 'A'] },
  { f: ['g', 0, 'Y'], t: ['out', 0, 'A'] },
  { f: ['g', 0, 'Y'], t: ['g', 2, 'A'] },
  { f: ['g', 1, 'Y'], t: ['g', 3, 'A'] },
  { f: ['g', 2, 'Y'], t: ['g', 3, 'B'] },
  { f: ['g', 3, 'Y'], t: ['out', 1, 'A'] },
  { f: ['g', 1, 'Y'], t: ['g', 4, 'A'] },
  { f: ['g', 4, 'Y'], t: ['out', 2, 'A'] },
] },
// t2_hadd: 和与进位各用“1 外层 MUX + 2 行内 MUX”查表
t2_hadd: { nodes: [
  { t: 'MUX', x: 242, y: 88 }, { t: 'MUX', x: 242, y: 242 }, { t: 'MUX', x: 462, y: 176 },
  { t: 'MUX', x: 242, y: 418 }, { t: 'MUX', x: 242, y: 572 }, { t: 'MUX', x: 462, y: 506 },
  { t: 'C_P', x: 150, y: 44 }, { t: 'C_M', x: 110, y: 352 }, { t: 'C_Z', x: 110, y: 528 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 2, 'S'] },
  { f: ['in', 0, 'Q'], t: ['g', 5, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 0, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 1, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 3, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 4, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 2, 'Dz'] },
  { f: ['g', 6, 'Y'], t: ['g', 0, 'Dm'] },
  { f: ['g', 7, 'Y'], t: ['g', 0, 'Dz'] },
  { f: ['g', 8, 'Y'], t: ['g', 0, 'Dp'] },
  { f: ['g', 8, 'Y'], t: ['g', 1, 'Dm'] },
  { f: ['g', 6, 'Y'], t: ['g', 1, 'Dz'] },
  { f: ['g', 7, 'Y'], t: ['g', 1, 'Dp'] },
  { f: ['g', 0, 'Y'], t: ['g', 2, 'Dm'] },
  { f: ['g', 1, 'Y'], t: ['g', 2, 'Dp'] },
  { f: ['g', 2, 'Y'], t: ['out', 0, 'A'] },
  { f: ['g', 7, 'Y'], t: ['g', 3, 'Dm'] },
  { f: ['g', 8, 'Y'], t: ['g', 3, 'Dz'] },
  { f: ['g', 8, 'Y'], t: ['g', 3, 'Dp'] },
  { f: ['g', 8, 'Y'], t: ['g', 4, 'Dm'], pts: [[156, 640]] },
  { f: ['g', 8, 'Y'], t: ['g', 4, 'Dz'] },
  { f: ['g', 6, 'Y'], t: ['g', 4, 'Dp'] },
  { f: ['g', 3, 'Y'], t: ['g', 5, 'Dm'] },
  { f: ['g', 8, 'Y'], t: ['g', 5, 'Dz'] },
  { f: ['g', 4, 'Y'], t: ['g', 5, 'Dp'] },
  { f: ['g', 5, 'Y'], t: ['out', 1, 'A'] },
] },
// t2_fadd: HADD(A,B) + HADD(s1,Ci)，第三个 HADD 把两次进位相加取和得 Co
t2_fadd: { nodes: [
  { t: 'HADD', x: 220, y: 132 }, { t: 'HADD', x: 440, y: 132 }, { t: 'HADD', x: 440, y: 308 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 1, 'Q'], t: ['g', 0, 'B'] },
  { f: ['g', 0, 'S'], t: ['g', 1, 'A'] },
  { f: ['in', 2, 'Q'], t: ['g', 1, 'B'] },
  { f: ['g', 1, 'S'], t: ['out', 0, 'A'] },
  { f: ['g', 0, 'C'], t: ['g', 2, 'A'] },
  { f: ['g', 1, 'C'], t: ['g', 2, 'B'] },
  { f: ['g', 2, 'S'], t: ['out', 1, 'A'] },
] },
// t2_add2: 低位半加 + 高位全加行波
t2_add2: { nodes: [
  { t: 'HADD', x: 220, y: 154 }, { t: 'FADD', x: 440, y: 154 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 2, 'Q'], t: ['g', 0, 'B'] },
  { f: ['g', 0, 'S'], t: ['out', 0, 'A'] },
  { f: ['g', 0, 'C'], t: ['g', 1, 'Ci'] },
  { f: ['in', 1, 'Q'], t: ['g', 1, 'A'], pts: [[200, 120], [452, 120]] },
  { f: ['in', 3, 'Q'], t: ['g', 1, 'B'] },
  { f: ['g', 1, 'S'], t: ['out', 1, 'A'] },
  { f: ['g', 1, 'Co'], t: ['out', 2, 'A'] },
] },
// t2_sub: B 逐位取反后送 ADD2
t2_sub: { nodes: [
  { t: 'STI', x: 198, y: 280 }, { t: 'STI', x: 198, y: 380 }, { t: 'ADD2', x: 440, y: 220 },
], wires: [
  { f: ['in', 2, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 3, 'Q'], t: ['g', 1, 'A'] },
  { f: ['in', 0, 'Q'], t: ['g', 2, 'A0'] },
  { f: ['in', 1, 'Q'], t: ['g', 2, 'A1'] },
  { f: ['g', 0, 'Y'], t: ['g', 2, 'B0'] },
  { f: ['g', 1, 'Y'], t: ['g', 2, 'B1'] },
  { f: ['g', 2, 'S0'], t: ['out', 0, 'A'] },
  { f: ['g', 2, 'S1'], t: ['out', 1, 'A'] },
  { f: ['g', 2, 'C'], t: ['out', 2, 'A'] },
] },
// s3_reg: next = MUX(EN, Q, Q, D) → DFF
s3_reg: { nodes: [
  { t: 'MUX', x: 330, y: 176 }, { t: 'DFF', x: 550, y: 176 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 0, 'Dp'] },
  { f: ['g', 1, 'Q'], t: ['g', 0, 'Dm'] },
  { f: ['g', 1, 'Q'], t: ['g', 0, 'Dz'] },
  { f: ['g', 0, 'Y'], t: ['g', 1, 'D'] },
  { f: ['g', 1, 'Q'], t: ['out', 0, 'A'] },
] },
// s3_cnt: next = ADD2(Q, +1)，EN 经 MUX 选择保持/更新
s3_cnt: { nodes: [
  { t: 'REG1', x: 264, y: 132 }, { t: 'REG1', x: 264, y: 330 },
  { t: 'ADD2', x: 528, y: 220 },
  { t: 'MUX', x: 418, y: 110 }, { t: 'MUX', x: 418, y: 374 },
  { t: 'C_P', x: 176, y: 88 }, { t: 'C_Z', x: 110, y: 286 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 3, 'S'] },
  { f: ['in', 0, 'Q'], t: ['g', 4, 'S'] },
  { f: ['g', 0, 'Q'], t: ['g', 2, 'A0'] },
  { f: ['g', 1, 'Q'], t: ['g', 2, 'A1'] },
  { f: ['g', 5, 'Y'], t: ['g', 2, 'B0'] },
  { f: ['g', 6, 'Y'], t: ['g', 2, 'B1'] },
  { f: ['g', 0, 'Q'], t: ['g', 3, 'Dm'] },
  { f: ['g', 0, 'Q'], t: ['g', 3, 'Dz'] },
  { f: ['g', 2, 'S0'], t: ['g', 3, 'Dp'] },
  { f: ['g', 1, 'Q'], t: ['g', 4, 'Dm'] },
  { f: ['g', 1, 'Q'], t: ['g', 4, 'Dz'] },
  { f: ['g', 2, 'S1'], t: ['g', 4, 'Dp'] },
  { f: ['g', 3, 'Y'], t: ['g', 0, 'D'] },
  { f: ['g', 4, 'Y'], t: ['g', 1, 'D'] },
  { f: ['g', 5, 'Y'], t: ['g', 0, 'EN'] },
  { f: ['g', 5, 'Y'], t: ['g', 1, 'EN'] },
  { f: ['g', 0, 'Q'], t: ['out', 0, 'A'] },
  { f: ['g', 1, 'Q'], t: ['out', 1, 'A'] },
] },
// s3_mem: DEC 译码写选 + 3×REG + MUX 读出
s3_mem: { nodes: [
  { t: 'DEC', x: 176, y: 176 }, { t: 'ISP', x: 198, y: 396 },
  { t: 'TMIN', x: 352, y: 110 }, { t: 'TMIN', x: 352, y: 242 }, { t: 'TMIN', x: 352, y: 374 },
  { t: 'REG1', x: 506, y: 88 }, { t: 'REG1', x: 484, y: 220 }, { t: 'REG1', x: 506, y: 352 },
  { t: 'MUX', x: 630, y: 220 },
], wires: [
  { f: ['in', 1, 'Q'], t: ['g', 0, 'S'] },
  { f: ['in', 0, 'Q'], t: ['g', 1, 'A'] },
  { f: ['g', 1, 'Y'], t: ['g', 2, 'A'] },
  { f: ['g', 1, 'Y'], t: ['g', 3, 'A'] },
  { f: ['g', 1, 'Y'], t: ['g', 4, 'A'] },
  { f: ['g', 0, 'Ym'], t: ['g', 2, 'B'] },
  { f: ['g', 0, 'Yz'], t: ['g', 3, 'B'] },
  { f: ['g', 0, 'Yp'], t: ['g', 4, 'B'] },
  { f: ['g', 2, 'Y'], t: ['g', 5, 'EN'] },
  { f: ['g', 3, 'Y'], t: ['g', 6, 'EN'] },
  { f: ['g', 4, 'Y'], t: ['g', 7, 'EN'] },
  { f: ['in', 2, 'Q'], t: ['g', 5, 'D'] },
  { f: ['in', 2, 'Q'], t: ['g', 6, 'D'] },
  { f: ['in', 2, 'Q'], t: ['g', 7, 'D'] },
  { f: ['g', 5, 'Q'], t: ['g', 8, 'Dm'] },
  { f: ['g', 6, 'Q'], t: ['g', 8, 'Dz'] },
  { f: ['g', 7, 'Q'], t: ['g', 8, 'Dp'] },
  { f: ['in', 1, 'Q'], t: ['g', 8, 'S'], pts: [[170, 60], [642, 60]] },
  { f: ['g', 8, 'Y'], t: ['out', 0, 'A'] },
] },
// c4_alu: Y = MUX(OP, HADD.S, TMIN, TMAX)
c4_alu: { nodes: [
  { t: 'HADD', x: 220, y: 132 }, { t: 'TMIN', x: 220, y: 286 }, { t: 'TMAX', x: 220, y: 418 },
  { t: 'MUX', x: 440, y: 264 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 3, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 1, 'Q'], t: ['g', 1, 'A'] },
  { f: ['in', 1, 'Q'], t: ['g', 2, 'A'] },
  { f: ['in', 2, 'Q'], t: ['g', 0, 'B'] },
  { f: ['in', 2, 'Q'], t: ['g', 1, 'B'] },
  { f: ['in', 2, 'Q'], t: ['g', 2, 'B'] },
  { f: ['g', 0, 'S'], t: ['g', 3, 'Dm'] },
  { f: ['g', 1, 'Y'], t: ['g', 3, 'Dz'] },
  { f: ['g', 2, 'Y'], t: ['g', 3, 'Dp'] },
  { f: ['g', 3, 'Y'], t: ['out', 0, 'A'] },
] },
};

// 输入输出端子布局与 Editor.loadLevel 完全一致
function specToCircuit(lv, spec) {
  const nodes = [];
  const wires = [];
  let nid = 1, wid = 1;
  const inIds = lv.inputs.map((nm, i) => {
    const y = 80 + i * Math.max(72, Math.min(110, 400 / Math.max(1, lv.inputs.length)));
    nodes.push({ nid: nid++, type: 'INPUT', x: 40, y, val: 0, state: 0, ioName: nm });
    return nid - 1;
  });
  const outIds = lv.outputs.map((nm, i) => {
    const y = 80 + i * Math.max(72, Math.min(110, 400 / Math.max(1, lv.outputs.length)));
    nodes.push({ nid: nid++, type: 'OUTPUT', x: 720, y, val: 0, state: 0, ioName: nm });
    return nid - 1;
  });
  const gIds = spec.nodes.map(g => {
    nodes.push({ nid: nid++, type: g.t, x: g.x, y: g.y, val: 0, state: 0 });
    return nid - 1;
  });
  const res = ref => ref[0] === 'in' ? { nid: inIds[ref[1]], pin: ref[2] }
    : ref[0] === 'out' ? { nid: outIds[ref[1]], pin: ref[2] }
    : { nid: gIds[ref[1]], pin: ref[2] };
  for (const w of spec.wires) {
    wires.push({ wid: wid++, from: res(w.f), to: res(w.t), pts: (w.pts || []).map(p => ({ x: p[0], y: p[1] })) });
  }
  return { nodes, wires, nidSeq: nid, widSeq: wid };
}

// 浏览器载入参考解（可撤销：进历史栈）
function loadRefSolution(id) {
  const lv = LEVELS.find(l => l.id === id);
  if (!lv) return false;
  if (lv.kind === 'program') {
    const en = (typeof LANG !== 'undefined' && LANG === 'en' && LEVEL_EN[id] && LEVEL_EN[id].starter)
      ? LEVEL_EN[id].starter : null;
    document.getElementById('cpu-code').value = en || lv.starter || '';
    return true;
  }
  const spec = REF_SPEC[id];
  if (!spec) return false;
  Editor.pushHistory();
  return Editor.restore(JSON.stringify(specToCircuit(lv, spec)));
}
