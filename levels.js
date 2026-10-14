/* 元件定义 + 关卡定义 */
'use strict';

const COMP_DEFS = {
  TNAND:{name:'与非',en:'TNAND',inputs:['A','B'],outputs:['Y'],desc:'Y = 取反(取小(A,B))',fn:{Y:(A,B)=>-Math.min(A,B)}},
  TMIN:{name:'取小',en:'TMIN ∧',inputs:['A','B'],outputs:['Y'],desc:'Y = 最小 (三进制与)',fn:{Y:(A,B)=>Math.min(A,B)}},
  TMAX:{name:'取大',en:'TMAX ∨',inputs:['A','B'],outputs:['Y'],desc:'Y = 最大 (三进制或)',fn:{Y:(A,B)=>Math.max(A,B)}},
  TNOR:{name:'或非',en:'TNOR',inputs:['A','B'],outputs:['Y'],desc:'Y = 取反(取大(A,B))',fn:{Y:(A,B)=>-Math.max(A,B)}},
  STI:{name:'非',en:'STI ¬',inputs:['A'],outputs:['Y'],desc:'Y = −A (正负翻转)',fn:{Y:(A)=>-A}},
  NTI:{name:'负阈',en:'NTI',inputs:['A'],outputs:['Y'],desc:'− Finite →+，其余→−',fn:{Y:(A)=>(A===-1?1:-1)}},
  PTI:{name:'正阈',en:'PTI',inputs:['A'],outputs:['Y'],desc:'+ Finite →−，其余→+',fn:{Y:(A)=>(A===1?-1:1)}},
  ISP:{name:'判正',en:'IS+',inputs:['A'],outputs:['Y'],desc:'A=+ → +，否则 −',fn:{Y:(A)=>(A===1?1:-1)}},
  ISN:{name:'判负',en:'IS−',inputs:['A'],outputs:['Y'],desc:'A=− → +，否则 −',fn:{Y:(A)=>(A===-1?1:-1)}},
  ISZ:{name:'判零',en:'IS0',inputs:['A'],outputs:['Y'],desc:'A=0 → +，否则 −',fn:{Y:(A)=>(A===0?1:-1)}},
  MUX:{name:'选择器',en:'MUX',inputs:['S','Dm','Dz','Dp'],outputs:['Y'],desc:'S=−/0/+ 选 Dm/Dz/Dp',fn:{Y:(S,Dm,Dz,Dp)=>(S===-1?Dm:S===0?Dz:Dp)}},
  CMP:{name:'比较器',en:'CMP',inputs:['A','B'],outputs:['Y'],desc:'A>B→+，=→0，<→−',fn:{Y:(A,B)=>(A>B?1:A===B?0:-1)}},
  DEC:{name:'解码器',en:'DEC',inputs:['S'],outputs:['Ym','Yz','Yp'],desc:'选中线输出+，其余−',fn:{Ym:(S)=>(S===-1?1:-1),Yz:(S)=>(S===0?1:-1),Yp:(S)=>(S===1?1:-1)}},
  HADD:{name:'半加器',en:'HADD',inputs:['A','B'],outputs:['S','C'],desc:'和 / 进位',fn:{S:(A,B)=>halfAdd(A,B).sum,C:(A,B)=>halfAdd(A,B).carry}},
  FADD:{name:'全加器',en:'FADD',inputs:['A','B','Ci'],outputs:['S','Co'],desc:'带进位加',fn:{S:(A,B,Ci)=>fullAdd(A,B,Ci).sum,Co:(A,B,Ci)=>fullAdd(A,B,Ci).cout}},
  ADD2:{name:'2-trit加法',en:'ADD2',inputs:['A0','A1','B0','B1'],outputs:['S0','S1','C'],desc:'双trit加法 A1A0+B1B0',
    fn:{S0:(a0,a1,b0,b1)=>decToTritsLE(tritsToDecLE([a0,a1])+tritsToDecLE([b0,b1]),3)[0],
        S1:(a0,a1,b0,b1)=>decToTritsLE(tritsToDecLE([a0,a1])+tritsToDecLE([b0,b1]),3)[1],
        C:(a0,a1,b0,b1)=>decToTritsLE(tritsToDecLE([a0,a1])+tritsToDecLE([b0,b1]),3)[2]}},
  SUB2:{name:'2-trit减法',en:'SUB2',inputs:['A0','A1','B0','B1'],outputs:['D0','D1','C'],desc:'A−B',
    fn:{D0:(a0,a1,b0,b1)=>decToTritsLE(tritsToDecLE([a0,a1])-tritsToDecLE([b0,b1]),3)[0],
        D1:(a0,a1,b0,b1)=>decToTritsLE(tritsToDecLE([a0,a1])-tritsToDecLE([b0,b1]),3)[1],
        C:(a0,a1,b0,b1)=>decToTritsLE(tritsToDecLE([a0,a1])-tritsToDecLE([b0,b1]),3)[2]}},
  DFF:{name:'D触发器',en:'DFF',inputs:['D'],outputs:['Q'],desc:'滴答时 Q←D',stateful:true,fn:{Q:(D,state)=>state}},
  REG1:{name:'寄存器',en:'REG',inputs:['EN','D'],outputs:['Q'],desc:'EN=+才写入',stateful:true,fn:{Q:(EN,D,state)=>(EN===1?D:state)}},
  ALU1:{name:'ALU',en:'ALU',inputs:['OP','A','B'],outputs:['Y'],desc:'−加和 / 0取小 / +取大',
    fn:{Y:(OP,A,B)=>(OP===-1?halfAdd(A,B).sum:OP===0?Math.min(A,B):Math.max(A,B))}},
  C_M:{name:'常量 −',en:'−1',inputs:[],outputs:['Y'],desc:'恒输出 −',constVal:-1,fn:{Y:()=>-1}},
  C_Z:{name:'常量 0',en:'0',inputs:[],outputs:['Y'],desc:'恒输出 0',constVal:0,fn:{Y:()=>0}},
  C_P:{name:'常量 +',en:'+1',inputs:[],outputs:['Y'],desc:'恒输出 +',constVal:1,fn:{Y:()=>1}},
};
const PALETTE_GROUPS = {
  base:['TNAND','C_M','C_Z','C_P'],
};

