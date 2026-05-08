// ======================== app.js — 神码再现 v3.5.3 完整功能版 ========================
"use strict";

const DATA = window.APP_DATA || {};
const CONFIG = DATA.CONFIG || {};
const numProps = DATA.numProps || [];

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
let lastUniqueNum = null;
let currentUniqueElement = null;

function subscribe(fn) { subscribers.push(fn); }
function notify() { subscribers.forEach(fn => fn()); }

function setKillNums(newNums) {
    state.killNums = [...new Set(newNums.filter(n => Number.isInteger(n) && n >= 1 && n <= 49))];
    notify();
}
function toggleFilter(category, value, checked) {
    const set = new Set(state.selectedFilters[category] || []);
    checked ? set.add(value) : set.delete(value);
    state.selectedFilters[category] = Array.from(set);
    notify();
}
function clearAllFilters() {
    state.killNums = [];
    Object.keys(state.selectedFilters).forEach(k => state.selectedFilters[k] = []);
    notify();
}
function getFilterSet() {
    return Object.values(state.selectedFilters).flat();
}
function saveState() {
    try {
        localStorage.setItem(CONFIG.LS_KEY, JSON.stringify({
            killNums: state.killNums,
            selectedFilters: state.selectedFilters
        }));
    } catch (e) {}
}
function loadState() {
    try {
        const raw = localStorage.getItem(CONFIG.LS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.killNums)) {
            state.killNums = parsed.killNums.filter(n => Number.isInteger(n) && n >= 1 && n <= 49);
        }
        if (parsed.selectedFilters && typeof parsed.selectedFilters === "object") {
            Object.keys(state.selectedFilters).forEach(k => {
                if (Array.isArray(parsed.selectedFilters[k])) state.selectedFilters[k] = [...parsed.selectedFilters[k]];
            });
        }
    } catch (e) { console.warn("loadState failed", e); }
}

// ---------- DOM ----------
const DOM = {};
function cacheDOM() {
    const ids = [
        "numbers", "result", "charCount", "numberWarn", "exampleBtn", "clearBtn", "copyResultBtn",
        "lotteryPeriod", "lotteryTime", "lotteryBalls", "refreshLotteryBtn",
        "drawer-overlay", "drawer-container", "drawer-title", "drawer-content", "drawer-close", "toast"
    ];
    ids.forEach(id => DOM[id.replace(/-/g, "_")] = document.getElementById(id));
}
function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function showToast(msg) {
    const t = DOM.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("translate-y-20", "opacity-0");
    setTimeout(() => t.classList.add("translate-y-20", "opacity-0"), 2000);
}

// ---------- 分析引擎 ----------
let analysisWorker = null;
let workerReady = false;
let cachedMatchFuncs = null;
let lastFilterSignature = "";

