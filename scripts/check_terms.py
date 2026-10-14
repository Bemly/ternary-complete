#!/usr/bin/env python3
"""仓库名称检测：全文禁止出现某款二进制游戏的中英文名称（大小写、连写皆禁）。

注意：本文件自身不得含有被检词字面量，模式全部用转义与分段构造。
自有品牌名（含 Complete 的三进制那个）不在禁止之列，正则不会误伤它。
用法：python3 scripts/check_terms.py；命中则退出码 1 并列出文件行号。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUFFIXES = {'.html', '.js', '.css', '.md', '.py', '.sh', '.json', '.txt'}

PATS = [
    re.compile(''.join(['\u56fe', '\u7075', '\u5b8c', '\u5907'])),
    re.compile('tur' + 'ing' + r'\s*' + 'com' + 'plete', re.IGNORECASE),
]


def main() -> int:
    bad = []
    for p in sorted(ROOT.rglob('*')):
        if '.git' in p.parts:
            continue
        if not p.is_file() or p.suffix not in SUFFIXES:
            continue
        try:
            text = p.read_text(encoding='utf-8')
        except (OSError, UnicodeDecodeError):
            continue
        for i, line in enumerate(text.split('\n'), 1):
            if any(pat.search(line) for pat in PATS):
                bad.append(f'{p.relative_to(ROOT)}:{i}')
    if bad:
        print('forbidden terms found:')
        for hit in bad:
            print(' ', hit)
        return 1
    print('terms check: clean')
    return 0


if __name__ == '__main__':
    sys.exit(main())
