// ======================== worker.js — 独立 Worker（APK WebView 兼容版）========================
// ❌ 不使用 Blob URL / Service Worker
// ✅ 纯独立文件，通过 new Worker('worker.js') 加载
// ✅ v3.5: 单数据源 — importScripts('data.js') 加载静态数据，不再内置重复定义
(function () {
  "use strict";

  const MAX_NUMBERS = 5000;

  // ========== 单数据源：importScripts 加载 data.js，与主线程共用同一数据源 ==========
  // 若 data.js 加载失败（如跨域/CSP），回退到主线程 postMessage 注入
  let dataLoadFailed = false;
  try {
    importScripts('data.js');
  } catch (e) {
    console.warn('Worker: importScripts(data.js) failed, will use postMessage data', e);
    dataLoadFailed = true;
  }

  // 从 data.js 获取数据（Worker 环境中 importScripts 会在全局作用域执行）
  const DATA = (typeof APP_DATA !== 'undefined') ? APP_DATA : {};
  const SHENGXIAO = DATA.SHENGXIAO || {};
  let numProps = DATA.numProps || [];  // let 允许 fallback 替换

  // ========== 安全输入解析（不用 \s 正则，避免转义问题）==========
  function parseInputWorker(input) {
    if (!input || !input.trim()) return [];
    let cleaned = input.replace(/《.*?》/g, ' ').replace(/[^0-9鼠牛虎兔龙蛇马羊猴鸡狗猪]/g, ' ')
                       .replace(/([鼠牛虎兔龙蛇马羊猴鸡狗猪])/g, ' $1 ');
    const tokens = cleaned.split(' ').filter(function (t) { return t.length > 0; });
    if (!tokens.length) return [];

    let results = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (SHENGXIAO[token]) {
        results.push.apply(results, SHENGXIAO[token]);
      } else {
        if (!/^\d+$/.test(token)) continue;
        let n = Number(token);
        if (Number.isInteger(n) && n >= 1 && n <= 49) results.push(n);
      }
    }
    if (results.length > MAX_NUMBERS) results = results.slice(0, MAX_NUMBERS);
    return results;
  }

  // ========== 筛选条件编译器 ==========
  function buildMatchFunc(cond) {
    if (cond.startsWith('生肖')) {
      const sx = cond.slice(2);
      return function (n) { return numProps[n].shengXiao === sx; };
    }
    if (cond.endsWith('头单') || cond.endsWith('头双')) {
      const parts = cond.split('头');
      const headVal = parseInt(parts[0], 10);
      const oe = parts[1];
      return function (n) { return numProps[n].head === headVal && numProps[n].odd === oe; };
    }
    if (cond.endsWith('尾')) {
      const tailVal = parseInt(cond[0], 10);
      return function (n) { return numProps[n].tail === tailVal; };
    }
    if (cond.endsWith('段')) {
      return function (n) { return numProps[n].duan === cond; };
    }
    if (cond.endsWith('波单') || cond.endsWith('波双')) {
      const parts = cond.split('波');
      const c = parts[0];
      const oe = parts[1];
      const colorMap = {红:'red',蓝:'blue',绿:'green'};
      return function (n) { return numProps[n].color === colorMap[c] && numProps[n].odd === oe; };
    }
    if (['金','木','水','火','土'].includes(cond)) {
      return function (n) { return numProps[n].five === cond; };
    }
    if (['合数单','合数双','大单','大双','小单','小双'].includes(cond)) {
      if (cond === '合数单') return function (n) { return numProps[n].sumOdd === '合数单'; };
      if (cond === '合数双') return function (n) { return numProps[n].sumOdd === '合数双'; };
      return function (n) { return numProps[n].halfOddEven === cond; };
    }
    if (cond.endsWith('合')) {
      const sumVal = parseInt(cond, 10);
      return function (n) { return numProps[n].sum === sumVal; };
    }
    return function () { return false; };
  }

  // ========== 高性能命中计算（Uint8Array + 上限剪枝）==========
  function computeHitCounts(killNums, filters) {
    const hits = new Uint8Array(50);
    const killSet = new Set(killNums);
    const matchFuncs = filters.map(buildMatchFunc);
    for (let n = 1; n <= 49; n++) {
      let hit = killSet.has(n) ? 1 : 0;
      for (let i = 0; i < matchFuncs.length; i++) {
        if (matchFuncs[i](n)) {
          hit++;
          if (hit > 3) break; // 剪枝：超过 3 次命中后不再继续计算
        }
      }
      hits[n] = hit;
    }
    return hits;
  }

  // ========== Worker 消息处理 ==========
  // 优先使用主线程传来的 numProps，避免数据重复；无则回退到内置数据
  self.onmessage = function (e) {
    // 若主线程传来有效 numProps，直接替换内置数据，消除 Worker/主线程数据重复
    if (e.data.numProps && e.data.numProps.length >= 50) {
      numProps = e.data.numProps;
    }
    const input = e.data.input || '';
    const killNums = e.data.killNums || [];
    const filters = e.data.filters || [];

    // 解析输入
    const nums = parseInputWorker(input);
    const rawCount = new Uint16Array(50);
    for (let i = 0; i < nums.length; i++) {
      rawCount[nums[i]]++;
    }

    // 计算命中
    const hitCounts = computeHitCounts(killNums, filters);

    // 调整频次
    const adjustedCount = new Uint16Array(50);
    let adjustedTotal = 0;
    let unique = 0;
    for (let n = 1; n <= 49; n++) {
      const raw = rawCount[n];
      const hit = hitCounts[n] || 0;
      const adj = Math.max(0, raw - hit);
      adjustedCount[n] = adj;
      adjustedTotal += adj;
      if (adj > 0) unique++;
    }

    // 返回结果
    self.postMessage({
      adjustedCount: Array.from(adjustedCount),
      adjustedTotal: adjustedTotal,
      unique: unique,
      hitCounts: Array.from(hitCounts)
    });
  };
})();
