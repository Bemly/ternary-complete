# AGENTS.md — 三进制完备 (Ternary Complete)

> 平衡三进制版《图灵完备》网页游戏：从 TNAND 出发，经阈值门、MUX、加法器、寄存器、内存、ALU，
> 最终在 TRIT-3 CPU 上写汇编。共 18 关。

## 目录

- `index.html` — 页面结构（路线图独立页 + 全屏布线台 + 底部测试条 + 弹窗）
- `styles.css` — 全站样式。**禁止圆角**：所有元素 `border-radius: 0`，走线拐角走直角
- `ternary.js` — 三值逻辑核心（STI/NTI/PTI/MIN/MAX/MUX、半加/全加、十进制⇄平衡三进制）
- `levels.js` — 元件定义 `COMP_DEFS` + 18 关 `LEVELS`（组合用 `tests()`，时序用 `steps()`，语义均为「置输入→滴答→检查」）
- `editor.js` — 电路编辑器 + 仿真器（求值/滴答/测试/序列化；键鼠交互对标《图灵完备》）
- `cpu.js` — TRIT-3 CPU（3-trit 字，R0–R3，M0–M8）
- `app.js` — 路线图/布线台视图切换、验证台、CPU 面板、存档（`localStorage`）

## 工作流（强制）

1. **每次修改完都提交**：任何文件改动验证通过后，立即 `git add -A && git commit -m "<简短中文说明>"`。
   不要攒多个修改一次提交；不要把未验证的代码提交。
2. 提交前必跑：`node --check` 全部 JS 文件（见下），以及 DOM id 完整性检查（`app.js`/`editor.js`
   引用的 id 必须在 `index.html` 中存在）。
3. 进制/门逻辑改动必跑功能回归：半加器、MUX 阈值构造、REG 时序、两道汇编参考解（参考本文件末尾命令）。

## 常用命令

```bash
# 启动本地服务（文件热更新，无需重启）
python3 -m http.server 8000
# 打开 http://localhost:8000

# 语法检查
node --check ternary.js && node --check levels.js && node --check cpu.js && node --check editor.js && node --check app.js

# DOM id 完整性
python3 -c "
import re
ids = set(re.findall(r'id=\"([^\"]+)\"', open('index.html').read()))
js = open('app.js').read() + open('editor.js').read()
import re as _re
refs = set(_re.findall(r\"\\\$\('([^']+)'\)\", js)) | set(_re.findall(r'getElementById\(\"([^\"]+)\"\)', js))
missing = sorted(r for r in refs if r not in ids)
print('missing:', missing if missing else 'none')
"

# 逻辑回归（半加/MUX/REG/汇编参考解）
node -e "
const fs=require('fs');
let src=fs.readFileSync('ternary.js','utf8')+'\n'+fs.readFileSync('levels.js','utf8')+'\n'+fs.readFileSync('cpu.js','utf8');
src+=\`
const p2=LEVELS.find(l=>l.id===\"c4_prog2\").starter;
for(const t of [{in:[1],want:[1]},{in:[4],want:[10]}]){const r=CPU.run(p2,t.in);console.log('prog2',t.in,JSON.stringify(r.out));}
console.log('halfAdd(-1,-1)='+JSON.stringify(halfAdd(-1,-1)));
\`;eval(src);"
```

## UI 约束

- **零圆角**：不得引入任何 `border-radius != 0`；元件、按钮、弹窗、焊点（方形）一律直角。
- **键鼠对标《图灵完备》**（详见 `editor.js` 顶部注释）：输出钉按住拖到输入钉连线；
  双击导线添加可拖动的导线节点；右键点导线删除；空白拖拽框选；空格/中键/右键拖拽平移；
  滚轮缩放；`Delete` 删除选中；`Esc` 取消；`Ctrl+Z/Y` 撤销/重做；`Ctrl+C/V` 复制粘贴。
- 时序语义统一为「置输入→滴答→检查输出」，改动时序关时保证用例符合该语义。
- 三态配色固定：`−`=#4fc3f7、`0`=#9aa0b0、`+`=#ffa726。
