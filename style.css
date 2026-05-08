/* ======================== style.css — 神码再现 v3.5.3 完整样式 ======================== */
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body {
  font-family: 'Orbitron', system-ui, sans-serif;
  background: radial-gradient(circle at 20% 80%, rgba(0,255,234,0.1) 0%, transparent 50%),
              radial-gradient(circle at 80% 20%, rgba(255,0,85,0.1) 0%, transparent 50%),
              linear-gradient(135deg, #050510 0%, #0a0a1a 30%, #151525 100%);
  min-height: 100vh; padding-bottom: 110px; touch-action: manipulation; color: #e0e0ff;
}

.mech-grid::before {
  content: ''; position: fixed; inset: 0;
  background-image: linear-gradient(rgba(0,255,234,0.05) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0,255,234,0.05) 1px, transparent 1px);
  background-size: 30px 30px; pointer-events: none; z-index: -1;
}

/* ---------- 抽屉布局类（完全不依赖 Tailwind） ---------- */
.dgrid-6 { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
.dgrid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.dflex { display: flex; gap: 8px; margin-bottom: 8px; }
.dflex-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
.dflex-between { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.dflex-col { display: flex; flex-direction: column; }
.dflex-1 { flex: 1 1 0%; }
.ditems-center { display: flex; align-items: center; }
.dspace-y > * + * { margin-top: 8px; }
.dmb-2 { margin-bottom: 8px; }
.dmb-3 { margin-bottom: 12px; }
.dmt-3 { margin-top: 12px; }
.dmt-6 { margin-top: 24px; }
.dpx-1 { padding-left: 4px; padding-right: 4px; }
.dpy-4 { padding-top: 16px; padding-bottom: 16px; }
.dpb-20 { padding-bottom: 80px; }

.dbtn {
  display: block; text-align: center; padding: 8px 0; background: #1a1a2a;
  border-radius: 8px; font-size: 14px; color: #9ca3af;
  border: 1px solid rgba(0, 255, 234, 0.2); cursor: pointer; transition: all 0.2s;
  user-select: none; -webkit-user-select: none;
}
.dbtn-sm { padding: 6px 0; font-size: 12px; }
.dbtn-md { padding: 8px 16px; font-size: 14px; }
.dbtn-fixed { width: 3rem; min-width: 3rem; flex: none; padding: 8px 0; }

.dinput {
  width: 100%; background: #1a1a2a; border: 1px solid rgba(0, 255, 234, 0.3);
  border-radius: 8px; padding: 12px; color: #00ffea; font-family: monospace; font-size: 14px;
  resize: vertical; outline: none;
}
.dselect {
  width: 100%; background: #1a1a2a; border: 1px solid rgba(0, 255, 234, 0.3);
  border-radius: 8px; padding: 12px; color: #00ffea; font-size: 16px; outline: none;
}
.dtext-xs { font-size: 12px; }
.dtext-sm { font-size: 14px; }
.dtext-gray { color: #9ca3af; }
.dhidden { display: none !important; }

.dpage-btn {
  padding: 12px 24px; background: #1a1a2a; color: #00ffea; border-radius: 16px;
  font-size: 14px; font-weight: 500; border: none; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
}
.dpage-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.dpage-btn:hover:not(:disabled) { background: rgba(0, 255, 234, 0.1); }

.dlive-btn {
  padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500;
  border: 1px solid rgba(0, 255, 234, 0.2); cursor: pointer; background: #1a1a2a; color: #9ca3af;
}
.dlive-btn.active { background: #00ffea; color: #000; border-color: #00ffea; }

.dvideo-box {
  position: relative; flex: 1; background: #000; border-radius: 16px;
  overflow: hidden; border: 1px solid rgba(0, 255, 234, 0.4);
  box-shadow: 0 10px 40px rgba(0,0,0,0.8);
}
.doverlay {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; z-index: 10;
}

/* ---------- 3D 号码球（分析结果区） ---------- */
.ball-3d {
  position: relative; width: 36px; height: 36px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font: 700 14px/1 'Orbitron', sans-serif; color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5); cursor: pointer; user-select: none;
  overflow: visible; transition: transform .25s cubic-bezier(.175, .885, .32, 1.275);
  transform: translateZ(0);
  background:
    radial-gradient(circle at 35% 25%, rgba(255,255,255,.95) 0%, transparent 25%),
    radial-gradient(circle at 50% 30%, rgba(255,255,255,.4) 0%, transparent 40%),
    radial-gradient(circle at 50% 100%, rgba(0,0,0,.4) 0%, transparent 60%),
    linear-gradient(135deg, #4488ff 0%, #2244cc 60%, #112288 100%);
  border: none;
  box-shadow: 0 4px 8px rgba(0,0,0,.5), 0 8px 16px rgba(0,0,0,.3),
              inset 0 -3px 8px rgba(0,0,0,.3), inset 0 3px 8px rgba(255,255,255,.4);
}
.ball-3d::after {
  content: ''; position: absolute; z-index: -1; left: 10%; top: 10%;
  width: 80%; height: 80%; border-radius: 50%; background: rgba(0,0,0,.35);
  filter: blur(8px); transform: translate(6px, 6px); pointer-events: none;
}
.ball-3d:active { transform: scale(0.92) translateZ(0); }

.ball-red {
  background: radial-gradient(circle at 65% 25%, rgba(255,255,255,.8) 0%, transparent 35%),
              radial-gradient(circle at 50% 30%, rgba(255,255,255,.2) 0%, transparent 40%),
              radial-gradient(circle at 50% 100%, rgba(0,0,0,.4) 0%, transparent 60%),
              linear-gradient(135deg, #ff3333 0%, #cc0000 60%, #990000 100%);
}
.ball-green {
  background: radial-gradient(circle at 65% 25%, rgba(255,255,255,.8) 0%, transparent 35%),
              radial-gradient(circle at 50% 30%, rgba(255,255,255,.2) 0%, transparent 40%),
              radial-gradient(circle at 50% 100%, rgba(0,0,0,.4) 0%, transparent 60%),
              linear-gradient(135deg, #33cc33 0%, #118811 60%, #005500 100%);
}
.ball-blue {
  background: radial-gradient(circle at 65% 25%, rgba(255,255,255,.8) 0%, transparent 35%),
              radial-gradient(circle at 50% 30%, rgba(255,255,255,.2) 0%, transparent 40%),
              radial-gradient(circle at 50% 100%, rgba(0,0,0,.4) 0%, transparent 60%),
              linear-gradient(135deg, #4488ff 0%, #2244cc 60%, #112288 100%);
}
.ball-gray { background: #666 !important; box-shadow: 0 0 4px rgba(0,0,0,0.5) !important; filter: none !important; }
.ball-gray::after { display: none; }

.hit-mark {
  position: absolute; bottom: 1px; right: 3px; color: #ffeb3b;
  font-size: 10px; font-weight: 900; font-family: monospace; z-index: 2;
  text-shadow: 0 0 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.7), -1px -1px 0 rgba(0,0,0,0.5);
  pointer-events: none;
}
.hit-mark.cross { color: #ff3333; font-size: 14px; bottom: -1px; right: 2px; }

#result .ball-3d { width: 32px; height: 32px; font-size: 12px; }
#result .ball-3d::after { filter: blur(6px); transform: translate(4px, 4px); }
#result .ball-3d .hit-mark { font-size: 9px; bottom: 0px; right: 2px; }
#result .ball-3d .hit-mark.cross { font-size: 12px; bottom: -2px; right: 1px; }

@keyframes flashPulse {
  0%, 100% { opacity: 1; filter: brightness(1) saturate(1); transform: scale(1); }
  50% { opacity: 0.7; filter: brightness(1.3) saturate(1.2); transform: scale(1.15); }
}
.flash-unique {
  animation: flashPulse 0.6s ease-in-out infinite;
  box-shadow: 0 0 20px currentColor, 0 0 40px currentColor !important; z-index: 10;
}

.kill-line::before, .kill-line::after {
  content: '✂'; position: absolute; top: 50%; transform: translateY(-50%);
  color: #b5443a; font-size: 1.2rem; animation: scissor 2s ease-in-out infinite;
}
.kill-line::before { left: 0; }
.kill-line::after { right: 0; }

/* ---------- 底部导航与抽屉 ---------- */
.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
  background: #0a0a12cc; backdrop-filter: blur(12px);
  border-top: 1px solid rgba(0,255,234,0.4);
  padding: 8px; padding-bottom: env(safe-area-inset-bottom, 8px);
}
.nav-grid {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;
  max-width: 680px; margin: 0 auto;
}
.bottom-nav .nav-item {
  transition: all 0.2s; cursor: pointer; user-select: none; -webkit-user-select: none;
  padding: 10px 4px; text-align: center; font-size: 12px; color: #aaa;
  background: #1a1a2a; border-radius: 8px; border: 1px solid rgba(0,255,234,0.2);
}
.bottom-nav .nav-item:hover, .bottom-nav .nav-item.active {
  background: #00ffea; color: #000; border-color: #00ffea;
}

.drawer-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 1100;
  opacity: 0; transition: opacity 0.3s;
}
.drawer-overlay:not(.hidden) { opacity: 1; }

.drawer-mobile {
  position: fixed; left: 0; right: 0; bottom: 0;
  background: #111118; border-top-left-radius: 20px; border-top-right-radius: 20px;
  transform: translateY(100%); transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
  z-index: 1200; max-height: 85vh; overflow-y: auto;
}
.drawer-mobile.open { transform: translateY(0); }

.drawer-header {
  padding: 16px 20px; border-bottom: 1px solid rgba(0,255,234,0.2);
  display: flex; justify-content: space-between; align-items: center;
  background: #1a1a2a; position: sticky; top: 0; z-index: 10;
}

.filter-checkbox:checked + .filter-label {
  background: linear-gradient(135deg, rgba(0,255,234,0.9) 0%, rgba(0,102,255,0.9) 100%) !important;
  color: #000 !important; box-shadow: 0 0 10px rgba(0,255,234,0.4) !important;
  border-color: transparent !important;
}
.filter-checkbox:checked + .dbtn {
  background: linear-gradient(135deg, rgba(0,255,234,0.9) 0%, rgba(0,102,255,0.9) 100%) !important;
  color: #000 !important; box-shadow: 0 0 10px rgba(0,255,234,0.4) !important;
  border-color: transparent !important;
}

.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.lottery-card {
  background: rgba(30, 35, 50, 0.65); border-radius: 24px; padding: 18px;
  border: 1px solid rgba(100, 120, 150, 0.3); backdrop-filter: blur(12px);
}
.refresh-btn-orange {
  background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%); color: #1a1a2e;
  border: none; padding: 12px 32px; border-radius: 40px; font-weight: bold; font-size: 16px;
  display: flex; align-items: center; gap: 8px; margin: 20px auto 0;
  box-shadow: 0 4px 10px rgba(251,191,36,0.3); cursor: pointer; touch-action: manipulation;
}
.refresh-btn-orange:active { transform: scale(0.96); }

/* ---------- 开奖结果蛋形球 ---------- */
.result-balls-row {
  display: flex; align-items: center; justify-content: center; gap: 18px; flex-wrap: wrap;
}
.result-ball-item { display: flex; flex-direction: column; align-items: center; position: relative; }
.result-ball {
  width: 67px; height: 88px; border-radius: 50% 50% 50% 50% / 55% 55% 45% 45%;
  display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
  padding-top: 14px; font-size: 28px; font-weight: 700; color: #fff;
  text-shadow: 0 2px 5px rgba(0,0,0,0.4);
  box-shadow: inset 0 -5px 12px rgba(0,0,0,0.35), inset 0 5px 12px rgba(255,255,255,0.3), 0 4px 14px rgba(0,0,0,0.45);
  position: relative; overflow: hidden;
  animation: ballAppear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  opacity: 0; transform: scale(0);
}
.result-ball::after {
  content: ''; position: absolute; top: 6%; left: 18%; width: 30%; height: 18%;
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.7) 0%, transparent 65%);
  border-radius: 50%; pointer-events: none;
}
.result-ball-red {
  background: radial-gradient(ellipse at 50% 25%, rgba(255,255,255,0.22) 0%, transparent 50%),
              linear-gradient(180deg, #ff5555 0%, #dd1111 45%, #aa0000 100%);
}
.result-ball-green {
  background: radial-gradient(ellipse at 50% 25%, rgba(255,255,255,0.22) 0%, transparent 50%),
              linear-gradient(180deg, #44dd44 0%, #229922 45%, #116611 100%);
}
.result-ball-blue {
  background: radial-gradient(ellipse at 50% 25%, rgba(255,255,255,0.22) 0%, transparent 50%),
              linear-gradient(180deg, #5599ff 0%, #2244cc 45%, #112288 100%);
}
.result-plus-sign { font-size: 26px; font-weight: 400; color: #fff; margin: 0 1px; align-self: center; padding-bottom: 16px; }
.result-ball-meta {
  position: absolute; bottom: 7px; left: 50%; transform: translateX(-50%);
  font-size: 15px; font-weight: 600; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.9);
  white-space: nowrap; letter-spacing: 0.2px;
}
.wx-gold { color: #FFD700; } .wx-wood { color: #32CD32; }
.wx-water { color: #00BFFF; } .wx-fire { color: #FF4444; } .wx-earth { color: #CD853F; }

@keyframes ballAppear {
  0% { transform: scale(0) rotate(-180deg); opacity: 0; }
  60% { transform: scale(1.15) rotate(10deg); opacity: 1; }
  80% { transform: scale(0.95) rotate(-5deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

/* ---------- 历史记录 ---------- */
.history-ball-card {
  display: flex; flex-direction: column; align-items: center; min-width: 40px;
  border-radius: 6px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.3); flex-shrink: 0;
}
.history-ball-number { width: 100%; text-align: center; font-size: 18px; font-weight: 900; color: #fff; padding: 5px 2px; line-height: 1; }
.history-ball-red { background: linear-gradient(180deg, #ff4444 0%, #dd0000 100%); }
.history-ball-blue { background: linear-gradient(180deg, #4488ff 0%, #0055dd 100%); }
.history-ball-green { background: linear-gradient(180deg, #44bb44 0%, #008822 100%); }
.history-ball-tag { width: 100%; background: #fff; text-align: center; font-size: 9px; font-weight: 700; color: #333; padding: 2px 1px; line-height: 1.2; white-space: nowrap; }
.history-plus-sign { display: flex; align-items: center; font-size: 20px; font-weight: 900; color: #aaa; padding: 0 2px; align-self: center; }
.history-item {
  background: #0f0f1a; border: 1px solid rgba(0,255,234,0.1); border-radius: 10px;
  padding: 10px; margin-bottom: 8px; min-width: 0; overflow: hidden;
}
.history-item-header { font-size: 12px; color: #00ffea; margin-bottom: 8px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.history-balls-row {
  display: flex; justify-content: flex-start; align-items: stretch; gap: 3px;
  flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px;
}
#historyContent { contain: content; will-change: scroll-position; max-height: 50vh; overflow-y: auto; }

/* ---------- 独苗飞入动画 ---------- */
.flying-unique-ball {
  position: fixed; width: 48px; height: 48px; border-radius: 50%; z-index: 9999;
  pointer-events: none; display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 900; font-size: 18px; font-family: 'Orbitron', sans-serif;
  will-change: transform;
  box-shadow: 0 0 30px currentColor, 0 0 60px currentColor, inset 0 0 12px rgba(255,255,255,0.6);
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
}
.flying-trail {
  position: fixed; width: 6px; height: 6px; border-radius: 50%;
  pointer-events: none; z-index: 9998; opacity: 0.7;
}
.landing-shock { animation: landShake 0.4s ease !important; }
@keyframes landShake {
  0% { transform: scale(1); } 25% { transform: scale(1.3) rotate(-5deg); }
  50% { transform: scale(0.9) rotate(3deg); } 75% { transform: scale(1.1) rotate(-2deg); }
  100% { transform: scale(1) rotate(0); }
}

/* ---------- Toast ---------- */
.toast {
  position: fixed; bottom: 80px; left: 50%;
  transform: translateX(-50%) translateY(30px);
  background: rgba(0,255,234,0.95); color: #000;
  padding: 12px 24px; border-radius: 9999px; font-weight: 600;
  white-space: nowrap; z-index: 9999;
  transition: all 0.3s ease;
  box-shadow: 0 10px 30px rgba(0,255,234,0.3);
}

/* ---------- 五行抽屉修复 ---------- */
.wuxing-row { display: flex; align-items: center; gap: 12px; min-width: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.wuxing-row::-webkit-scrollbar { display: none; }
.wuxing-nums { font-size: 14px; color: rgba(0, 255, 234, 0.7); white-space: nowrap; flex-shrink: 0; user-select: text; }
.wuxing-btn-fixed { width: 3rem !important; min-width: 3rem !important; flex: none !important; }

/* ---------- 小屏适配 ---------- */
@media (max-width: 420px) {
  .result-ball { width: 42px; height: 56px; font-size: 15px; padding-top: 10px; }
  .result-balls-row { gap: 4px; } .result-plus-sign { font-size: 20px; padding-bottom: 10px; }
  .result-ball-meta { font-size: 9px; bottom: 7px; }
  .history-ball-card { min-width: 36px; } .history-ball-number { font-size: 15px; padding: 4px 1px; }
  .history-ball-tag { font-size: 9px; padding: 1px; } .history-plus-sign { font-size: 16px; padding: 0 1px; }
  .history-balls-row { gap: 2px; } .history-item { padding: 8px 6px; }
  .history-item-header { font-size: 11px; margin-bottom: 6px; }
  .dgrid-6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 360px) {
  .result-ball { width: 38px; height: 50px; font-size: 16px; padding-top: 8px; }
  .result-balls-row { gap: 3px; } .result-plus-sign { font-size: 18px; padding-bottom: 8px; }
  .result-ball-meta { font-size: 9px; bottom: 6px; }
  .history-ball-card { min-width: 32px; } .history-ball-number { font-size: 13px; padding: 3px 1px; }
  .history-ball-tag { font-size: 8px; } .history-plus-sign { font-size: 14px; }
  .history-balls-row { gap: 1px; } .history-item-header { font-size: 10px; }
  .wuxing-btn-fixed { width: 2.5rem !important; min-width: 2.5rem !important; font-size: 11px; }
  .dbtn-fixed { width: 2.5rem !important; min-width: 2.5rem !important; }
}
