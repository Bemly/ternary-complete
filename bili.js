/* B站 Toy 平台接入层：云存档、排行榜、分享 / 二维码接力、账号资料、App 容器适配。
 * 不在 Toy 环境（本地开发、SDK 没加载、未登录、接口被拒）时一律静默降级为纯本地，游戏照常可玩。
 *
 * 用量约定（按 SDK 频率限制的最佳实践）：
 * - 云存档只在关键节点落盘：通关、离开布线台、页面隐藏；只写有变化的 key，一次批量写完。
 * - 排行榜只在通关时提交；榜单拉一次本地缓存，刷新由玩家手动触发。
 * - 遇到 307044 限流按指数退避重试，最多 3 次。
 * - 云存储单值 ≤1024 字节、单 Toy ≤128 个 key：电路压成紧凑格式后按字节切片，总 key 数留余量。
 */
'use strict';

const Bili = {
  sdk: null,
  caps: {},
  cloud: 'off',        // off | on | fail
  synced: {},          // 上次同步到云端的 key → value，用于只写差量
  profile: null,
  ready: null,

  // 探测 SDK 与各能力；全部失败也不抛错
  init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      this.sdk = (typeof window !== 'undefined' && window.toy) || null;
      if (!this.sdk || typeof this.sdk.isSupport !== 'function') return false;
      const names = ['getCloudStorage', 'setCloudStorage', 'removeCloudStorage', 'submitScore', 'getRankList',
        'getMyRank', 'share', 'getQrCode', 'getUserProfile', 'onContainerChange', 'setContainerMode', 'closeBrowser'];
      await Promise.all(names.map(async n => {
        try { this.caps[n] = !!(await this.sdk.isSupport(n)); } catch { this.caps[n] = false; }
      }));
      return true;
    })();
    return this.ready;
  },
  can(n) { return !!(this.sdk && this.caps[n]); },
  isLimit(e) { return e && e.type === 'http_error' && Number(e.code) === 307044; },

  // 调 SDK：限流时指数退避重试，其余错误直接抛给调用方
  async call(name, ...args) {
    let wait = 1000;
    for (let i = 0; ; i++) {
      try { return await this.sdk[name](...args); }
      catch (e) {
        if (!this.isLimit(e) || i >= 2) throw e;
        await new Promise(r => setTimeout(r, wait));
        wait *= 2;
      }
    }
  },

  // ---------- 云存档 ----------
  // 电路紧凑格式：节点 [nid,type,x/11,y/11,val,ioName]，导线 [wid,fromNid,fromPin,toNid,toPin,...pts/11]
  packCircuit(json) {
    const o = JSON.parse(json);
    const g = v => Math.round(v / 11);
    return JSON.stringify({
      n: o.nodes.map(n => [n.nid, n.type, g(n.x), g(n.y)].concat(n.type === 'INPUT' ? [n.val || 0, n.ioName] : n.type === 'OUTPUT' ? [0, n.ioName] : [])),
      w: o.wires.map(w => [w.wid, w.from.nid, w.from.pin, w.to.nid, w.to.pin].concat((w.pts || []).flatMap(p => [g(p.x), g(p.y)]))),
      s: [o.nidSeq, o.widSeq],
    });
  },
  unpackCircuit(str) {
    const o = JSON.parse(str);
    return JSON.stringify({
      v: 2,
      nodes: o.n.map(a => {
        const n = { nid: a[0], type: a[1], x: a[2] * 11, y: a[3] * 11, val: 0, state: 0 };
        if (a.length > 4) { n.val = a[4]; n.ioName = a[5]; }
        if (COMP_DEFS[n.type] && COMP_DEFS[n.type].constVal !== undefined) n.constVal = COMP_DEFS[n.type].constVal;
        return n;
      }),
      wires: o.w.map(a => {
        const pts = [];
        for (let i = 5; i + 1 < a.length; i += 2) pts.push({ x: a[i] * 11, y: a[i + 1] * 11 });
        return { wid: a[0], from: { nid: a[1], pin: a[2] }, to: { nid: a[3], pin: a[4] }, pts };
      }),
      nidSeq: o.s[0], widSeq: o.s[1],
    });
  },
  // 按 UTF-8 字节切片（中文注释也算对）
  chunk(str, max = 1000) {
    const enc = new TextEncoder();
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of str) {
      const b = enc.encode(ch).length;
      if (bytes + b > max) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    if (cur || !out.length) out.push(cur);
    return out;
  },
  // 存档 → 云端键值表。index：关卡在 LEVELS 中的序号，key 更短
  toItems(S) {
    const items = {};
    const meta = { v: 1, done: S.done, cur: S.cur, best: S.best || {}, ts: {}, k: {} };
    const add = (prefix, id, str) => {
      const i = LEVELS.findIndex(l => l.id === id);
      if (i < 0 || !str) return;
      const parts = this.chunk(str);
      parts.forEach((p, j) => { items[`${prefix}${i}_${j}`] = p; });
      meta.k[id] = parts.length;
      meta.ts[id] = (S.ts && S.ts[id]) || 0;
    };
    // 先放已通关关卡、再放其余；超出 key 预算的部分只留在本地
    const ids = [...LEVELS.map(l => l.id)].sort((a, b) => (S.done.includes(b) ? 1 : 0) - (S.done.includes(a) ? 1 : 0));
    for (const id of ids) {
      const before = Object.keys(items).length;
      if (S.circuits[id]) { try { add('c', id, this.packCircuit(S.circuits[id])); } catch {} }
      if (S.code[id]) add('p', id, S.code[id]);
      if (Object.keys(items).length > 118) {
        for (const k of Object.keys(items).slice(before)) delete items[k];
        delete meta.k[id]; delete meta.ts[id];
        break;
      }
    }
    items.meta = JSON.stringify(meta);
    return items;
  },
  fromItems(items) {
    if (!items || !items.meta) return null;
    const meta = JSON.parse(items.meta);
    const out = { done: meta.done || [], cur: meta.cur, best: meta.best || {}, ts: meta.ts || {}, circuits: {}, code: {} };
    for (const [id, n] of Object.entries(meta.k || {})) {
      const i = LEVELS.findIndex(l => l.id === id);
      if (i < 0) continue;
      const lv = LEVELS[i];
      const prefix = lv.kind === 'program' ? 'p' : 'c';
      let s = '';
      for (let j = 0; j < n; j++) s += items[`${prefix}${i}_${j}`] || '';
      try { if (prefix === 'c') out.circuits[id] = this.unpackCircuit(s); else out.code[id] = s; } catch {}
    }
    return out;
  },
  async cloudLoad() {
    await this.init();
    if (!this.can('getCloudStorage')) return null;
    try {
      const items = await this.call('getCloudStorage');
      this.cloud = 'on';
      this.synced = { ...items };
      return this.fromItems(items);
    } catch {
      this.cloud = 'fail';   // 未登录或不在 Toy 页面：本次会话不再尝试
      return null;
    }
  },
  async cloudSave(S) {
    if (this.cloud !== 'on' || !this.can('setCloudStorage')) return false;
    if (this._saving) { this._again = S; return false; }
    this._saving = true;
    try {
      const items = this.toItems(S);
      const changed = {};
      for (const [k, v] of Object.entries(items)) if (this.synced[k] !== v) changed[k] = v;
      const removed = Object.keys(this.synced).filter(k => !(k in items));
      if (Object.keys(changed).length) await this.call('setCloudStorage', changed);
      if (removed.length && this.can('removeCloudStorage')) await this.call('removeCloudStorage', removed);
      for (const k of removed) delete this.synced[k];
      Object.assign(this.synced, changed);
      return true;
    } catch (e) {
      if (this.isLimit(e)) this.onLimit && this.onLimit();
      return false;
    } finally {
      this._saving = false;
      if (this._again) { const n = this._again; this._again = null; this.cloudSave(n); }
    }
  },
  // 本地与云端合并：通关并集；每关电路 / 代码取较新的一份
  merge(S, C) {
    if (!C) return false;
    let changed = false;
    for (const id of C.done) if (LEVELS.some(l => l.id === id) && !S.done.includes(id)) { S.done.push(id); changed = true; }
    S.best = S.best || {}; S.ts = S.ts || {};
    for (const [id, v] of Object.entries(C.best)) if (S.best[id] === undefined || v < S.best[id]) { S.best[id] = v; changed = true; }
    for (const kind of ['circuits', 'code']) {
      for (const [id, v] of Object.entries(C[kind])) {
        if (!S[kind][id] || (C.ts[id] || 0) > (S.ts[id] || 0)) { S[kind][id] = v; S.ts[id] = C.ts[id] || 0; changed = true; }
      }
    }
    return changed;
  },

  // ---------- 排行榜 ----------
  async submit(board, score) {
    await this.init();
    if (!this.can('submitScore')) return null;
    try { return await this.call('submitScore', { board, score }); } catch { return null; }
  },
  async rankList(board, period) {
    await this.init();
    if (!this.can('getRankList')) throw new Error('unsupported');
    return this.call('getRankList', { board, period, limit: 50 });
  },
  async myRank(board, period) {
    if (!this.can('getMyRank')) return null;
    try { return await this.call('getMyRank', { board, period }); } catch { return null; }
  },

  // ---------- 账号 / 分享 / 二维码 ----------
  async getProfile() {
    await this.init();
    if (!this.can('getUserProfile')) return null;
    const p = await this.sdk.getUserProfile();
    // 只保留展示用的头像与昵称；toyOpenId 不落盘、不打日志
    this.profile = { avatar: p.avatar, nickname: p.nickname };
    return this.profile;
  },
  async share(path) { return this.sdk.share({ path }); },
  async qr(path) { return this.sdk.getQrCode({ path, size: 320 }); },

  // ---------- App 容器：安全区与横屏 ----------
  watchContainer(onState) {
    if (!this.can('onContainerChange')) return null;
    try { return this.sdk.onContainerChange(onState); } catch { return null; }
  },
  async landscape() {
    if (!this.can('setContainerMode')) return;
    try { await this.sdk.setContainerMode({ orientation: 'landscape', immersive: true }); } catch {}
  },
};
