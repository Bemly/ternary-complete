# AGENTS.md：三进制完备 (Ternary Complete)

> 平衡三进制版《图灵完备》网页游戏：从 TNAND 出发，经阈值门、MUX、加法器、寄存器、内存、ALU，
> 最终在 TRIT-3 CPU 上写汇编。共 18 关。

## 目录

- `index.html` ：页面结构（路线图独立页 + 全屏布线台 + 底部测试条 + 弹窗）
- `styles.css` ：全站样式，见下「UI 约束」
- `ternary.js` ：三值逻辑核心（STI/NTI/PTI/MIN/MAX/MUX、半加/全加、十进制与平衡三进制互转）
- `levels.js` ：元件定义 `COMP_DEFS` + 18 关 `LEVELS`（组合用 `tests()`，时序用 `steps()`，语义均为「置输入，滴答，检查」）
- `editor.js` ：电路编辑器 + 仿真器（求值/滴答/测试/序列化；键鼠交互对标《图灵完备》）
- `cpu.js` ：TRIT-3 CPU（3-trit 字，R0-R3，M0-M8）
- `app.js` ：路线图/布线台视图切换、验证台、CPU 面板、存档（`localStorage`）
- `icons.js` ：内联 SVG 图标库 `ICONS`（全项目唯一图标来源，禁 emoji 用它代替）
- `i18n.js` ：界面语言字典 `I18N`（中英双份）+ `t()` 取词 + `setLang()` 切换（顶栏语言按钮，`localStorage` 记忆）
- `levels_en.js` ：18 关英文覆写 `LEVEL_EN` + 章节名 `CHAPTERS_EN` + 元件英文名 `NAME_EN`/`DESC_EN`
  （中文原文留在 `levels.js`，英文运行时覆写，用 `LText()`/`compName()`/`compDesc()` 取词）

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
node --check ternary.js && node --check levels.js && node --check cpu.js && node --check icons.js && node --check editor.js && node --check app.js

# 破折号与 emoji 扫描（必须无输出；本命令自身用转义写法，文件内不得出现字面破折号）
python3 -c "
import re
dash = chr(0x2014)
pat = re.compile('[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\u23E9-\u23FA\u23F5\u23F8\u25B6\u25C0]')
allow = {0x2713, 0x2717}
files = ['index.html','app.js','editor.js','levels.js','levels_en.js','cpu.js','ternary.js','icons.js','i18n.js','styles.css','AGENTS.md']
bad_dash = [(f, i) for f in files for i, l in enumerate(open(f).read().split(chr(10)), 1) if dash in l]
bad_emoji = [(f, i, hex(ord(c))) for f in files for i, l in enumerate(open(f).read().split(chr(10)), 1) for c in set(pat.findall(l)) if ord(c) not in allow]
print('dash:', bad_dash if bad_dash else 'none')
print('emoji:', bad_emoji if bad_emoji else 'none')
"

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

# 逻辑回归（半加/MUX/REG/汇编参考解；i18n 字典键一致）
node -e "
const fs=require('fs');
let src=fs.readFileSync('ternary.js','utf8')+'\n'+fs.readFileSync('levels.js','utf8')+'\n'+fs.readFileSync('cpu.js','utf8');
src+=\`
const p2=LEVELS.find(l=>l.id===\"c4_prog2\").starter;
for(const t of [{in:[1],want:[1]},{in:[4],want:[10]}]){const r=CPU.run(p2,t.in);console.log('prog2',t.in,JSON.stringify(r.out));}
console.log('halfAdd(-1,-1)='+JSON.stringify(halfAdd(-1,-1)));
\`;eval(src);
node -e "
const fs=require('fs');
let src=fs.readFileSync('ternary.js','utf8')+'\n'+fs.readFileSync('levels.js','utf8')+'\n'+fs.readFileSync('levels_en.js','utf8')+'\n'+fs.readFileSync('i18n.js','utf8');
src+=\`
const zk=Object.keys(I18N.zh).sort(), ek=Object.keys(I18N.en).sort();
console.log('i18n parity:', JSON.stringify(zk)===JSON.stringify(ek)?'OK':'DIFF '+zk.filter(k=>!ek.includes(k))+' / '+ek.filter(k=>!zk.includes(k)));
console.log('EN levels:', Object.keys(LEVEL_EN).length+'/18');
\`;eval(src);"
```

## UI 约束

- **零圆角**：UI 铬（按钮、面板、弹窗、名牌、焊点）不得引入任何 `border-radius != 0`，一律直角。
  例外仅限**标准逻辑符号本体**（`editor.js → shapeOf()`）：AND-D 形、OR 尖拱、反相圈、常量圆端子
  必须按 ANSI Distinctive Shape 绘制，曲线是符号的一部分，不算圆角违规。
- **键鼠对标《图灵完备》**（详见 `editor.js` 顶部注释）：输出钉按住拖到输入钉连线；
  双击导线添加可拖动的导线节点；右键点导线删除；空白拖拽框选；空格/中键/右键拖拽平移；
  滚轮缩放；`Delete` 删除选中；`Esc` 取消；`Ctrl+Z/Y` 撤销/重做；`Ctrl+C/V` 复制粘贴。
- 时序语义统一为「置输入，滴答，检查输出」，改动时序关时保证用例符合该语义。
- 三态配色固定：`−`=#4fc3f7、`0`=#9aa0b0、`+`=#ffa726。
- **禁破折号**：全项目（代码注释、界面文案、文档）不得出现破折号（U+2014，单横双横皆禁），用逗号、句号或冒号改写。
- **禁 emoji**：界面与文案不得出现任何 emoji，一律用 `icons.js` 中的内联 SVG 图标代替
 （方形线条风，`stroke-linecap="square"`）。`✓` `✗` `→` `●` 等纯文本几何符号允许保留。
- **i18n**：面向玩家的文案禁止硬编码中文。UI 铬字符串进 `i18n.js`（中英双份）；
  关卡文案中文进 `levels.js`，英文进 `levels_en.js`；元件名经 `compName()` 取词。
  新增文案必须同时给中英两份（`node` 校验字典键一致，见回归命令）。
- 提交前加检：破折号扫描（见常用命令）为空，
  且 emoji 扫描（见常用命令）无新增。
