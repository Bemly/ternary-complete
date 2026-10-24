/* 全关参考解：电路关用规格（REF_SPEC），汇编关用程序（REF_PROG）。
 * 规格格式：nodes: [{t:元件类型, x, y}]（门编号 g0…），
 * wires: [{f:['in'|'g'|'out', 序号, 引脚], t:[...]}]，in/out 序号与关卡 inputs/outputs 同序。
 * specToCircuit() 为纯函数（无 DOM），浏览器载入走 loadRefSolution()，
 * scripts/check_solutions.js 用同一份规格做全关 headless 回归。
 */
'use strict';

const REF_SPEC = {
// 布局约定：输入端子钉在 (154, 110 + 88i)，输出端子钉在 (outX, 110 + 88i)；
// 门的钉间距一格 22px，尽量让上下游钉同高，走线自然拉直。
// t0_wire: 直连
t0_wire: { nodes: [], wires: [
  { f: ['in', 0, 'Q'], t: ['out', 0, 'A'] },
] },
// t0_sti: TNAND(A,A)
t0_sti: { nodes: [{ t: 'TNAND', x: 330, y: 66 }], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 0, 'Q'], t: ['g', 0, 'B'] },
  { f: ['g', 0, 'Y'], t: ['out', 0, 'A'] },
] },
// t0_min: STI(TNAND(A,B))
t0_min: { nodes: [{ t: 'TNAND', x: 308, y: 66 }, { t: 'STI', x: 506, y: 66 }], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 1, 'Q'], t: ['g', 0, 'B'] },
  { f: ['g', 0, 'Y'], t: ['g', 1, 'A'] },
  { f: ['g', 1, 'Y'], t: ['out', 0, 'A'] },
] },
// t0_max: STI(TMIN(STI(A),STI(B)))，德·摩根
t0_max: { nodes: [
  { t: 'STI', x: 264, y: 66 }, { t: 'STI', x: 264, y: 154 },
  { t: 'TMIN', x: 440, y: 88 }, { t: 'STI', x: 594, y: 66 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 1, 'Q'], t: ['g', 1, 'A'] },
  { f: ['g', 0, 'Y'], t: ['g', 2, 'A'] },
  { f: ['g', 1, 'Y'], t: ['g', 2, 'B'] },
  { f: ['g', 2, 'Y'], t: ['g', 3, 'A'] },
  { f: ['g', 3, 'Y'], t: ['out', 0, 'A'] },
] },
// t0_thr: ISP = STI(PTI(A))
t0_thr: { nodes: [{ t: 'PTI', x: 286, y: 66 }, { t: 'STI', x: 462, y: 66 }], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['g', 0, 'Y'], t: ['g', 1, 'A'] },
  { f: ['g', 1, 'Y'], t: ['out', 0, 'A'] },
] },
// t1_mux: n=NTI, z=TMIN(PTI,STI(NTI)), p=STI(PTI)，三路门控后取大
t1_mux: { outX: 1144, nodes: [
  { t: 'NTI', x: 264, y: 22 }, { t: 'PTI', x: 264, y: 110 },
  { t: 'STI', x: 418, y: 22 }, { t: 'TMIN', x: 572, y: 0 },
  { t: 'STI', x: 418, y: 110 }, { t: 'TMIN', x: 726, y: 176 },
  { t: 'TMIN', x: 726, y: 286 }, { t: 'TMIN', x: 726, y: 396 },
  { t: 'TMAX', x: 880, y: 220 }, { t: 'TMAX', x: 1012, y: 330 },
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
t1_cmp: { outX: 880, nodes: [
  { t: 'C_Z', x: 264, y: 264 }, { t: 'C_M', x: 264, y: 352 }, { t: 'C_P', x: 264, y: 440 },
  { t: 'MUX', x: 462, y: 0 }, { t: 'MUX', x: 462, y: 176 }, { t: 'MUX', x: 462, y: 352 },
  { t: 'MUX', x: 660, y: 154 },
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
  { t: 'NTI', x: 264, y: 66 }, { t: 'PTI', x: 264, y: 220 },
  { t: 'STI', x: 418, y: 132 }, { t: 'TMIN', x: 572, y: 154 },
  { t: 'STI', x: 418, y: 264 },
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
t2_hadd: { outX: 880, nodes: [
  { t: 'MUX', x: 440, y: 0 }, { t: 'MUX', x: 440, y: 176 }, { t: 'MUX', x: 660, y: 44 },
  { t: 'MUX', x: 440, y: 352 }, { t: 'MUX', x: 440, y: 528 }, { t: 'MUX', x: 660, y: 396 },
  { t: 'C_P', x: 242, y: 286 }, { t: 'C_M', x: 242, y: 374 }, { t: 'C_Z', x: 242, y: 462 },
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
  { f: ['g', 8, 'Y'], t: ['g', 4, 'Dm'] },
  { f: ['g', 8, 'Y'], t: ['g', 4, 'Dz'] },
  { f: ['g', 6, 'Y'], t: ['g', 4, 'Dp'] },
  { f: ['g', 3, 'Y'], t: ['g', 5, 'Dm'] },
  { f: ['g', 8, 'Y'], t: ['g', 5, 'Dz'] },
  { f: ['g', 4, 'Y'], t: ['g', 5, 'Dp'] },
  { f: ['g', 5, 'Y'], t: ['out', 1, 'A'] },
] },
// t2_fadd: HADD(A,B) + HADD(s1,Ci)，第三个 HADD 把两次进位相加取和得 Co
t2_fadd: { outX: 924, nodes: [
  { t: 'HADD', x: 286, y: 66 }, { t: 'HADD', x: 528, y: 66 }, { t: 'HADD', x: 726, y: 198 },
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
  { t: 'HADD', x: 330, y: 66 }, { t: 'FADD', x: 550, y: 176 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'A'] },
  { f: ['in', 2, 'Q'], t: ['g', 0, 'B'] },
  { f: ['g', 0, 'S'], t: ['out', 0, 'A'] },
  { f: ['g', 0, 'C'], t: ['g', 1, 'Ci'] },
  { f: ['in', 1, 'Q'], t: ['g', 1, 'A'] },
  { f: ['in', 3, 'Q'], t: ['g', 1, 'B'] },
  { f: ['g', 1, 'S'], t: ['out', 1, 'A'] },
  { f: ['g', 1, 'Co'], t: ['out', 2, 'A'] },
] },
// t2_sub: B 逐位取反后送 ADD2
t2_sub: { nodes: [
  { t: 'STI', x: 264, y: 242 }, { t: 'STI', x: 264, y: 330 }, { t: 'ADD2', x: 506, y: 66 },
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
// t2_mul: Y = MUX(A, STI(B), 0, B)
t2_mul: { nodes: [
  { t: 'STI', x: 286, y: 154 }, { t: 'C_Z', x: 286, y: 264 }, { t: 'MUX', x: 506, y: 66 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 2, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 0, 'A'] },
  { f: ['g', 0, 'Y'], t: ['g', 2, 'Dm'] },
  { f: ['g', 1, 'Y'], t: ['g', 2, 'Dz'] },
  { f: ['in', 1, 'Q'], t: ['g', 2, 'Dp'] },
  { f: ['g', 2, 'Y'], t: ['out', 0, 'A'] },
] },
// s3_reg: next = MUX(EN, Q, Q, D) → DFF
s3_reg: { nodes: [
  { t: 'MUX', x: 330, y: 66 }, { t: 'DFF', x: 528, y: 88 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'S'] },
  { f: ['in', 1, 'Q'], t: ['g', 0, 'Dp'] },
  { f: ['g', 1, 'Q'], t: ['g', 0, 'Dm'] },
  { f: ['g', 1, 'Q'], t: ['g', 0, 'Dz'] },
  { f: ['g', 0, 'Y'], t: ['g', 1, 'D'] },
  { f: ['g', 1, 'Q'], t: ['out', 0, 'A'] },
] },
// s3_shift: D → DFF0 → DFF1 → DFF2
s3_shift: { nodes: [
  { t: 'DFF', x: 242, y: 44 }, { t: 'DFF', x: 418, y: 132 }, { t: 'DFF', x: 594, y: 220 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'D'] },
  { f: ['g', 0, 'Q'], t: ['g', 1, 'D'] },
  { f: ['g', 1, 'Q'], t: ['g', 2, 'D'] },
  { f: ['g', 0, 'Q'], t: ['out', 0, 'A'] },
  { f: ['g', 1, 'Q'], t: ['out', 1, 'A'] },
  { f: ['g', 2, 'Q'], t: ['out', 2, 'A'] },
] },
// s3_cnt: next = ADD2(Q, +1)，REG 自带 EN
s3_cnt: { nodes: [
  { t: 'REG1', x: 550, y: 66 }, { t: 'REG1', x: 550, y: 220 },
  { t: 'ADD2', x: 330, y: 264 },
  { t: 'C_P', x: 176, y: 308 }, { t: 'C_Z', x: 176, y: 396 },
], wires: [
  { f: ['in', 0, 'Q'], t: ['g', 0, 'EN'] },
  { f: ['in', 0, 'Q'], t: ['g', 1, 'EN'] },
  { f: ['g', 0, 'Q'], t: ['g', 2, 'A0'] },
  { f: ['g', 1, 'Q'], t: ['g', 2, 'A1'] },
  { f: ['g', 3, 'Y'], t: ['g', 2, 'B0'] },
  { f: ['g', 4, 'Y'], t: ['g', 2, 'B1'] },
  { f: ['g', 2, 'S0'], t: ['g', 0, 'D'] },
  { f: ['g', 2, 'S1'], t: ['g', 1, 'D'] },
  { f: ['g', 0, 'Q'], t: ['out', 0, 'A'] },
  { f: ['g', 1, 'Q'], t: ['out', 1, 'A'] },
] },
// s3_acc: next = ADD2(Q, [X, 0]) → 2×DFF
s3_acc: { nodes: [
  { t: 'ADD2', x: 330, y: 22 }, { t: 'DFF', x: 550, y: 22 }, { t: 'DFF', x: 550, y: 154 },
  { t: 'C_Z', x: 198, y: 154 },
], wires: [
  { f: ['g', 1, 'Q'], t: ['g', 0, 'A0'] },
  { f: ['g', 2, 'Q'], t: ['g', 0, 'A1'] },
  { f: ['in', 0, 'Q'], t: ['g', 0, 'B0'] },
  { f: ['g', 3, 'Y'], t: ['g', 0, 'B1'] },
  { f: ['g', 0, 'S0'], t: ['g', 1, 'D'] },
  { f: ['g', 0, 'S1'], t: ['g', 2, 'D'] },
  { f: ['g', 1, 'Q'], t: ['out', 0, 'A'] },
  { f: ['g', 2, 'Q'], t: ['out', 1, 'A'] },
] },
// s3_mem: DEC 译码写选 + 3×REG + MUX 读出
s3_mem: { outX: 1056, nodes: [
  { t: 'DEC', x: 242, y: 132 }, { t: 'ISP', x: 242, y: 44 },
  { t: 'TMIN', x: 440, y: 0 }, { t: 'TMIN', x: 440, y: 132 }, { t: 'TMIN', x: 440, y: 264 },
  { t: 'REG1', x: 638, y: 0 }, { t: 'REG1', x: 638, y: 132 }, { t: 'REG1', x: 638, y: 264 },
  { t: 'MUX', x: 858, y: 110 },
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
  { f: ['in', 1, 'Q'], t: ['g', 8, 'S'] },
  { f: ['g', 8, 'Y'], t: ['out', 0, 'A'] },
] },
// c4_alu: Y = MUX(OP, HADD.S, TMIN, TMAX)
c4_alu: { nodes: [
  { t: 'HADD', x: 330, y: 154 }, { t: 'TMIN', x: 330, y: 286 }, { t: 'TMAX', x: 330, y: 396 },
  { t: 'MUX', x: 594, y: 66 },
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
// c4_pc: next = MUX(J, PC+1, PC+1, T) → 2×DFF
c4_pc: { outX: 1012, nodes: [
  { t: 'ADD2', x: 330, y: 308 },
  { t: 'MUX', x: 594, y: 22 }, { t: 'MUX', x: 594, y: 198 },
  { t: 'DFF', x: 770, y: 44 }, { t: 'DFF', x: 770, y: 220 },
  { t: 'C_P', x: 198, y: 352 }, { t: 'C_Z', x: 198, y: 440 },
], wires: [
  { f: ['g', 3, 'Q'], t: ['g', 0, 'A0'] },
  { f: ['g', 4, 'Q'], t: ['g', 0, 'A1'] },
  { f: ['g', 5, 'Y'], t: ['g', 0, 'B0'] },
  { f: ['g', 6, 'Y'], t: ['g', 0, 'B1'] },
  { f: ['in', 0, 'Q'], t: ['g', 1, 'S'] },
  { f: ['g', 0, 'S0'], t: ['g', 1, 'Dm'] },
  { f: ['g', 0, 'S0'], t: ['g', 1, 'Dz'] },
  { f: ['in', 1, 'Q'], t: ['g', 1, 'Dp'] },
  { f: ['in', 0, 'Q'], t: ['g', 2, 'S'] },
  { f: ['g', 0, 'S1'], t: ['g', 2, 'Dm'] },
  { f: ['g', 0, 'S1'], t: ['g', 2, 'Dz'] },
  { f: ['in', 2, 'Q'], t: ['g', 2, 'Dp'] },
  { f: ['g', 1, 'Y'], t: ['g', 3, 'D'] },
  { f: ['g', 2, 'Y'], t: ['g', 4, 'D'] },
  { f: ['g', 3, 'Q'], t: ['out', 0, 'A'] },
  { f: ['g', 4, 'Q'], t: ['out', 1, 'A'] },
] },
};

// 汇编关参考解（编辑器里的 starter 只是骨架，答案在这里）
const REF_PROG = {
c4_prog1: '# 回声取反\nINP R0\nNEG R1, R0\nOUT R1\nHLT\n',
c4_prog2: '# 累加 1+..+n\nINP R0\nLIT R1, 1\nLIT R2, 0\nLOOP:\nSUB R3, R1, R0\nJPP R3, DONE   # R1 > n 结束\nADD R2, R2, R1\nADD R1, R1, 1\nJMP LOOP\nDONE:\nOUT R2\nHLT\n',
c4_prog3: '# 乘法 a×b\nINP R0\nINP R1\nLIT R2, 0\nJPZ R1, DONE\nJPP R1, LOOP\nNEG R0, R0     # b<0：a、b 同时变号\nNEG R1, R1\nLOOP:\nADD R2, R2, R0\nSUB R1, R1, 1\nJPP R1, LOOP\nDONE:\nOUT R2\nHLT\n',
c4_prog4: '# 斐波那契前 n 项\nINP R0\nLIT R1, 1\nLIT R2, 1\nLOOP:\nOUT R1\nSUB R0, R0, 1\nJPZ R0, DONE\nADD R3, R1, R2\nMOV R1, R2\nMOV R2, R3\nJMP LOOP\nDONE:\nHLT\n',
c4_prog5: '# 三数排序：无分支\nINP R0\nINP R1\nINP R2\nMIN R3, R0, R1  # lo\nMAX R0, R0, R1  # hi\nMIN R1, R3, R2\nOUT R1          # 最小\nMIN R1, R0, R2\nMAX R1, R1, R3\nOUT R1          # 中位\nMAX R1, R0, R2\nOUT R1          # 最大\nHLT\n',
};

// 输入输出端子布局与 Editor.loadLevel 完全一致
function specToCircuit(lv, spec) {
  const nodes = [];
  const wires = [];
  let nid = 1, wid = 1;
  const io = ioLayout(lv, spec.outX);
  const inIds = io.ins.map(p => {
    nodes.push({ nid: nid++, type: 'INPUT', x: p.x, y: p.y, val: 0, state: 0, ioName: p.nm });
    return nid - 1;
  });
  const outIds = io.outs.map(p => {
    nodes.push({ nid: nid++, type: 'OUTPUT', x: p.x, y: p.y, val: 0, state: 0, ioName: p.nm });
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
    if (!REF_PROG[id]) return false;
    document.getElementById('cpu-code').value = REF_PROG[id];
    return true;
  }
  const spec = REF_SPEC[id];
  if (!spec) return false;
  Editor.pushHistory();
  return Editor.restore(JSON.stringify(specToCircuit(lv, spec)));
}
