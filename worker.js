// ======================== worker.js — 独立分析引擎 v3.5.3 ========================
// 职责：高性能计算号码频次、命中衰减，支持主线程降级
"use strict";

// 引入统一数据源
self.importScripts('data.js');

self.onmessage = function (e) {
    try {
        const { input = "", killNums = [], filters = [], numProps: passedProps } = e.data;

        // 如果主线程传了 numProps，则优先使用（保持数据一致性）
        if (passedProps && Array.isArray(passedProps) && passedProps.length >= 50) {
            // 可选：覆盖当前 numProps（通常不需要，因为 data.js 已加载）
        }

        // 1. 解析输入号码（支持数字 + 生肖）
        const nums = APP_DATA.parseInput(input);

        // 2. 统计原始频次
        const rawCount = new Uint16Array(50);
        for (let i = 0; i < nums.length; i++) {
            rawCount[nums[i]]++;
        }

        // 3. 计算命中次数（杀码 + 所有筛选条件）
        const killSet = new Set(killNums);
        const matchFuncs = filters.map(APP_DATA.buildMatchFunc);
        const hitCounts = new Uint8Array(50);

        for (let n = 1; n <= 49; n++) {
            let hit = killSet.has(n) ? 1 : 0;
            
            for (let i = 0; i < matchFuncs.length; i++) {
                if (matchFuncs[i](n)) {
                    hit++;
                    if (hit > 3) break;   // 最高记录4次命中（性能优化）
                }
            }
            hitCounts[n] = hit;
        }

        // 4. 计算调整后频次（原始 - 命中，最低为0）
        const adjustedCount = new Uint16Array(50);
        let adjustedTotal = 0;
        let unique = 0;

        for (let n = 1; n <= 49; n++) {
            const raw = rawCount[n];
            const hit = hitCounts[n];
            const adj = Math.max(0, raw - hit);
            
            adjustedCount[n] = adj;
            adjustedTotal += adj;
            if (adj > 0) unique++;
        }

        // 5. 返回结果给主线程
        self.postMessage({
            adjustedCount: Array.from(adjustedCount),
            adjustedTotal: adjustedTotal,
            unique: unique,
            hitCounts: Array.from(hitCounts),
            rawCount: Array.from(rawCount)
        });

    } catch (err) {
        console.error("Worker 执行出错:", err);
        self.postMessage({
            error: err.message || "Worker 分析引擎异常"
        });
    }
};

// Worker 启动提示
console.log("%c⚙️ Worker.js v3.5.3 已启动（独立分析引擎）", "color:#00ff88");