// ======================== app.js — 主线程核心逻辑 v3.5.4 ========================
// 变更记录：
// 1) 开奖自动刷新：21:33:30 起每5秒刷新，开奖完成停止
// 2) 新增彩色水泡粒子背景特效（initParticles）
// 3) 保留 v3.5.3 全部审查修复（去重修复、缓存复用、z-index、内存泄漏、并发锁等）
(function () {
  "use strict";

  // ======================== 数据与配置 ========================
  const DATA = window.APP_DATA || {};
  const MAX_NUMBERS = DATA.MAX_NUMBERS || 5000;
  const SHENGXIAO = DATA.SHENGXIAO || {};
  const numProps = DATA.numProps || [];

  const API_CONFIG = {
    live: "https://macaumarksix.com/api/live2",
    historyBase: "https://history.macaumarksix.com/history/macaujc2/y/"
  };
  const HISTORY_PAGE_SIZE = 15;
  const LS_KEY = "shenma_v4_state";
  const LS_CACHE_KEY = "shenma_v4_lottery_cache";

  // ======================== DOM 缓存 ========================
  const DOM = {};
  function cacheDOM() {
    const ids = [
      "numbers", "result", "charCount", "numberWarn", "exampleBtn", "clearBtn", "copyResultBtn",
      "lotteryPeriod", "lotteryTime", "lastRefreshTime", "lotteryBalls", "refreshLotteryBtn",
      "drawer-overlay", "drawer-container", "drawer-title", "drawer-content", "drawer-close", "toast"
    ];
    ids.forEach(function (id) {
      DOM[id.replace(/-/g, "_")] = document.getElementById(id);
    });
    if (!DOM.drawer_content) DOM.drawer_content = document.getElementById("drawer-content");
    if (!DOM.drawer_container) DOM.drawer_container = document.getElementById("drawer-container");
    if (!DOM.drawer_overlay) DOM.drawer_overlay = document.getElementById("drawer-overlay");
    if (!DOM.drawer_title) DOM.drawer_title = document.getElementById("drawer-title");
    if (!DOM.drawer_close) DOM.drawer_close = document.getElementById("drawer-close");
  }

  // ======================== 状态管理 ========================
  let state = {
    killNums: [],
    selectedFilters: {
      shengxiao: [], haomatou: [], weishu: [], shuduan: [],
      bose: [], wuxing: [], bandanshuang: [], heshu: []
    }
  };
  let subscribers = [];
  let lastAnalysisResult = null;
  let lastRawCount = null;

  function subscribe(fn) { subscribers.push(fn); }
  function notify() { subscribers.forEach(function (fn) { fn(); }); }

  function setKillNums(newNums) { state.killNums = [...newNums]; notify(); }
  function toggleFilter(category, value, checked) {
    if (!state.selectedFilters[category]) return;
    const set = new Set(state.selectedFilters[category]);
    if (checked) set.add(value); else set.delete(value);
    state.selectedFilters[category] = Array.from(set);
    notify();
  }
  function clearAllFilters() {
    state.killNums = [];
    Object.keys(state.selectedFilters).forEach(function (k) { state.selectedFilters[k] = []; });
    notify();
  }
  function getFilterSet() {
    return Object.values(state.selectedFilters).flat();
  }

  // ======================== 本地持久化 ========================
  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        killNums: state.killNums,
        selectedFilters: state.selectedFilters
      }));
    } catch (e) {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      if (Array.isArray(parsed.killNums)) {
        state.killNums = parsed.killNums.filter(function (n) {
          return Number.isInteger(n) && n >= 1 && n <= 49;
        });
      }
      if (parsed.selectedFilters && typeof parsed.selectedFilters === "object") {
        Object.keys(state.selectedFilters).forEach(function (k) {
          const val = parsed.selectedFilters[k];
          if (Array.isArray(val)) state.selectedFilters[k] = Array.from(val);
        });
      }
    } catch (e) {
      console.warn("loadState failed", e);
    }
  }

  // ======================== 工具函数 ========================
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(msg) {
    const t = DOM.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("translate-y-20", "opacity-0");
    t.style.transform = "translateY(0)";
    t.style.opacity = "1";
    setTimeout(function () {
      t.classList.add("translate-y-20", "opacity-0");
      t.style.transform = "translateY(5rem)";
      t.style.opacity = "0";
    }, 2000);
  }

  /**
   * 解析输入文本，提取号码与生肖
   * v3.5.3+ 修复：移除错误去重，保留原始重复频次，使 rawCount 统计真实
   */
  function parseInputCount(input) {
    if (!input || !input.trim()) return { nums: [], truncated: false };
    let cleaned = input.replace(/《.*?》/g, " ").replace(/[^0-9鼠牛虎兔龙蛇马羊猴鸡狗猪]/g, " ")
                       .replace(/([鼠牛虎兔龙蛇马羊猴鸡狗猪])/g, " $1 ");
    const tokens = cleaned.split(" ").filter(function (t) { return t.length > 0; });
    if (!tokens.length) return { nums: [], truncated: false };

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
    let truncated = false;
    if (results.length > MAX_NUMBERS) { results = results.slice(0, MAX_NUMBERS); truncated = true; }
    return { nums: results, truncated: truncated };
  }

  // ======================== 匹配函数缓存 ========================
  let cachedMatchFuncs = null;
  let lastFilterSignature = "";

  function getMatchFuncs(filters) {
    const allConds = filters || getFilterSet();
    const sig = allConds.join("\x00");
    if (cachedMatchFuncs && sig === lastFilterSignature) return cachedMatchFuncs;
    lastFilterSignature = sig;
    cachedMatchFuncs = allConds.map(function (cond) { return buildMatchFunc(cond); });
    return cachedMatchFuncs;
  }

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

  /**
   * 主线程 fallback 分析：复用 getMatchFuncs 缓存，避免重复编译
   */
  function computeAnalysisMainThread(input, killNums, filters) {
    const nums = parseInputCount(input).nums;
    const rawCount = new Uint16Array(50);
    for (let i = 0; i < nums.length; i++) rawCount[nums[i]]++;

    const killSet = new Set(killNums);
    const funcs = getMatchFuncs(filters);
    const hitCounts = new Uint8Array(50);

    for (let n = 1; n <= 49; n++) {
      let hit = killSet.has(n) ? 1 : 0;
      for (let i = 0; i < funcs.length; i++) {
        if (funcs[i](n)) { hit++; if (hit > 3) break; }
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
    return { adjustedCount: Array.from(adjustedCount), adjustedTotal, unique, hitCounts: Array.from(hitCounts), rawCount: Array.from(rawCount) };
  }

  // ======================== Web Worker 管理 ========================
  let analysisWorker = null;
  let workerReady = false;

  function initWorker() {
    if (analysisWorker) return;
    try {
      analysisWorker = new Worker("worker.js");
      analysisWorker.onmessage = onWorkerMessage;
      analysisWorker.onerror = function (e) {
        console.error("Worker error:", e);
        workerReady = false;
        runAnalysisMainThread();
      };
      workerReady = true;
    } catch (e) {
      console.error("Worker init failed:", e);
      workerReady = false;
      showToast("分析引擎降级至主线程模式");
    }
  }
  function terminateWorker() {
    if (analysisWorker) { analysisWorker.terminate(); analysisWorker = null; workerReady = false; }
  }

  function onWorkerMessage(e) {
    try {
      const d = e.data;
      if (d.error) {
        console.error("Worker returned error:", d.error);
        runAnalysisMainThread();
        return;
      }
      lastRawCount = d.rawCount;
      renderResult(d.adjustedCount, d.adjustedTotal, d.unique, d.hitCounts, d.rawCount);
    } catch (err) {
      console.error("onWorkerMessage error:", err);
    }
  }

  // ======================== 独苗飞入特效 ========================
  let currentUniqueElement = null;
  let lastUniqueNum = null;

  function launchUniqueFlyEffect(targetNum, colorClass) {
    const targetEl = DOM.result.querySelector('[data-num="' + targetNum + '"]');
    if (!targetEl) return;

    const targetRect = targetEl.getBoundingClientRect();
    const startX = window.innerWidth / 2 - 24;
    const startY = -80;
    const endX = targetRect.left + targetRect.width / 2 - 24;
    const endY = targetRect.top + targetRect.height / 2 - 24;
    const glowColor = colorClass === "ball-red" ? "#ff3366" : colorClass === "ball-green" ? "#33cc66" : "#3366ff";

    const ball = document.createElement("div");
    ball.className = "flying-unique-ball " + colorClass;
    ball.textContent = String(targetNum).padStart(2, "0");
    ball.style.left = startX + "px";
    ball.style.top = startY + "px";
    ball.style.color = glowColor;
    document.body.appendChild(ball);

    let startTime = null;
    const duration = 1400;

    function dropTrail(x, y) {
      const trail = document.createElement("div");
      trail.className = "flying-trail";
      trail.style.left = (x + 21) + "px";
      trail.style.top = (y + 21) + "px";
      trail.style.background = glowColor;
      trail.style.boxShadow = "0 0 8px " + glowColor;
      document.body.appendChild(trail);
      requestAnimationFrame(function () {
        trail.style.transition = "all 0.5s ease";
        trail.style.opacity = "0";
        trail.style.transform = "scale(0.2)";
      });
      setTimeout(function () { trail.remove(); }, 500);
    }

    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const currentX = startX + (endX - startX) * ease;
      const currentY = startY + (endY - startY) * ease;
      const scale = 0.6 + Math.sin(progress * Math.PI) * 0.7;
      const rotate = progress * 1080;
      ball.style.transform = "translate3d(" + (currentX - startX) + "px, " + (currentY - startY) + "px, 0) scale(" + scale + ") rotate(" + rotate + "deg)";

      if (progress > 0.05 && progress < 0.95 && (timestamp - startTime) % 60 < 20) {
        dropTrail(currentX, currentY);
      }
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        ball.remove();
        targetEl.classList.remove("flash-unique");
        void targetEl.offsetWidth;
        targetEl.classList.add("landing-shock", "flash-unique");
        setTimeout(function () { targetEl.classList.remove("landing-shock"); }, 400);
        showToast("\uD83C\uDFAF 独苗守护：" + String(targetNum).padStart(2, "0") + " 号");
      }
    }
    requestAnimationFrame(animate);
  }

  // ======================== 结果渲染 ========================
  function renderResult(adjustedCount, adjustedTotal, unique, hitCounts, rawCount) {
    try {
      const container = DOM.result;
      if (!container) return;

      if (currentUniqueElement) {
        currentUniqueElement.classList.remove("flash-unique");
        currentUniqueElement = null;
      }

      const freqMap = new Map();
      for (let n = 1; n <= 49; n++) {
        const f = adjustedCount[n];
        if (f > 0) {
          if (!freqMap.has(f)) freqMap.set(f, []);
          freqMap.get(f).push(n);
        }
      }
      const freqs = Array.from(freqMap.keys()).sort(function (a, b) { return b - a; });

      let killDrawn = false;
      const avg = unique ? (adjustedTotal / unique).toFixed(2) : "0.00";

      const unhitNumbers = [];
      for (let n = 1; n <= 49; n++) {
        if (adjustedCount[n] > 0 && hitCounts[n] === 0) unhitNumbers.push(n);
      }
      const isUniqueUnhit = (unhitNumbers.length === 1);
      const uniqueUnhitNum = isUniqueUnhit ? unhitNumbers[0] : null;
      const killSet = new Set(state.killNums);

      const sortedFreqMap = new Map();
      const htmlParts = [];

      for (let fi = 0; fi < freqs.length; fi++) {
        const f = freqs[fi];
        if (!killDrawn && f <= (adjustedTotal / unique)) {
          htmlParts.push('<div class="kill-line relative h-0.5 bg-gradient-to-r from-transparent via-[#00ffea] to-transparent my-3 rounded-full"></div>');
          killDrawn = true;
        }
        htmlParts.push('<div class="flex items-start gap-2 mb-2 flex-wrap"><span class="text-xs text-green-500 font-mono min-w-[30px] pt-2">' + f + '次：</span><div class="flex flex-wrap gap-1.5 flex-1">');
        const nums = freqMap.get(f).sort(function (a, b) { return a - b; });
        sortedFreqMap.set(f, nums.slice());
        for (let ni = 0; ni < nums.length; ni++) {
          const n = nums[ni];
          const hit = hitCounts[n] || 0;
          const isGray = (hit > 0);
          const p = numProps[n];
          let baseColorClass = isGray ? "ball-gray" : (p && p.color === "red" ? "ball-red" : (p && p.color === "green" ? "ball-green" : "ball-blue"));
          const isTarget = (n === uniqueUnhitNum);
          const flashClass = isTarget ? "flash-unique" : "";
          let markHtml = "";
          if (killSet.has(n)) {
            markHtml = '<span class="hit-mark cross">\u2718</span>';
          } else if (hit > 0) {
            markHtml = '<span class="hit-mark">' + hit + '</span>';
          }
          htmlParts.push('<button class="ball-3d ' + baseColorClass + " " + flashClass + '" data-num="' + n + '">' + String(n).padStart(2, "0") + markHtml + "</button>");
        }
        htmlParts.push("</div></div>");
      }

      if (unique === 0) {
        htmlParts.push('<div class="text-center py-8 text-amber-400">\u26A1 所有号码频次归零，请调整筛选条件 \u26A1</div>');
      }

      const zeroCountNumbers = [];
      if (rawCount && rawCount.length) {
        for (let n = 1; n <= 49; n++) {
          if (rawCount[n] === 0) zeroCountNumbers.push(n);
        }
      }
      if (zeroCountNumbers.length > 0) {
        if (!killDrawn) {
          htmlParts.push('<div class="kill-line relative h-0.5 bg-gradient-to-r from-transparent via-[#00ffea] to-transparent my-3 rounded-full"></div>');
        }
        htmlParts.push('<div class="flex items-start gap-2 mb-2 flex-wrap"><span class="text-xs text-gray-500 font-mono min-w-[30px] pt-2">0次：</span><div class="flex flex-wrap gap-1.5 flex-1">');
        zeroCountNumbers.sort(function (a, b) { return a - b; });
        for (let i = 0; i < zeroCountNumbers.length; i++) {
          const n = zeroCountNumbers[i];
          const p = numProps[n];
          const colorClass = p && p.color === "red" ? "ball-red" : (p && p.color === "green" ? "ball-green" : "ball-blue");
          htmlParts.push('<button class="ball-3d ' + colorClass + '" data-num="' + n + '">' + String(n).padStart(2, "0") + "</button>");
        }
        htmlParts.push("</div></div>");
      }

      htmlParts.push('<div class="mt-4 grid grid-cols-3 gap-2 p-3 bg-transparent rounded-lg border border-[#00ffea]/20"><div class="text-center"><div class="text-[#00ffea] font-bold text-lg">' + unique + '</div><div class="text-xs text-gray-500">有效数字个数</div></div><div class="text-center"><div class="text-[#00ffea] font-bold text-lg">' + adjustedTotal + '</div><div class="text-xs text-gray-500">调整后总次数</div></div><div class="text-center"><div class="text-[#00ffea] font-bold text-lg">' + avg + '</div><div class="text-xs text-gray-500">调整后平均次数</div></div></div>');

      container.innerHTML = htmlParts.join("");

      if (uniqueUnhitNum) {
        currentUniqueElement = DOM.result.querySelector('[data-num="' + uniqueUnhitNum + '"]');
        if (lastUniqueNum !== uniqueUnhitNum) {
          lastUniqueNum = uniqueUnhitNum;
          const p = numProps[uniqueUnhitNum];
          const flyColor = p && p.color === "red" ? "ball-red" : (p && p.color === "green" ? "ball-green" : "ball-blue");
          setTimeout(function () { launchUniqueFlyEffect(uniqueUnhitNum, flyColor); }, 100);
        }
      } else {
        lastUniqueNum = null;
      }

      lastAnalysisResult = { sortedFreqMap: sortedFreqMap, adjustedTotal: adjustedTotal, unique: unique, avg: avg };
    } catch (err) {
      console.error("renderResult error:", err);
      if (DOM.result) DOM.result.innerHTML = '<div class="text-center py-8 text-red-400">渲染出错，请检查控制台</div>';
    }
  }

  function initResultDelegation() {
    const resultEl = DOM.result;
    if (!resultEl) return;
    resultEl.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-num]");
      if (!btn) return;
      const num = Number(btn.dataset.num);
      if (!Number.isNaN(num)) copyNumber(num);
    });
  }

  // ======================== 分析调度 ========================
  let debounceTimer = null;

  function runAnalysis() {
    initWorker();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      try {
        const input = DOM.numbers ? DOM.numbers.value : "";
        const parsed = parseInputCount(input);
        if (DOM.charCount) DOM.charCount.textContent = parsed.nums.length;
        if (DOM.numberWarn) {
          if (parsed.truncated) {
            DOM.numberWarn.classList.remove("hidden");
            if (!window._truncToastShown) {
              showToast("\u26A0\uFE0F 输入号码超过" + MAX_NUMBERS + "个，已截断");
              window._truncToastShown = true;
              setTimeout(function () { window._truncToastShown = false; }, 2000);
            }
          } else {
            DOM.numberWarn.classList.add("hidden");
          }
        }

        if (workerReady && analysisWorker) {
          analysisWorker.postMessage({
            input: input,
            killNums: state.killNums,
            filters: getFilterSet(),
            numProps: numProps
          });
        } else {
          const res = computeAnalysisMainThread(input, state.killNums, getFilterSet());
          lastRawCount = res.rawCount;
          renderResult(res.adjustedCount, res.adjustedTotal, res.unique, res.hitCounts, res.rawCount);
        }
      } catch (err) {
        console.error("runAnalysis error:", err);
      }
    }, 200);
  }

  function runAnalysisMainThread() {
    try {
      const input = DOM.numbers ? DOM.numbers.value : "";
      const res = computeAnalysisMainThread(input, state.killNums, getFilterSet());
      lastRawCount = res.rawCount;
      renderResult(res.adjustedCount, res.adjustedTotal, res.unique, res.hitCounts, res.rawCount);
    } catch (err) {
      console.error("runAnalysisMainThread error:", err);
    }
  }

  function onStateChange() {
    runAnalysis();
    saveState();
  }

  // ======================== 开奖数据获取 ========================
  let isCurrentDrawComplete = false;
  let lastLotteryPeriod = "";
  let isFetchingLottery = false;

  function checkDrawComplete(item) {
    if (!item || !item.openCode) return false;
    const codes = String(item.openCode).split(",").filter(function (c) { return c.trim() !== ""; });
    return codes.length >= 7;
  }

  async function safeFetch(url, options, retries) {
    options = options || {};
    retries = retries !== undefined ? retries : 2;
    for (let i = 0; i <= retries; i++) {
      try {
        let res;
        if (typeof AbortController !== "undefined") {
          const ctrl = new AbortController();
          const tid = setTimeout(function () { ctrl.abort(); }, options.timeout || 8000);
          res = await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
          clearTimeout(tid);
        } else {
          const fetchPromise = fetch(url, options);
          const timeoutPromise = new Promise(function (_, reject) {
            setTimeout(function () { reject(new Error("Timeout")); }, options.timeout || 8000);
          });
          res = await Promise.race([fetchPromise, timeoutPromise]);
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res;
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(function (r) { setTimeout(r, 800); });
      }
    }
  }

  async function fetchLottery() {
    if (isFetchingLottery) return;
    isFetchingLottery = true;

    const btn = DOM.refreshLotteryBtn;
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
      btn.innerHTML = '<svg class="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>加载中...';
      btn.disabled = true;
    }
    try {
      const res = await safeFetch(API_CONFIG.live + "?_t=" + Date.now());
      let data;
      try { data = await res.json(); }
      catch (parseErr) { showToast("数据格式异常"); return; }
      if (!Array.isArray(data) || !data[0]) { showToast("暂无开奖数据"); return; }

      const item = data[0];
      if (!item.openCode || typeof item.openCode !== "string" ||
          !item.wave || typeof item.wave !== "string" ||
          !item.zodiac || typeof item.zodiac !== "string") {
        showToast("数据字段不完整");
        return;
      }

      try {
        localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ data: data, time: Date.now() }));
      } catch (e) {}

      if (lastLotteryPeriod !== item.expect) {
        lastLotteryPeriod = item.expect;
        isCurrentDrawComplete = false;
      }
      renderLottery(item);

      if (!isCurrentDrawComplete && checkDrawComplete(item)) {
        isCurrentDrawComplete = true;
        showToast("当期开奖已完成，自动刷新停止");
      } else {
        showToast("刷新成功");
      }
      if (DOM.lastRefreshTime) DOM.lastRefreshTime.textContent = "上次刷新：" + new Date().toLocaleTimeString();
    } catch (e) {
      console.error("fetchLottery error:", e);
      try {
        const cacheRaw = localStorage.getItem(LS_CACHE_KEY);
        if (cacheRaw) {
          const cache = JSON.parse(cacheRaw);
          if (cache.data && cache.data[0]) {
            renderLottery(cache.data[0]);
            showToast("离线模式：显示缓存数据");
            return;
          }
        }
      } catch (cacheErr) {}
      showToast("获取开奖失败");
    } finally {
      isFetchingLottery = false;
      if (btn) {
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }
    }
  }

  function renderLottery(item) {
    const codes = String(item.openCode || "").split(",").map(function (c) { return escapeHtml(c.trim()); });
    const waves = String(item.wave || "").split(",").map(function (w) {
      w = w.trim();
      if (w === "红" || w === "red") return "red";
      if (w === "蓝" || w === "blue") return "blue";
      if (w === "绿" || w === "green") return "green";
      return w;
    });
    const zodiacs = String(item.zodiac || "").split(",").map(function (z) { return escapeHtml(z.trim()); });
    const container = DOM.lotteryBalls;
    if (!container) return;
    container.className = "result-balls-row";
    container.innerHTML = "";
    const wxClassMap = { 金: "wx-gold", 木: "wx-wood", 水: "wx-water", 火: "wx-fire", 土: "wx-earth" };

    for (let i = 0; i < 6 && i < codes.length; i++) {
      const num = parseInt(codes[i], 10);
      const colorClass = waves[i] === "red" ? "result-ball-red" : (waves[i] === "green" ? "result-ball-green" : "result-ball-blue");
      const wx = (num >= 1 && num <= 49) ? (numProps[num] && numProps[num].five || "?") : "?";
      const wxCls = wxClassMap[wx] || "";
      const div = document.createElement("div");
      div.className = "result-ball-item";
      div.innerHTML = '<div class="result-ball ' + colorClass + '" style="animation-delay: ' + (i * 150) + 'ms">' + escapeHtml(codes[i].padStart(2, "0")) + '<div class="result-ball-meta">' + escapeHtml(zodiacs[i] || "") + '/<span class="' + wxCls + '">' + wx + "</span></div></div>";
      container.appendChild(div);
    }
    if (codes.length >= 7) {
      const plus = document.createElement("div");
      plus.className = "result-plus-sign";
      plus.textContent = "+";
      container.appendChild(plus);

      const num = parseInt(codes[6], 10);
      const colorClass = waves[6] === "red" ? "result-ball-red" : (waves[6] === "green" ? "result-ball-green" : "result-ball-blue");
      const wx = (num >= 1 && num <= 49) ? (numProps[num] && numProps[num].five || "?") : "?";
      const wxCls = wxClassMap[wx] || "";
      const div = document.createElement("div");
      div.className = "result-ball-item";
      div.innerHTML = '<div class="result-ball ' + colorClass + '" style="animation-delay: ' + (6 * 150) + 'ms">' + escapeHtml(codes[6].padStart(2, "0")) + '<div class="result-ball-meta">' + escapeHtml(zodiacs[6] || "") + '/<span class="' + wxCls + '">' + wx + "</span></div></div>";
      container.appendChild(div);
    }
    void container.offsetHeight;
    if (DOM.lotteryPeriod) DOM.lotteryPeriod.textContent = escapeHtml(item.expect || "--");
    if (DOM.lotteryTime) DOM.lotteryTime.textContent = escapeHtml((item.openTime || "--").replace(" ", "\n"));
  }

  // ======================== 历史开奖 ========================
  let currentHistoryData = [];
  let currentHistorySorted = [];
  let currentHistoryPage = 1;
  let historyCache = {};
  let historyYearLoaded = null;

  function renderBallsHTML(codes, waves, zodiacs) {
    let html = "";
    codes.forEach(function (code, i) {
      const wave = waves[i];
      const zodiac = zodiacs[i];
      const cc = wave === "blue" || wave === "蓝" ? "history-ball-blue" : wave === "green" || wave === "绿" ? "history-ball-green" : "history-ball-red";
      const num = parseInt(code, 10);
      const five = (num >= 1 && num <= 49) ? (numProps[num] && numProps[num].five || "") : "";
      html += '<div class="history-ball-card ' + cc + '"><div class="history-ball-number">' + escapeHtml(code) + '</div><div class="history-ball-tag">' + escapeHtml(zodiac || "") + "/" + escapeHtml(five) + "</div></div>";
      if (i === 5) html += '<span class="history-plus-sign">+</span>';
    });
    return html;
  }

  function ensureHistorySorted() {
    if (currentHistorySorted.length > 0) return;
    const seen = new Set();
    const unique = [];
    for (let i = 0; i < currentHistoryData.length; i++) {
      const item = currentHistoryData[i];
      if (item && item.expect && !seen.has(item.expect)) {
        seen.add(item.expect);
        unique.push(item);
      }
    }
    currentHistorySorted = unique.sort(function (a, b) {
      return String(b.expect).localeCompare(String(a.expect), undefined, { numeric: true });
    });
  }

  function renderHistoryPage() {
    try {
      const cont = document.getElementById("historyContent");
      const pagi = document.getElementById("historyPagination");
      ensureHistorySorted();
      const sorted = currentHistorySorted;

      if (!sorted || sorted.length === 0) {
        if (cont) cont.innerHTML = '<div style="color:#9ca3af; padding:32px 0; text-align:center;">暂无数据</div>';
        if (pagi) pagi.classList.add("dhidden");
        return;
      }

      const totalPages = Math.max(1, Math.ceil(sorted.length / HISTORY_PAGE_SIZE));
      if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;
      const start = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
      const pageData = sorted.slice(start, start + HISTORY_PAGE_SIZE);

      const frag = document.createDocumentFragment();
      for (let i = 0; i < pageData.length; i++) {
        const item = pageData[i];
        const expect = escapeHtml(item.expect || "");
        let ballsHtml = "";
        if (item.openCode && item.openCode.trim()) {
          const codes = item.openCode.split(",").map(function (c) { return escapeHtml(c.trim()); });
          const waves = (item.wave || "").split(",").map(function (w) { return escapeHtml(w.trim()); });
          const zodiacs = (item.zodiac || "").split(",").map(function (z) { return escapeHtml(z.trim()); });
          ballsHtml = renderBallsHTML(codes, waves, zodiacs);
        } else {
          ballsHtml = '<div style="display:flex; justify-content:center; align-items:center; padding:24px 0; color:#fbbf24; font-size:14px; font-weight:500;">待开奖</div>';
        }
        const div = document.createElement("div");
        div.className = "history-item";
        div.innerHTML = '<div class="history-item-header">第' + expect.slice(4) + "期 · " + escapeHtml(item.openTime && item.openTime.slice(5, 16) || "") + '</div><div class="history-balls-row">' + ballsHtml + "</div>";
        frag.appendChild(div);
      }
      if (cont) {
        cont.innerHTML = "";
        cont.appendChild(frag);
      }

      const pageNumEl = document.getElementById("historyPageNum");
      const totalPagesEl = document.getElementById("historyTotalPages");
      if (pageNumEl) pageNumEl.textContent = currentHistoryPage;
      if (totalPagesEl) totalPagesEl.textContent = totalPages;

      if (pagi) {
        if (totalPages <= 1) {
          pagi.classList.add("dhidden");
        } else {
          pagi.classList.remove("dhidden");
        }
        const prevBtn = document.getElementById("history-prev");
        const nextBtn = document.getElementById("history-next");
        if (prevBtn) prevBtn.disabled = currentHistoryPage <= 1;
        if (nextBtn) nextBtn.disabled = currentHistoryPage >= totalPages;
      }
    } catch (err) {
      console.error("renderHistoryPage error:", err);
    }
  }

  // ======================== 底部抽屉系统 ========================
  const DrawerSystem = {
    current: null,
    templates: {
      shama: function () {
        return '<textarea id="kill-input" rows="3" class="dinput">' + state.killNums.join(" ") + "</textarea>";
      },
      shengxiao: function () {
        const sxs = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
        const sel = state.selectedFilters.shengxiao;
        return '<div class="dgrid-6">' + sxs.map(function (sx) {
          return '<label><input type="checkbox" class="filter-checkbox hidden" value="生肖' + sx + '" data-drawer="shengxiao" ' + (sel.includes("生肖" + sx) ? "checked" : "") + '><span class="filter-label dbtn">' + sx + "</span></label>";
        }).join("") + "</div>";
      },
      haomatou: function () {
        const heads = [["0头单", "1头单", "2头单", "3头单", "4头单"], ["0头双", "1头双", "2头双", "3头双", "4头双"]];
        const sel = state.selectedFilters.haomatou;
        return heads.map(function (row) {
          return '<div class="dflex">' + row.map(function (h) {
            return '<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="' + h + '" data-drawer="haomatou" ' + (sel.includes(h) ? "checked" : "") + '><span class="filter-label dbtn dbtn-sm">' + h + "</span></label>";
          }).join("") + "</div>";
        }).join("");
      },
      weishu: function () {
        const tails = [["0尾", "1尾", "2尾", "3尾", "4尾"], ["5尾", "6尾", "7尾", "8尾", "9尾"]];
        const sel = state.selectedFilters.weishu;
        return tails.map(function (row) {
          return '<div class="dflex">' + row.map(function (t) {
            return '<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="' + t + '" data-drawer="weishu" ' + (sel.includes(t) ? "checked" : "") + '><span class="filter-label dbtn dbtn-sm">' + t + "</span></label>";
          }).join("") + "</div>";
        }).join("");
      },
      shuduan: function () {
        const duans = ["1段", "2段", "3段", "4段", "5段", "6段", "7段"];
        const sel = state.selectedFilters.shuduan;
        return '<div class="dflex-wrap">' + duans.map(function (d) {
          return '<label><input type="checkbox" class="filter-checkbox hidden" value="' + d + '" data-drawer="shuduan" ' + (sel.includes(d) ? "checked" : "") + '><span class="filter-label dbtn dbtn-md">' + d + "</span></label>";
        }).join("") + "</div>";
      },
      bose: function () {
        const items = [["红波单", "蓝波单", "绿波单"], ["红波双", "蓝波双", "绿波双"]];
        const sel = state.selectedFilters.bose;
        return items.map(function (row) {
          return '<div class="dflex">' + row.map(function (item) {
            return '<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="' + item + '" data-drawer="bose" ' + (sel.includes(item) ? "checked" : "") + '><span class="filter-label dbtn dbtn-sm">' + item.replace("波", "") + "</span></label>";
          }).join("") + "</div>";
        }).join("");
      },
      wuxing: function () {
        const wx = {
          "金": "04 05 12 13 26 27 34 35 42 43",
          "木": "08 09 16 17 24 25 38 39 46 47",
          "水": "01 14 15 22 23 30 31 44 45",
          "火": "02 03 10 11 18 19 32 33 40 41 48 49",
          "土": "06 07 20 21 28 29 36 37"
        };
        const sel = state.selectedFilters.wuxing;
        return '<div class="dspace-y">' + Object.entries(wx).map(function (entry) {
          const k = entry[0], v = entry[1];
          return '<div class="wuxing-row">' +
            '<label class="ditems-center" style="gap:8px;min-width:0;flex-shrink:0;">' +
              '<input type="checkbox" class="filter-checkbox hidden" value="' + k + '" data-drawer="wuxing" ' + (sel.includes(k) ? "checked" : "") + '>' +
              '<span class="filter-label dbtn dbtn-fixed wuxing-btn-fixed">' + k + '</span>' +
            '</label>' +
            '<span class="wuxing-nums">' + v + '</span>' +
          '</div>';
        }).join("") + '</div>';
      },
      bandanshuang: function () {
        const items = [["合数单", "小单", "大单"], ["合数双", "小双", "大双"]];
        const sel = state.selectedFilters.bandanshuang;
        return items.map(function (row) {
          return '<div class="dflex">' + row.map(function (item) {
            return '<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="' + item + '" data-drawer="bandanshuang" ' + (sel.includes(item) ? "checked" : "") + '><span class="filter-label dbtn dbtn-sm">' + item + "</span></label>";
          }).join("") + "</div>";
        }).join("");
      },
      heshu: function () {
        const hes = Array.from({ length: 13 }, function (_, i) { return (i + 1) + "合"; });
        const sel = state.selectedFilters.heshu;
        return '<div class="dgrid-4">' + hes.map(function (h) {
          return '<label><input type="checkbox" class="filter-checkbox hidden" value="' + h + '" data-drawer="heshu" ' + (sel.includes(h) ? "checked" : "") + '><span class="filter-label dbtn dbtn-sm">' + h + "</span></label>";
        }).join("") + "</div>";
      },
      live: function () {
        return '<div class="dflex-col" style="height: calc(90vh - 68px); min-height: 480px;">' +
          '<div class="dflex-between dmb-2 dpx-1">' +
          '<span class="dtext-xs dtext-gray">直连视频流播放 · 自动切换备选源</span>' +
          '<a href="https://macaujc.com/open_video2/" target="_blank" rel="noopener noreferrer" style="font-size:12px; background:rgba(0,255,234,0.2); color:#00ffea; padding:6px 12px; border-radius:8px; border:1px solid rgba(0,255,234,0.4); text-decoration:none; display:inline-flex; align-items:center; gap:4px;">' +
          '<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>新窗口观看</a></div>' +
          '<div class="dflex-wrap dmb-3" id="live-source-btns">' +
          '<button data-src-idx="0" class="dlive-btn active">源1·API获取</button>' +
          '<button data-src-idx="1" class="dlive-btn">源2·HLS</button>' +
          '<button data-src-idx="2" class="dlive-btn">源3·FLV</button>' +
          "</div>" +
          '<div class="dvideo-box">' +
          '<video id="live-video" style="width:100%; height:100%; background:#000;" controls autoplay playsinline muted></video>' +
          '<div id="live-loading" class="doverlay">' +
          '<svg width="32" height="32" class="animate-spin" style="color:#00ffea; margin-bottom:12px;" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>' +
          '<span class="dtext-sm dtext-gray" id="live-status">正在获取直播源...</span></div>' +
          '<div id="live-error" class="dhidden doverlay" style="background:#0a0a12; z-index:20; padding:24px; text-align:center;">' +
          '<svg width="48" height="48" style="color:#f87171; margin-bottom:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' +
          '<p style="color:#f87171; font-weight:bold; margin-bottom:4px;">直播源加载失败</p>' +
          '<p class="dtext-xs dtext-gray" style="margin-bottom:16px;">所有备选源均无法连接</p>' +
          '<a href="https://macaujc.com/open_video2/" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg,#00ffea,#0088ff); color:#000; font-weight:bold; padding:10px 24px; border-radius:12px; text-decoration:none; margin-bottom:8px;">' +
          '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>macaujc.com 直播</a>' +
          '<a href="https://momarksix.org/video" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:8px; background:#1a1a2a; color:#00ffea; font-weight:bold; padding:10px 24px; border-radius:12px; border:1px solid rgba(0,255,234,0.3); text-decoration:none;">' +
          '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>备用直播站</a></div></div></div>';
      },
      history: function () {
        let opts = "";
        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= 2020; y--) {
          opts += '<option value="' + y + '">' + y + "年</option>";
        }
        return '<div><select id="historyYear" class="dselect"><option value="">选择年份</option>' + opts + "</select>" +
          '<div id="historyLoading" class="dhidden dtext-center dpy-4"><svg class="animate-spin" style="width:24px; height:24px; margin:0 auto; color:#00ffea;" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>' +
          '<div id="historyContent" class="dmt-3 hide-scrollbar"></div>' +
          '<div id="historyPagination" class="dflex-between dmt-6 dpx-1 dhidden"><button id="history-prev" class="dpage-btn">← 上1页</button>' +
          '<div class="dtext-sm" style="text-align:center;">第 <span id="historyPageNum" style="font-weight:bold; color:#00ffea;">1</span> 页 / <span id="historyTotalPages" class="dtext-gray">1</span> 页</div>' +
          '<button id="history-next" class="dpage-btn">下1页 →</button></div></div>';
      }
    },
    open: function (type) {
      if (this.current === type) { this.close(); return; }
      this.current = type;
      const titles = { shama: "杀码", shengxiao: "生肖", haomatou: "头数", weishu: "尾数", shuduan: "数段", bose: "波色", wuxing: "五行", bandanshuang: "半单双", heshu: "合数", live: "开奖直播", history: "历史开奖" };
      const titleText = titles[type] || "筛选器";
      if (DOM.drawer_title) DOM.drawer_title.textContent = titleText;

      let contentDiv = DOM.drawer_content || document.getElementById("drawer-content");
      if (!contentDiv) {
        console.error("drawer-content 元素缺失");
        showToast("抽屉初始化失败，请刷新页面");
        return;
      }

      try {
        const templateFn = this.templates[type];
        if (templateFn) {
          contentDiv.innerHTML = templateFn();
        } else {
          contentDiv.innerHTML = "<p>暂无内容</p>";
          console.warn("未找到抽屉模板:", type);
        }
      } catch (err) {
        console.error("Drawer open error:", err);
        contentDiv.innerHTML = '<p style="color:#f87171;">抽屉加载出错</p>';
      }

      if (DOM.drawer_overlay) {
        DOM.drawer_overlay.classList.remove("hidden");
        DOM.drawer_overlay.style.display = "block";
        setTimeout(function () {
          DOM.drawer_overlay.classList.remove("opacity-0");
          DOM.drawer_overlay.style.opacity = "1";
        }, 10);
      }
      if (DOM.drawer_container) DOM.drawer_container.classList.add("open");
      this.updateNavState(type);

      if (type === "history") {
        setTimeout(function () {
          const sel = document.getElementById("historyYear");
          if (sel && !sel.value) sel.value = historyYearLoaded || "";
          if (sel) sel.dispatchEvent(new Event("change"));
        }, 50);
      }
    },
    close: function () {
      destroyLivePlayer();
      if (DOM.drawer_container) DOM.drawer_container.classList.remove("open");
      if (DOM.drawer_overlay) {
        DOM.drawer_overlay.classList.add("opacity-0");
        DOM.drawer_overlay.style.opacity = "0";
        setTimeout(function () {
          DOM.drawer_overlay.classList.add("hidden");
          DOM.drawer_overlay.style.display = "none";
        }, 300);
      }
      this.current = null;
      this.updateNavState(null);
    },
    bindGlobalDelegation: function () {
      const content = DOM.drawer_content || document.getElementById("drawer-content");
      if (!content || content._delegationBound) return;
      content._delegationBound = true;

      content.addEventListener("change", function (e) {
        const cb = e.target;
        if (cb.classList && cb.classList.contains("filter-checkbox")) {
          const dr = cb.dataset.drawer;
          const val = cb.value;
          if (dr && state.selectedFilters[dr] !== undefined) {
            toggleFilter(dr, val, cb.checked);
          }
          return;
        }
        if (e.target.id === "historyYear") {
          const year = e.target.value;
          if (!year) return;
          historyYearLoaded = year;
          const loadDiv = document.getElementById("historyLoading");
          const cont = document.getElementById("historyContent");
          if (loadDiv) loadDiv.classList.remove("dhidden");
          (async function () {
            try {
              if (historyCache[year]) {
                currentHistoryData = historyCache[year];
              } else {
                const res = await safeFetch(API_CONFIG.historyBase + year);
                const json = await res.json();
                if (json.code === 200 && Array.isArray(json.data)) {
                  currentHistoryData = json.data;
                  historyCache[year] = json.data;
                } else {
                  currentHistoryData = [];
                }
              }
              currentHistorySorted = [];
              currentHistoryPage = 1;
              renderHistoryPage();
            } catch (e) {
              console.error("history fetch error:", e);
              currentHistoryData = [];
              if (cont) cont.innerHTML = '<div style="color:#f87171;">加载失败</div>';
            } finally {
              if (loadDiv) loadDiv.classList.add("dhidden");
            }
          })();
        }
      });

      content.addEventListener("input", function (e) {
        const el = e.target;
        if (el.id === "kill-input") {
          const parsed = parseInputCount(el.value);
          setKillNums(parsed.nums.filter(function (n) { return n >= 1 && n <= 49; }));
        }
      });

      content.addEventListener("click", function (e) {
        const prevBtn = e.target.closest("#history-prev");
        const nextBtn = e.target.closest("#history-next");
        if (prevBtn) {
          if (currentHistoryPage > 1) { currentHistoryPage--; renderHistoryPage(); }
          return;
        }
        if (nextBtn) {
          ensureHistorySorted();
          const totalPages = Math.ceil(currentHistorySorted.length / HISTORY_PAGE_SIZE);
          if (currentHistoryPage < totalPages) { currentHistoryPage++; renderHistoryPage(); }
          return;
        }

        const liveBtn = e.target.closest(".dlive-btn");
        if (liveBtn) {
          const idx = parseInt(liveBtn.dataset.srcIdx, 10);
          if (!isNaN(idx)) {
            liveSourceIndex = idx;
            const btns = document.querySelectorAll(".dlive-btn");
            btns.forEach(function (b, i) {
              if (i === idx) {
                b.classList.add("active");
                b.style.background = "#00ffea";
                b.style.color = "#000";
                b.style.borderColor = "#00ffea";
              } else {
                b.classList.remove("active");
                b.style.background = "#1a1a2a";
                b.style.color = "#9ca3af";
                b.style.borderColor = "rgba(0,255,234,0.2)";
              }
            });
            connectLiveSource(idx);
          }
          return;
        }
      });
    },
    updateNavState: function (activeType) {
      document.querySelectorAll(".nav-item").forEach(function (el) {
        const dr = el.dataset.drawer;
        if (dr === activeType) {
          el.classList.add("bg-[#00ffea]", "text-black");
          el.classList.remove("bg-transparent", "text-gray-400");
        } else {
          el.classList.remove("bg-[#00ffea]", "text-black");
          if (dr === "selectnone") el.classList.add("bg-[#ff0055]/20", "text-[#ff0055]");
          else el.classList.add("bg-transparent", "text-gray-400");
        }
      });
    }
  };

  // ======================== 复制功能 ========================
  function copyResult() {
    if (!lastAnalysisResult) { showToast("暂无分析结果"); return; }
    const sortedFreqMap = lastAnalysisResult.sortedFreqMap;
    let text = "";
    sortedFreqMap.forEach(function (nums, f) {
      text += f + "次：" + nums.map(function (n) { return String(n).padStart(2, "0"); }).join(" ") + "\n";
    });
    if (!text.trim()) return;
    fallbackCopy(text.trim());
  }
  function copyNumber(n) {
    fallbackCopy(String(n).padStart(2, "0"));
  }
  function fallbackCopy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast("已复制");
      }).catch(function () {
        execCopy(text);
      });
    } else {
      execCopy(text);
    }
  }
  function execCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    try {
      const ok = document.execCommand("copy");
      showToast(ok ? "已复制" : "复制失败");
    } catch (e) {
      showToast("复制失败");
    }
    document.body.removeChild(ta);
  }
  window.copyResult = copyResult;

  // ======================== 直播播放器 ========================
  let currentHls = null;
  let currentFlvPlayer = null;
  let liveSourceIndex = 0;
  let liveSourceTimer = null;
  let liveSwitchLock = false;
  const LIVE_SOURCE_TIMEOUT = 15000;

  const LIVE_SOURCES = [
    { name: "API获取", type: "auto", url: "" },
    { name: "HLS源1", type: "hls", url: "https://media.macaumarksix.com/live/marksix.m3u8" },
    { name: "FLV源1", type: "flv", url: "https://media.macaumarksix.com/live/marksix.flv" }
  ];

  function clearLiveTimer() {
    if (liveSourceTimer) { clearTimeout(liveSourceTimer); liveSourceTimer = null; }
  }

  function connectLiveSource(idx) {
    if (liveSwitchLock) return;
    liveSwitchLock = true;
    clearLiveTimer();

    const video = document.getElementById("live-video");
    const loading = document.getElementById("live-loading");
    const error = document.getElementById("live-error");
    const status = document.getElementById("live-status");
    if (!video) { liveSwitchLock = false; return; }

    destroyLivePlayer();
    if (loading) loading.classList.remove("dhidden");
    if (error) error.classList.add("dhidden");
    if (status) status.textContent = "正在连接 " + LIVE_SOURCES[idx].name + "...";

    const src = LIVE_SOURCES[idx];

    liveSourceTimer = setTimeout(function () {
      console.warn("直播源加载超时: " + src.name);
      liveSwitchLock = false;
      tryNextSource();
    }, LIVE_SOURCE_TIMEOUT);

    if (src.type === "auto") {
      fetch("https://macaumarksix.com/api/live2?_t=" + Date.now())
        .then(function (r) { return r.json(); })
        .then(function (data) {
          clearLiveTimer();
          if (data && data[0] && data[0].videoUrl) {
            playStream(data[0].videoUrl, detectStreamType(data[0].videoUrl));
          } else {
            if (idx + 1 < LIVE_SOURCES.length) {
              setTimeout(function () { liveSwitchLock = false; connectLiveSource(idx + 1); }, 1000);
            } else {
              liveSwitchLock = false;
              showLiveError();
            }
          }
        })
        .catch(function () {
          clearLiveTimer();
          if (idx + 1 < LIVE_SOURCES.length) {
            setTimeout(function () { liveSwitchLock = false; connectLiveSource(idx + 1); }, 1000);
          } else {
            liveSwitchLock = false;
            showLiveError();
          }
        });
    } else if (src.url) {
      playStream(src.url, src.type);
    } else {
      clearLiveTimer();
      liveSwitchLock = false;
      showLiveError();
    }
  }

  function detectStreamType(url) {
    if (url.indexOf(".m3u8") !== -1) return "hls";
    if (url.indexOf(".flv") !== -1) return "flv";
    return "hls";
  }

  function playStream(url, type) {
    const video = document.getElementById("live-video");
    const loading = document.getElementById("live-loading");
    if (!video) { liveSwitchLock = false; return; }

    if (type === "hls" && window.Hls && Hls.isSupported()) {
      currentHls = new Hls({ enableWorker: true, lowLatencyMode: true });
      currentHls.loadSource(url);
      currentHls.attachMedia(video);
      currentHls.on(Hls.Events.MANIFEST_PARSED, function () {
        clearLiveTimer();
        liveSwitchLock = false;
        if (loading) loading.classList.add("dhidden");
        video.play().catch(function () {});
      });
      currentHls.on(Hls.Events.ERROR, function (_event, data) {
        if (data.fatal) {
          clearLiveTimer();
          liveSwitchLock = false;
          tryNextSource();
        }
      });
    } else if (type === "flv" && window.flvjs && flvjs.isSupported()) {
      currentFlvPlayer = flvjs.createPlayer({ type: "flv", url: url, isLive: true });
      currentFlvPlayer.attachMediaElement(video);
      currentFlvPlayer.load();
      currentFlvPlayer.play();
      currentFlvPlayer.on(flvjs.Events.LOADING_COMPLETE, function () {
        clearLiveTimer();
        liveSwitchLock = false;
        if (loading) loading.classList.add("dhidden");
      });
      currentFlvPlayer.on(flvjs.Events.ERROR, function () {
        clearLiveTimer();
        liveSwitchLock = false;
        tryNextSource();
      });
      setTimeout(function () {
        if (loading) loading.classList.add("dhidden");
      }, 3000);
    } else {
      video.src = url;
      video.addEventListener("loadedmetadata", function () {
        clearLiveTimer();
        liveSwitchLock = false;
        if (loading) loading.classList.add("dhidden");
      });
      video.addEventListener("error", function () {
        clearLiveTimer();
        liveSwitchLock = false;
        tryNextSource();
      });
      video.play().catch(function () {});
    }
  }

  function tryNextSource() {
    clearLiveTimer();
    destroyLivePlayer();
    if (liveSourceIndex + 1 < LIVE_SOURCES.length) {
      liveSourceIndex++;
      const btns = document.querySelectorAll(".dlive-btn");
      btns.forEach(function (b, i) {
        if (i === liveSourceIndex) {
          b.classList.add("active");
          b.style.background = "#00ffea";
          b.style.color = "#000";
          b.style.borderColor = "#00ffea";
        } else {
          b.classList.remove("active");
          b.style.background = "#1a1a2a";
          b.style.color = "#9ca3af";
          b.style.borderColor = "rgba(0,255,234,0.2)";
        }
      });
      connectLiveSource(liveSourceIndex);
    } else {
      showLiveError();
    }
  }

  function showLiveError() {
    clearLiveTimer();
    liveSwitchLock = false;
    const loading = document.getElementById("live-loading");
    const error = document.getElementById("live-error");
    if (loading) loading.classList.add("dhidden");
    if (error) error.classList.remove("dhidden");
  }

  function destroyLivePlayer() {
    clearLiveTimer();
    if (currentHls) { currentHls.destroy(); currentHls = null; }
    if (currentFlvPlayer) { currentFlvPlayer.destroy(); currentFlvPlayer = null; }
    const video = document.getElementById("live-video");
    if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
  }

  // ======================== 自动刷新（v3.5.4：21:33:30起每5秒） ========================
  function initAutoRefresh() {
    // 每秒检查是否在开奖窗口内，但只在窗口内每5秒实际发一次请求
    setInterval(function () {
      if (isCurrentDrawComplete || isFetchingLottery) return;
      const now = new Date();
      const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
      const totalSec = h * 3600 + m * 60 + s;
      const startSec = 21 * 3600 + 33 * 60 + 30; // 21:33:30
      const endSec = 21 * 3600 + 35 * 60 + 0;    // 21:35:00

      if (document.visibilityState === "visible" && totalSec >= startSec && totalSec <= endSec) {
        const nowTs = Date.now();
        // 确保两次自动刷新间隔至少5秒
        if (!window._lastAutoFetchTime || (nowTs - window._lastAutoFetchTime) >= 5000) {
          window._lastAutoFetchTime = nowTs;
          fetchLottery();
        }
      } else {
        // 离开开奖窗口后重置计时器，下次进入时立即触发第一次
        window._lastAutoFetchTime = 0;
      }
    }, 1000);
  }

  // ======================== 彩色水泡粒子背景 ========================
  function initParticles() {
    const canvas = document.getElementById("particle-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width, height;
    let particles = [];
    const MAX_PARTICLES = 60; // 低端设备友好数量，平衡视觉效果与性能

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }

    function createParticle(yOverride) {
      const speedY = Math.random() * 0.8 + 0.3;   // 上升速度 0.3-1.1
      const speedX = (Math.random() - 0.5) * 0.4; // 轻微水平漂移
      const y = yOverride !== undefined ? yOverride : height + Math.random() * 30;
      // 根据当前位置和速度计算刚好飞到顶部（y=-80）所需的帧数
      const life = Math.min((y + 80) / speedY, 3000); // 上限3000帧（约50秒）防内存泄漏
      return {
        x: Math.random() * width,
        y: y,
        r: Math.random() * 2.5 + 0.8,       // 半径 0.8-3.3px，小水泡感
        speedY: speedY,
        speedX: speedX,
        alpha: Math.random() * 0.4 + 0.15,
        hue: Math.random() * 360,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.015 + 0.005,
        life: life
      };
    }

    function initDots() {
      particles = [];
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = createParticle(Math.random() * height); // 初始全屏均匀分布
        particles.push(p);
      }
    }

    let frameId;
    function animate() {
      // 页面不可见时暂停绘制，节省 GPU/CPU（保留 rAF 循环但不执行 clearRect 与绘制）
      if (document.hidden) {
        frameId = requestAnimationFrame(animate);
        return;
      }
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y -= p.speedY;
        p.wobble += p.wobbleSpeed;
        p.x += Math.sin(p.wobble) * 0.4 + p.speedX;

        // 超出顶部或左右边界则重置到底部
        if (p.life <= 0 || p.y < -80 || p.x < -10 || p.x > width + 10) {
          particles[i] = createParticle();
        }

        // 主球体：五颜六色半透明
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "hsla(" + p.hue + ", 80%, 60%, " + p.alpha + ")";
        ctx.fill();

        // 水泡高光白点
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fill();
      }

      frameId = requestAnimationFrame(animate);
    }

    resize();
    initDots();
    animate();

    window.addEventListener("resize", function () {
      resize();
      initDots();
    });
  }

  // ======================== 初始化入口 ========================
  function init() {
    cacheDOM();
    loadState();
    initWorker();
    subscribe(onStateChange);
    initResultDelegation();
    DrawerSystem.bindGlobalDelegation();

    if (DOM.exampleBtn) {
      DOM.exampleBtn.addEventListener("click", function () {
        if (DOM.numbers) DOM.numbers.value = "龙蛇马 12 25 36 8 17 29 41 5 19 33 47";
        runAnalysis();
      });
    }
    if (DOM.clearBtn) {
      DOM.clearBtn.addEventListener("click", function () {
        if (DOM.numbers) DOM.numbers.value = "";
        runAnalysis();
        showToast("已清空输入");
      });
    }
    if (DOM.copyResultBtn) DOM.copyResultBtn.addEventListener("click", copyResult);
    if (DOM.numbers) DOM.numbers.addEventListener("input", function () { runAnalysis(); });
    if (DOM.refreshLotteryBtn) DOM.refreshLotteryBtn.addEventListener("click", function () { fetchLottery(); });

    document.querySelectorAll(".nav-item").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const drawer = btn.dataset.drawer;
        if (drawer === "selectnone") {
          clearAllFilters();
          const killInput = document.getElementById("kill-input");
          if (killInput) killInput.value = "";
          DrawerSystem.close();
          showToast("已清空所有筛选");
        } else {
          DrawerSystem.open(drawer);
        }
      });
    });
    if (DOM.drawer_close) DOM.drawer_close.addEventListener("click", function () { DrawerSystem.close(); });
    if (DOM.drawer_overlay) DOM.drawer_overlay.addEventListener("click", function () { DrawerSystem.close(); });

    fetchLottery();
    runAnalysis();
    initAutoRefresh();
    initParticles(); // v3.5.4：启动彩色水泡粒子背景

    window.addEventListener("beforeunload", function () {
      terminateWorker();
    });

    console.log("%c✅ 神码再现 v3.5.4 粒子特效版已加载", "color:#00ffea;font-weight:bold");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
