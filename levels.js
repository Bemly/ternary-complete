/* 元件定义 + 关卡定义 */
'use strict';

const COMP_DEFS = {
  TNAND:{name:'与非',en:'TNAND',inputs:['A','B'],outputs:['Y'],desc:'Y = 取反(取小(A,B))',fn:{Y:(A,B)=>-Math.min(A,B)}},
  TMIN:{name:'取小',en:'TMIN ∧',inputs:['A','B'],outputs:['Y'],desc:'Y = 最小 (三进制与)',fn:{Y:(A,B)=>Math.min(A,B)}},
  TMAX:{name:'取大',en:'TMAX ∨',inputs:['A','B'],outputs:['Y'],desc:'Y = 最大 (三进制或)',fn:{Y:(A,B)=>Math.max(A,B)}},
  TNOR:{name:'或非',en:'TNOR',inputs:['A','B'],outputs:['Y'],desc:'Y = 取反(取大(A,B))',fn:{Y:(A,B)=>-Math.max(A,B)}},
  STI:{name:'非',en:'STI ¬',inputs:['A'],outputs:['Y'],desc:'Y = −A (正负翻转)',fn:{Y:(A)=>-A}},
  NTI:{name:'负阈',en:'NTI',inputs:['A'],outputs:['Y'],desc:'− → +，其余 → −',fn:{Y:(A)=>(A===-1?1:-1)}},
  PTI:{name:'正阈',en:'PTI',inputs:['A'],outputs:['Y'],desc:'+ → −，其余 → +',fn:{Y:(A)=>(A===1?-1:1)}},
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
  theory:'<b>平衡三进制</b>只有三个数字：<code>−</code>(−1)、<code>0</code>、<code>+</code>(+1)。权重是 …9, 3, 1。如 <code>+0−</code> = 9+0−1 = 8。没有符号位，<b>最高位为 − 整个数就是负数</b>，取反即变号，这是平衡三进制的一大便利。',
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
  theory:'德·摩根：<code>max(A,B) = −min(−A,−B)</code>。即：两个输入各过一次 STI，取小，再取反，共 4 个元件（两个 STI、一个 TMIN、一个 STI）。这是第一次“多级推理”，后面全加器都靠它。',
  inputs:['A','B'], outputs:['Y'], palette:['TNAND','STI','TMIN'],
  hint:'A→STI→m1，B→STI→m2，m1,m2→TMIN→STI→Y。画出来就是两边对称的形状。',
  win:'TMAX 解锁！德·摩根在三进制同样优雅。',
  tests:()=>enumInputs(2).map(r=>({in:r,out:[Math.max(r[0],r[1])]})) },

