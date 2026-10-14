/* 三进制完备：核心三值逻辑 */
'use strict';
// trit: -1, 0, 1
const T = {
  neg: a => -a,
  min: (a,b) => Math.min(a,b),
  max: (a,b) => Math.max(a,b),
  // 与非 / 或非（取小后取反）
  tnand: (a,b) => -Math.min(a,b),
  tnor: (a,b) => -Math.max(a,b),
  // 标准反相 STI: -x ；正阈 PTI: + 除非输入+ ；负阈 NTI
  sti: a => -a,
  pti: a => (a === 1 ? -1 : 1),   // -→+, 0→+, +→−
  nti: a => (a === -1 ? 1 : -1),  // -→+, 0→−, +→−
  // 判正 / 判负 / 判零（由阈值门导出，游戏内可搭建）
  isp: a => (a === 1 ? 1 : -1),   // STI(PTI)
  isn: a => (a === -1 ? 1 : -1),  // NTI
  isz: a => (a === 0 ? 1 : -1),   // STI(MAX(NTI,PTI))
  mux: (s, dm, dz, dp) => (s === -1 ? dm : s === 0 ? dz : dp),
  sym: v => (v === -1 ? '−' : v === 0 ? '0' : v === 1 ? '+' : '?'),
  cls: v => (v === -1 ? 'v-1' : v === 0 ? 'v0' : v === 1 ? 'v1' : ''),
  parseSym: ch => {
    if (ch === '+' ) return 1;
    if (ch === '0') return 0;
    if (ch === '-' || ch === '−' || ch === '–') return -1;
    return null;
  }
};

// 半加真值
function halfAdd(a, b) {
  const tot = a + b;
  let sum, carry;
  if (tot === -2) { sum = 1; carry = -1; }
  else if (tot === -1) { sum = -1; carry = 0; }
  else if (tot === 0) { sum = 0; carry = 0; }
  else if (tot === 1) { sum = 1; carry = 0; }
  else { sum = -1; carry = 1; }
  return { sum, carry };
}
function fullAdd(a, b, cin) {
  const tot = a + b + cin;
  // tot ∈ [-3,3] → sum + 3*cout, sum∈{-1,0,1}
  let sum, cout;
  if (tot <= -3) { /* -3 */ sum = 0; cout = -1; }
  else if (tot === -2) { sum = 1; cout = -1; }
  else if (tot === -1) { sum = -1; cout = 0; }
  else if (tot === 0) { sum = 0; cout = 0; }
  else if (tot === 1) { sum = 1; cout = 0; }
  else if (tot === 2) { sum = -1; cout = 1; }
  else { sum = 0; cout = 1; }
  return { sum, cout };
}

// 十进制 ⇄ 平衡三进制
function decToBal(n, width = 0) {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return '';
  if (n === 0) { let s = '0'; while (s.length < width) s = '0' + s; return s; }
  let digs = [];
  let x = n;
  while (x !== 0) {
    let r = ((x % 3) + 3) % 3; // 0,1,2
    x = Math.floor(x / 3);
    if (r === 2) { r = -1; x += 1; }
    digs.push(r);
  }
  let s = digs.reverse().map(d => d === -1 ? '−' : d === 0 ? '0' : '+').join('');
  // 用 ASCII 连字符兼容显示切换
  s = s.replace(/−/g, '-').replace(/-/g, m => m); // 保持 - 即可，下面统一用 +0-
  // 规范为 + 0 -（用 ASCII - 代表负）
  if (width > s.length) s = '0'.repeat(width - s.length) + s;
  return s;
}
function balToDec(str) {
  if (typeof str !== 'string') return NaN;
  str = str.trim().replace(/−|–/g, '-').replace(/\s+/g, '');
  if (!/^[+\-0]+$/.test(str) || str.length === 0) return NaN;
  let v = 0;
  for (const ch of str) {
    v = v * 3 + (ch === '+' ? 1 : ch === '0' ? 0 : -1);
  }
  return v;
}
// 以 trit 数组（低位在前）求值
function tritsToDecLE(trits) {
  let v = 0, p = 1;
  for (const t of trits) { v += t * p; p *= 3; }
  return v;
}
function decToTritsLE(n, len) {
  const s = decToBal(n);
  const arr = s.split('').map(c => c === '+' ? 1 : c === '0' ? 0 : -1);
  arr.reverse(); // 高→低 变 低→高
  while (arr.length < len) arr.push(0);
  return arr.slice(0, len);
}
// 枚举全部输入组合
function enumInputs(n) {
  const out = [];
  const total = Math.pow(3, n);
  for (let k = 0; k < total; k++) {
    let x = k, row = [];
    for (let i = 0; i < n; i++) { const r = x % 3; x = Math.floor(x / 3); row.push(r === 0 ? -1 : r === 1 ? 0 : 1); }
    out.push(row);
  }
  return out;
}