function getMatchFuncs(filters) {
    const sig = filters.join("\x00");
    if (cachedMatchFuncs && sig === lastFilterSignature) return cachedMatchFuncs;
    lastFilterSignature = sig;
    cachedMatchFuncs = filters.map(DATA.buildMatchFunc);
    return cachedMatchFuncs;
}
function computeAnalysisMainThread(input) {
    const { nums, truncated } = DATA.parseInput(input);
    const rawCount = new Uint16Array(50);
    nums.forEach(n => rawCount[n]++);

    const killSet = new Set(state.killNums);
    const funcs = getMatchFuncs(getFilterSet());
    const hitCounts = new Uint8Array(50);

    for (let n = 1; n <= 49; n++) {
        let hit = killSet.has(n) ? 1 : 0;
        for (const fn of funcs) {
            if (fn(n)) { hit++; if (hit > 3) break; }
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
function initWorker() {
    if (analysisWorker) return;
    try {
        analysisWorker = new Worker("worker.js");
        analysisWorker.onmessage = (e) => {
            if (e.data.error) { console.error("Worker error:", e.data.error); runAnalysisMainThread(); return; }
            lastRawCount = e.data.rawCount;
            renderResult(e.data);
        };
        analysisWorker.onerror = (e) => { console.error("Worker error event:", e); workerReady = false; runAnalysisMainThread(); };
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
let debounceTimer = null;
function runAnalysis() {
    initWorker();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        try {
            const input = DOM.numbers ? DOM.numbers.value : "";
            const { nums, truncated } = DATA.parseInput(input);
            if (DOM.charCount) DOM.charCount.textContent = nums.length;
            if (DOM.numberWarn) {
                if (truncated) {
                    DOM.numberWarn.classList.remove("hidden");
                    if (!window._truncToastShown) {
                        showToast(`⚠️ 输入号码超过${CONFIG.MAX_NUMBERS}个，已截断`);
                        window._truncToastShown = true;
                        setTimeout(() => window._truncToastShown = false, 2000);
                    }
                } else {
                    DOM.numberWarn.classList.add("hidden");
                }
            }
            if (workerReady && analysisWorker) {
                analysisWorker.postMessage({ input, killNums: state.killNums, filters: getFilterSet() });
            } else {
                const res = computeAnalysisMainThread(input);
                lastRawCount = res.rawCount;
                renderResult(res);
            }
        } catch (err) { console.error("runAnalysis error:", err); }
    }, 200);
}
function runAnalysisMainThread() {
    try {
        const input = DOM.numbers ? DOM.numbers.value : "";
        const res = computeAnalysisMainThread(input);
        lastRawCount = res.rawCount;
        renderResult(res);
    } catch (err) { console.error("runAnalysisMainThread error:", err); }
}
function onStateChange() { runAnalysis(); saveState(); }

// ---------- 结果渲染 ----------
function renderResult({ adjustedCount, adjustedTotal, unique, hitCounts, rawCount }) {
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
        for (let n = 1; n <= 49; n++) {
            if (adjustedCount[n] > 0 && (hitCounts[n] || 0) === 0) unhitNumbers.push(n);
        }
        const uniqueUnhitNum = unhitNumbers.length === 1 ? unhitNumbers[0] : null;
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
            const nums = freqMap.get(f).sort((a, b) => a - b);
            sortedFreqMap.set(f, nums.slice());
            for (let ni = 0; ni < nums.length; ni++) {
                const n = nums[ni];
                const hit = hitCounts[n] || 0;
                const isGray = hit > 0;
                const p = numProps[n];
                let baseColorClass = isGray ? "ball-gray" : (p && p.color === "red" ? "ball-red" : (p && p.color === "green" ? "ball-green" : "ball-blue"));
                const isTarget = n === uniqueUnhitNum;
                const flashClass = isTarget ? "flash-unique" : "";
                let markHtml = "";
                if (killSet.has(n)) markHtml = '<span class="hit-mark cross">✘</span>';
                else if (hit > 0) markHtml = '<span class="hit-mark">' + hit + '</span>';
                htmlParts.push('<button class="ball-3d ' + baseColorClass + ' ' + flashClass + '" data-num="' + n + '">' + String(n).padStart(2, "0") + markHtml + '</button>');
            }
            htmlParts.push('</div></div>');
        }
        if (unique === 0) htmlParts.push('<div class="text-center py-8 text-amber-400">⚡ 所有号码频次归零，请调整筛选条件 ⚡</div>');

        const zeroCountNumbers = [];
        if (rawCount) { for (let n = 1; n <= 49; n++) if (rawCount[n] === 0) zeroCountNumbers.push(n); }
        if (zeroCountNumbers.length > 0) {
            if (!killDrawn) htmlParts.push('<div class="kill-line relative h-0.5 bg-gradient-to-r from-transparent via-[#00ffea] to-transparent my-3 rounded-full"></div>');
            htmlParts.push('<div class="flex items-start gap-2 mb-2 flex-wrap"><span class="text-xs text-gray-500 font-mono min-w-[30px] pt-2">0次：</span><div class="flex flex-wrap gap-1.5 flex-1">');
            zeroCountNumbers.sort((a, b) => a - b);
            for (const n of zeroCountNumbers) {
                const p = numProps[n];
                const colorClass = p && p.color === "red" ? "ball-red" : (p && p.color === "green" ? "ball-green" : "ball-blue");
                htmlParts.push('<button class="ball-3d ' + colorClass + '" data-num="' + n + '">' + String(n).padStart(2, "0") + '</button>');
            }
            htmlParts.push('</div></div>');
        }

        htmlParts.push('<div class="mt-4 grid grid-cols-3 gap-2 p-3 bg-[#1a1a2a] rounded-lg border border-[#00ffea]/20"><div class="text-center"><div class="text-[#00ffea] font-bold text-lg">' + unique + '</div><div class="text-xs text-gray-500">有效数字个数</div></div><div class="text-center"><div class="text-[#00ffea] font-bold text-lg">' + adjustedTotal + '</div><div class="text-xs text-gray-500">调整后总次数</div></div><div class="text-center"><div class="text-[#00ffea] font-bold text-lg">' + avg + '</div><div class="text-xs text-gray-500">调整后平均次数</div></div></div>');
        container.innerHTML = htmlParts.join("");

        if (uniqueUnhitNum) {
            currentUniqueElement = DOM.result.querySelector('[data-num="' + uniqueUnhitNum + '"]');
            if (lastUniqueNum !== uniqueUnhitNum) {
                lastUniqueNum = uniqueUnhitNum;
                const p = numProps[uniqueUnhitNum];
                const flyColor = p && p.color === "red" ? "ball-red" : (p && p.color === "green" ? "ball-green" : "ball-blue");
                setTimeout(() => launchUniqueFlyEffect(uniqueUnhitNum, flyColor), 100);
            }
        } else { lastUniqueNum = null; }

        lastAnalysisResult = { sortedFreqMap, adjustedTotal, unique, avg };
    } catch (err) {
        console.error("renderResult error:", err);
        if (DOM.result) DOM.result.innerHTML = '<div class="text-center py-8 text-red-400">渲染出错，请检查控制台</div>';
    }
}
function initResultDelegation() {
    const resultEl = DOM.result;
    if (!resultEl) return;
    resultEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-num]");
        if (!btn) return;
        const num = Number(btn.dataset.num);
        if (!Number.isNaN(num)) copyNumber(num);
    });
}

