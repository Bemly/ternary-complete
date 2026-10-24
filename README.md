# Ternary Complete

A web puzzle game that rebuilds the computer from scratch in **balanced ternary**
(−1 / 0 / +1): from a single TNAND gate, through threshold gates, MUX, adders,
registers, memory and an ALU, to writing assembly for the TRIT-3 CPU.
25 levels, Chinese/English bilingual.

中文说明见 [README.zh.md](README.zh.md).

## Play

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

No build step, no dependencies. Static files only.

## How it plays

- **Roadmap view**: a wiring-bench-style tech tree, bottom-up, with levels wired
  together in a serpentine path. Click a node to enter the bench.
- **Wiring bench**: drag from a pin to the opposite pin (either direction; pins
  snap within 28px, dropping on a part body picks its nearest free pin), drag a
  wired input to rewire or unplug it, drag parts straight from the bin, drag
  wires to reroute, double-click to add nodes, right-click to delete, box-select,
  pan/zoom, `F` to fit, undo/redo, copy/paste. Every pin sits on the 22px grid.
- **Wiring rule**: wires of different nets may cross but never overlap or hug
  (parallel gap < 6px over a run > 24px counts too). Branches of the same net may
  share a trunk and get a solder dot where they split. A bad drop squeezes into a
  nearby free lane, falling back to the previous step only when nowhere fits.
- **Clock**: single Tick plus auto gears (1/2/5/10 TPS), beat counter, live
  input/output strip, and a waveform timeline sampling every tick.
- **Reference solution** button on every level loads a verified build and runs
  its tests.
- **Dev mode** (unlock every level) only exists when running locally (localhost or a local file, `?dev` also works); it is off and hidden anywhere else.

## bilibili Toy integration

The bilibili Toy JS SDK is wired in through `bili.js`. Inside a Toy it turns on automatically; locally or when
logged out the game falls back to local saves: cloud save (progress, circuits and code follow the account),
two leaderboards (levels cleared, lean score), share sheet in the app and QR relay on the web (deep link
`?lv=<level id>`), account avatar and nickname, app safe areas, a rotate-to-landscape hint, and touch pan / pinch zoom.

## Level map

| # | Level | Chapter |
|---|-------|---------|
| 01 | Hello, Ternary: one wire | 0 · Balanced Ternary |
| 02 | Negate STI: the first gate | 0 · Balanced Ternary |
| 03 | Minimum TMIN: ternary AND | 0 · Balanced Ternary |
| 04 | Maximum TMAX: De Morgan | 0 · Balanced Ternary |
| 05 | Threshold gates: ternary is not complete | 0 · Balanced Ternary |
| 06 | MUX: the universal gate | 1 · Select & Decide |
| 07 | Comparator: the scales | 1 · Select & Decide |
| 08 | Decoder DEC: 1 wire to 3 | 1 · Select & Decide |
| 09 | Half adder: 1+1=…? | 2 · Arithmetic |
| 10 | Full adder: addition with carry | 2 · Arithmetic |
| 11 | 2-trit ripple adder | 2 · Arithmetic |
| 12 | Subtractor: negate is sign-flip | 2 · Arithmetic |
| 13 | Multiplier: multiplying signs | 2 · Arithmetic |
| 14 | Register: remember one trit (sequential) | 3 · Storage |
| 15 | Shift register: a three-tick delay line (sequential) | 3 · Storage |
| 16 | Counter: a register that counts (sequential) | 3 · Storage |
| 17 | Accumulator: a register that keeps the books (sequential) | 3 · Storage |
| 18 | Small memory: 3 cells (sequential) | 3 · Storage |
| 19 | ALU: the ternary operator | 4 · Complete |
| 20 | Program counter PC: step and jump (sequential) | 4 · Complete |
| 21 | Program 1: echo and negate (assembly) | 4 · Complete |
| 22 | Program 2: sum 1+2+…+n (assembly) | 4 · Complete |
| 23 | Program 3: multiply a × b (assembly) | 4 · Complete |
| 24 | Program 4: Fibonacci (assembly) | 4 · Complete |
| 25 | Program 5: sort three numbers (assembly) | 4 · Complete |

The key lesson: one TNAND is **not** functionally complete in three-valued
logic (its functions are all zero-preserving). Threshold gates NTI / PTI close
the gap, the physical basis of the historical Setun ternary computer, and the MUX built
on top of them makes every truth table a lookup.

## Project layout

- `index.html`: roadmap page + fullscreen bench + bottom test strip + dialogs
- `styles.css`: styling (zero rounded corners on UI chrome; ANSI gate symbols)
- `ternary.js`: ternary logic core and balanced↔decimal conversion
- `levels.js`: part definitions (`COMP_DEFS`) + 25 levels (`LEVELS`, Chinese)
- `levels_en.js`: English overrides for levels, chapters, part names
- `i18n.js`: UI dictionary (zh/en), `t()`, language switch
- `icons.js`: inline SVG icon set (the only icon source; no emoji)
- `editor.js`: circuit editor + simulator (eval/tick/tests/serialize, router)
- `solutions.js`: verified reference builds for every level (circuit specs + assembly programs)
- `cpu.js`: TRIT-3 CPU (3-trit words, R0–R3, M0–M8)
- `app.js`: view switching, test bench, CPU panel, saves (`localStorage`)
- `scripts/check_solutions.js`: headless regression over all reference builds
- `scripts/check_terms.py`: name scanner, wired as a pre-commit hook
- `AGENTS.md`: contributor rules (commit workflow, UI constraints, commands)

## Checks

```bash
node --check ternary.js && node --check levels.js && node --check cpu.js \
  && node --check icons.js && node --check editor.js && node --check app.js
node scripts/check_solutions.js   # every reference build must pass
python3 scripts/check_terms.py    # runs automatically on every commit
```

Coding-agent rules live in [AGENTS.md](AGENTS.md): verify before every commit,
keep UI text in `i18n.js` / `levels*.js`, no emoji, no rounded corners on UI
chrome, wires cross-but-never-merge.
