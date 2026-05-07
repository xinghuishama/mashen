// ======================== worker.js — 独立 Worker（优化传输） ========================
// 接收主线程 init 消息获取静态数据，避免重复传输
(function () {
  "use strict";

  const MAX_NUMBERS = 5000;

  let SHENGXIAO, CATEGORIES, DUAN, numProps;

  // 内置默认数据（后备）
  const DEFAULT = {
    SHENGXIAO: {
      鼠:[7,19,31,43], 牛:[6,18,30,42], 虎:[5,17,29,41],
      兔:[4,16,28,40], 龙:[3,15,27,39], 蛇:[2,14,26,38],
      马:[1,13,25,37,49], 羊:[12,24,36,48], 猴:[11,23,35,47],
      鸡:[10,22,34,46], 狗:[9,21,33,45], 猪:[8,20,32,44]
    },
    CATEGORIES: {
      金:[4,5,12,13,26,27,34,35,42,43],
      木:[8,9,16,17,24,25,38,39,46,47],
      水:[1,14,15,22,23,30,31,44,45],
      火:[2,3,10,11,18,19,32,33,40,41,48,49],
      土:[6,7,20,21,28,29,36,37],
      红波:[1,2,7,8,12,13,18,19,23,24,29,30,34,35,40,45,46],
      蓝波:[3,4,9,10,14,15,20,25,26,31,36,37,41,42,47,48],
      绿波:[5,6,11,16,17,21,22,27,28,32,33,38,39,43,44,49]
    },
    DUAN: {
      "1段":[1,2,3,4,5,6,7], "2段":[8,9,10,11,12,13,14],
      "3段":[15,16,17,18,19,20,21], "4段":[22,23,24,25,26,27,28],
      "5段":[29,30,31,32,33,34,35], "6段":[36,37,38,39,40,41,42],
      "7段":[43,44,45,46,47,48,49]
    }
  };

  function setDefaultData() {
    SHENGXIAO = DEFAULT.SHENGXIAO;
    CATEGORIES = DEFAULT.CATEGORIES;
    DUAN = DEFAULT.DUAN;
    buildNumProps();
  }
  setDefaultData(); // 启动时即加载默认数据

  function buildNumProps() {
    numProps = new Array(50);
    for (let n=1; n<=49; n++) {
      const head = Math.floor(n/10), tail = n%10;
      const odd = n%2===1?'单':'双';
      const color = CATEGORIES.红波.includes(n)?'red':CATEGORIES.蓝波.includes(n)?'blue':'green';
      const five = CATEGORIES.金.includes(n)?'金':CATEGORIES.木.includes(n)?'木':CATEGORIES.水.includes(n)?'水':CATEGORIES.火.includes(n)?'火':'土';
      const sum = head+tail, sumOdd = sum%2===1?'合数单':'合数双';
      let duan = '';
      for (const [dk,dv] of Object.entries(DUAN)) { if (dv.includes(n)) { duan=dk; break; } }
      const halfOddEven = n>24 ? (n%2===1?'大单':'大双') : (n%2===1?'小单':'小双');
      let shengXiao = '';
      for (const [sk,sv] of Object.entries(SHENGXIAO)) { if (sv.includes(n)) { shengXiao=sk; break; } }
      numProps[n] = { head, tail, color, odd, five, sumOdd, duan, halfOddEven, shengXiao, sum };
    }
  }

  function parseInputWorker(input) {
    if (!input || !input.trim()) return [];
    let cleaned = input.replace(/《.*?》/g,' ').replace(/[^0-9鼠牛虎兔龙蛇马羊猴鸡狗猪]/g,' ')
                       .replace(/([鼠牛虎兔龙蛇马羊猴鸡狗猪])/g,' $1 ');
    const tokens = cleaned.split(' ').filter(t=>t.length>0);
    if (!tokens.length) return [];
    let results = [];
    for (const token of tokens) {
      if (SHENGXIAO[token]) results.push(...SHENGXIAO[token]);
      else if (/^\d+$/.test(token)) {
        const n = Number(token);
        if (Number.isInteger(n) && n>=1 && n<=49) results.push(n);
      }
    }
    if (results.length > MAX_NUMBERS) results = results.slice(0, MAX_NUMBERS);
    return results;
  }

  function buildMatchFunc(cond) {
    if (cond.startsWith('生肖')) {
      const sx = cond.slice(2);
      return n => numProps[n].shengXiao === sx;
    }
    if (cond.endsWith('头单') || cond.endsWith('头双')) {
      const [headStr, oe] = cond.split('头');
      const headVal = parseInt(headStr);
      return n => numProps[n].head === headVal && numProps[n].odd === oe;
    }
    if (cond.endsWith('尾')) {
      const tailVal = parseInt(cond);
      return n => numProps[n].tail === tailVal;
    }
    if (cond.endsWith('段')) return n => numProps[n].duan === cond;
    if (cond.endsWith('波单') || cond.endsWith('波双')) {
      const [c, oe] = cond.split('波');
      const colorMap = {红:'red',蓝:'blue',绿:'green'};
      return n => numProps[n].color === colorMap[c] && numProps[n].odd === oe;
    }
    if (['金','木','水','火','土'].includes(cond)) return n => numProps[n].five === cond;
    if (['合数单','合数双','大单','大双','小单','小双'].includes(cond)) {
      if (cond==='合数单') return n => numProps[n].sumOdd === '合数单';
      if (cond==='合数双') return n => numProps[n].sumOdd === '合数双';
      return n => numProps[n].halfOddEven === cond;
    }
    if (cond.endsWith('合')) {
      const sumVal = parseInt(cond);
      return n => numProps[n].sum === sumVal;
    }
    return () => false;
  }

  function computeHitCounts(killNums, filters) {
    const hits = new Uint8Array(50);
    const killSet = new Set(killNums);
    const funcs = filters.map(buildMatchFunc);
    for (let n=1; n<=49; n++) {
      let hit = killSet.has(n) ? 1 : 0;
      for (const fn of funcs) {
        if (fn(n)) { hit++; if (hit>3) break; }
      }
      hits[n] = hit;
    }
    return hits;
  }

  self.onmessage = function(e) {
    try {
      const msg = e.data;
      if (msg.type === 'init') {
        // 接收主线程的静态数据
        if (msg.numProps && Array.isArray(msg.numProps) && msg.numProps.length >= 50) {
          numProps = msg.numProps; // 直接使用，不再自建
        }
        return;
      }
      if (msg.type === 'analysis') {
        const input = msg.input || '';
        const killNums = msg.killNums || [];
        const filters = msg.filters || [];

        const nums = parseInputWorker(input);
        const rawCount = new Uint16Array(50);
        for (let i=0; i<nums.length; i++) rawCount[nums[i]]++;

        const hitCounts = computeHitCounts(killNums, filters);
        const adjustedCount = new Uint16Array(50);
        let adjustedTotal = 0, unique = 0;
        for (let n=1; n<=49; n++) {
          const raw = rawCount[n];
          const hit = hitCounts[n] || 0;
          const adj = Math.max(0, raw - hit);
          adjustedCount[n] = adj;
          adjustedTotal += adj;
          if (adj > 0) unique++;
        }

        self.postMessage({
          adjustedCount: Array.from(adjustedCount),
          adjustedTotal,
          unique,
          hitCounts: Array.from(hitCounts)
        });
      }
    } catch(err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  };
})();