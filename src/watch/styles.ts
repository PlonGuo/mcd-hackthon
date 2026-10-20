export const watchCss = `
:root{
  color-scheme:dark;
  font-family:"PingFang SC","Microsoft YaHei",Arial,sans-serif;
  color:#f7f3eb;background:#0c0d10;line-height:1.7;
  --base:#0c0d10;--surface:#19191f;--red:#ff493b;--red-text:#ff8273;
  --yellow:#ffc72c;--ink:#f7f3eb;--muted:#bdb6b2;--line:#ffc72c24;
}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse at 0 12%,#7d1c2029,transparent 45%),radial-gradient(ellipse at 100% 58%,#9b6b1414,transparent 45%)}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background-image:radial-gradient(#ffc72c24 .7px,transparent .8px);background-size:28px 28px;opacity:.36}
main{position:relative;max-width:1240px;margin:auto;padding:0 44px 28px}
p,h1,h2,h3{overflow-wrap:anywhere}[hidden]{display:none!important}
::selection{color:#180c0b;background:var(--yellow)}

/* Red and yellow belong to the two contenders, from the stage to the verdict. */
.site-header{position:relative;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:25px 0;border-bottom:1px solid var(--line)}
.site-header::after{content:"";position:absolute;bottom:-1px;left:0;width:98px;height:3px;background:linear-gradient(90deg,var(--red) 48%,transparent 48% 52%,var(--yellow) 52%)}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none}
.brand-name{font:800 26px/1 Arial,sans-serif;letter-spacing:-1.2px}
.brand-caption{font-size:12px;color:var(--muted);margin-left:9px;padding-left:18px;border-left:1px solid var(--line)}
.brand-mark{position:relative;display:block;width:30px;height:30px;margin-right:2px}
.brand-mark::before,.brand-mark::after{content:"";position:absolute;width:21px;height:21px;border-radius:6px 6px 6px 1px}
.brand-mark::before{background:var(--yellow);top:0;left:0;box-shadow:0 0 22px #ffc72c20}
.brand-mark::after{background:var(--red);right:0;bottom:0;border:2px solid var(--base)}
#connection{display:flex;align-items:center;gap:8px;flex-shrink:0;font-size:11px;color:var(--muted)}
#connection::before{content:"";width:6px;height:6px;flex-shrink:0;background:#8d807d;border-radius:50%}
#connection[data-state="live"]{color:var(--yellow)}
#connection[data-state="live"]::before{background:var(--yellow);box-shadow:0 0 0 4px #ffc72c12,0 0 12px #ffc72c60}

.arena{isolation:isolate;position:relative;text-align:center;margin-top:28px;padding:32px 32px 0;border:1px solid #ffc72c32;border-radius:24px 24px 10px 10px;overflow:hidden;background:radial-gradient(ellipse at 15% 55%,#a51e283b,transparent 53%),radial-gradient(ellipse at 88% 55%,#9f681c33,transparent 53%),#141419;box-shadow:0 20px 70px #0003,inset 0 1px #ffffff06}
.arena::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:radial-gradient(#e8a36338 .8px,transparent 1px);background-size:22px 22px;mask-image:linear-gradient(transparent,#000 35%,transparent 90%)}
.arena::after{content:"";position:absolute;top:0;left:8%;right:8%;height:2px;background:linear-gradient(90deg,transparent,var(--red) 20%,#9e4928 50%,var(--yellow) 80%,transparent);box-shadow:0 0 20px #ff693d50}
.intro{display:flex;justify-content:center;align-items:center;gap:10px;margin:0 0 12px;font-size:11px;color:#e3bd8a;letter-spacing:.5px}
.intro span{color:#aa6949;margin:0 2px}
h1{font-size:clamp(30px,4.3vw,48px);font-weight:800;line-height:1.35;letter-spacing:-1.8px;margin:0;text-wrap:balance}
.match{display:grid;grid-template-columns:minmax(0,1fr) 94px minmax(0,1fr);align-items:center;gap:16px;max-width:800px;margin:20px auto 26px}
.contender{--side:var(--red-text);--particle-ink:#ff8b7b;position:relative;padding:0 12px;min-width:0}
.contender.b{--side:var(--yellow);--particle-ink:#ffdf72}
.portrait{position:relative;width:190px;height:132px;max-width:100%;margin:auto}
.portrait::before{content:"";position:absolute;inset:4px 15px 3px;border:1px solid var(--side);border-bottom:0;border-radius:100px 100px 0 0;opacity:.24;mask-image:linear-gradient(#000,transparent 94%);pointer-events:none}
.portrait::after{content:"";position:absolute;bottom:5px;left:36%;right:36%;height:1px;background:var(--side);opacity:.4;box-shadow:0 0 12px var(--side)}
.particles{position:absolute;inset:0;pointer-events:none}.particles canvas{display:block;width:100%;height:100%}
.avatar{position:absolute;inset:0;display:grid;place-items:center;font:800 78px/1 Arial,sans-serif;color:var(--side)}
.portrait.has-particles .avatar{visibility:hidden}
.side-label{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:650;color:var(--side);letter-spacing:1px;margin-top:7px}
.side-label::before{content:"";width:14px;height:3px;background:currentColor;border-radius:1px}
.contender h2{font-size:21px;line-height:1.5;font-weight:650;letter-spacing:-.5px;margin:4px 0}
.agent-label{font-size:11px;color:var(--muted);margin:0}
.candidate{display:table;margin:12px auto 0;font-size:13px;font-weight:600;padding:3px 12px;color:var(--side);border-left:2px solid currentColor;background:#0d0e1266;text-align:left}
.contender-state{display:inline-flex;justify-content:center;align-items:center;gap:6px;font-size:10px;color:var(--muted);margin-top:12px;padding:3px 10px;min-height:25px;border-radius:4px;border:1px solid #ffffff12;background:#0e0f124d}
.contender.active .contender-state{color:var(--red-text);border-color:#ff493b66;background:#ff493b18}
.contender.b.active .contender-state{color:var(--yellow);border-color:#ffc72c66;background:#ffc72c13}
.contender.active .contender-state::before{content:"";width:4px;height:4px;background:currentColor;box-shadow:0 0 9px currentColor;border-radius:50%}
.contender.is-winner .contender-state{color:#291309;font-weight:700;background:var(--yellow);border-color:var(--yellow);box-shadow:0 0 24px #ffc72c18}
.versus{position:relative;align-self:stretch;display:grid;place-items:center}
.versus::before{content:"";position:absolute;inset:8px auto 8px;width:1px;background:linear-gradient(transparent,#ff493b60 25%,#ffc72c50 70%,transparent)}
.versus>span{position:relative;z-index:1;display:grid;place-items:center;width:78px;height:64px;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);background:linear-gradient(135deg,#78261f,#392713);font:italic 900 43px/1 Arial,sans-serif;letter-spacing:-4px;color:var(--yellow);text-shadow:3px 3px var(--red);padding-right:5px}
.stage-status{border-top:1px solid var(--line);padding:15px 24px;margin:0 -32px;display:flex;align-items:center;justify-content:space-between;gap:20px;text-align:left;background:#0c0d10d9}
.phase{margin:0;font-size:12px;font-weight:500;color:#e6cbb6}
.turn-progress{display:flex;gap:18px;align-items:center;flex-shrink:0}
#progress{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.turns{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px;max-width:155px}
.turns span{height:4px;width:35px;border-radius:1px;background:#4a322d}
.turns .done.side-a,.turns .current.side-a{background:var(--red);box-shadow:0 0 10px #ff493b25}
.turns .done.side-b,.turns .current.side-b{background:var(--yellow);box-shadow:0 0 10px #ffc72c25}
.turns .current{outline:1px solid #bdb6b277;outline-offset:3px}

/* One column per contender on desktop; natural reading order on a phone. */
.watch-layout{display:grid;grid-template-columns:minmax(0,1fr) 284px;gap:32px;align-items:start;margin-top:36px}
.watch-layout:has(#shopping[hidden]){grid-template-columns:minmax(0,1fr)}
.debate-column{min-width:0}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}
.section-heading h2{font-size:18px;line-height:1.5;font-weight:650;letter-spacing:-.4px;margin:0;color:var(--yellow)}
.section-heading>span{font-size:11px;color:var(--muted);flex-shrink:0}
.section-subtitle{display:block;font-size:11px;font-weight:400;color:var(--muted);letter-spacing:0;margin-top:4px}
#empty{font-size:13px;color:var(--muted);padding:32px 20px;text-align:center;border:1px dashed #ffc72c35;border-radius:10px;background:#19191f99}
#messages{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;list-style:none;padding:0;margin:0}
#messages>li{min-width:0;border:1px solid #ff493b3b;border-top:2px solid var(--red);border-radius:4px 14px 14px 14px;padding:18px 20px;overflow-wrap:anywhere;scroll-margin-bottom:22px;background:linear-gradient(135deg,#2c191e,#19191f 80%);box-shadow:0 8px 28px #0002}
#messages>li.message-b{border-color:#ffc72c35;border-top-color:var(--yellow);border-radius:14px 4px 14px 14px;background:linear-gradient(135deg,#292316,#1d1b18 80%)}
.message-meta{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;line-height:1.5;color:var(--red-text)}
.message-meta::before{content:"A";display:grid;place-items:center;width:24px;height:24px;border-radius:5px;background:var(--red);color:#1d090b;font:800 12px/1 Arial,sans-serif;flex-shrink:0}
.message-b .message-meta{color:var(--yellow)}
.message-b .message-meta::before{content:"B";color:#241b0b;background:var(--yellow)}
.message-round{font-size:10px;font-weight:400;color:var(--muted);margin-left:auto;white-space:nowrap}
.bubble{margin-top:14px;white-space:pre-wrap;font-size:14px;line-height:1.95;color:#e9e4de}
.waiting{display:flex;align-items:center;gap:12px;width:fit-content;max-width:100%;padding:12px 16px;margin:16px 0 0;border:1px solid #ff493b40;border-radius:7px;color:var(--red-text);background:#2b1518;font-size:11px;scroll-margin-bottom:24px}
.waiting.message-b{margin-left:auto;color:var(--yellow);border-color:#ffc72c40;background:#2b2315}
.dots{display:flex;gap:4px;flex-shrink:0}.dots span{width:4px;height:4px;border-radius:50%;background:currentColor;animation:waiting-bounce 1.2s ease-in-out infinite}.dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}
@keyframes waiting-bounce{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-4px);opacity:1}}
#notice{font-size:13px;padding:12px 16px;border:1px solid #ff493b44;border-left:3px solid var(--red);background:#2c191e;color:#ffb7a9}

/* The verdict is the climax. The numbers are actual judge scores, never decoration. */
#judgement{position:relative;margin-top:32px;border:1px solid #ffc72c54;border-top:3px solid var(--yellow);border-radius:14px;padding:24px;background:radial-gradient(ellipse at 100% 0,#ffc72c16,transparent 55%),radial-gradient(ellipse at 0 0,#ff493b16,transparent 50%),#19191f;box-shadow:0 12px 40px #0003}
#judgement .section-heading{margin-bottom:26px}
.result-lead{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:24px}
.result-title{min-width:0}.result-kicker{font-size:11px;color:var(--muted);margin:0 0 6px}
#winner{font-size:29px;line-height:1.5;letter-spacing:-1px;font-weight:750;color:var(--red-text);margin:0}
#judgement[data-winner-side="b"] #winner{color:var(--yellow)}
.scoreboard{display:grid;grid-template-columns:minmax(0,1fr) 16px minmax(0,1fr);gap:16px;align-items:start;min-width:215px}
.final-score{display:flex;flex-direction:column;align-items:center;min-width:0}
.final-score strong{font:800 62px/1.1 Arial,sans-serif;letter-spacing:-3px;font-variant-numeric:tabular-nums}
.final-score.side-a strong{color:var(--red-text);text-shadow:0 0 32px #ff493b25}
.final-score.side-b strong{color:var(--yellow);text-shadow:0 0 32px #ffc72c20}
.final-score>span{font-size:11px;color:var(--muted);margin-top:9px;max-width:95px;text-align:center;overflow-wrap:anywhere}
.score-separator{font:400 32px/1.8 Arial,sans-serif;color:#9c7152;text-align:center}
#summary{font-size:13px;line-height:1.85;margin:24px 0;padding-top:20px;border-top:1px solid var(--line);color:#e9e4de}
#tie-break{font-size:12px;background:#ffc72c0b;border-left:2px solid var(--yellow);padding:12px;margin:0 0 20px}
#scores{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}
.score-row{min-width:0}.score-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:12px;font-weight:600;color:var(--red-text)}
.score-row.side-b .score-top{color:var(--yellow)}
.score-top span:last-child{font-size:11px;font-weight:400;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.score-meter{appearance:none;display:block;width:100%;height:5px;border:0;overflow:hidden;border-radius:2px;margin:11px 0 10px;background:#383033}
.score-meter::-webkit-progress-bar{background:#383033}.score-meter::-webkit-progress-value{background:var(--red)}.score-meter::-moz-progress-bar{background:var(--red)}
.side-b .score-meter::-webkit-progress-value{background:var(--yellow)}.side-b .score-meter::-moz-progress-bar{background:var(--yellow)}
.score-meter.reveal{animation:score-reveal .6s ease-out}@keyframes score-reveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
.score-detail,.score-reason{font-size:11px;color:var(--muted);margin:6px 0;line-height:1.8}
#round-comments{border-top:1px solid var(--line);padding:18px 0 0;list-style:none;margin:20px 0 0;font-size:12px;color:var(--muted)}
#round-comments li+li{margin-top:7px}.footnote{font-size:11px;line-height:1.8;color:var(--muted);margin:12px 0 0}

/* A yellow ticket header anchors the shared meal without a bright white panel. */
#shopping{min-width:0;border:1px solid #ffc72c55;border-radius:4px 16px 12px 12px;background:linear-gradient(160deg,#29241c,#19191e 60%);box-shadow:0 10px 35px #0003;overflow:hidden}
.shopping-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;list-style:none;cursor:pointer;padding:20px;background:var(--yellow);color:#321709;border-bottom:4px solid #a72c22;transition:background .15s ease}
.shopping-heading:hover{background:#ffd354}
.shopping-heading::-webkit-details-marker{display:none}
.receipt-title{font-size:18px;font-weight:750;letter-spacing:-.4px}
.receipt-caption{display:block;font-size:11px;font-weight:400;color:#67400e;letter-spacing:0;margin-top:3px}
.receipt-overview{display:flex;align-items:center;gap:12px}
#cart-summary{font-size:11px;color:#5b350b;white-space:nowrap}
.receipt-toggle{width:7px;height:7px;border-bottom:1.5px solid #63330a;border-right:1.5px solid #63330a;transform:rotate(45deg);margin-top:-4px}
#shopping-details[open] .receipt-toggle{transform:rotate(225deg);margin-top:3px}
.shopping-body{padding:0 20px 20px}
.shopping-card{padding:20px 0;border-top:1px dashed #ffc72c30;overflow-wrap:anywhere}
.store-card{border-top:0}
.shopping-card h2{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:500;color:#e1b46b;margin:0 0 10px}
.card-tag{font-size:10px;font-weight:400;color:var(--muted)}
.store-card #store{font-size:13px;font-weight:500;margin:0}.store-card .footnote{font-size:10px;margin-top:8px}
#draft-lines{list-style:none;margin:0;padding:0}.draft-line{padding:10px 0}
.line-top{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:600}
.line-top span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--yellow)}
.line-detail{font-size:11px;color:var(--muted);margin:4px 0 0}
#draft-lines .empty-cart{font-size:12px;color:var(--muted);padding:12px 0}
#draft-total{font-size:19px;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.4px;border-top:1px dashed #ffc72c40;padding-top:16px;margin:16px 0 0;color:var(--yellow)}
#checkout-status,#checkout-amount{font-size:12px}#checkout-amount{color:var(--yellow)}
.next-steps{font-size:11px;line-height:1.8;color:var(--muted);padding:14px 12px;border-left:2px solid #ff493b99;background:#ff493b09;margin:0}
#history-section{margin-top:36px}#history-section .section-heading{margin-bottom:4px}
#battle-history:empty::after{content:"新的对局开始后，可在这里回看交锋。";display:block;padding:16px 0;font-size:12px;color:var(--muted)}
#battle-history details{padding:16px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
#battle-history summary{font-size:12px;cursor:pointer;font-weight:500;color:#e4ceaf}#battle-history summary::marker{color:var(--yellow)}
#battle-history p{font-size:12px;color:var(--muted)}
footer{display:flex;justify-content:space-between;align-items:center;gap:20px;border-top:1px solid #ff493b40;padding-top:20px;margin-top:44px;color:var(--muted);font-size:11px}
.footer-brand{font:750 18px/1 Arial,sans-serif;letter-spacing:-.7px;color:var(--yellow)}footer p{margin:0}
a:focus-visible,summary:focus-visible{outline:2px solid var(--yellow);outline-offset:5px;border-radius:3px}.shopping-heading:focus-visible{outline:3px solid #9b261e;outline-offset:-6px}
.judge-status{padding:20px;margin-top:20px;border:1px solid var(--line);border-left:3px solid var(--yellow);border-radius:6px;background:var(--surface);scroll-margin-bottom:24px}
.judge-status-heading{display:flex;align-items:center;gap:16px;color:var(--yellow);font-size:14px}
.judge-status p{margin:8px 0 0;color:var(--muted);font-size:13px}
.judge-status[data-state="failed"]{border-left-color:var(--red)}.judge-status[data-state="failed"] strong{color:var(--red-text)}
#score-details>summary{cursor:pointer;color:var(--yellow);font-size:13px;padding:12px 0;border-top:1px solid var(--line)}
#score-details[open]>summary{margin-bottom:12px}
.compact-status,.cart-dock{display:none}
.follow-live{position:fixed;z-index:5;bottom:26px;left:50%;transform:translateX(-50%);max-width:calc(100% - 32px);white-space:nowrap;border:1px solid #ffc72c77;border-radius:30px;padding:12px 20px;background:#272116;color:var(--yellow);font-size:13px;text-decoration:none;box-shadow:0 8px 30px #0008}
.follow-live:hover{background:#392c17}#unread-label{font-weight:650}

@media(max-width:1020px){
  main{padding-left:28px;padding-right:28px}
  .watch-layout{grid-template-columns:minmax(0,1fr);gap:32px}
  .shopping-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}
  .shopping-grid .draft-card{border-top:0}
  .shopping-heading{padding:20px 24px}.shopping-body{padding:0 24px 22px}.receipt-overview{gap:18px}
}
@media(max-width:600px){
  body:has(#cart-dock:not([hidden])){padding-bottom:calc(84px + env(safe-area-inset-bottom))}
  .compact-status{display:flex;position:fixed;z-index:4;inset:0 0 auto;align-items:center;gap:12px;min-height:52px;padding:10px 16px;background:#111115f5;border-bottom:1px solid #ffc72c44;box-shadow:0 4px 20px #0005}
  #compact-phase{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;color:var(--yellow)}
  .compact-status a{font-size:11px;flex-shrink:0;color:var(--muted);text-decoration:none;padding:6px 0}
  .cart-dock{display:flex;position:fixed;z-index:4;inset:auto 0 0;justify-content:space-between;align-items:center;gap:16px;padding:12px 20px calc(12px + env(safe-area-inset-bottom));background:#181719f5;border-top:1px solid #ffc72c44;box-shadow:0 -8px 30px #0005}
  .cart-dock>span{min-width:0}.cart-dock strong{display:block;font-size:13px;color:var(--ink)}.cart-dock small{font-size:11px;color:var(--muted)}#dock-total{color:var(--yellow)}
  .cart-dock a{color:#201507;background:var(--yellow);padding:10px 14px;border-radius:6px;font-size:12px;font-weight:650;text-decoration:none;white-space:nowrap}
  .follow-live{bottom:calc(100px + env(safe-area-inset-bottom));font-size:12px;padding:10px 16px}
  #messages>li,#waiting,#judgement,.judge-status{scroll-margin-bottom:calc(100px + env(safe-area-inset-bottom))}
  #shopping{scroll-margin-top:72px}#arena{scroll-margin-top:12px}
  main{padding:0 16px 24px}.site-header{padding:20px 0;gap:12px}
  .brand{gap:8px}.brand-name{font-size:22px}.brand-mark{width:25px;height:25px}.brand-mark::before,.brand-mark::after{width:18px;height:18px}
  .brand-caption{display:none}#connection{font-size:10px;gap:6px}
  .arena{margin-top:20px;padding:24px 14px 0;border-radius:18px 18px 8px 8px}
  .intro{font-size:10px;letter-spacing:0;gap:5px}.intro span{margin:0 3px}
  h1{font-size:29px;letter-spacing:-1.2px}
  .match{grid-template-columns:minmax(0,1fr) 36px minmax(0,1fr);gap:0;margin:18px auto 22px}
  .contender{padding:0}.portrait{width:142px;height:110px}.portrait::before{inset:2px 7px 6px}
  .avatar{font-size:62px}.side-label{font-size:9px;margin-top:5px}.side-label::before{width:11px}
  .contender h2{font-size:16px;margin:4px 0}.agent-label{font-size:10px}
  .candidate{font-size:11px;margin-top:10px;padding:3px 7px}
  .contender-state{font-size:10px;padding:2px 7px;margin-top:10px}
  .versus>span{width:38px;height:40px;font-size:27px;letter-spacing:-2.5px;padding-right:4px;text-shadow:2px 2px var(--red);clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px)}
  .stage-status{flex-direction:column;align-items:stretch;gap:12px;padding:14px 16px;margin:0 -14px}
  .phase{font-size:11px}.turn-progress{justify-content:space-between;gap:12px}#progress{font-size:10px}.turns{max-width:119px}.turns span{width:26px}
  .watch-layout{margin-top:28px;gap:28px}.section-heading{gap:12px;margin-bottom:16px}.section-heading h2{font-size:18px}.section-heading>span{font-size:10px}.section-subtitle{font-size:11px}
  #messages{grid-template-columns:minmax(0,1fr);gap:14px}#messages>li{padding:17px 18px}.bubble{font-size:15px;margin-top:12px}.message-meta{font-size:12px}.message-round{font-size:10px}
  .waiting{font-size:11px;margin-top:14px}
  #judgement{padding:20px 18px;margin-top:28px}#judgement .section-heading{margin-bottom:22px}
  .result-lead{grid-template-columns:minmax(0,1fr);gap:22px}.result-kicker{font-size:10px}#winner{font-size:27px}
  .scoreboard{max-width:280px;width:100%;min-width:0;margin:auto;gap:18px;grid-template-columns:minmax(0,1fr) 16px minmax(0,1fr)}
  .final-score strong{font-size:65px}.final-score>span{font-size:11px;max-width:110px}.score-separator{font-size:35px}
  #summary{font-size:14px;margin:22px 0}#scores{grid-template-columns:minmax(0,1fr);gap:18px}.score-row+.score-row{padding-top:16px;border-top:1px solid var(--line)}.score-detail,.score-reason{font-size:12px}
  .shopping-grid{grid-template-columns:minmax(0,1fr);gap:0}.shopping-grid .draft-card{border-top:1px dashed #ffc72c30}
  .shopping-heading{padding:18px 20px}.shopping-body{padding:0 20px 20px}.receipt-title{font-size:18px}
  #history-section{margin-top:28px}footer{display:block;text-align:center;margin-top:32px}footer p{margin-top:10px;font-size:10px}
}
@media(prefers-reduced-motion:reduce){.dots span,.score-meter.reveal{animation:none}.shopping-heading{transition:none}}
`;