// ---------- 独苗飞入动画 ----------
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
    ball.style.left = startX + "px"; ball.style.top = startY + "px"; ball.style.color = glowColor;
    document.body.appendChild(ball);

    let startTime = null;
    const duration = 1400;
    function dropTrail(x, y) {
        const trail = document.createElement("div");
        trail.className = "flying-trail";
        trail.style.left = (x + 21) + "px"; trail.style.top = (y + 21) + "px";
        trail.style.background = glowColor; trail.style.boxShadow = "0 0 8px " + glowColor;
        document.body.appendChild(trail);
        requestAnimationFrame(() => { trail.style.transition = "all 0.5s ease"; trail.style.opacity = "0"; trail.style.transform = "scale(0.2)"; });
        setTimeout(() => trail.remove(), 500);
    }
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const currentX = startX + (endX - startX) * ease;
        const currentY = startY + (endY - startY) * ease;
        const scale = 0.6 + Math.sin(progress * Math.PI) * 0.7;
        const rotate = progress * 1080;
        ball.style.transform = "translate3d(" + (currentX - startX) + "px, " + (currentY - startY) + "px, 0) scale(" + scale + ") rotate(" + rotate + "deg)";
        if (progress > 0.05 && progress < 0.95 && (timestamp - startTime) % 60 < 20) dropTrail(currentX, currentY);
        if (progress < 1) { requestAnimationFrame(animate); } else {
            ball.remove();
            targetEl.classList.remove("flash-unique"); void targetEl.offsetWidth;
            targetEl.classList.add("landing-shock", "flash-unique");
            setTimeout(() => targetEl.classList.remove("landing-shock"), 400);
            showToast("🎯 独苗守护：" + String(targetNum).padStart(2, "0") + " 号");
        }
    }
    requestAnimationFrame(animate);
}

// ---------- 复制 ----------
function copyResult() {
    if (!lastAnalysisResult) { showToast("暂无分析结果"); return; }
    const sortedFreqMap = lastAnalysisResult.sortedFreqMap;
    let text = "";
    sortedFreqMap.forEach((nums, f) => {
        text += f + "次：" + nums.map(n => String(n).padStart(2, "0")).join(" ") + "\n";
    });
    if (!text.trim()) return;
    fallbackCopy(text.trim());
}
function copyNumber(n) { fallbackCopy(String(n).padStart(2, "0")); }
function fallbackCopy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast("已复制")).catch(() => execCopy(text));
    } else { execCopy(text); }
}
function execCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); showToast("已复制"); } catch (e) { showToast("复制失败"); }
    document.body.removeChild(ta);
}
window.copyResult = copyResult;

// ---------- 开奖 ----------
const API_CONFIG = {
    live: "https://macaumarksix.com/api/live2",
    historyBase: "https://history.macaumarksix.com/history/macaujc2/y/"
};
let isCurrentDrawComplete = false;
let lastLotteryPeriod = "";

