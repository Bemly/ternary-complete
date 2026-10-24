/* 全关参考解回归：电路关 REF_SPEC、汇编关 REF_PROG 在无 DOM 环境下跑满全部测试向量。
 * 用法：node scripts/check_solutions.js（退出码非 0 即有失败）
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let src = ['ternary.js', 'levels.js', 'i18n.js', 'cpu.js', 'editor.js', 'solutions.js']
  .map(read).join('\n');
src += `
let fails = 0;
for (const lv of LEVELS.filter(l => l.kind === 'circuit')) {
  const spec = REF_SPEC[lv.id];
  if (!spec) { console.log('MISS SPEC ' + lv.id); fails++; continue; }
  Editor.circuit = specToCircuit(lv, spec);
  // 参考解只能用本关元件箱里有的元件
  const illegal = [...new Set(spec.nodes.map(n => n.t))].filter(k => !(lv.palette || []).includes(k));
  if (illegal.length) { console.log('   参考解用了元件箱外的元件 ' + lv.id + ': ' + illegal.join(',')); fails++; }
  let pass = 0, total = 0;
  const bad = [];
  if (lv.seq) {
    Editor.resetStates();
    const steps = lv.steps();
    total = steps.length;
    for (const s of steps) {
      Editor.setInputs(s.in);
      Editor.tickSilent();
      const got = Editor.getOutputs();
      if (got.length === s.out.length && got.every((x, i) => x === s.out[i])) pass++;
      else bad.push('step in=' + JSON.stringify(s.in) + ' want=' + JSON.stringify(s.out) + ' got=' + JSON.stringify(got));
    }
  } else {
    Editor.resetStates();
    const tests = lv.tests();
    total = tests.length;
    for (const tt of tests) {
      Editor.setInputs(tt.in);
      const got = Editor.getOutputs();
      if (got.length === tt.out.length && got.every((x, i) => x === tt.out[i])) pass++;
      else bad.push('case in=' + JSON.stringify(tt.in) + ' want=' + JSON.stringify(tt.out) + ' got=' + JSON.stringify(got));
    }
  }
  console.log((pass === total ? 'ok  ' : 'FAIL') + ' ' + lv.id + ' ' + pass + '/' + total);
  for (const b of bad.slice(0, 5)) console.log('   ' + b);
  if (pass !== total) fails++;
}
for (const lv of LEVELS.filter(l => l.kind === 'program')) {
  const code = REF_PROG[lv.id];
  if (!code) { console.log('MISS PROG ' + lv.id); fails++; continue; }
  const ts = lv.progTests();
  // starter 只能是骨架，不得直接通过全部测试
  for (const st of [lv.starter].filter(Boolean)) {
    const ok = ts.every(tt => { const r = CPU.run(st, tt.in); return r.ok && JSON.stringify(r.out) === JSON.stringify(tt.want); });
    if (ok) { console.log('   starter 已是答案 ' + lv.id); fails++; }
  }
  let pass = 0;
  for (const tt of ts) {
    const r = CPU.run(code, tt.in);
    if (r.ok && JSON.stringify(r.out) === JSON.stringify(tt.want)) pass++;
    else console.log('   prog fail', lv.id, JSON.stringify(tt.in), 'got', JSON.stringify(r.out), r.errs || '');
  }
  console.log((pass === ts.length ? 'ok  ' : 'FAIL') + ' ' + lv.id + ' ' + pass + '/' + ts.length);
  if (pass !== ts.length) fails++;
}
if (fails) { console.log('FAILURES: ' + fails); process.exitCode = 1; }
else console.log('ALL SOLUTIONS PASS');
`;
eval(src);
