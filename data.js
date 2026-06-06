// ======================== data.js v3.6.3 ========================
(function () {
  "use strict";

  const MAX_NUMBERS = 5000;

  // 自动跨年生肖算法
  const ZODIAC_SEQUENCE = ["龙","蛇","马","羊","猴","鸡","狗","猪","鼠","牛","虎","兔"];
  const BASE_YEAR = 2024;

  function generateShengxiaoMap(year) {
    const taiSuiIdx = ((year - BASE_YEAR) % 12 + 12) % 12;
    const map = {};
    for (let i = 0; i < 12; i++) {
      const offset = (taiSuiIdx - i + 12) % 12;
      const start = offset + 1;
      const nums = [];
      for (let k = 0; k < 5; k++) {
        const num = start + k * 12;
        if (num <= 49) nums.push(num);
      }
      map[ZODIAC_SEQUENCE[i]] = nums;
    }
    return map;
  }

  // ==================== 五行自动跨年 ====================
  const WUXING_BASE_SEQ = [
    '金','金','土','土','木','木','火','火','金','金',
    '水','水','木','木','火','火','土','土','水','水',
    '木','木','金','金','土','土','水','水','火','火'
  ];
  function generateWuxing(year) {
    const offset = year - 2023;
    const result = { '金':[], '木':[], '水':[], '火':[], '土':[] };
    for (let n = 1; n <= 49; n++) {
      const wx = WUXING_BASE_SEQ[((n - 1) % 30 - offset + 30) % 30];
      result[wx].push(n);
    }
    return result;
  }
  function getNumberWuxing(num, year) {
    const idx = (num - 1) % 30;
    const offset = year - 2023;
    return WUXING_BASE_SEQ[(idx - offset + 30) % 30];
  }

  const CURRENT_YEAR = new Date().getFullYear();
  const SHENGXIAO = generateShengxiaoMap(CURRENT_YEAR);

  const CATEGORIES = {
    红波: [1,2,7,8,12,13,18,19,23,24,29,30,34,35,40,45,46],
    蓝波: [3,4,9,10,14,15,20,25,26,31,36,37,41,42,47,48],
    绿波: [5,6,11,16,17,21,22,27,28,32,33,38,39,43,44,49]
  };

  const DUAN = {
    "1段":[1,2,3,4,5,6,7],"2段":[8,9,10,11,12,13,14],"3段":[15,16,17,18,19,20,21],
    "4段":[22,23,24,25,26,27,28],"5段":[29,30,31,32,33,34,35],
    "6段":[36,37,38,39,40,41,42],"7段":[43,44,45,46,47,48,49]
  };

  const numProps = new Array(50);
  const sxEntries = Object.entries(SHENGXIAO);
  const duanEntries = Object.entries(DUAN);

  for (let n = 1; n <= 49; n++) {
    const head = Math.floor(n / 10);
    const tail = n % 10;
    const odd = n % 2 === 1 ? "单" : "双";
    const color = CATEGORIES.红波.includes(n) ? "red" : (CATEGORIES.蓝波.includes(n) ? "blue" : "green");
    const five = getNumberWuxing(n, CURRENT_YEAR);
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

  window.APP_DATA = {
    MAX_NUMBERS, SHENGXIAO, CATEGORIES, DUAN, numProps,
    ZODIAC_SEQUENCE, BASE_YEAR, generateShengxiaoMap,
    generateWuxing, getNumberWuxing, WUXING_BASE_SEQ
  };
})();
