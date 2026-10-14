/* TRIT-3 CPU：3-trit 字长教学机 */
'use strict';

const CPU = {
  regs: ['R0','R1','R2','R3'],
  memSize: 9,
  clampW(v) {
    // 回绕到 -13..13（3 trits = 27 值）
    v = Math.round(v);
    let m = ((v + 13) % 27 + 27) % 27 - 13;
    return m;
  },
  parse(src) {
    const lines = src.split('\n');
    const prog = []; const labels = {};
    const errs = [];
    const reg = s => { s=s.toUpperCase(); const i=['R0','R1','R2','R3'].indexOf(s); return i; };
    const num = s => {
      s = s.trim().replace(/−/g,'-');
      if (/^[+\-0]+$/.test(s)) { const v = balToDec(s); return Number.isNaN(v)?null:v; }
      if (/^-?\d+$/.test(s)) return parseInt(s,10);
      return null;
    };
    lines.forEach((raw, li) => {
      let line = raw.split('#')[0].trim();
      if (!line) return;
      const lm = line.match(/^([A-Za-z_][\w]*)\s*:\s*(.*)$/);
      if (lm) {
        labels[lm[1].toUpperCase()] = prog.length;
        line = lm[2].trim();
        if (!line) return;
      }
      const parts = line.replace(/,/g,' ').split(/\s+/).filter(Boolean);
      if (!parts.length) return;
      const op = parts[0].toUpperCase();
      const a = parts.slice(1);
      const need = {HLT:0,INP:1,OUT:1,NEG:2,MOV:2,ADD:3,MIN:3,MAX:3,SUB:3,LD:2,ST:2,LIT:2,JMP:1,JPZ:2,JPP:2,JPN:2}[op];
      if (need === undefined) { errs.push(`第${li+1}行：未知指令 ${op}`); return; }
      if (a.length !== need) { errs.push(`第${li+1}行：${op} 需要 ${need} 个参数`); return; }
      prog.push({op, a, line: li+1, raw});
    });
    return { prog, labels, errs };
  },
  run(src, inputs, maxSteps = 500) {
    const { prog, labels, errs } = this.parse(src);
    if (errs.length) return { ok:false, errs };
    const R = [0,0,0,0], M = new Array(this.memSize).fill(0);
    let ip = 0, inp = 0; const out = [];
    const rv = s => { const i=['R0','R1','R2','R3'].indexOf(s.toUpperCase()); return i; };
    const nv = s => {
      s = s.trim().replace(/−/g,'-');
      if (/^[+\-0]+$/.test(s)) return balToDec(s);
      return parseInt(s,10);
    };
    let steps = 0;
    const trace = [];
    while (steps++ < maxSteps) {
      if (ip < 0 || ip >= prog.length) return { ok:false, errs:[`IP 越界 ${ip}`], R, M, out, trace };
      const ins = prog[ip];
      const { op, a } = ins;
      trace.push({ip, op, a:[...a], R:[...R]});
      const nxt = () => ip++;
      if (op === 'HLT') return { ok:true, R, M, out, trace, steps };
      else if (op === 'LIT') { const d=rv(a[0]); const v=nv(a[1]); if(d<0||v===null||!Number.isFinite(v)) return {ok:false,errs:[`第${ins.line}行 LIT 参数错`],R,M,out,trace}; R[d]=this.clampW(v); nxt(); }
      else if (op === 'MOV') { const d=rv(a[0]),s=rv(a[1]); if(d<0||s<0) return {ok:false,errs:[`第${ins.line}行 寄存器错`],R,M,out,trace}; R[d]=R[s]; nxt(); }
      else if (op === 'NEG') { const d=rv(a[0]),s=rv(a[1]); if(d<0||s<0) return {ok:false,errs:[`第${ins.line}行 寄存器错`],R,M,out,trace}; R[d]=this.clampW(-R[s]); nxt(); }
      else if (op==='ADD'||op==='SUB'||op==='MIN'||op==='MAX') {
        const d=rv(a[0]),s1=rv(a[1]); let s2, imm=null;
        if (d<0||s1<0) return {ok:false,errs:[`第${ins.line}行 寄存器错`],R,M,out,trace};
        const third=a[2]; const ri=rv(third);
        if (ri>=0) s2=R[ri]; else { const v=nv(third); if(v===null) return {ok:false,errs:[`第${ins.line}行 第三个参数应为寄存器或立即数`],R,M,out,trace}; s2=v; }
        let v = op==='ADD'?R[s1]+s2:op==='SUB'?R[s1]-s2:op==='MIN'?Math.min(R[s1],s2):Math.max(R[s1],s2);
        R[d]=this.clampW(v); nxt();
      }
      else if (op==='INP') { const d=rv(a[0]); if(d<0) return {ok:false,errs:[`第${ins.line}行 寄存器错`],R,M,out,trace}; R[d]=this.clampW(inp<inputs.length?inputs[inp++]:0); nxt(); }
      else if (op==='OUT') { const s=rv(a[0]); if(s<0) return {ok:false,errs:[`第${ins.line}行 寄存器错`],R,M,out,trace}; out.push(this.clampW(R[s])); nxt(); }
      else if (op==='LD') { const d=rv(a[0]); const ad=nv(a[1].replace(/[\[\]]/g,'')); if(d<0||ad===null||ad<0||ad>8) return {ok:false,errs:[`第${ins.line}行 地址须 0..8`],R,M,out,trace}; R[d]=M[ad]; nxt(); }
      else if (op==='ST') { const s=rv(a[0]); const ad=nv(a[1].replace(/[\[\]]/g,'')); if(s<0||ad===null||ad<0||ad>8) return {ok:false,errs:[`第${ins.line}行 地址须 0..8`],R,M,out,trace}; M[ad]=R[s]; nxt(); }
      else if (op==='JMP') { const t=labels[a[0].toUpperCase()]; if(t===undefined) return {ok:false,errs:[`第${ins.line}行 未知标签 ${a[0]}`],R,M,out,trace}; ip=t; }
      else if (op==='JPZ'||op==='JPP'||op==='JPN') { const s=rv(a[0]); const t=labels[a[1].toUpperCase()]; if(s<0||t===undefined) return {ok:false,errs:[`第${ins.line}行 跳转参数错`],R,M,out,trace}; const c=R[s]; if((op==='JPZ'&&c===0)||(op==='JPP'&&c>0)||(op==='JPN'&&c<0)) ip=t; else nxt(); }
    }
    return { ok:false, errs:['步数超限（死循环？缺 HLT？）'], R, M, out, trace };
  }
};