// 关卡
// kind: 'circuit' | 'program'
const LEVELS = [
{ id:'t0_wire', ch:'0 · 平衡三进制', name:'初见三元：连一根线', kind:'circuit',
  desc:'把输入直接连到输出。点击左侧蓝色输入端，可以切换 − / 0 / +，观察右侧输出跟着变。',
  theory:'<b>平衡三进制</b>只有三个数字：<code>−</code>(−1)、<code>0</code>、<code>+</code>(+1)。权重是 …9, 3, 1。如 <code>+0−</code> = 9+0−1 = 8。没有符号位，<b>最高位为 − 整个数就是负数</b>，取反即变号。这是 Setun 胜过二进制的地方。',
  inputs:['X'], outputs:['Y'], palette:[],
  hint:'不需要任何门。从左侧 X 的输出钉拖一根线到右侧 Y 的输入钉即可。输入钉空着是非法状态。',
  win:'三态导线接通！三进制世界里，一根线有三种状态。',
  tests:()=>enumInputs(1).map(r=>({in:r,out:r})) },

{ id:'t0_sti', ch:'0 · 平衡三进制', name:'取反 STI：第一个门', kind:'circuit',
  desc:'用 1 个 TNAND 搭出「非门」STI：Y = −A。把 TNAND 的两个输入并在一起会发生什么？',
  theory:'<b>TNAND</b>：<code>Y = −min(A,B)</code>。当 A=B=x 时，Y = −x，正好就是<b>标准反相 STI</b>，和用 NAND 搭 NOT 的经典做法一模一样。试试：输入 − → 输出 +，输入 0 → 0，+ → −。',
  inputs:['A'], outputs:['Y'], palette:['TNAND'],
  hint:'TNAND(A,A) = −min(A,A) = −A。把输入 A 同时连到 TNAND 的 A、B，再连到输出。',
  win:'STI 解锁！−A 就是平衡三进制的“变号”。',
  tests:()=>enumInputs(1).map(r=>({in:r,out:[-r[0]]})) },

{ id:'t0_min', ch:'0 · 平衡三进制', name:'取小 TMIN：三进制与', kind:'circuit',
  desc:'用 TNAND + STI 搭出取小门：Y = min(A,B)。9 行真值表全部通过才算成功。',
  theory:'三进制的<b>与 = 取小 ∧</b>，<b>或 = 取大 ∨</b>。把 TNAND 的输出再取反一次：<code>−(−min) = min</code>。注意：若把 + 当 1、− 当 0 且不出现 0，这张表和二进制与门一模一样，三进制向下兼容二进制。',
  inputs:['A','B'], outputs:['Y'], palette:['TNAND','STI'],
  hint:'先 TNAND(A,B)，再把结果过一个 STI。两级串联即可。',
  win:'TMIN 解锁！与 = 取小，或 = 取大，记住了。',
  tests:()=>enumInputs(2).map(r=>({in:r,out:[Math.min(r[0],r[1])]})) },

{ id:'t0_max', ch:'0 · 平衡三进制', name:'取大 TMAX：德·摩根', kind:'circuit',
  desc:'只用 TNAND + STI + TMIN 搭出取大门：Y = max(A,B)。提示：德·摩根在三进制依然成立。',
  theory:'德·摩根：<code>max(A,B) = −min(−A,−B)</code>。即：两个输入各过一次 STI，取小，再取反。共 5 个门（2×STI + TMIN 内部 2 门…实际按你的搭法计数）。这是第一次“多级推理”，后面全加器都靠它。',
  inputs:['A','B'], outputs:['Y'], palette:['TNAND','STI','TMIN'],
  hint:'A→STI→m1，B→STI→m2，m1,m2→TMIN→STI→Y。画出来就是两边对称的形状。',
  win:'TMAX 解锁！德·摩根在三进制同样优雅。',
  tests:()=>enumInputs(2).map(r=>({in:r,out:[Math.max(r[0],r[1])]})) },

{ id:'t0_thr', ch:'0 · 平衡三进制', name:'阈值门：三进制不完备的证明', kind:'circuit',
  desc:'用 PTI + STI 搭出「判正」ISP：输入为 + 才输出 +，否则输出 −。理解为什么 TNAND 一家造不出它。',
  theory:'只用 <code>TNAND/STI/TMIN/TMAX</code> 的函数都有一个性质：<b>输入全 0 则输出必 0</b>（保零）。而 <code>PTI(0)=+</code> 打破了它，所以<b>单个 TNAND 在三值逻辑中不完备</b>，必须引入<b>阈值门 NTI / PTI</b>（Setun 的物理基础）。本题：<code>ISP = STI(PTI(A))</code>：PTI 把“是不是 +”翻成 −/+，STI 再翻回来。',
  inputs:['A'], outputs:['Y'], palette:['STI','PTI','NTI','TMIN','TMAX','TNAND','C_M','C_Z','C_P'],
  hint:'A → PTI → STI → Y，仅此而已。但请读懂 theory：这是全游戏最重要的概念分叉点。',
  win:'阈值门解锁！NTI / PTI / 判正 / 判负 / 判零全部加入元件箱。三进制从此完备。',
  tests:()=>enumInputs(1).map(r=>({in:r,out:[r[0]===1?1:-1]})) },

{ id:'t1_mux', ch:'1 · 选择与判断', name:'选择器 MUX：万能门', kind:'circuit',
  desc:'搭建 4 输入选择器：S=−选Dm，S=0选Dz，S=+选Dp。这是后面 ALU、寄存器、内存的万能积木。',
  theory:'做法：先用阈值门做出三根“独热”线 <code>n=ISN(S), z=ISZ(S), p=ISP(S)</code>（恰一根为 +），再门控：<code>gm=min(Dm,n)</code> 等，最后 <code>Y=max(gm,max(gz,gp))</code>。被选中的数据原样通过，其余被压成 −，取大即选中。其中 <code>ISN=NTI(S)</code>，<code>ISP=STI(PTI(S))</code>，<code>ISZ=TMIN(PTI(S),STI(NTI(S)))</code>（验证：S=0 时两路皆 +，否则必有一路 −）。',
  inputs:['S','Dm','Dz','Dp'], outputs:['Y'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','C_M','C_Z','C_P'],
  hint:'分三步：① S→ISN/ISZ/ISP 得 n/z/p；② min(Dm,n)、min(Dz,z)、min(Dp,p)；③两级 TMAX 合并。ISZ 若元件箱没有就按 theory 现搭。',
  win:'MUX 解锁！有了它，任何真值表都能“查表”实现，三进制真正完备了。',
  tests:()=>enumInputs(4).map(r=>({in:r,out:[T.mux(r[0],r[1],r[2],r[3])]})) },

{ id:'t1_cmp', ch:'1 · 选择与判断', name:'比较器：天平', kind:'circuit',
  desc:'搭建比较器：A>B 输出 +，相等输出 0，A<B 输出 −。允许直接用 MUX 查表。',
  theory:'最优雅的搭法是 <b>MUX 嵌套</b>：先对 B 查表做出三行（A=− 行：B=−/0/+ → 0/−/−；A=0 行 → +/0/−；A=+ 行 → +/+/0），再用 A 选择三行。常量 +/0/− 直接喂给 MUX 的数据端。这是“查表法”的第一次实战。',
  inputs:['A','B'], outputs:['Y'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','C_M','C_Z','C_P'],
  hint:'摆 4 个 MUX：3 个以 B 为选择端生成三行，1 个以 A 为选择端从三行里选。常量用 C_M/C_Z/C_P。',
  win:'CMP 解锁！天平做好了，CPU 的条件跳转就靠它。',
  tests:()=>enumInputs(2).map(r=>({in:r,out:[r[0]>r[1]?1:r[0]===r[1]?0:-1]})) },

{ id:'t1_dec', ch:'1 · 选择与判断', name:'解码器 DEC：1 线变 3 线', kind:'circuit',
  desc:'把 1 根选择线译成 3 根独热线：选中的那根输出 +，其余 −。输出顺序 Ym(−路) / Yz(0路) / Yp(+路)。',
  theory:'这正是 MUX 内部用到的三根线：<code>Ym=ISN(S), Yz=ISZ(S), Yp=ISP(S)</code>。内存的地址译码、MUX 的选择都靠它。三个检测器各守一路。',
  inputs:['S'], outputs:['Ym','Yz','Yp'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','C_M','C_Z','C_P'],
  hint:'S 分别进 ISN / ISZ / Yp(ISP)，直连三个输出。若箱里没有 ISZ，按 MUX 关的做法现搭。',
  win:'DEC 解锁！地址译码就绪，可以做内存了。',
  tests:()=>enumInputs(1).map(r=>({in:r,out:[r[0]===-1?1:-1, r[0]===0?1:-1, r[0]===1?1:-1]})) },

{ id:'t2_hadd', ch:'2 · 算术', name:'半加器：1+1=…？', kind:'circuit',
  desc:'搭建半加器：S 为和，C 为进位。注意 −1 + −1 = −2，要记成“和 +、进位 −”（因为 −2 = +1 + (−1)×3）。',
  theory:'平衡三进制加法表：<code>S(A,B)</code> 形如 <code>[+,−,0; −,0,+; 0,+,−]</code>，<code>C</code> 仅在 (−,−)→− 与 (+,+)→+ 时非零，其余全 0，进位极其稀疏，这是三进制乘法更快的原因之一。用 MUX 查表法（以 A 选三行，每行是 B 的单输入变换）可直接实现。',
  inputs:['A','B'], outputs:['S','C'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','C_M','C_Z','C_P'],
  hint:'摆 2 个 MUX（都以 A 为选择）：一个查“和表”，一个查“进位表”，数据端填常量/ B 的变换。先列出 A=−/0/+ 三行分别是什么，再填。',
  win:'HADD 解锁！进位只在同号溢出时出现，三进制加法就是省。',
  tests:()=>enumInputs(2).map(r=>{const h=halfAdd(r[0],r[1]);return{in:r,out:[h.sum,h.carry]};}) },

{ id:'t2_fadd', ch:'2 · 算术', name:'全加器：会进位的加法', kind:'circuit',
  desc:'搭建全加器：S=(A+B+Ci) 的和位，Co 为新进位。允许使用已解锁的半加器 HADD。',
  theory:'标准结构：<code>第一次 HADD(A,B)→s1,c1；第二次 HADD(s1,Ci)→S,c2；第三次 HADD(c1,c2) 取和得 Co</code>（它的进位恒为 0，直接弃掉）。c1、c2 不会同号非零（可证），所以它俩的和就是新进位。注意二进制里进位合并用或门，是因为进位只有 0/1；在三进制里进位可正可负，取大会把 −1 吃掉，比如 A=B=Ci=−1 时总和 −3，进位应为 − 而 max 给出 0。27 行全过。',
  inputs:['A','B','Ci'], outputs:['S','Co'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','C_M','C_Z','C_P'],
  hint:'摆 3 个 HADD：前两个算和（Ci 进第二个），第三个把两次进位 c1、c2 相加，取它的和得 Co。',
  win:'FADD 解锁！可以搭多位加法器了。',
  tests:()=>enumInputs(3).map(r=>{const f=fullAdd(r[0],r[1],r[2]);return{in:r,out:[f.sum,f.cout]};}) },

{ id:'t2_add2', ch:'2 · 算术', name:'2-trit 行波加法器', kind:'circuit',
  desc:'把两个 2-trit 数 A1A0、B1B0 相加（A0/B0/S0 为低位，权重 1；A1/B1/S1 权重 3；C 为权重 9 的进位）。低位用半加器，高位用全加器。',
  theory:'十进制 −4…+4 恰好是 2-trit 的全部 9 个值。如 <code>−2=[+,−]? </code>验证：−→低位？低位在前：[低,高]。+2 = −1+1×3 → <code>[−,+]</code>。行波进位：低位 C0 → 高位 Ci。',
  inputs:['A0','A1','B0','B1'], outputs:['S0','S1','C'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','C_M','C_Z','C_P'],
  hint:'HADD(A0,B0)→S0,c0；FADD(A1,B1,c0)→S1,C。注意输入输出的低/高位不要接反。',
  win:'ADD2 解锁！多位加法打通，减法只差一个取反。',
  tests:()=>enumInputs(4).map(r=>{const t=decToTritsLE(tritsToDecLE([r[0],r[1]])+tritsToDecLE([r[2],r[3]]),3);return{in:r,out:t};}) },

{ id:'t2_sub', ch:'2 · 算术', name:'减法器：取反即变号', kind:'circuit',
  desc:'搭建 2-trit 减法器 D=A−B。平衡三进制里变号只需逐位 STI，无需补码！',
  theory:'<code>−B</code> = 每一位 STI（因为 −(−1,0,1)=(1,0,−1)）。然后 <code>D = ADD2(A, −B)</code>。二进制需要补码+1，三进制直接翻转，Setun 指令因此少一半。',
  inputs:['A0','A1','B0','B1'], outputs:['D0','D1','C'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','ADD2','C_M','C_Z','C_P'],
  hint:'B0→STI, B1→STI，再与 A0,A1 一起进 ADD2。输出 D0D1C。',
  win:'SUB2 解锁！没有符号位、没有补码，负数浑然天成。',
  tests:()=>enumInputs(4).map(r=>{const t=decToTritsLE(tritsToDecLE([r[0],r[1]])-tritsToDecLE([r[2],r[3]]),3);return{in:r,out:t};}) },

{ id:'s3_reg', ch:'3 · 存储', name:'寄存器：记住一个 trit', kind:'circuit', seq:true,
  desc:'用 MUX + DFF 搭带使能的寄存器：EN=+ 时滴答写入 D，否则保持。Q 反馈回 MUX。',
  theory:'<code>next = MUX(EN, Q, Q, D)</code>：EN=−/0 都保持（选 Q），EN=+ 才选 D。next → DFF.D，滴答后 Q 更新。反馈环穿过 DFF（状态件）是合法时序，不是组合环。初始 Q=0。',
  inputs:['EN','D'], outputs:['Q'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','DFF','C_M','C_Z','C_P'],
  hint:'摆 1×MUX + 1×DFF：MUX.S=EN，Dm=Q反馈，Dz=Q反馈，Dp=D；MUX.Y→DFF.D；DFF.Q→输出Q，同时分叉回 MUX 的 Dm/Dz。',
  win:'REG 解锁！存储 = 选择器 + 触发器 + 反馈。CPU 的 3 个寄存器就绪。',
  steps:()=>[
    {in:[-1,1],out:[0]},{in:[1,1],out:[1]},{in:[-1,-1],out:[1]},
    {in:[0,-1],out:[1]},{in:[1,-1],out:[-1]},{in:[1,0],out:[0]},
  ] },

{ id:'s3_cnt', ch:'3 · 存储', name:'计数器：会数数的寄存器', kind:'circuit', seq:true,
  desc:'用 REG + ADD2 搭 2-trit 自增计数器：EN=+ 滴答一次 Q←Q+1（模 9 循环 −4…+4），EN≠+ 保持。输入只有 EN，输出 Q0(低)/Q1(高)。',
  theory:'把寄存器输出加常量 <code>+1 = [+,0]</code>（低位 +、高位 0）再写回：<code>next = ADD2(Q, +1)</code>，EN 用 MUX 在 next 与 Q 之间选择。序列从 [0,0] 开始：+1→[+,0]→[−,+]…转一圈回到 [0,0]。这是程序计数器 PC 的雏形。',
  inputs:['EN'], outputs:['Q0','Q1'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','ADD2','REG1','DFF','C_M','C_Z','C_P'],
  hint:'需要 2 个 REG（存Q0/Q1）+ 1 个 ADD2（Q+常量[+,0]）+ 2 个 MUX（EN 选择保持/更新）。常量用 C_P(低+/恒+)、C_Z(高0)。先让 EN=+ 连转验证，再补 MUX。',
  win:'计数器完成！PC（程序计数器）就是它 + 跳转改写。',
  steps:()=>{
    const seq=[[0,0],[1,0],[-1,1],[0,1],[1,1],[-1,-1],[0,-1],[1,-1],[-1,0],[0,0]];
    const st=[{in:[-1],out:[0,0]}];
    for(let i=1;i<seq.length;i++) st.push({in:[1],out:seq[i]});
    st.push({in:[-1],out:seq[seq.length-1]});
    return st;
  } },

{ id:'s3_mem', ch:'3 · 存储', name:'小内存：3 个 cells', kind:'circuit', seq:true,
  desc:'用 DEC + 3×REG + MUX 搭地址为 1-trit 的内存：W=+ 才写入，A 选择 cell(−/0/+)，D 为写入数据，Q 为读出。',
  theory:'<code>DEC(A) → wM,wZ,wP</code> 三根写选线；每个 cell 的 EN = (W==+ 且本路被选中) ? + : −，即 <code>ENi = min(IS+, wi)</code> 其中 IS+=ISP(W)。读出 <code>Q = MUX(A, qM, qZ, qP)</code>。地址本身就是数据，三进制寻址浑然一体。',
  inputs:['W','A','D'], outputs:['Q'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','REG1','DFF','C_M','C_Z','C_P'],
  hint:'1×DEC(A)；3×REG 存数；写使能：W→ISP 得 s，s 分别与 wM/wZ/wP 取小得 EN；读：三路 Q 进 MUX(A) 选出。共约 8 件。',
  win:'MEM 解锁！译码 + 寄存器阵列 + 选择 = 内存。冯·诺依曼就绪。',
  steps:()=>[
    {in:[1,-1,1],out:[1]},   // 写 cell- ← +（滴答后立即可读）
    {in:[1,0,-1],out:[-1]},  // 写 cell0 ← −
    {in:[1,1,0],out:[0]},    // 写 cell+ ← 0
    {in:[-1,-1,0],out:[1]},  // 读 cell-
    {in:[-1,0,0],out:[-1]},  // 读 cell0
    {in:[-1,1,0],out:[0]},   // 读 cell+
    {in:[-1,1,1],out:[0]},   // 写禁：读不受 D 影响
  ] },

{ id:'c4_alu', ch:'4 · 完备', name:'ALU：三进制运算器', kind:'circuit',
  desc:'搭建 1-trit ALU：OP=− 输出加法和 S(A+B)，OP=0 输出 min，OP=+ 输出 max。',
  theory:'三个子电路各算一路，再用 OP 选择：<code>Y = MUX(OP, S, min, max)</code>。S 可用 HADD 的 S 端，min/max 直接 TMIN/TMAX。真实 Setun 的 ALU 也是“多算一路、选一路”。下一步：给它加上寄存器、内存与 PC，就是 CPU。',
  inputs:['OP','A','B'], outputs:['Y'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','C_M','C_Z','C_P'],
  hint:'HADD(A,B).S / TMIN(A,B) / TMAX(A,B) 三路进 MUX 的 Dm/Dz/Dp，OP 进 S。一次成型。',
  win:'ALU 解锁！运算器完成，只差把它放进取指-执行循环。',
  tests:()=>enumInputs(3).map(r=>{const y=r[0]===-1?halfAdd(r[1],r[2]).sum:r[0]===0?Math.min(r[1],r[2]):Math.max(r[1],r[2]);return{in:r,out:[y]};}) },

{ id:'c4_prog1', ch:'4 · 完备', name:'编程 ①：回声与取反', kind:'program',
  desc:'为 TRIT-3 CPU 写第一个程序：读一个输入，求相反数并输出。理解 INP / OUT / NEG / HLT。',
  theory:'TRIT-3 字长 3-trit（−13…+13），寄存器 R0–R2，内存 M0–M8。你的程序会跑 3 组测试：输入 +、0、−，期望输出其相反数。 starter 已给出骨架，补上 NEG 与 OUT。',
  hint:'INP R0 → NEG R1,R0 → OUT R1 → HLT。注意 OUT 的是 R1。',
  starter:'# 回声取反：读入→取反→输出\nINP R0\nNEG R1, R0\nOUT R1\nHLT\n',
  progTests:()=>[{in:[1],want:[-1]},{in:[0],want:[0]},{in:[-1],want:[1]}],
  win:'第一个三进制程序跑通了！你正在对“自己体系”的机器编程。' },

{ id:'c4_prog2', ch:'4 · 完备', name:'编程 ②：累加 1+2+…+n', kind:'program',
  desc:'读入 n（1…4），计算 1+2+…+n 并输出。用循环 + 条件跳转实现，这就是“完备”的体感时刻。',
  theory:'需要：计数器 R1 从 1 开始、累加器 R2 从 0 开始；每轮 R2+=R1, R1+=1；当 R1 > n 跳出。用 CMP 思路：JPP/JPN 按符号跳转。TRIT-3 没有 CMP 指令，用 <code>SUB + JPP/JPZ/JPN</code> 组合判断。小心立即数用 LIT 加载。',
  hint:'框架：R1=计数器从1开始，R2=累加器从0开始；每轮先 SUB R3,R1,R0 判断 R1−n，若 R3>0 则已超过n跳 DONE，否则 ADD 累加再自增。注意 ADD 第三个参数可写立即数 1。',
  starter:'# 累加：INP n → 输出 1+..+n\nINP R0\nLIT R1, 1\nLIT R2, 0\nLOOP:\nSUB R3, R1, R0\nJPP R3, DONE\nADD R2, R2, R1\nADD R1, R1, 1\nJMP LOOP\nDONE:\nOUT R2\nHLT\n',
  progTests:()=>[{in:[1],want:[1]},{in:[2],want:[3]},{in:[3],want:[6]},{in:[4],want:[10]}],
  win:'三进制完备！你从一根线出发，亲手走完了 Setun 之路：门 → 算术 → 存储 → CPU → 程序。' },
];
const CHAPTERS = ['0 · 平衡三进制','1 · 选择与判断','2 · 算术','3 · 存储','4 · 完备'];
