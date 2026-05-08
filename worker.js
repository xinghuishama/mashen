// ======================== worker.js — 复用 data.js 精简高效版 ========================
"use strict";

self.importScripts('data.js');

self.onmessage = function (e) {
  try {
    const { input = "", killNums = [], filters = [] } = e.data;
    const { nums } = APP_DATA.parseInput(input);
    const rawCount = new Uint16Array(50);
    for (let i = 0; i < nums.length; i++) rawCount[nums[i]]++;

    const killSet = new Set(killNums);
    const matchFuncs = filters.map(APP_DATA.buildMatchFunc);

    const hitCounts = new Uint8Array(50);
    for (let n = 1; n <= 49; n++) {
      let hit = killSet.has(n) ? 1 : 0;
      for (const fn of matchFuncs) {
        if (fn(n)) {
          hit++;
          if (hit > 3) break;
        }
      }
      hitCounts[n] = hit;
    }

    const adjustedCount = new Uint16Array(50);
    let adjustedTotal = 0, unique = 0;
    for (let n = 1; n <= 49; n++) {
      const adj = Math.max(0, rawCount[n] - hitCounts[n]);
      adjustedCount[n] = adj;
      adjustedTotal += adj;
      if (adj > 0) unique++;
    }

    self.postMessage({
      adjustedCount: Array.from(adjustedCount),
      adjustedTotal,
      unique,
      hitCounts: Array.from(hitCounts),
      rawCount: Array.from(rawCount)
    });
  } catch (err) {
    self.postMessage({ error: err.message || "Worker 分析失败" });
  }
};
