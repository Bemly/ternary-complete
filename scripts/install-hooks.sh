#!/bin/sh
# 每次提交前自动跑名称检测，不通过则拦截提交
python3 scripts/check_terms.py || exit 1
