// ======================== data.js — 静态数据与号码属性预计算 v3.5.4 ========================
// 设计目标：单一数据源，供主线程与 Worker 共享（Worker 通过 postMessage 接收 numProps）
// 年份：2026（丙午·马年），生肖号码按当年太岁顺移
(function () {
  "use strict";

  const MAX_NUMBERS = 5000;

  // 2026年生肖号码映射（马年，马占 01,13,25,37,49，其余依次顺排）
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

  // 五行与波色分类（标准澳门六合彩配色）
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

  // 数段定义（每段7个号码）
  const DUAN = {
    "1段": [1, 2, 3, 4, 5, 6, 7],
    "2段": [8, 9, 10, 11, 12, 13, 14],
    "3段": [15, 16, 17, 18, 19, 20, 21],
    "4段": [22, 23, 24, 25, 26, 27, 28],
    "5段": [29, 30, 31, 32, 33, 34, 35],
    "6段": [36, 37, 38, 39, 40, 41, 42],
    "7段": [43, 44, 45, 46, 47, 48, 49]
  };

  // 预计算 1-49 每个号码的完整属性表，避免运行时重复计算
  const numProps = new Array(50);
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

  // 暴露到全局，供 app.js 读取
  window.APP_DATA = {
    MAX_NUMBERS,
    SHENGXIAO,
    CATEGORIES,
    DUAN,
    numProps
  };
})();