function checkDrawComplete(item) {
    if (!item || !item.openCode) return false;
    return String(item.openCode).split(",").filter(c => c.trim() !== "").length >= 7;
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
        } catch (e) { if (i === retries) throw e; await new Promise(r => setTimeout(r, 800)); }
    }
}
async function fetchLottery() {
    const btn = DOM.refreshLotteryBtn;
    if (!btn) return;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<svg class="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>加载中...';
    btn.disabled = true;
    try {
        const res = await safeFetch(API_CONFIG.live + "?_t=" + Date.now());
        let data;
        try { data = await res.json(); } catch (e) { showToast("数据格式异常"); return; }
        if (!Array.isArray(data) || !data[0]) { showToast("暂无开奖数据"); return; }
        const item = data[0];
        if (!item.openCode || typeof item.openCode !== "string" || !item.wave || !item.zodiac) {
            showToast("数据字段不完整"); return;
        }
        try { localStorage.setItem(CONFIG.LS_CACHE_KEY, JSON.stringify({ data, time: Date.now() })); } catch (e) {}
        if (lastLotteryPeriod !== item.expect) { lastLotteryPeriod = item.expect; isCurrentDrawComplete = false; }
        renderLottery(item);
        if (!isCurrentDrawComplete && checkDrawComplete(item)) {
            isCurrentDrawComplete = true; showToast("当期开奖已完成，自动刷新停止");
        } else { showToast("刷新成功"); }
    } catch (e) {
        console.error("fetchLottery error:", e);
        try {
            const cacheRaw = localStorage.getItem(CONFIG.LS_CACHE_KEY);
            if (cacheRaw) {
                const cache = JSON.parse(cacheRaw);
                if (cache.data && cache.data[0]) { renderLottery(cache.data[0]); showToast("离线模式：显示缓存数据"); return; }
            }
        } catch (e2) {}
        showToast("获取开奖失败");
    } finally { btn.innerHTML = origHtml; btn.disabled = false; }
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
    const zodiacs = String(item.zodiac || "").split(",").map(z => escapeHtml(z.trim()));
    const container = DOM.lotteryBalls;
    if (!container) return;
    container.className = "result-balls-row"; container.innerHTML = "";
    const wxClassMap = { 金: "wx-gold", 木: "wx-wood", 水: "wx-water", 火: "wx-fire", 土: "wx-earth" };
    for (let i = 0; i < 6 && i < codes.length; i++) {
        const num = parseInt(codes[i], 10);
        const colorClass = waves[i] === "red" ? "result-ball-red" : (waves[i] === "green" ? "result-ball-green" : "result-ball-blue");
        const wx = (num >= 1 && num <= 49) ? (numProps[num] && numProps[num].five || "?") : "?";
        const div = document.createElement("div");
        div.className = "result-ball-item";
        div.innerHTML = '<div class="result-ball ' + colorClass + '" style="animation-delay: ' + (i * 150) + 'ms">' + escapeHtml(codes[i].padStart(2, "0")) + '<div class="result-ball-meta">' + escapeHtml(zodiacs[i] || "") + '/<span class="' + (wxClassMap[wx] || "") + '">' + wx + "</span></div></div>";
        container.appendChild(div);
    }
    if (codes.length >= 7) {
        const plus = document.createElement("div"); plus.className = "result-plus-sign"; plus.textContent = "+"; container.appendChild(plus);
    }
    if (codes.length >= 7) {
        const num = parseInt(codes[6], 10);
        const colorClass = waves[6] === "red" ? "result-ball-red" : (waves[6] === "green" ? "result-ball-green" : "result-ball-blue");
        const wx = (num >= 1 && num <= 49) ? (numProps[num] && numProps[num].five || "?") : "?";
        const div = document.createElement("div");
        div.className = "result-ball-item";
        div.innerHTML = '<div class="result-ball ' + colorClass + '" style="animation-delay: ' + (6 * 150) + 'ms">' + escapeHtml(codes[6].padStart(2, "0")) + '<div class="result-ball-meta">' + escapeHtml(zodiacs[6] || "") + '/<span class="' + (wxClassMap[wx] || "") + '">' + wx + "</span></div></div>";
        container.appendChild(div);
    }
    void container.offsetHeight;
    if (DOM.lotteryPeriod) DOM.lotteryPeriod.textContent = escapeHtml(item.expect || "--");
    if (DOM.lotteryTime) DOM.lotteryTime.textContent = escapeHtml((item.openTime || "--").replace(" ", "\n"));
}

// ---------- 历史记录 ----------
let currentHistoryData = [];
let currentHistorySorted = [];
let currentHistoryPage = 1;
let historyCache = {};
let historyYearLoaded = null;