{ id:'t0_thr', ch:'0 · 平衡三进制', name:'阈值门：三进制不完备的证明', kind:'circuit',
  desc:'用 PTI + STI 搭出「判正」ISP：输入为 + 才输出 +，否则输出 −。理解为什么 TNAND 一家造不出它。',
  theory:'只用 <code>TNAND/STI/TMIN/TMAX</code> 的函数都有一个性质：<b>输入全 0 则输出必 0</b>（保零）。而 <code>PTI(0)=+</code> 打破了它，所以<b>单个 TNAND 在三值逻辑中不完备</b>，必须引入<b>阈值门 NTI / PTI</b>（三进制电路的物理基础）。本题：<code>ISP = STI(PTI(A))</code>：PTI 把“是不是 +”翻成 −/+，STI 再翻回来。',
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
  theory:'十进制 −4…+4 恰好是 2-trit 的全部 9 个值。本关一律低位在前写成 [低,高]：<code>+2 = −1 + 1×3 → [−,+]</code>，<code>−2 = +1 − 1×3 → [+,−]</code>。行波进位：低位进位 c0 接到高位全加器的 Ci，高位进位就是输出 C。',
  inputs:['A0','A1','B0','B1'], outputs:['S0','S1','C'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','C_M','C_Z','C_P'],
  hint:'HADD(A0,B0)→S0,c0；FADD(A1,B1,c0)→S1,C。注意输入输出的低/高位不要接反。',
  win:'ADD2 解锁！多位加法打通，减法只差一个取反。',
  tests:()=>enumInputs(4).map(r=>{const t=decToTritsLE(tritsToDecLE([r[0],r[1]])+tritsToDecLE([r[2],r[3]]),3);return{in:r,out:t};}) },

{ id:'t2_sub', ch:'2 · 算术', name:'减法器：取反即变号', kind:'circuit',
  desc:'搭建 2-trit 减法器 D=A−B。平衡三进制里变号只需逐位 STI，无需补码！',
  theory:'<code>−B</code> = 每一位 STI（因为 −(−1,0,1)=(1,0,−1)）。然后 <code>D = ADD2(A, −B)</code>。二进制需要补码+1，三进制直接逐位翻转，省掉了一整步运算。',
  inputs:['A0','A1','B0','B1'], outputs:['D0','D1','C'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','ADD2','C_M','C_Z','C_P'],
  hint:'B0→STI, B1→STI，再与 A0,A1 一起进 ADD2。输出 D0D1C。',
  win:'SUB2 解锁！没有符号位、没有补码，负数浑然天成。',
  tests:()=>enumInputs(4).map(r=>{const t=decToTritsLE(tritsToDecLE([r[0],r[1]])-tritsToDecLE([r[2],r[3]]),3);return{in:r,out:t};}) },

{ id:'t2_mul', ch:'2 · 算术', name:'乘法器：符号相乘', kind:'circuit',
  desc:'搭建 1-trit 乘法器：Y = A × B。− × − = +，任何数乘 0 得 0。',
  theory:'单个 trit 的乘积仍是一个 trit：<code>|A×B| ≤ 1</code>，所以<b>乘法表根本不会进位</b>，只有一张 3×3 的符号表。用 A 做选择：A=− 时输出 −B，A=0 时输出 0，A=+ 时原样输出 B，即 <code>Y = MUX(A, STI(B), 0, B)</code>。多位乘法就是“逐位乘（只是取反或清零）再移位相加”，所以三进制乘法又快又简单。',
  inputs:['A','B'], outputs:['Y'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','ADD2','SUB2','C_M','C_Z','C_P'],
  hint:'1 个 STI、1 个常量 0、1 个 MUX：A 进 S，Dm 接 STI(B)，Dz 接常量 0，Dp 直接接 B。',
  win:'MUL 完成！乘一个 trit 只是“取反、清零或照抄”，没有乘法表要背。',
  tests:()=>enumInputs(2).map(r=>({in:r,out:[r[0]*r[1]]})) },

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

{ id:'s3_shift', ch:'3 · 存储', name:'移位寄存器：三拍延迟线', kind:'circuit', seq:true,
  desc:'用 DFF 串成 3 级移位寄存器：每次滴答，D 进第一格，旧值依次往后挪。Q0 为上一拍的 D，Q1 为前两拍，Q2 为前三拍。',
  theory:'把 DFF 首尾相接：<code>D → DFF0 → DFF1 → DFF2</code>，三个 Q 都引出。滴答时所有 DFF <b>同时</b>取样自己 D 端“滴答前”的值，所以数据每拍恰好往后走一格，不会一口气穿透到底。串行通信、流水线、乘法里的“移位”都靠它。初始全 0。',
  inputs:['D'], outputs:['Q0','Q1','Q2'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','DFF','REG1','C_M','C_Z','C_P'],
  hint:'3 个 DFF 串起来：D→DFF0.D，DFF0.Q→DFF1.D，DFF1.Q→DFF2.D；三个 Q 分别接 Q0/Q1/Q2（DFF0.Q 要同时分叉到输出 Q0）。',
  win:'移位寄存器完成！一拍一格，数据在时间轴上排队前进。',
  steps:()=>{
    const ds=[1,-1,0,1,1,-1,0,-1];
    const h=[0,0,0];
    return ds.map(d=>{h.unshift(d);h.length=3;return{in:[d],out:[...h]};});
  } },

{ id:'s3_cnt', ch:'3 · 存储', name:'计数器：会数数的寄存器', kind:'circuit', seq:true,
  desc:'用 REG + ADD2 搭 2-trit 自增计数器：EN=+ 滴答一次 Q←Q+1（模 9 循环 −4…+4），EN≠+ 保持。输入只有 EN，输出 Q0(低)/Q1(高)。',
  theory:'把寄存器输出加常量 <code>+1 = [+,0]</code>（低位 +、高位 0）再写回：<code>next = ADD2(Q, +1)</code>。REG 自带写使能：EN=+ 这一拍写入 next，否则保持原值，所以 EN 直接接两个 REG 的 EN 即可。序列从 [0,0] 开始：+1→[+,0]→[−,+]…转一圈回到 [0,0]。ADD2 的进位 C 不接，自然实现模 9 回绕。这是程序计数器 PC 的雏形。',
  inputs:['EN'], outputs:['Q0','Q1'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','ADD2','REG1','DFF','C_M','C_Z','C_P'],
  hint:'2 个 REG（存 Q0/Q1）+ 1 个 ADD2 + 两个常量。ADD2 的 A0/A1 接两个 REG 的 Q，B0 接 C_P、B1 接 C_Z；S0/S1 写回两个 REG 的 D；输入 EN 同时接两个 REG 的 EN。',
  win:'计数器完成！PC（程序计数器）就是它 + 跳转改写。',
  steps:()=>{
    const seq=[[0,0],[1,0],[-1,1],[0,1],[1,1],[-1,-1],[0,-1],[1,-1],[-1,0],[0,0]];
    const st=[{in:[-1],out:[0,0]}];
    for(let i=1;i<seq.length;i++) st.push({in:[1],out:seq[i]});
    st.push({in:[-1],out:seq[seq.length-1]});
    return st;
  } },

{ id:'s3_acc', ch:'3 · 存储', name:'累加器：会记账的寄存器', kind:'circuit', seq:true,
  desc:'搭建 2-trit 累加器：每次滴答 Q ← Q + X（X 为 1-trit 输入，可正可负），模 9 回绕到 −4…+4。输出 Q0(低)/Q1(高)。',
  theory:'计数器只会 +1，累加器加的是外面送进来的数：<code>next = ADD2(Q, [X, 0])</code>。X=− 时就是减一，所以同一套电路既能加也能减，不需要单独的减法通路，这又是平衡三进制“符号即数字”的好处。ADD2 的进位丢弃即模 9 回绕。CPU 里的累加器、程序里的 <code>ADD R2, R2, R1</code> 就是它。',
  inputs:['X'], outputs:['Q0','Q1'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','ADD2','REG1','DFF','C_M','C_Z','C_P'],
  hint:'1 个 ADD2 + 2 个 DFF + 常量 0：ADD2 的 A0/A1 接两个 DFF 的 Q，B0 接输入 X，B1 接常量 0；S0/S1 分别写回两个 DFF 的 D。',
  win:'累加器完成！加法和减法共用一条通路，账永远记得清。',
  steps:()=>{
    const xs=[1,1,1,1,1,-1,-1,0,-1,-1,-1,-1,-1,1];
    let a=0;
    return xs.map(x=>{a=tritsToDecLE(decToTritsLE(a+x,2));return{in:[x],out:decToTritsLE(a,2)};});
  } },

{ id:'s3_mem', ch:'3 · 存储', name:'小内存：3 个 cells', kind:'circuit', seq:true,
  desc:'用 DEC + 3×REG + MUX 搭地址为 1-trit 的内存：W=+ 才写入，A 选择 cell(−/0/+)，D 为写入数据，Q 为读出。',
  theory:'<code>DEC(A) → wM,wZ,wP</code> 三根写选线；每个 cell 的 EN = (W==+ 且本路被选中) ? + : −，即 <code>ENi = min(IS+, wi)</code> 其中 IS+=ISP(W)。读出 <code>Q = MUX(A, qM, qZ, qP)</code>。地址本身就是数据，三进制寻址浑然一体。',
  inputs:['W','A','D'], outputs:['Q'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','REG1','DFF','C_M','C_Z','C_P'],
  hint:'1×DEC(A)；3×REG 存数；写使能：W→ISP 得 s，s 分别与 wM/wZ/wP 取小得 EN；读：三路 Q 进 MUX(A) 选出。共约 8 件。',
  win:'MEM 解锁！译码 + 寄存器阵列 + 选择 = 内存。存储程序的计算机就差最后一步了。',
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
  theory:'三个子电路各算一路，再用 OP 选择：<code>Y = MUX(OP, S, min, max)</code>。S 可用 HADD 的 S 端，min/max 直接 TMIN/TMAX。真实的运算器也常用“多算几路、再选一路”的做法。下一步：给它加上寄存器、内存与 PC，就是 CPU。',
  inputs:['OP','A','B'], outputs:['Y'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','C_M','C_Z','C_P'],
  hint:'HADD(A,B).S / TMIN(A,B) / TMAX(A,B) 三路进 MUX 的 Dm/Dz/Dp，OP 进 S。一次成型。',
  win:'ALU 解锁！运算器完成，只差把它放进取指-执行循环。',
  tests:()=>enumInputs(3).map(r=>{const y=r[0]===-1?halfAdd(r[1],r[2]).sum:r[0]===0?Math.min(r[1],r[2]):Math.max(r[1],r[2]);return{in:r,out:[y]};}) },

{ id:'c4_pc', ch:'4 · 完备', name:'程序计数器 PC：顺序与跳转', kind:'circuit', seq:true,
  desc:'搭建 2-trit 程序计数器：每次滴答，J=+ 时 PC ← 目标地址 T1T0（跳转），否则 PC ← PC + 1（顺序执行），模 9 回绕。输出 P0(低)/P1(高)。',
  theory:'CPU 每执行一条指令都要决定下一条在哪：要么顺着走 <code>PC+1</code>，要么跳到 <code>T</code>。两条路都先算好，再用 J 选：<code>next = MUX(J, PC+1, PC+1, T)</code>，每个 trit 各用一个 MUX。这就是计数器加上“跳转改写”，前面汇编里的 <code>JMP / JPP</code> 落到硬件上就是 J 这根线。',
  inputs:['J','T0','T1'], outputs:['P0','P1'], palette:['STI','NTI','PTI','ISP','ISN','ISZ','TMIN','TMAX','TNAND','TNOR','MUX','DEC','CMP','HADD','FADD','ADD2','ALU1','DFF','REG1','C_M','C_Z','C_P'],
  hint:'ADD2(P, [+,0]) 得 PC+1（B0 接 C_P，B1 接 C_Z）；两个 MUX 都以 J 为选择端：Dm、Dz 接 PC+1 的对应位，Dp 接 T0 / T1；MUX 输出写进两个 DFF，DFF 的 Q 就是 P0/P1 并反馈回 ADD2。',
  win:'PC 完成！顺序和跳转合在一根选择线上，取指循环的心脏开始跳动。',
  steps:()=>{
    const js=[[-1,0,0],[0,1,1],[-1,0,0],[-1,0,0],[-1,0,0],[1,-1,1],[-1,0,0],[1,0,-1],[0,0,0],[1,1,1],[-1,0,0],[-1,-1,-1]];
    let pc=0;
    return js.map(([j,t0,t1])=>{pc=j===1?tritsToDecLE([t0,t1]):tritsToDecLE(decToTritsLE(pc+1,2));return{in:[j,t0,t1],out:decToTritsLE(pc,2)};});
  } },

{ id:'c4_prog1', ch:'4 · 完备', name:'编程 ①：回声与取反', kind:'program',
  desc:'为 TRIT-3 CPU 写第一个程序：读一个输入，求相反数并输出。理解 INP / OUT / NEG / HLT。',
  theory:'TRIT-3 字长 3-trit（−13…+13），寄存器 R0–R3，内存 M0–M8。你的程序会跑 3 组测试：输入 +、0、−，期望输出其相反数。编辑器里已给出骨架，补上 NEG 与 OUT。',
  hint:'INP R0 → NEG R1,R0 → OUT R1 → HLT。注意 OUT 的是 R1。',
  starter:'# 回声取反：读入 → 取反 → 输出\nINP R0\n# 在这里补上 NEG 与 OUT\nHLT\n',
  progTests:()=>[{in:[1],want:[-1]},{in:[0],want:[0]},{in:[-1],want:[1]}],
  win:'第一个三进制程序跑通了！你写的程序正跑在你亲手搭出来的机器上。' },

{ id:'c4_prog2', ch:'4 · 完备', name:'编程 ②：累加 1+2+…+n', kind:'program',
  desc:'读入 n（1…4），计算 1+2+…+n 并输出。用循环 + 条件跳转实现，这就是“完备”的体感时刻。',
  theory:'需要：计数器 R1 从 1 开始、累加器 R2 从 0 开始；每轮 R2+=R1, R1+=1；当 R1 > n 跳出。用 CMP 思路：JPP/JPN 按符号跳转。TRIT-3 没有 CMP 指令，用 <code>SUB + JPP/JPZ/JPN</code> 组合判断。小心立即数用 LIT 加载。',
  hint:'框架：R1=计数器从1开始，R2=累加器从0开始；每轮先 SUB R3,R1,R0 判断 R1−n，若 R3>0 则已超过n跳 DONE，否则 ADD 累加再自增。注意 ADD 第三个参数可写立即数 1。',
  starter:'# 累加：INP n → 输出 1+..+n\nINP R0\nLIT R1, 1    # 计数器\nLIT R2, 0    # 累加器\nLOOP:\n# 1) R1 超过 n 就跳到 DONE\n# 2) 累加、计数器自增、跳回 LOOP\nDONE:\nOUT R2\nHLT\n',
  progTests:()=>[{in:[1],want:[1]},{in:[2],want:[3]},{in:[3],want:[6]},{in:[4],want:[10]}],
  win:'循环跑通了！计数、判断、跳转齐活，这台机器已经能算任何“能一步步算”的东西。' },

{ id:'c4_prog3', ch:'4 · 完备', name:'编程 ③：乘法 a × b', kind:'program',
  desc:'读入 a、b（可正可负），输出 a × b。TRIT-3 没有乘法指令，用循环反复相加。',
  theory:'乘法就是 b 次加 a。麻烦在 b 可能是负数：平衡三进制里变号只要 <code>NEG</code>，所以先看 b 的符号，b<0 就把 a、b 同时取反（积不变），之后 b 一定 ≥ 0，循环 b 次累加 a 即可。b=0 直接输出 0。结果保证落在 −13…+13 内。',
  hint:'R2 清零；JPZ R1 直接去 DONE；JPP R1 去 LOOP，否则先 NEG R0 与 NEG R1；LOOP 里 ADD R2,R2,R0 再 SUB R1,R1,1，JPP R1 回 LOOP。',
  starter:'# 乘法：INP a, INP b → 输出 a×b\nINP R0    # a\nINP R1    # b\nLIT R2, 0 # 积\n# 1) b=0 直接输出；b<0 先把 a、b 一起取反\n# 2) 循环 b 次：R2 += a\nOUT R2\nHLT\n',
  progTests:()=>[{in:[3,4],want:[12]},{in:[-2,3],want:[-6]},{in:[4,-3],want:[-12]},{in:[0,5],want:[0]},{in:[-3,-4],want:[12]},{in:[5,0],want:[0]},{in:[1,-1],want:[-1]}],
  win:'乘法跑通！负数不用任何特殊处理，一个 NEG 就把符号搬走了。' },

{ id:'c4_prog4', ch:'4 · 完备', name:'编程 ④：斐波那契数列', kind:'program',
  desc:'读入 n（1…7），依次输出斐波那契数列的前 n 项：1, 1, 2, 3, 5, 8, 13。',
  theory:'两个寄存器滚动保存相邻两项 a、b：每轮先 <code>OUT a</code>，再算 <code>c = a + b</code>，然后 <code>a ← b, b ← c</code>。第 7 项 13 恰好是 3-trit 字的最大值 <code>+++</code>，再算下一项就会回绕，所以程序必须在输出够 n 项后立刻停下。注意 <code>MOV</code> 可以在寄存器之间搬数。',
  hint:'R1=1、R2=1；LOOP：OUT R1，n 减一，为 0 跳 DONE；ADD R3,R1,R2，MOV R1,R2，MOV R2,R3，JMP LOOP。',
  starter:'# 斐波那契：INP n → 输出前 n 项\nINP R0\nLIT R1, 1  # a\nLIT R2, 1  # b\n# 循环：输出 a，n 减一，算下一项\nHLT\n',
  progTests:()=>[{in:[1],want:[1]},{in:[2],want:[1,1]},{in:[4],want:[1,1,2,3]},{in:[7],want:[1,1,2,3,5,8,13]}],
  win:'数列流出来了！一台三进制机器在你手里数兔子。' },

{ id:'c4_prog5', ch:'4 · 完备', name:'编程 ⑤：三数排序', kind:'program',
  desc:'读入 3 个数，从小到大依次输出。只许用 MIN / MAX，不许跳转也能做到。',
  theory:'MIN/MAX 在一个字上就是三进制的“与 / 或”，也是最简单的比较器：<code>lo=MIN(a,b)</code>，<code>hi=MAX(a,b)</code>。最小值 <code>MIN(lo,c)</code>，最大值 <code>MAX(hi,c)</code>，中位数是 <code>MAX(lo, MIN(hi,c))</code>。整个程序是一条直线，没有任何分支：这就是硬件排序网络的思路。寄存器只有 4 个，安排好谁先腾出来。',
  hint:'R3=MIN(R0,R1) 存 lo，R0=MAX(R0,R1) 存 hi（R1 之后可复用）；OUT MIN(R3,R2)；OUT MAX(R3, MIN(R0,R2))；OUT MAX(R0,R2)。',
  starter:'# 三数排序：INP a, b, c → 从小到大输出\nINP R0\nINP R1\nINP R2\n# 用 MIN / MAX 求最小、中位、最大\nHLT\n',
  progTests:()=>[{in:[3,-2,1],want:[-2,1,3]},{in:[0,0,-1],want:[-1,0,0]},{in:[5,9,-7],want:[-7,5,9]},{in:[4,4,4],want:[4,4,4]},{in:[-1,2,-3],want:[-3,-1,2]},{in:[13,-13,0],want:[-13,0,13]}],
  win:'三进制完备！你从一根线出发，亲手走完了整条路：门 → 算术 → 存储 → CPU → 程序。排序网络没有一条跳转，数字自己站好了队。' },
];
const CHAPTERS = ['0 · 平衡三进制','1 · 选择与判断','2 · 算术','3 · 存储','4 · 完备'];
