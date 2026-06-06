// ======================== app.js v3.6.3 (无直播版) ========================
(function () {
  "use strict";

  // ---------- 从 DATA 获取全局数据 ----------
  const DATA = window.APP_DATA || {};
  const MAX_NUMBERS = DATA.MAX_NUMBERS || 5000;
  const SHENGXIAO = DATA.SHENGXIAO || {};
  const numProps = DATA.numProps || [];
  const RED_SET = new Set(DATA.CATEGORIES ? DATA.CATEGORIES.红波 : []);
  const BLUE_SET = new Set(DATA.CATEGORIES ? DATA.CATEGORIES.蓝波 : []);
  const getFive = DATA.getNumberWuxing || function () { return "?"; };
  const generateWuxingTable = DATA.generateWuxing || function () { return { 金:[],木:[],水:[],火:[],土:[] }; };
  const CURRENT_YEAR = new Date().getFullYear();

  // ---------- 常量配置 ----------
  const API_CONFIG = {
    live: "https://macaumarksix.com/api/live2",
    historyBase: "https://history.macaumarksix.com/history/macaujc2/y/"
  };
  const HISTORY_PAGE_SIZE = 15;
  const LS_KEY = "shenma_v4_state";
  const LS_CACHE_KEY = "shenma_v4_lottery_cache";

  // ---------- DOM 缓存 ----------
  const DOM = {};
  function cacheDOM() {
    const ids = [
      "numbers","result","charCount","numberWarn","exampleBtn","clearBtn","copyResultBtn",
      "lotteryPeriod","lotteryTime","lastRefreshTime","lotteryBalls","refreshLotteryBtn",
      "drawer-overlay","drawer-container","drawer-title","drawer-content","drawer-close","toast"
    ];
    ids.forEach(id => { DOM[id.replace(/-/g, "_")] = document.getElementById(id); });
    if (!DOM.drawer_content) DOM.drawer_content = document.getElementById("drawer-content");
    if (!DOM.drawer_container) DOM.drawer_container = document.getElementById("drawer-container");
    if (!DOM.drawer_overlay) DOM.drawer_overlay = document.getElementById("drawer-overlay");
    if (!DOM.drawer_title) DOM.drawer_title = document.getElementById("drawer-title");
    if (!DOM.drawer_close) DOM.drawer_close = document.getElementById("drawer-close");
  }

  // ---------- 全局状态 ----------
  let state = {
    killNums: [],
    selectedFilters: { shengxiao:[], haomatou:[], weishu:[], shuduan:[], bose:[], wuxing:[], bandanshuang:[], heshu:[] }
  };
  let subscribers = [], lastAnalysisResult = null, lastRawCount = null;

  function subscribe(fn) { subscribers.push(fn); }
  function notify() { subscribers.forEach(fn => fn()); }
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
    Object.keys(state.selectedFilters).forEach(k => { state.selectedFilters[k] = []; });
    notify();
  }
  function getFilterSet() { return Object.values(state.selectedFilters).flat(); }

  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ killNums: state.killNums, selectedFilters: state.selectedFilters, _t: Date.now() }));
    } catch (e) {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      if (parsed._t && (Date.now() - parsed._t > 7 * 86400000)) { localStorage.removeItem(LS_KEY); return; }
      if (Array.isArray(parsed.killNums)) state.killNums = parsed.killNums.filter(n => Number.isInteger(n) && n >= 1 && n <= 49);
      if (parsed.selectedFilters && typeof parsed.selectedFilters === "object") {
        Object.keys(state.selectedFilters).forEach(k => {
          const val = parsed.selectedFilters[k];
          if (Array.isArray(val)) state.selectedFilters[k] = Array.from(val);
        });
      }
    } catch (e) { console.warn("loadState failed", e); }
  }

  // ---------- 工具函数 ----------
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function showToast(msg) {
    const t = DOM.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("translate-y-20", "opacity-0");
    t.style.transform = "translateY(0)";
    t.style.opacity = "1";
    setTimeout(() => {
      t.classList.add("translate-y-20", "opacity-0");
      t.style.transform = "translateY(5rem)";
      t.style.opacity = "0";
    }, 2000);
  }

  // ---------- 输入解析 ----------
  function parseInputCount(input) {
    if (!input || !input.trim()) return { nums: [], truncated: false };
    let cleaned = input.replace(/《.*?》/g, " ").replace(/[^0-9鼠牛虎兔龙蛇马羊猴鸡狗猪]/g, " ").replace(/([鼠牛虎兔龙蛇马羊猴鸡狗猪])/g, " $1 ");
    const tokens = cleaned.split(" ").filter(t => t.length > 0);
    if (!tokens.length) return { nums: [], truncated: false };
    let results = [];
    for (let token of tokens) {
      if (SHENGXIAO[token]) {
        results.push(...SHENGXIAO[token]);
      } else if (/^\d+$/.test(token)) {
        const n = Number(token);
        if (Number.isInteger(n) && n >= 1 && n <= 49) results.push(n);
      }
    }
    let truncated = false;
    if (results.length > MAX_NUMBERS) { results = results.slice(0, MAX_NUMBERS); truncated = true; }
    return { nums: results, truncated };
  }

  // ---------- 筛选匹配函数 ----------
  let cachedMatchFuncs = null, lastFilterSignature = "";
  function getMatchFuncs(filters) {
    const allConds = filters || getFilterSet();
    const sig = allConds.join("\x00");
    if (cachedMatchFuncs && sig === lastFilterSignature) return cachedMatchFuncs;
    lastFilterSignature = sig;
    cachedMatchFuncs = allConds.map(cond => buildMatchFunc(cond));
    return cachedMatchFuncs;
  }
  function buildMatchFunc(cond) {
    if (cond.startsWith("生肖")) {
      const sx = cond.slice(2);
      return n => numProps[n] && numProps[n].shengXiao === sx;
    }
    if (cond.endsWith("头单") || cond.endsWith("头双")) {
      const parts = cond.split("头");
      const headVal = parseInt(parts[0], 10);
      const oe = parts[1];
      return n => numProps[n] && numProps[n].head === headVal && numProps[n].odd === oe;
    }
    if (cond.endsWith("尾")) {
      const tailVal = parseInt(cond[0], 10);
      return n => numProps[n] && numProps[n].tail === tailVal;
    }
    if (cond.endsWith("段")) {
      return n => numProps[n] && numProps[n].duan === cond;
    }
    if (cond.endsWith("波单") || cond.endsWith("波双")) {
      const parts = cond.split("波");
      const c = parts[0]; const oe = parts[1];
      const colorMap = { 红: "red", 蓝: "blue", 绿: "green" };
      return n => numProps[n] && numProps[n].color === colorMap[c] && numProps[n].odd === oe;
    }
    if (["金","木","水","火","土"].includes(cond)) {
      return n => getFive(n, CURRENT_YEAR) === cond;
    }
    if (["合数单","合数双","大单","大双","小单","小双"].includes(cond)) {
      if (cond === "合数单") return n => numProps[n] && numProps[n].sumOdd === "合数单";
      if (cond === "合数双") return n => numProps[n] && numProps[n].sumOdd === "合数双";
      return n => numProps[n] && numProps[n].halfOddEven === cond;
    }
    if (cond.endsWith("合")) {
      const sumVal = parseInt(cond, 10);
      return n => numProps[n] && numProps[n].sum === sumVal;
    }
    return () => false;
  }

  // ---------- 主线程分析 (降级) ----------
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
        if (funcs[i](n)) { hit++; if (hit > 6) break; }
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

  // ---------- Worker 通信 ----------
  let analysisWorker = null, workerReady = false;
  function initWorker() {
    if (analysisWorker) return;
    try {
      analysisWorker = new Worker("worker.js");
      analysisWorker.onmessage = onWorkerMessage;
      analysisWorker.onerror = e => {
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
      if (d.error) { console.error("Worker returned error:", d.error); runAnalysisMainThread(); return; }
      lastRawCount = d.rawCount;
      renderResult(d.adjustedCount, d.adjustedTotal, d.unique, d.hitCounts, d.rawCount);
    } catch (err) { console.error("onWorkerMessage error:", err); }
  }

  // ---------- 分析触发（仅此一份，移除重复）----------
  let debounceTimer = null;
  function runAnalysis() {
    initWorker();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const input = DOM.numbers ? DOM.numbers.value : "";
        const parsed = parseInputCount(input);
        if (DOM.charCount) DOM.charCount.textContent = parsed.nums.length;
        if (DOM.numberWarn) {
          if (parsed.truncated) {
            DOM.numberWarn.classList.remove("hidden");
            if (!window._truncToastShown) { showToast("⚠️ 输入号码超过" + MAX_NUMBERS + "个，已截断"); window._truncToastShown = true; setTimeout(() => window._truncToastShown = false, 2000); }
          } else { DOM.numberWarn.classList.add("hidden"); }
        }
        if (workerReady && analysisWorker) {
          analysisWorker.postMessage({ input, killNums: state.killNums, filters: getFilterSet() });
        } else {
          const res = computeAnalysisMainThread(input, state.killNums, getFilterSet());
          lastRawCount = res.rawCount;
          renderResult(res.adjustedCount, res.adjustedTotal, res.unique, res.hitCounts, res.rawCount);
        }
      } catch (err) { console.error("runAnalysis error:", err); }
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
      if (DOM.result) DOM.result.innerHTML = '<div class="text-center py-8 text-red-400">分析引擎异常，请刷新重试</div>';
    }
  }
  function onStateChange() { runAnalysis(); saveState(); }

  // ---------- 黑洞特效 ----------
  let currentUniqueElement = null, lastUniqueNum = null;
  function launchUniqueFlyEffect(targetNum, colorClass) {
    document.querySelectorAll(".flying-unique-ball, .blackhole, .distortion, .accretion-disk, .particle-stream").forEach(function (el) { el.remove(); });
    var targetEl = DOM.result.querySelector('[data-num="' + targetNum + '"]');
    if (!targetEl) return;
    var targetRect = targetEl.getBoundingClientRect();
    var endX = targetRect.left + targetRect.width / 2;
    var endY = targetRect.top + targetRect.height / 2;
    var centerX = window.innerWidth / 2;
    var centerY = window.innerHeight * 0.35;
    var color = colorClass === "ball-red" ? "#ff3366" : colorClass === "ball-green" ? "#33cc66" : "#3366ff";
    var darkColor = colorClass === "ball-red" ? "#660022" : colorClass === "ball-green" ? "#004422" : "#002266";
    
    var disk = document.createElement("div");
    disk.className = "accretion-disk";
    disk.style.cssText = "position:fixed;left:" + centerX + "px;top:" + centerY + "px;width:0;height:0;pointer-events:none;z-index:9998;transform:translate(-50%,-50%);";
    document.body.appendChild(disk);
    
    for (var i = 0; i < 4; i++) {
      (function(idx) {
        var ring = document.createElement("div");
        ring.style.cssText = "position:absolute;left:50%;top:50%;width:0;height:0;border:2px solid " + color + ";border-radius:50%;transform:translate(-50%,-50%);opacity:0.6;border-top-color:transparent;border-bottom-color:transparent;";
        disk.appendChild(ring);
        var anim = ring.animate([
          { width: '0px', height: '0px', transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 0 },
          { width: (100 + idx * 40) + 'px', height: (100 + idx * 40) + 'px', transform: 'translate(-50%,-50%) rotate(' + (idx % 2 === 0 ? 180 : -180) + 'deg)', opacity: 0.6, offset: 0.5 },
          { width: (80 + idx * 30) + 'px', height: (80 + idx * 30) + 'px', transform: 'translate(-50%,-50%) rotate(' + (idx % 2 === 0 ? 360 : -360) + 'deg)', opacity: 0.3 }
        ], { duration: 3000, delay: idx * 200, easing: 'ease-in-out' });
        anim.onfinish = function() { ring.remove(); };
      })(i);
    }
    
    var blackhole = document.createElement("div");
    blackhole.className = "blackhole";
    blackhole.style.cssText = "position:fixed;left:" + centerX + "px;top:" + centerY + "px;width:0;height:0;background:radial-gradient(circle,#000 20%," + darkColor + " 50%," + color + " 70%,transparent 100%);border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:9999;box-shadow:0 0 60px " + color + ", inset 0 0 40px " + color + ";";
    document.body.appendChild(blackhole);
    
    var bhAnim = blackhole.animate([
      { width: '0px', height: '0px', opacity: 0 },
      { width: '80px', height: '80px', opacity: 1, offset: 0.2 },
      { width: '100px', height: '100px', opacity: 0.9, offset: 0.5 },
      { width: '80px', height: '80px', opacity: 0.9, offset: 0.7 },
      { width: '0px', height: '0px', opacity: 0 }
    ], { duration: 4000, easing: 'ease-in-out' });
    bhAnim.onfinish = function() { blackhole.remove(); disk.remove(); };
    
    var ball = document.createElement("div");
    ball.className = "flying-unique-ball " + colorClass;
    ball.textContent = String(targetNum).padStart(2, "0");
    ball.style.cssText = "position:fixed;left:" + endX + "px;top:" + endY + "px;transform:translate(-50%,-50%) scale(1);z-index:10000;";
    document.body.appendChild(ball);
    
    var startTime = performance.now();
    var phase1Duration = 2000;
    function phase1(now) {
      var progress = Math.min((now - startTime) / phase1Duration, 1);
      var ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      var currentX = endX + (centerX - endX) * ease;
      var currentY = endY + (centerY - endY) * ease;
      var scale = 1 - ease * 0.9;
      var rotate = ease * 1080;
      ball.style.left = currentX + "px";
      ball.style.top = currentY + "px";
      ball.style.transform = "translate(-50%,-50%) scale(" + scale + ") rotate(" + rotate + "deg)";
      if (progress < 1 && Math.random() > 0.5) {
        var trail = document.createElement("div");
        trail.className = "particle-stream";
        trail.style.cssText = "position:fixed;left:" + currentX + "px;top:" + currentY + "px;width:4px;height:4px;background:" + color + ";border-radius:50%;pointer-events:none;z-index:9997;opacity:0.6;";
        document.body.appendChild(trail);
        trail.animate([
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.6 },
          { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 }
        ], { duration: 500 }).onfinish = function() { trail.remove(); };
      }
      if (progress < 1) {
        requestAnimationFrame(phase1);
      } else {
        ball.style.transform = "translate(-50%,-50%) scale(0)";
        ball.style.opacity = 0;
        setTimeout(function() {
          phase2Start = performance.now();
          requestAnimationFrame(phase2);
        }, 400);
      }
    }
    var phase2Start;
    var phase2Duration = 1600;
    function phase2(now) {
      var progress = Math.min((now - phase2Start) / phase2Duration, 1);
      var ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      var currentX = centerX + (endX - centerX) * ease;
      var currentY = centerY + (endY - centerY) * ease;
      var scale = 0.1 + ease * 0.9;
      var rotate = -1080 * (1 - ease);
      ball.style.left = currentX + "px";
      ball.style.top = currentY + "px";
      ball.style.transform = "translate(-50%,-50%) scale(" + scale + ") rotate(" + rotate + "deg)";
      ball.style.opacity = Math.min(1, ease * 2);
      if (progress < 0.5 && Math.random() > 0.5) {
        var jet = document.createElement("div");
        jet.style.cssText = "position:fixed;left:" + currentX + "px;top:" + currentY + "px;width:3px;height:3px;background:" + color + ";border-radius:50%;pointer-events:none;z-index:9997;box-shadow:0 0 6px " + color + ";";
        document.body.appendChild(jet);
        var jetAngle = Math.random() * Math.PI * 2;
        var jetDist = 30 + Math.random() * 50;
        jet.animate([
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: 'translate(' + (Math.cos(jetAngle)*jetDist) + 'px,' + (Math.sin(jetAngle)*jetDist) + 'px) scale(0)', opacity: 0 }
        ], { duration: 600 }).onfinish = function() { jet.remove(); };
      }
      if (progress < 1) {
        requestAnimationFrame(phase2);
      } else {
        ball.remove();
        targetEl.classList.add("landing-shock", "flash-unique");
        setTimeout(function() { targetEl.classList.remove("landing-shock"); }, 400);
        showToast("🌌 黑洞吞噬：" + String(targetNum).padStart(2, "0") + " 号");
      }
    }
    requestAnimationFrame(phase1);
  }

  // ---------- 渲染分析结果 ----------
  function renderResult(adjustedCount, adjustedTotal, unique, hitCounts, rawCount) {
    try {
      const container = DOM.result;
      if (!container) return;
      if (currentUniqueElement) { currentUniqueElement.classList.remove("flash-unique"); currentUniqueElement = null; }

      const freqMap = new Map();
      for (let n = 1; n <= 49; n++) {
        const f = adjustedCount[n];
        if (f > 0) { if (!freqMap.has(f)) freqMap.set(f, []); freqMap.get(f).push(n); }
      }
      const freqs = Array.from(freqMap.keys()).sort((a, b) => b - a);
      let killDrawn = false;
      const avg = unique ? (adjustedTotal / unique).toFixed(2) : "0.00";
      const unhitNumbers = [];
      for (let n = 1; n <= 49; n++) { if (adjustedCount[n] > 0 && hitCounts[n] === 0) unhitNumbers.push(n); }
      const isUniqueUnhit = (unhitNumbers.length === 1);
      const uniqueUnhitNum = isUniqueUnhit ? unhitNumbers[0] : null;
      const killSet = new Set(state.killNums);
      const sortedFreqMap = new Map();

      const htmlParts = [];
      for (let f of freqs) {
        if (!killDrawn && f <= (adjustedTotal / unique)) {
          htmlParts.push('<div class="kill-line relative h-0.5 bg-gradient-to-r from-transparent via-[#00ffea] to-transparent my-3 rounded-full"></div>');
          killDrawn = true;
        }
        htmlParts.push(`<div class="flex items-start gap-2 mb-2 flex-wrap"><span class="text-xs text-green-500 font-mono min-w-[30px] pt-2">${f}次：</span><div class="flex flex-wrap gap-1.5 flex-1">`);
        const nums = freqMap.get(f).sort((a, b) => a - b);
        sortedFreqMap.set(f, nums.slice());
        nums.forEach(n => {
          const hit = hitCounts[n] || 0;
          const isGray = (hit > 0);
          const color = numProps[n] ? numProps[n].color : getBallColor(n);
          let baseColorClass = isGray ? "ball-gray" : (color === "red" ? "ball-red" : (color === "green" ? "ball-green" : "ball-blue"));
          const isTarget = (n === uniqueUnhitNum);
          const flashClass = isTarget ? "flash-unique" : "";
          let markHtml = "";
          if (killSet.has(n)) markHtml = '<span class="hit-mark cross">✘</span>';
          else if (hit > 0) markHtml = `<span class="hit-mark">${hit}</span>`;
          htmlParts.push(`<button class="ball-3d ${baseColorClass} ${flashClass}" data-num="${n}">${String(n).padStart(2, "0")}${markHtml}</button>`);
        });
        htmlParts.push("</div></div>");
      }

      if (unique === 0) htmlParts.push('<div class="text-center py-8 text-amber-400">⚡ 所有号码频次归零，请调整筛选条件 ⚡</div>');

      const zeroCountNumbers = [];
      if (rawCount && rawCount.length) {
        for (let n = 1; n <= 49; n++) { if (rawCount[n] === 0) zeroCountNumbers.push(n); }
        if (zeroCountNumbers.length > 0) {
          if (!killDrawn) htmlParts.push('<div class="kill-line relative h-0.5 bg-gradient-to-r from-transparent via-[#00ffea] to-transparent my-3 rounded-full"></div>');
          htmlParts.push('<div class="flex items-start gap-2 mb-2 flex-wrap"><span class="text-xs text-gray-500 font-mono min-w-[30px] pt-2">0次：</span><div class="flex flex-wrap gap-1.5 flex-1">');
          zeroCountNumbers.forEach(n => {
            const color = numProps[n] ? numProps[n].color : getBallColor(n);
            const colorClass = color === "red" ? "ball-red" : (color === "green" ? "ball-green" : "ball-blue");
            htmlParts.push(`<button class="ball-3d ${colorClass}" data-num="${n}">${String(n).padStart(2, "0")}</button>`);
          });
          htmlParts.push("</div></div>");
        }
      }

      htmlParts.push(`<div class="mt-4 grid grid-cols-3 gap-2 p-3 bg-transparent rounded-lg border border-[#00ffea]/20"><div class="text-center"><div class="text-[#00ffea] font-bold text-lg">${unique}</div><div class="text-xs text-gray-500">有效数字个数</div></div><div class="text-center"><div class="text-[#00ffea] font-bold text-lg">${adjustedTotal}</div><div class="text-xs text-gray-500">调整后总次数</div></div><div class="text-center"><div class="text-[#00ffea] font-bold text-lg">${avg}</div><div class="text-xs text-gray-500">调整后平均次数</div></div></div>`);
      container.innerHTML = htmlParts.join("");

      if (uniqueUnhitNum) {
        currentUniqueElement = DOM.result.querySelector(`[data-num="${uniqueUnhitNum}"]`);
        if (lastUniqueNum !== uniqueUnhitNum) {
          lastUniqueNum = uniqueUnhitNum;
          const flyColor = numProps[uniqueUnhitNum] ? numProps[uniqueUnhitNum].color : getBallColor(uniqueUnhitNum);
          const flyColorClass = flyColor === "red" ? "ball-red" : (flyColor === "green" ? "ball-green" : "ball-blue");
          setTimeout(() => launchUniqueFlyEffect(uniqueUnhitNum, flyColorClass), 100);
        }
      } else { lastUniqueNum = null; }

      lastAnalysisResult = { sortedFreqMap, adjustedTotal, unique, avg };
    } catch (err) {
      console.error("renderResult error:", err);
      if (DOM.result) DOM.result.innerHTML = '<div class="text-center py-8 text-red-400">渲染出错，请检查控制台</div>';
    }
  }

  // 辅助函数：获取球颜色（降级使用）
  function getBallColor(n) {
    if (numProps[n] && numProps[n].color) return numProps[n].color;
    if (RED_SET.has(n)) return "red";
    if (BLUE_SET.has(n)) return "blue";
    return "green";
  }

  // ---------- 结果区事件委托 ----------
  function initResultDelegation() {
    const resultEl = DOM.result;
    if (!resultEl) return;
    resultEl.addEventListener("click", e => {
      const btn = e.target.closest("[data-num]");
      if (!btn) return;
      const num = Number(btn.dataset.num);
      if (!Number.isNaN(num)) copyNumber(num);
    });
  }

  // ---------- 开奖数据获取与渲染 ----------
  let isCurrentDrawComplete = false, lastLotteryPeriod = "", isFetchingLottery = false;
  let countdownTimer = null;
  function checkDrawComplete(item) {
    if (!item || !item.openCode) return false;
    const codes = String(item.openCode).split(",").filter(c => c.trim() !== "");
    return codes.length >= 7;
  }
  function getNextDrawTime() {
    const now = new Date();
    const draw = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 35, 0);
    if (now >= draw) draw.setDate(draw.getDate() + 1);
    return draw;
  }
  function updateCountdown() {
    if (!DOM.lotteryTime) return;
    const nextDraw = getNextDrawTime();
    const diff = nextDraw - Date.now();
    if (diff <= 0) { DOM.lotteryTime.textContent = "开奖中..."; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    DOM.lotteryTime.textContent = "距开奖 " + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  async function safeFetch(url, options = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        let res;
        if (typeof AbortController !== "undefined") {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), options.timeout || 8000);
          res = await fetch(url, { ...options, signal: ctrl.signal });
          clearTimeout(tid);
        } else {
          res = await Promise.race([
            fetch(url, options),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), options.timeout || 8000))
          ]);
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res;
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }
  async function fetchLottery() {
    if (isFetchingLottery) return;
    isFetchingLottery = true;
    const btn = DOM.refreshLotteryBtn;
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) { btn.innerHTML = '<svg class="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>加载中...'; btn.disabled = true; }
    try {
      const res = await safeFetch(API_CONFIG.live + "?_t=" + Date.now());
      const data = await res.json();
      if (!Array.isArray(data) || !data[0]) { showToast("暂无开奖数据"); return; }
      const item = data[0];
      if (!item.openCode || typeof item.openCode !== "string" || !item.wave) { showToast("数据字段不完整"); return; }
      try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ data, time: Date.now() })); } catch (e) {}
      const isNewPeriod = lastLotteryPeriod !== item.expect;
      if (isNewPeriod) { lastLotteryPeriod = item.expect; isCurrentDrawComplete = false; }
      renderLottery(item);
      if (checkDrawComplete(item)) {
        if (!isCurrentDrawComplete) { isCurrentDrawComplete = true; showToast("当期开奖已完成"); }
        else if (isNewPeriod) { isCurrentDrawComplete = true; showToast("新期号已更新"); }
        else { showToast("刷新成功"); }
      } else {
        isCurrentDrawComplete = false;
        showToast("刷新成功 - 等待开奖");
      }
      if (DOM.lastRefreshTime) DOM.lastRefreshTime.textContent = "上次刷新：" + new Date().toLocaleTimeString();
    } catch (e) {
      console.error("fetchLottery error:", e);
      try {
        const cacheRaw = localStorage.getItem(LS_CACHE_KEY);
        if (cacheRaw) {
          const cache = JSON.parse(cacheRaw);
          if (cache.data && cache.data[0]) { renderLottery(cache.data[0]); showToast("离线模式：显示缓存数据"); return; }
        }
      } catch (cacheErr) {}
      showToast("获取开奖失败");
    } finally {
      isFetchingLottery = false;
      if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
    }
  }

  function renderLottery(item) {
    const codes = String(item.openCode || "").split(",").map(c => escapeHtml(c.trim()));
    const waves = String(item.wave || "").split(",").map(w => {
      w = w.trim();
      if (w === "红" || w === "red") return "red";
      if (w === "蓝" || w === "blue") return "blue";
      if (w === "绿" || w === "green") return "green";
      return w;
    });
    const zodiacs = codes.map(c => {
      const n = parseInt(c, 10);
      if (isNaN(n) || n < 1 || n > 49) return "";
      return numProps[n]?.shengXiao || "";
    });

    const container = DOM.lotteryBalls;
    if (!container) return;
    container.className = "result-balls-row";
    container.innerHTML = "";

    const wxClassMap = { 金: "wx-gold", 木: "wx-wood", 水: "wx-water", 火: "wx-fire", 土: "wx-earth" };

    for (let i = 0; i < 6 && i < codes.length; i++) {
      const num = parseInt(codes[i], 10);
      const colorClass = waves[i] === "red" ? "result-ball-red" : (waves[i] === "green" ? "result-ball-green" : "result-ball-blue");
      const wx = (num >= 1 && num <= 49) ? (numProps[num]?.five || "?") : "?";
      const wxCls = wxClassMap[wx] || "";
      const div = document.createElement("div");
      div.className = "result-ball-item";
      div.innerHTML = `<div class="result-ball ${colorClass}" style="animation-delay: ${i * 150}ms">${escapeHtml(codes[i].padStart(2, "0"))}<div class="result-ball-meta">${escapeHtml(zodiacs[i])}/<span class="${wxCls}">${wx}</span></div></div>`;
      container.appendChild(div);
    }
    if (codes.length >= 7) {
      const plus = document.createElement("div");
      plus.className = "result-plus-sign";
      plus.textContent = "+";
      container.appendChild(plus);
      const num = parseInt(codes[6], 10);
      const colorClass = waves[6] === "red" ? "result-ball-red" : (waves[6] === "green" ? "result-ball-green" : "result-ball-blue");
      const wx = (num >= 1 && num <= 49) ? (numProps[num]?.five || "?") : "?";
      const wxCls = wxClassMap[wx] || "";
      const div = document.createElement("div");
      div.className = "result-ball-item";
      div.innerHTML = `<div class="result-ball ${colorClass}" style="animation-delay: ${6 * 150}ms">${escapeHtml(codes[6].padStart(2, "0"))}<div class="result-ball-meta">${escapeHtml(zodiacs[6])}/<span class="${wxCls}">${wx}</span></div></div>`;
      container.appendChild(div);
    }
    void container.offsetHeight;
    if (DOM.lotteryPeriod) DOM.lotteryPeriod.textContent = escapeHtml(item.expect || "--");
    if (DOM.lotteryTime) DOM.lotteryTime.textContent = escapeHtml((item.openTime || "--").replace(" ", "\n"));
  }

  // ---------- 历史记录 ----------
  let currentHistoryData = [], currentHistorySorted = [], currentHistoryPage = 1, historyCache = {}, historyYearLoaded = null;

  function renderBallsHTML(codes, waves, zodiacs, year) {
    year = year || CURRENT_YEAR;
    let html = "";
    codes.forEach((code, i) => {
      const wave = waves[i];
      const zodiac = zodiacs[i];
      const cc = wave === "blue" || wave === "蓝" ? "history-ball-blue" : wave === "green" || wave === "绿" ? "history-ball-green" : "history-ball-red";
      const num = parseInt(code, 10);
      const five = (num >= 1 && num <= 49) ? getFive(num, year) : "";
      html += `<div class="history-ball-card ${cc}"><div class="history-ball-number">${escapeHtml(code)}</div><div class="history-ball-tag">${escapeHtml(zodiac || "")}/${escapeHtml(five)}</div></div>`;
      if (i === 5) html += '<span class="history-plus-sign">+</span>';
    });
    return html;
  }

  function ensureHistorySorted() {
    if (currentHistorySorted.length > 0) return;
    const seen = new Set();
    const unique = [];
    for (const item of currentHistoryData) {
      if (item && item.expect && !seen.has(item.expect)) { seen.add(item.expect); unique.push(item); }
    }
    currentHistorySorted = unique.sort((a, b) => String(b.expect).localeCompare(String(a.expect), undefined, { numeric: true }));
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
      for (const item of pageData) {
        const expect = escapeHtml(item.expect || "");
        let ballsHtml = "";
        if (item.openCode && item.openCode.trim()) {
          const codes = item.openCode.split(",").map(c => escapeHtml(c.trim()));
          const waves = (item.wave || "").split(",").map(w => escapeHtml(w.trim()));
          const zodiacs = (item.zodiac || "").split(",").map(z => escapeHtml(z.trim()));
          const recordYear = historyYearLoaded || CURRENT_YEAR;
          ballsHtml = renderBallsHTML(codes, waves, zodiacs, recordYear);
        } else {
          ballsHtml = '<div style="display:flex; justify-content:center; align-items:center; padding:24px 0; color:#fbbf24; font-size:14px; font-weight:500;">待开奖</div>';
        }
        const div = document.createElement("div");
        div.className = "history-item";
        div.innerHTML = `<div class="history-item-header">第${expect.slice(4)}期 · ${escapeHtml(item.openTime && item.openTime.slice(5, 16) || "")}</div><div class="history-balls-row">${ballsHtml}</div>`;
        frag.appendChild(div);
      }
      if (cont) { cont.innerHTML = ""; cont.appendChild(frag); }
      const pageNumEl = document.getElementById("historyPageNum");
      const totalPagesEl = document.getElementById("historyTotalPages");
      if (pageNumEl) pageNumEl.textContent = currentHistoryPage;
      if (totalPagesEl) totalPagesEl.textContent = totalPages;
      if (pagi) {
        if (totalPages <= 1) pagi.classList.add("dhidden"); else pagi.classList.remove("dhidden");
        const prevBtn = document.getElementById("history-prev");
        const nextBtn = document.getElementById("history-next");
        if (prevBtn) prevBtn.disabled = currentHistoryPage <= 1;
        if (nextBtn) nextBtn.disabled = currentHistoryPage >= totalPages;
      }
    } catch (e) {
      console.error("renderHistoryPage error:", e);
      const cont = document.getElementById("historyContent");
      if (cont) cont.innerHTML = '<div style="color:#f87171;">历史加载失败</div>';
    }
  }

  // ---------- 抽屉系统 ----------
  const DrawerSystem = {
    current: null,
    templates: {
      shama: () => `<textarea id="kill-input" rows="3" class="dinput">${state.killNums.join(" ")}</textarea>`,
      shengxiao: () => {
        const sxs = ["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"];
        const sel = state.selectedFilters.shengxiao;
        return '<div class="dgrid-6">' + sxs.map(sx => `<label><input type="checkbox" class="filter-checkbox hidden" value="生肖${sx}" data-drawer="shengxiao" ${sel.includes("生肖"+sx)?"checked":""}><span class="filter-label dbtn">${sx}</span></label>`).join("") + "</div>";
      },
      haomatou: () => {
        const heads = [["0头单","1头单","2头单","3头单","4头单"],["0头双","1头双","2头双","3头双","4头双"]];
        const sel = state.selectedFilters.haomatou;
        return heads.map(row => '<div class="dflex">' + row.map(h => `<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="${h}" data-drawer="haomatou" ${sel.includes(h)?"checked":""}><span class="filter-label dbtn dbtn-sm">${h}</span></label>`).join("") + "</div>").join("");
      },
      weishu: () => {
        const tails = [["0尾","1尾","2尾","3尾","4尾"],["5尾","6尾","7尾","8尾","9尾"]];
        const sel = state.selectedFilters.weishu;
        return tails.map(row => '<div class="dflex">' + row.map(t => `<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="${t}" data-drawer="weishu" ${sel.includes(t)?"checked":""}><span class="filter-label dbtn dbtn-sm">${t}</span></label>`).join("") + "</div>").join("");
      },
      shuduan: () => {
        const duans = ["1段","2段","3段","4段","5段","6段","7段"];
        const sel = state.selectedFilters.shuduan;
        return '<div class="dflex-wrap">' + duans.map(d => `<label><input type="checkbox" class="filter-checkbox hidden" value="${d}" data-drawer="shuduan" ${sel.includes(d)?"checked":""}><span class="filter-label dbtn dbtn-md">${d}</span></label>`).join("") + "</div>";
      },
      bose: () => {
        const items = [["红波单","蓝波单","绿波单"],["红波双","蓝波双","绿波双"]];
        const sel = state.selectedFilters.bose;
        return items.map(row => '<div class="dflex">' + row.map(item => `<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="${item}" data-drawer="bose" ${sel.includes(item)?"checked":""}><span class="filter-label dbtn dbtn-sm">${item.replace("波","")}</span></label>`).join("") + "</div>").join("");
      },
      wuxing: () => {
        const table = generateWuxingTable(CURRENT_YEAR);
        const wx = {};
        for (const [k,v] of Object.entries(table)) wx[k] = v.map(n => String(n).padStart(2,'0')).join(' ');
        const sel = state.selectedFilters.wuxing;
        return '<div class="dspace-y">' + Object.entries(wx).map(([k,v]) => `<div class="wuxing-row"><label class="ditems-center" style="gap:8px;min-width:0;flex-shrink:0;"><input type="checkbox" class="filter-checkbox hidden" value="${k}" data-drawer="wuxing" ${sel.includes(k)?"checked":""}><span class="filter-label dbtn dbtn-fixed wuxing-btn-fixed">${k}</span></label><span class="wuxing-nums">${v}</span></div>`).join("") + "</div>";
      },
      bandanshuang: () => {
        const items = [["合数单","小单","大单"],["合数双","小双","大双"]];
        const sel = state.selectedFilters.bandanshuang;
        return items.map(row => '<div class="dflex">' + row.map(item => `<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="${item}" data-drawer="bandanshuang" ${sel.includes(item)?"checked":""}><span class="filter-label dbtn dbtn-sm">${item}</span></label>`).join("") + "</div>").join("");
      },
      heshu: () => {
        const hes = Array.from({ length: 13 }, (_, i) => (i + 1) + "合");
        const sel = state.selectedFilters.heshu;
        return '<div class="dgrid-4">' + hes.map(h => `<label><input type="checkbox" class="filter-checkbox hidden" value="${h}" data-drawer="heshu" ${sel.includes(h)?"checked":""}><span class="filter-label dbtn dbtn-sm">${h}</span></label>`).join("") + "</div>";
      },
      history: () => {
        let opts = "";
        for (let y = new Date().getFullYear(); y >= 2020; y--) opts += `<option value="${y}">${y}年</option>`;
        return [
          '<div>',
            `<select id="historyYear" class="dselect"><option value="">选择年份</option>${opts}</select>`,
            '<div id="historyLoading" class="dhidden dtext-center dpy-4"><svg class="animate-spin" style="width:24px;height:24px;margin:0 auto;color:#00ffea;" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>',
            '<div id="historyContent" class="dmt-3 hide-scrollbar"></div>',
            '<div id="historyPagination" class="dflex-between dmt-6 dpx-1 dhidden">',
              '<button id="history-prev" class="dpage-btn">← 上1页</button>',
              '<div class="dtext-sm" style="text-align:center;">第 <span id="historyPageNum" style="font-weight:bold;color:#00ffea;">1</span> 页 / <span id="historyTotalPages" class="dtext-gray">1</span> 页</div>',
              '<button id="history-next" class="dpage-btn">下1页 →</button>',
            '</div>',
          '</div>'
        ].join("");
      }
    },
    open(type) {
      if (this.current === type) { this.close(); return; }
      this.current = type;
      const titles = { shama: "杀码", shengxiao: "生肖", haomatou: "头数", weishu: "尾数", shuduan: "数段", bose: "波色", wuxing: "五行", bandanshuang: "半单双", heshu: "合数", history: "历史开奖" };
      DOM.drawer_title.textContent = titles[type] || "筛选器";
      const contentDiv = DOM.drawer_content;
      if (!contentDiv) { showToast("抽屉初始化失败"); return; }
      contentDiv.innerHTML = this.templates[type] ? this.templates[type]() : "<p>暂无内容</p>";
      DOM.drawer_overlay.classList.remove("hidden");
      DOM.drawer_overlay.style.display = "block";
      setTimeout(() => { DOM.drawer_overlay.classList.remove("opacity-0"); DOM.drawer_overlay.style.opacity = "1"; }, 10);
      DOM.drawer_container.classList.add("open");
      this.updateNavState(type);
      if (type === "history") setTimeout(() => { const sel = document.getElementById("historyYear"); if (sel && !sel.value) sel.value = historyYearLoaded || ""; if (sel) sel.dispatchEvent(new Event("change")); }, 50);
    },
    close() {
      DOM.drawer_container.classList.remove("open");
      DOM.drawer_overlay.classList.add("opacity-0");
      DOM.drawer_overlay.style.opacity = "0";
      setTimeout(() => { DOM.drawer_overlay.classList.add("hidden"); DOM.drawer_overlay.style.display = "none"; }, 300);
      this.current = null;
      this.updateNavState(null);
    },
    bindGlobalDelegation() {
      const content = DOM.drawer_content;
      if (!content || content._delegationBound) return;
      content._delegationBound = true;
      content.addEventListener("change", e => {
        const cb = e.target;
        if (cb.classList.contains("filter-checkbox")) {
          toggleFilter(cb.dataset.drawer, cb.value, cb.checked);
          return;
        }
        if (e.target.id === "historyYear") {
          const year = e.target.value;
          if (!year) return;
          historyYearLoaded = year;
          const loadDiv = document.getElementById("historyLoading");
          const cont = document.getElementById("historyContent");
          if (loadDiv) loadDiv.classList.remove("dhidden");
          (async () => {
            try {
              if (historyCache[year]) currentHistoryData = historyCache[year];
              else {
                const res = await safeFetch(API_CONFIG.historyBase + year);
                const json = await res.json();
                if (json.code === 200 && Array.isArray(json.data)) { currentHistoryData = json.data; historyCache[year] = json.data; }
                else currentHistoryData = [];
              }
              currentHistorySorted = []; currentHistoryPage = 1; renderHistoryPage();
            } catch (e) { currentHistoryData = []; if (cont) cont.innerHTML = '<div style="color:#f87171;">加载失败</div>'; }
            finally { if (loadDiv) loadDiv.classList.add("dhidden"); }
          })();
        }
      });
      content.addEventListener("input", e => {
        if (e.target.id === "kill-input") {
          const parsed = parseInputCount(e.target.value);
          setKillNums(parsed.nums.filter(n => n >= 1 && n <= 49));
        }
      });
      content.addEventListener("click", e => {
        if (e.target.closest("#history-prev")) { if (currentHistoryPage > 1) { currentHistoryPage--; renderHistoryPage(); } }
        else if (e.target.closest("#history-next")) { ensureHistorySorted(); if (currentHistoryPage < Math.ceil(currentHistorySorted.length / HISTORY_PAGE_SIZE)) { currentHistoryPage++; renderHistoryPage(); } }
      });
    },
    updateNavState(activeType) {
      document.querySelectorAll(".nav-item").forEach(el => {
        const dr = el.dataset.drawer;
        if (dr === activeType) { el.classList.add("bg-[#00ffea]", "text-black"); el.classList.remove("bg-transparent", "text-gray-400"); }
        else { el.classList.remove("bg-[#00ffea]", "text-black"); if (dr === "selectnone") el.classList.add("bg-[#ff0055]/20", "text-[#ff0055]"); else el.classList.add("bg-transparent", "text-gray-400"); }
      });
    }
  };

  // ---------- 复制功能 ----------
  function copyResult() {
    if (!lastAnalysisResult) { showToast("暂无分析结果"); return; }
    let text = "";
    lastAnalysisResult.sortedFreqMap.forEach((nums, f) => { text += `${f}次：${nums.map(n => String(n).padStart(2, "0")).join(" ")}\n`; });
    if (text.trim()) fallbackCopy(text.trim());
  }
  function copyNumber(n) { fallbackCopy(String(n).padStart(2, "0")); }
  function fallbackCopy(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("已复制")).catch(() => execCopy(text));
    } else execCopy(text);
  }
  function execCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px"; document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    try { document.execCommand("copy"); showToast("已复制"); } catch (e) { showToast("复制失败"); }
    document.body.removeChild(ta);
  }
  window.copyResult = copyResult;

  // ---------- 自动刷新开奖 ----------
  function initAutoRefresh() {
    // 启动开奖倒计时显示
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
    // 自动刷新策略：开奖时段高频 + 全时段兜底刷新
    setInterval(() => {
      if (isFetchingLottery || document.visibilityState !== "visible") return;
      const now = new Date();
      const totalSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const DRAW_START = 21 * 3600 + 30 * 60; // 21:30
      const DRAW_END   = 21 * 3600 + 40 * 60; // 21:40
      const isInDrawWindow = totalSec >= DRAW_START && totalSec <= DRAW_END;
      // 开奖时间段：每5秒刷新一次（不判断 isCurrentDrawComplete，以便检测新期号）
      if (isInDrawWindow) {
        if (!window._lastAutoFetchTime || (Date.now() - window._lastAutoFetchTime) >= 5000) {
          window._lastAutoFetchTime = Date.now();
          fetchLottery();
        }
        return;
      }
      // 非开奖时间：每60秒刷新一次兜底（检测新期号发布）
      if (!window._lastRegularFetchTime || (Date.now() - window._lastRegularFetchTime) >= 60000) {
        window._lastRegularFetchTime = Date.now();
        fetchLottery();
      }
    }, 1000);
  }

  // ---------- 粒子背景 ----------
  function initParticles() {
    const canvas = document.getElementById("particle-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width, height, particles = [], frameId = null, lastTime = 0;
    const MAX_PARTICLES = 60;
    function resize() { width = window.innerWidth; height = window.innerHeight; canvas.width = width; canvas.height = height; }
    function createParticle(yOverride) {
      const speedY = (Math.random() * 50 + 20);
      const speedX = (Math.random() - 0.5) * 24;
      const y = yOverride !== undefined ? yOverride : height + Math.random() * 30;
      return { x: Math.random() * width, y: y, r: Math.random() * 2.5 + 0.8, speedY: speedY, speedX: speedX, alpha: Math.random() * 0.4 + 0.15, hue: Math.random() * 360, wobble: Math.random() * Math.PI * 2, wobbleSpeed: (Math.random() * 1.0 + 0.3) };
    }
    function initDots() { particles = []; for (let i = 0; i < MAX_PARTICLES; i++) particles.push(createParticle(Math.random() * height)); }
    function animate(timestamp) {
      if (!lastTime) lastTime = timestamp;
      const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
      lastTime = timestamp;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y -= p.speedY * dt; p.wobble += p.wobbleSpeed * dt; p.x += Math.sin(p.wobble) * 0.4 + p.speedX * dt;
        if (p.y < -80 || p.x < -10 || p.x > width + 10) particles[i] = createParticle();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = "hsla(" + p.hue + ", 80%, 60%, " + p.alpha + ")"; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill();
      }
      frameId = requestAnimationFrame(animate);
    }
    function start() { if (frameId) return; lastTime = 0; frameId = requestAnimationFrame(animate); }
    function stop() { if (frameId) { cancelAnimationFrame(frameId); frameId = null; } }
    resize(); initDots(); start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
  }

  // ---------- 初始化 ----------
  function init() {
    try {
      cacheDOM(); loadState(); initWorker(); subscribe(onStateChange); initResultDelegation(); DrawerSystem.bindGlobalDelegation();
      if (DOM.exampleBtn) DOM.exampleBtn.addEventListener("click", () => { DOM.numbers.value = "龙蛇马 12 25 36 8 17 29 41 5 19 33 47"; runAnalysis(); });
      if (DOM.clearBtn) DOM.clearBtn.addEventListener("click", () => { DOM.numbers.value = ""; runAnalysis(); showToast("已清空输入"); });
      if (DOM.copyResultBtn) DOM.copyResultBtn.addEventListener("click", copyResult);
      if (DOM.numbers) DOM.numbers.addEventListener("input", () => runAnalysis());
      if (DOM.refreshLotteryBtn) DOM.refreshLotteryBtn.addEventListener("click", () => fetchLottery());
      document.querySelectorAll(".nav-item").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const drawer = btn.dataset.drawer;
          if (drawer === "selectnone") { clearAllFilters(); DrawerSystem.close(); showToast("已清空所有筛选"); }
          else DrawerSystem.open(drawer);
        });
      });
      if (DOM.drawer_close) DOM.drawer_close.addEventListener("click", () => DrawerSystem.close());
      if (DOM.drawer_overlay) DOM.drawer_overlay.addEventListener("click", () => DrawerSystem.close());
      fetchLottery(); runAnalysis(); initAutoRefresh(); initParticles();
      window.addEventListener("beforeunload", () => { terminateWorker(); if (countdownTimer) clearInterval(countdownTimer); });
      console.log("%c✅ 神码再现 v3.6.3 无直播版已加载", "color:#00ffea;font-weight:bold");
    } catch (e) { console.error("初始化失败:", e); alert("页面初始化出错，请刷新重试。错误: " + e.message); }
  }

  document.addEventListener("DOMContentLoaded", init);
})();