function renderBallsHTML(codes, waves, zodiacs) {
    let html = "";
    codes.forEach((code, i) => {
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
        const totalPages = Math.max(1, Math.ceil(sorted.length / CONFIG.HISTORY_PAGE_SIZE));
        if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;
        const start = (currentHistoryPage - 1) * CONFIG.HISTORY_PAGE_SIZE;
        const pageData = sorted.slice(start, start + CONFIG.HISTORY_PAGE_SIZE);

        const frag = document.createDocumentFragment();
        for (const item of pageData) {
            const expect = escapeHtml(item.expect || "");
            let ballsHtml = "";
            if (item.openCode && item.openCode.trim()) {
                const codes = item.openCode.split(",").map(c => escapeHtml(c.trim()));
                const waves = (item.wave || "").split(",").map(w => escapeHtml(w.trim()));
                const zodiacs = (item.zodiac || "").split(",").map(z => escapeHtml(z.trim()));
                ballsHtml = renderBallsHTML(codes, waves, zodiacs);
            } else {
                ballsHtml = '<div style="display:flex; justify-content:center; align-items:center; padding:24px 0; color:#fbbf24; font-size:14px; font-weight:500;">待开奖</div>';
            }
            const div = document.createElement("div");
            div.className = "history-item";
            div.innerHTML = '<div class="history-item-header">第' + expect.slice(4) + "期 · " + escapeHtml(item.openTime && item.openTime.slice(5, 16) || "") + '</div><div class="history-balls-row">' + ballsHtml + "</div>";
            frag.appendChild(div);
        }
        if (cont) { cont.innerHTML = ""; cont.appendChild(frag); }

        const pageNumEl = document.getElementById("historyPageNum");
        const totalPagesEl = document.getElementById("historyTotalPages");
        if (pageNumEl) pageNumEl.textContent = currentHistoryPage;
        if (totalPagesEl) totalPagesEl.textContent = totalPages;

        if (pagi) {
            if (totalPages <= 1) pagi.classList.add("dhidden");
            else pagi.classList.remove("dhidden");
            const prevBtn = document.getElementById("history-prev");
            const nextBtn = document.getElementById("history-next");
            if (prevBtn) prevBtn.disabled = currentHistoryPage <= 1;
            if (nextBtn) nextBtn.disabled = currentHistoryPage >= totalPages;
        }
    } catch (err) { console.error("renderHistoryPage error:", err); }
}
window.prevHistoryPage = function () { if (currentHistoryPage > 1) { currentHistoryPage--; renderHistoryPage(); } };
window.nextHistoryPage = function () {
    ensureHistorySorted();
    const totalPages = Math.ceil(currentHistorySorted.length / CONFIG.HISTORY_PAGE_SIZE);
    if (currentHistoryPage < totalPages) { currentHistoryPage++; renderHistoryPage(); }
};

// ---------- 抽屉系统 ----------
const DrawerSystem = {
    current: null,
    templates: {
        shama: () => '<textarea id="kill-input" rows="3" class="dinput">' + state.killNums.join(" ") + "</textarea>",
        shengxiao: () => {
            const sxs = ["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"];
            const sel = state.selectedFilters.shengxiao;
            return '<div class="dgrid-6">' + sxs.map(sx => '<label><input type="checkbox" class="filter-checkbox hidden" value="生肖' + sx + '" data-drawer="shengxiao" ' + (sel.includes("生肖"+sx)?"checked":"") + '><span class="filter-label dbtn">' + sx + '</span></label>').join("") + '</div>';
        },
        haomatou: () => {
            const heads = [["0头单","1头单","2头单","3头单","4头单"],["0头双","1头双","2头双","3头双","4头双"]];
            const sel = state.selectedFilters.haomatou;
            return heads.map(row => '<div class="dflex">' + row.map(h => '<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="' + h + '" data-drawer="haomatou" ' + (sel.includes(h)?"checked":"") + '><span class="filter-label dbtn dbtn-sm">' + h + '</span></label>').join("") + '</div>').join("");
        },
        weishu: () => {
            const tails = [["0尾","1尾","2尾","3尾","4尾"],["5尾","6尾","7尾","8尾","9尾"]];
            const sel = state.selectedFilters.weishu;
            return tails.map(row => '<div class="dflex">' + row.map(t => '<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="' + t + '" data-drawer="weishu" ' + (sel.includes(t)?"checked":"") + '><span class="filter-label dbtn dbtn-sm">' + t + '</span></label>').join("") + '</div>').join("");
        },
        shuduan: () => {
            const sel = state.selectedFilters.shuduan;
            return '<div class="dflex-wrap">' + ["1段","2段","3段","4段","5段","6段","7段"].map(d => '<label><input type="checkbox" class="filter-checkbox hidden" value="' + d + '" data-drawer="shuduan" ' + (sel.includes(d)?"checked":"") + '><span class="filter-label dbtn dbtn-md">' + d + '</span></label>').join("") + '</div>';
        },
        bose: () => {
            const items = [["红波单","蓝波单","绿波单"],["红波双","蓝波双","绿波双"]];
            const sel = state.selectedFilters.bose;
            return items.map(row => '<div class="dflex">' + row.map(item => '<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="' + item + '" data-drawer="bose" ' + (sel.includes(item)?"checked":"") + '><span class="filter-label dbtn dbtn-sm">' + item.replace("波","") + '</span></label>').join("") + '</div>').join("");
        },
        wuxing: () => {
            const wx = { "金":"04 05 12 13 26 27 34 35 42 43", "木":"08 09 16 17 24 25 38 39 46 47", "水":"01 14 15 22 23 30 31 44 45", "火":"02 03 10 11 18 19 32 33 40 41 48 49", "土":"06 07 20 21 28 29 36 37" };
            const sel = state.selectedFilters.wuxing;
            return '<div class="dspace-y">' + Object.entries(wx).map(([k,v]) => '<div class="wuxing-row"><label class="ditems-center" style="gap:8px;min-width:0;flex-shrink:0;"><input type="checkbox" class="filter-checkbox hidden" value="' + k + '" data-drawer="wuxing" ' + (sel.includes(k)?"checked":"") + '><span class="filter-label dbtn dbtn-fixed wuxing-btn-fixed">' + k + '</span></label><span class="wuxing-nums">' + v + '</span></div>').join("") + '</div>';
        },
        bandanshuang: () => {
            const items = [["合数单","小单","大单"],["合数双","小双","大双"]];
            const sel = state.selectedFilters.bandanshuang;
            return items.map(row => '<div class="dflex">' + row.map(item => '<label class="dflex-1"><input type="checkbox" class="filter-checkbox hidden" value="' + item + '" data-drawer="bandanshuang" ' + (sel.includes(item)?"checked":"") + '><span class="filter-label dbtn dbtn-sm">' + item + '</span></label>').join("") + '</div>').join("");
        },
        heshu: () => {
            const sel = state.selectedFilters.heshu;
            return '<div class="dgrid-4">' + Array.from({length:13},(_,i)=>(i+1)+"合").map(h => '<label><input type="checkbox" class="filter-checkbox hidden" value="' + h + '" data-drawer="heshu" ' + (sel.includes(h)?"checked":"") + '><span class="filter-label dbtn dbtn-sm">' + h + '</span></label>').join("") + '</div>';
        },
        live: () => {
            return '<div class="dflex-col" style="height: calc(90vh - 68px); min-height: 480px;">' +
                '<div class="dflex-between dmb-2 dpx-1"><span class="dtext-xs dtext-gray">直连视频流播放 · 自动切换备选源</span>' +
                '<a href="https://macaujc.com/open_video2/" target="_blank" rel="noopener noreferrer" style="font-size:12px; background:rgba(0,255,234,0.2); color:#00ffea; padding:6px 12px; border-radius:8px; border:1px solid rgba(0,255,234,0.4); text-decoration:none; display:inline-flex; align-items:center; gap:4px;">' +
                '<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>新窗口观看</a></div>' +
                '<div class="dflex-wrap dmb-3" id="live-source-btns">' +
                '<button data-src-idx="0" class="dlive-btn active">源1·API获取</button>' +
                '<button data-src-idx="1" class="dlive-btn">源2·HLS</button>' +
                '<button data-src-idx="2" class="dlive-btn">源3·FLV</button></div>' +
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
        history: () => {
            let opts = "";
            for (let y = new Date().getFullYear(); y >= 2020; y--) opts += '<option value="' + y + '">' + y + "年</option>";
            return '<div><select id="historyYear" class="dselect"><option value="">选择年份</option>' + opts + "</select>" +
                '<div id="historyLoading" class="dhidden dtext-center dpy-4"><svg class="animate-spin" style="width:24px; height:24px; margin:0 auto; color:#00ffea;" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>' +
                '<div id="historyContent" class="dmt-3 hide-scrollbar"></div>' +
                '<div id="historyPagination" class="dflex-between dmt-6 dpx-1 dhidden"><button id="history-prev" class="dpage-btn">← 上1页</button>' +
                '<div class="dtext-sm" style="text-align:center;">第 <span id="historyPageNum" style="font-weight:bold; color:#00ffea;">1</span> 页 / <span id="historyTotalPages" class="dtext-gray">1</span> 页</div>' +
                '<button id="history-next" class="dpage-btn">下1页 →</button></div></div>';
        }
    },
    open(type) {
        if (this.current === type) { this.close(); return; }
        this.current = type;
        const titles = { shama:"杀码", shengxiao:"生肖", haomatou:"头数", weishu:"尾数", shuduan:"数段", bose:"波色", wuxing:"五行", bandanshuang:"半单双", heshu:"合数", live:"开奖直播", history:"历史开奖" };
        if (DOM.drawer_title) DOM.drawer_title.textContent = titles[type] || "筛选器";
        let contentDiv = DOM.drawer_content;
        if (!contentDiv) { showToast("抽屉初始化失败，请刷新页面"); return; }
        try {
            const fn = this.templates[type];
            contentDiv.innerHTML = fn ? fn() : "<p>暂无内容</p>";
        } catch (err) {
            console.error("Drawer open error:", err);
            contentDiv.innerHTML = '<p style="color:#f87171;">抽屉加载出错</p>';
        }
        if (DOM.drawer_overlay) { DOM.drawer_overlay.classList.remove("hidden"); setTimeout(() => DOM.drawer_overlay.classList.remove("opacity-0"), 10); }
        if (DOM.drawer_container) DOM.drawer_container.classList.add("open");
        this.updateNavState(type);
        if (type === "history") {
            setTimeout(() => {
                const sel = document.getElementById("historyYear");
                if (sel && !sel.value) sel.value = historyYearLoaded || "";
                if (sel) sel.dispatchEvent(new Event("change"));
            }, 50);
        }
    },
    close() {
        if (DOM.drawer_container) DOM.drawer_container.classList.remove("open");
        if (DOM.drawer_overlay) { DOM.drawer_overlay.classList.add("opacity-0"); setTimeout(() => DOM.drawer_overlay.classList.add("hidden"), 300); }
        this.current = null;
        this.updateNavState(null);
    },
    bindGlobalDelegation() {
        const content = DOM.drawer_content;
        if (!content || content._delegationBound) return;
        content._delegationBound = true;

        content.addEventListener("change", (e) => {
            const cb = e.target;
            if (!cb.classList.contains("filter-checkbox")) return;
            const dr = cb.dataset.drawer;
            if (dr && state.selectedFilters[dr] !== undefined) toggleFilter(dr, cb.value, cb.checked);
        });
        content.addEventListener("input", (e) => {
            if (e.target.id === "kill-input") {
                const { nums } = DATA.parseInput(e.target.value);
                setKillNums(nums.filter(n => n >= 1 && n <= 49));
            }
        });
        content.addEventListener("click", (e) => {
            const prevBtn = e.target.closest("#history-prev");
            const nextBtn = e.target.closest("#history-next");
            if (prevBtn) { if (currentHistoryPage > 1) { currentHistoryPage--; renderHistoryPage(); } return; }
            if (nextBtn) { ensureHistorySorted(); const totalPages = Math.ceil(currentHistorySorted.length / CONFIG.HISTORY_PAGE_SIZE); if (currentHistoryPage < totalPages) { currentHistoryPage++; renderHistoryPage(); } return; }

            const liveBtn = e.target.closest(".dlive-btn");
            if (liveBtn) {
                const idx = parseInt(liveBtn.dataset.srcIdx, 10);
                if (!isNaN(idx)) {
                    liveSourceIndex = idx;
                    document.querySelectorAll(".dlive-btn").forEach((b, i) => {
                        if (i === idx) { b.classList.add("active"); b.style.background = "#00ffea"; b.style.color = "#000"; b.style.borderColor = "#00ffea"; }
                        else { b.classList.remove("active"); b.style.background = "#1a1a2a"; b.style.color = "#9ca3af"; b.style.borderColor = "rgba(0,255,234,0.2)"; }
                    });
                    connectLiveSource(idx);
                }
                return;
            }
        });
        content.addEventListener("change", (e) => {
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
                        currentHistorySorted = []; currentHistoryPage = 1;
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
    },
    updateNavState(activeType) {
        document.querySelectorAll(".nav-item").forEach(el => {
            const dr = el.dataset.drawer;
            if (dr === activeType) { el.classList.add("bg-[#00ffea]", "text-black"); el.classList.remove("bg-[#1a1a2a]", "text-gray-400"); }
            else {
                el.classList.remove("bg-[#00ffea]", "text-black");
                if (dr === "selectnone") el.classList.add("bg-[#ff0055]/20", "text-[#ff0055]");
                else el.classList.add("bg-[#1a1a2a]", "text-gray-400");
            }
        });
    }
};

// ---------- 直播 ----------
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
function clearLiveTimer() { if (liveSourceTimer) { clearTimeout(liveSourceTimer); liveSourceTimer = null; } }
function connectLiveSource(idx) {
    if (liveSwitchLock) return;
    liveSwitchLock = true; clearLiveTimer();
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
    liveSourceTimer = setTimeout(() => { console.warn("直播源加载超时: " + src.name); liveSwitchLock = false; tryNextSource(); }, LIVE_SOURCE_TIMEOUT);
    if (src.type === "auto") {
        fetch("https://macaumarksix.com/api/live2?_t=" + Date.now())
            .then(r => r.json())
            .then(data => {
                clearLiveTimer();
                if (data && data[0] && data[0].videoUrl) playStream(data[0].videoUrl, detectStreamType(data[0].videoUrl));
                else if (idx + 1 < LIVE_SOURCES.length) setTimeout(() => { liveSwitchLock = false; connectLiveSource(idx + 1); }, 1000);
                else { liveSwitchLock = false; showLiveError(); }
            })
            .catch(() => {
                clearLiveTimer();
                if (idx + 1 < LIVE_SOURCES.length) setTimeout(() => { liveSwitchLock = false; connectLiveSource(idx + 1); }, 1000);
                else { liveSwitchLock = false; showLiveError(); }
            });
    } else if (src.url) { playStream(src.url, src.type); }
    else { clearLiveTimer(); liveSwitchLock = false; showLiveError(); }
}
function detectStreamType(url) { if (url.indexOf(".m3u8") !== -1) return "hls"; if (url.indexOf(".flv") !== -1) return "flv"; return "hls"; }
function playStream(url, type) {
    const video = document.getElementById("live-video");
    const loading = document.getElementById("live-loading");
    if (!video) { liveSwitchLock = false; return; }
    if (type === "hls" && window.Hls && Hls.isSupported()) {
        currentHls = new Hls({ enableWorker: true, lowLatencyMode: true });
        currentHls.loadSource(url); currentHls.attachMedia(video);
        currentHls.on(Hls.Events.MANIFEST_PARSED, () => { clearLiveTimer(); liveSwitchLock = false; if (loading) loading.classList.add("dhidden"); video.play().catch(()=>{}); });
        currentHls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) { clearLiveTimer(); liveSwitchLock = false; tryNextSource(); } });
    } else if (type === "flv" && window.flvjs && flvjs.isSupported()) {
        currentFlvPlayer = flvjs.createPlayer({ type: "flv", url, isLive: true });
        currentFlvPlayer.attachMediaElement(video); currentFlvPlayer.load(); currentFlvPlayer.play();
        currentFlvPlayer.on(flvjs.Events.LOADING_COMPLETE, () => { clearLiveTimer(); liveSwitchLock = false; if (loading) loading.classList.add("dhidden"); });
        currentFlvPlayer.on(flvjs.Events.ERROR, () => { clearLiveTimer(); liveSwitchLock = false; tryNextSource(); });
        setTimeout(() => { if (loading) loading.classList.add("dhidden"); }, 3000);
    } else {
        video.src = url;
        video.addEventListener("loadedmetadata", () => { clearLiveTimer(); liveSwitchLock = false; if (loading) loading.classList.add("dhidden"); });
        video.addEventListener("error", () => { clearLiveTimer(); liveSwitchLock = false; tryNextSource(); });
        video.play().catch(()=>{});
    }
}
function tryNextSource() {
    clearLiveTimer(); destroyLivePlayer();
    if (liveSourceIndex + 1 < LIVE_SOURCES.length) {
        liveSourceIndex++;
        document.querySelectorAll(".dlive-btn").forEach((b, i) => {
            if (i === liveSourceIndex) { b.classList.add("active"); b.style.background = "#00ffea"; b.style.color = "#000"; b.style.borderColor = "#00ffea"; }
            else { b.classList.remove("active"); b.style.background = "#1a1a2a"; b.style.color = "#9ca3af"; b.style.borderColor = "rgba(0,255,234,0.2)"; }
        });
        connectLiveSource(liveSourceIndex);
    } else { showLiveError(); }
}
function showLiveError() { clearLiveTimer(); liveSwitchLock = false; const loading = document.getElementById("live-loading"); const error = document.getElementById("live-error"); if (loading) loading.classList.add("dhidden"); if (error) error.classList.remove("dhidden"); }
function destroyLivePlayer() { clearLiveTimer(); if (currentHls) { currentHls.destroy(); currentHls = null; } if (currentFlvPlayer) { currentFlvPlayer.destroy(); currentFlvPlayer = null; } const video = document.getElementById("live-video"); if (video) { video.pause(); video.removeAttribute("src"); video.load(); } }

// ---------- 自动刷新 ----------
function initAutoRefresh() {
    setInterval(() => {
        if (isCurrentDrawComplete) return;
        const now = new Date();
        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        const totalSec = h * 3600 + m * 60 + s;
        const startSec = 21 * 3600 + 33 * 60 + 20;
        const endSec = 21 * 3600 + 35 * 60 + 0;
        if (document.visibilityState === "visible" && totalSec >= startSec && totalSec <= endSec) fetchLottery();
    }, 1000);
}

// ---------- 初始化 ----------
function init() {
    cacheDOM();
    loadState();
    initWorker();
    subscribe(onStateChange);
    initResultDelegation();
    DrawerSystem.bindGlobalDelegation();

    if (DOM.exampleBtn) DOM.exampleBtn.addEventListener("click", () => { if (DOM.numbers) DOM.numbers.value = "龙蛇马 12 25 36 8 17 29 41 5 19 33 47"; runAnalysis(); });
    if (DOM.clearBtn) DOM.clearBtn.addEventListener("click", () => { if (DOM.numbers) DOM.numbers.value = ""; runAnalysis(); showToast("已清空输入"); });
    if (DOM.copyResultBtn) DOM.copyResultBtn.addEventListener("click", copyResult);
    if (DOM.numbers) DOM.numbers.addEventListener("input", runAnalysis);
    if (DOM.refreshLotteryBtn) DOM.refreshLotteryBtn.addEventListener("click", fetchLottery);

    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const drawer = btn.dataset.drawer;
            if (drawer === "selectnone") {
                clearAllFilters();
                const killInput = document.getElementById("kill-input");
                if (killInput) killInput.value = "";
                DrawerSystem.close();
                showToast("已清空所有筛选");
            } else { DrawerSystem.open(drawer); }
        });
    });
    if (DOM.drawer_close) DOM.drawer_close.addEventListener("click", () => DrawerSystem.close());
    if (DOM.drawer_overlay) DOM.drawer_overlay.addEventListener("click", () => DrawerSystem.close());

    fetchLottery();
    runAnalysis();
    initAutoRefresh();

    window.addEventListener("beforeunload", () => terminateWorker());
    console.log("%c✅ 神码再现 v3.5.3 完整功能版已加载", "color:#00ffea;font-weight:bold");
}
document.addEventListener("DOMContentLoaded", init);
