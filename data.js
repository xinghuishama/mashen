// ======================== data.js — 统一数据源与工具函数 v3.5.3 ========================
"use strict";

const APP_CONFIG = {
    MAX_NUMBERS: 5000,
    HISTORY_PAGE_SIZE: 15,
    LS_KEY: "shenma_v4_state",
    LS_CACHE_KEY: "shenma_v4_lottery_cache"
};

// ======================== 2026年生肖号码（马年） ========================
const SHENGXIAO = {
    鼠: [7, 19, 31, 43],
    牛: [6, 18, 30, 42],
    虎: [5, 17, 29, 41],
    兔: [4, 16, 28, 40],
    龙: [3, 15, 27, 39],
    蛇: [2, 14, 26, 38],
    马: [1, 13, 25, 37, 49],
    羊: [12, 24, 36, 48],
    猴: [11, 23, 35, 47],
    鸡: [10, 22, 34, 46],
    狗: [9, 21, 33, 45],
    猪: [8, 20, 32, 44]
};

// ======================== 五行、波色、数段 ========================
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
    "1段": [1, 2, 3, 4, 5, 6, 7],
    "2段": [8, 9, 10, 11, 12, 13, 14],
    "3段": [15, 16, 17, 18, 19, 20, 21],
    "4段": [22, 23, 24, 25, 26, 27, 28],
    "5段": [29, 30, 31, 32, 33, 34, 35],
    "6段": [36, 37, 38, 39, 40, 41, 42],
    "7段": [43, 44, 45, 46, 47, 48, 49]
};

// ======================== 预计算每个号码的属性 ========================
const numProps = new Array(50);

function buildNumProps() {
    const sxEntries = Object.entries(SHENGXIAO);
    const duanEntries = Object.entries(DUAN);

    for (let n = 1; n <= 49; n++) {
        const head = Math.floor(n / 10);
        const tail = n % 10;
        const odd = n % 2 === 1 ? "单" : "双";
        const color = CATEGORIES.红波.includes(n) ? "red" 
                     : CATEGORIES.蓝波.includes(n) ? "blue" 
                     : "green";
        
        const five = CATEGORIES.金.includes(n) ? "金" 
                   : CATEGORIES.木.includes(n) ? "木" 
                   : CATEGORIES.水.includes(n) ? "水" 
                   : CATEGORIES.火.includes(n) ? "火" 
                   : "土";
        
        const sum = head + tail;
        const sumOdd = sum % 2 === 1 ? "合数单" : "合数双";
        
        let duan = "";
        for (let i = 0; i < duanEntries.length; i++) {
            if (duanEntries[i][1].includes(n)) {
                duan = duanEntries[i][0];
                break;
            }
        }
        
        const halfOddEven = n > 24 
            ? (n % 2 === 1 ? "大单" : "大双") 
            : (n % 2 === 1 ? "小单" : "小双");
        
        let shengXiao = "";
        for (let i = 0; i < sxEntries.length; i++) {
            if (sxEntries[i][1].includes(n)) {
                shengXiao = sxEntries[i][0];
                break;
            }
        }

        numProps[n] = {
            head,
            tail,
            color,
            odd,
            five,
            sumOdd,
            duan,
            halfOddEven,
            shengXiao,
            sum
        };
    }
}

buildNumProps();

// ======================== 公共输入解析函数 ========================
function parseInput(input) {
    if (!input || !input.trim()) return [];
    
    let cleaned = input
        .replace(/《.*?》/g, " ")
        .replace(/[^0-9鼠牛虎兔龙蛇马羊猴鸡狗猪]/g, " ")
        .replace(/([鼠牛虎兔龙蛇马羊猴鸡狗猪])/g, " $1 ");
    
    const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);
    const results = [];

    for (const token of tokens) {
        if (SHENGXIAO[token]) {
            results.push(...SHENGXIAO[token]);
        } else if (/^\d+$/.test(token)) {
            const n = Number(token);
            if (Number.isInteger(n) && n >= 1 && n <= 49) {
                results.push(n);
            }
        }
    }

    // 去重并截断
    const unique = [...new Set(results)];
    return unique.slice(0, APP_CONFIG.MAX_NUMBERS);
}

// ======================== 筛选条件匹配函数构建器 ========================
function buildMatchFunc(cond) {
    if (cond.startsWith("生肖")) {
        const sx = cond.slice(2);
        return n => numProps[n].shengXiao === sx;
    }

    if (cond.endsWith("头单") || cond.endsWith("头双")) {
        const parts = cond.split("头");
        const headVal = parseInt(parts[0], 10);
        const oe = parts[1];
        return n => numProps[n].head === headVal && numProps[n].odd === oe;
    }

    if (cond.endsWith("尾")) {
        const tailVal = parseInt(cond[0], 10);
        return n => numProps[n].tail === tailVal;
    }

    if (cond.endsWith("段")) {
        return n => numProps[n].duan === cond;
    }

    if (cond.endsWith("波单") || cond.endsWith("波双")) {
        const parts = cond.split("波");
        const c = parts[0];
        const oe = parts[1];
        const colorMap = { 红: "red", 蓝: "blue", 绿: "green" };
        return n => numProps[n].color === colorMap[c] && numProps[n].odd === oe;
    }

    if (["金", "木", "水", "火", "土"].includes(cond)) {
        return n => numProps[n].five === cond;
    }

    if (["合数单", "合数双", "大单", "大双", "小单", "小双"].includes(cond)) {
        if (cond === "合数单") return n => numProps[n].sumOdd === "合数单";
        if (cond === "合数双") return n => numProps[n].sumOdd === "合数双";
        return n => numProps[n].halfOddEven === cond;
    }

    if (cond.endsWith("合")) {
        const sumVal = parseInt(cond, 10);
        return n => numProps[n].sum === sumVal;
    }

    return () => false;
}

// ======================== 暴露给全局 ========================
window.APP_DATA = {
    CONFIG: APP_CONFIG,
    SHENGXIAO,
    CATEGORIES,
    DUAN,
    numProps,
    parseInput,
    buildMatchFunc
};

console.log("%c📊 data.js v3.5.3 已加载，号码属性预计算完成", "color:#00ffea");