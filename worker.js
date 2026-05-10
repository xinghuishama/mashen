// ======================== worker.js — 独立 Worker 分析引擎 v3.5.4 ========================
// 职责：接收原始输入与筛选条件，返回频次统计、命中次数、原始频次
// 优化点：匹配函数缓存、轻量级签名、rawCount 回传、主线程数据优先
(function () {
  "use strict";

  const MAX_NUMBERS = 5000;

  // 备用内置数据（当主线程未传递 numProps 时使用，确保 Worker 独立可运行）
  const SHENGXIAO = {
    鼠: [7, 19, 31, 43],   牛: [6, 18, 30, 42],   虎: [5, 17, 29, 41],
    兔: [4, 16, 28, 40],   龙: [3, 15, 27, 39],   蛇: [2, 14, 26, 38],
    马: [1, 13, 25, 37, 49],  羊: [12, 24, 36, 48],  猴: [11, 23, 35, 47],
    鸡: [10, 22, 34, 46],  狗: [9, 21, 33, 45],   猪: [8, 20, 32, 44]
  };
  const CATEGORIES = {
    金: [4, 5, 12, 13, 26, 27, 34, 35, 42, 43],
    木: [8, 9, 16, 17, 24, 25, 38, 39, 46, 47],
    水: [1, 14, 15, 22, 23, 30, 31, 44, 45],
    火: [2, 3, 10, 11, 18, 19, 32, 33, 40, 41, 48, 49],
    土: [6, 7, 20, 21, 28, 29, 36, 37],
    红波: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    蓝波: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    绿波: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
  };
  const DUAN = {
    "1段": [1, 2, 3, 4, 5, 6, 7],       "2段": [8, 9, 10, 11, 12, 13, 14],
    "3段": [15, 16, 17, 18, 19, 20, 21], "4段": [22, 23, 24, 25, 26, 27, 28],
    "5段": [29, 30, 31, 32, 33, 34, 35], "6段": [36, 37, 38, 39, 40, 41, 42],
    "7段": [43, 44, 45, 46, 47, 48, 49]
  };

  // 内置 numProps 生成器（fallback）
  let numProps = new Array(50);
  function buildNumProps() {
    const sxEntries = Object.entries(SHENGXIAO);
    const duanEntries = Object.entries(DUAN);
    for (let n = 1; n <= 49; n++) {
      const head = Math.floor(n / 10);
      const tail = n % 10;
      const odd = n % 2 === 1 ? "单" : "双";
      const color = CATEGORIES.红波.includes(n) ? "red" : (CATEGORIES.蓝波.includes(n) ? "blue" : "green");
      const five = CATEGORIES.金.includes(n) ? "金" : (CATEGORIES.木.includes(n) ? "木" : (CATEGORIES.水.includes(n) ? "水" : (CATEGORIES.火.includes(n) ? "火" : "土")));
      const sum = head + tail;
      const sumOdd = sum % 2 === 1 ? "合数单" : "合数双";
      let duan = "";
      for (let i = 0; i < duanEntries.length; i++) {
        if (duanEntries[i][1].includes(n)) { duan = duanEntries[i][0]; break; }
      }
      const halfOddEven = n > 24 ? (n % 2 === 1 ? "大单" : "大双") : (n % 2 === 1 ? "小单" : "小双");
      let shengXiao = "";
      for (let i = 0; i < sxEntries.length; i++) {
        if (sxEntries[i][1].includes(n)) { shengXiao = sxEntries[i][0]; break; }
      }
      numProps[n] = { head, tail, color, odd, five, sumOdd, duan, halfOddEven, shengXiao, sum };
    }
  }
  buildNumProps();

  // 输入解析：提取号码与生肖，截断至 MAX_NUMBERS（保留重复，与主线程一致）
  function parseInputWorker(input) {
    if (!input || !input.trim()) return [];
    let cleaned = input.replace(/《.*?》/g, " ").replace(/[^0-9鼠牛虎兔龙蛇马羊猴鸡狗猪]/g, " ")
                       .replace(/([鼠牛虎兔龙蛇马羊猴鸡狗猪])/g, " $1 ");
    const tokens = cleaned.split(" ").filter(function (t) { return t.length > 0; });
    if (!tokens.length) return [];

    let results = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (SHENGXIAO[token]) {
        results.push.apply(results, SHENGXIAO[token]);
      } else if (/^\d+$/.test(token)) {
        const n = Number(token);
        if (Number.isInteger(n) && n >= 1 && n <= 49) results.push(n);
      }
    }
    if (results.length > MAX_NUMBERS) results = results.slice(0, MAX_NUMBERS);
    return results;
  }

  // 条件编译器：将筛选字符串编译为匹配函数
  function buildMatchFunc(cond) {
    if (cond.startsWith("生肖")) {
      const sx = cond.slice(2);
      return function (n) { return numProps[n].shengXiao === sx; };
    }
    if (cond.endsWith("头单") || cond.endsWith("头双")) {
      const parts = cond.split("头");
      const headVal = parseInt(parts[0], 10);
      const oe = parts[1];
      return function (n) { return numProps[n].head === headVal && numProps[n].odd === oe; };
    }
    if (cond.endsWith("尾")) {
      const tailVal = parseInt(cond[0], 10);
      return function (n) { return numProps[n].tail === tailVal; };
    }
    if (cond.endsWith("段")) {
      return function (n) { return numProps[n].duan === cond; };
    }
    if (cond.endsWith("波单") || cond.endsWith("波双")) {
      const parts = cond.split("波");
      const c = parts[0];
      const oe = parts[1];
      const colorMap = { 红: "red", 蓝: "blue", 绿: "green" };
      return function (n) { return numProps[n].color === colorMap[c] && numProps[n].odd === oe; };
    }
    if (["金", "木", "水", "火", "土"].includes(cond)) {
      return function (n) { return numProps[n].five === cond; };
    }
    if (["合数单", "合数双", "大单", "大双", "小单", "小双"].includes(cond)) {
      if (cond === "合数单") return function (n) { return numProps[n].sumOdd === "合数单"; };
      if (cond === "合数双") return function (n) { return numProps[n].sumOdd === "合数双"; };
      return function (n) { return numProps[n].halfOddEven === cond; };
    }
    if (cond.endsWith("合")) {
      const sumVal = parseInt(cond, 10);
      return function (n) { return numProps[n].sum === sumVal; };
    }
    return function () { return false; };
  }

  // 匹配函数缓存：以筛选条件数组的 join 结果作为签名，避免 JSON.stringify 开销
  let cachedFuncs = null;
  let lastFiltersSignature = "";

  function computeHitCounts(killNums, filters) {
    const hits = new Uint8Array(50);
    const killSet = new Set(killNums);
    const sig = filters.join("\x00");

    if (!cachedFuncs || sig !== lastFiltersSignature) {
      cachedFuncs = filters.map(buildMatchFunc);
      lastFiltersSignature = sig;
    }

    for (let n = 1; n <= 49; n++) {
      let hit = killSet.has(n) ? 1 : 0;
      for (let i = 0; i < cachedFuncs.length; i++) {
        if (cachedFuncs[i](n)) {
          hit++;
          if (hit > 3) break; // 命中次数上限截断，减少无用计算
        }
      }
      hits[n] = hit;
    }
    return hits;
  }

  // Worker 消息入口
  self.onmessage = function (e) {
    try {
      // 优先使用主线程传递的 numProps，确保数据绝对一致
      if (e.data.numProps && Array.isArray(e.data.numProps) && e.data.numProps.length >= 50) {
        numProps = e.data.numProps;
      }
      const input = e.data.input || "";
      const killNums = e.data.killNums || [];
      const filters = e.data.filters || [];

      // 解析输入并统计原始频次（保留重复）
      const nums = parseInputWorker(input);
      const rawCount = new Uint16Array(50);
      for (let i = 0; i < nums.length; i++) {
        rawCount[nums[i]]++;
      }

      // 计算各号码被斩杀/筛选条件命中次数
      const hitCounts = computeHitCounts(killNums, filters);

      // 计算调整后频次（原始频次 - 命中次数，最低为0）
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

      self.postMessage({
        adjustedCount: Array.from(adjustedCount),
        adjustedTotal: adjustedTotal,
        unique: unique,
        hitCounts: Array.from(hitCounts),
        rawCount: Array.from(rawCount) // 回传原始频次，支持0次统计
      });
    } catch (err) {
      // Worker 内部错误不应抛到主线程导致崩溃，转为错误消息
      self.postMessage({ error: err.message || "Worker 分析失败" });
    }
  };
})();
