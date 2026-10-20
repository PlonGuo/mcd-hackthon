export const watchCss = `
:root{color-scheme:light;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#262522;background:#fff;line-height:1.7;--red:#b82428;--yellow:#ffcc32;--amber:#8b600d;--muted:#6d6a63;--line:#ece9e2;--paper:#fff9e9}
*{box-sizing:border-box}body{margin:0}body::before{content:"";display:block;height:5px;background:var(--yellow)}
main{max-width:1140px;margin:auto;padding:26px 40px 30px}p,h1,h2,h3{overflow-wrap:anywhere}
.site-header{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:28px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;text-decoration:none;color:var(--red);letter-spacing:-.5px}
.brand-mark{display:grid;place-items:center;background:var(--yellow);color:#352910;width:34px;height:34px;border-radius:11px;font:900 25px/1 Georgia,serif}
.brand-caption{font-size:12px;margin-left:6px;padding-left:14px;border-left:1px solid var(--line);color:var(--muted);font-weight:500;letter-spacing:1px}
#connection{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:7px;flex-shrink:0}
#connection::before{content:"";width:6px;height:6px;flex-shrink:0;background:#a09b90;border-radius:50%}
#connection[data-state="live"]::before{background:#407746;box-shadow:0 0 0 3px #40774612}
.arena{text-align:center;background:var(--paper);border:1px solid #f4e9c9;border-radius:24px;padding:24px 32px 0;overflow:hidden}
.intro{font-size:12px;color:var(--muted);margin:0 0 12px}.eyebrow{font-size:11px;font-weight:600;letter-spacing:2px;color:var(--amber)}
.intro .eyebrow{display:block;margin-bottom:5px}
h1{font-size:clamp(24px,4.2vw,36px);letter-spacing:-1px;line-height:1.4;margin:0;font-weight:800}
.match{max-width:740px;margin:4px auto 16px;display:grid;grid-template-columns:minmax(0,1fr) 100px minmax(0,1fr);align-items:center;gap:14px}
.contender{--side:var(--red);min-width:0;position:relative;padding:0 10px 8px;border-radius:18px}
.contender.b{--side:var(--amber)}
.portrait{position:relative;width:190px;height:132px;max-width:100%;margin:auto}
.particles{position:absolute;inset:0;pointer-events:none}.particles canvas{display:block;width:100%;height:100%}
.avatar{position:absolute;inset:0;display:grid;place-items:center;font:800 78px/1 Arial,sans-serif;color:var(--side)}
.portrait.has-particles .avatar{visibility:hidden}
.side-label{font-size:10px;font-weight:700;letter-spacing:2px;color:var(--side)}
.contender h2{font-size:18px;line-height:1.5;margin:2px 0;font-weight:750}
.agent-label{font-size:12px;color:var(--muted);margin:0}
.candidate{color:var(--side);font-size:13px;font-weight:650;margin:10px 0 4px}
.contender-state{display:inline-flex;align-items:center;justify-content:center;gap:5px;font-size:11px;color:var(--muted);margin-top:9px;min-height:25px;padding:1px 10px;border-radius:30px}
.contender.active .contender-state{background:var(--red);color:#fff}.contender.b.active .contender-state{background:var(--yellow);color:#4e390a}
.contender.active .contender-state::before{content:"";width:4px;height:4px;border-radius:50%;background:currentColor}
.contender.is-winner .contender-state{background:#fff;border:1px solid #dfbc5d;color:var(--amber);font-weight:700}
.versus{align-self:center;padding-top:8px}.versus>span{font:italic 800 29px/1.2 Georgia,serif;color:#9b824a;letter-spacing:-3px}
.versus p{font-size:11px;color:var(--muted);margin:12px -8px 8px}.turns{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}
.turns span{width:5px;height:5px;background:#d9cda9;border-radius:50%}.turns .done{background:var(--amber)}.turns .current{background:var(--red);outline:2px solid #b8242820;outline-offset:2px}
.phase{margin:0 -32px;border-top:1px solid #ecdfb9;padding:10px 20px;font-size:12px;color:#776341;background:#fff4d5}
.watch-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:36px;margin-top:32px;align-items:start}.watch-layout:has(#shopping[hidden]){grid-template-columns:minmax(0,1fr)}
.debate-column{min-width:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:22px}
.section-heading h2{display:flex;align-items:center;gap:10px;font-size:17px;margin:0;letter-spacing:-.3px}.section-index{color:#94866a;font-size:11px;letter-spacing:1px;font-weight:500}
.section-heading>span{font-size:11px;color:var(--muted);flex-shrink:0}
#empty{color:var(--muted);font-size:14px;text-align:center;padding:32px 20px;border:1px dashed var(--line);border-radius:12px}
#messages{padding:0;list-style:none;margin:0}#messages li{width:90%;margin:0 0 24px;overflow-wrap:anywhere;scroll-margin-bottom:20px}
.message-b{margin-left:auto!important}.message-meta{font-size:11px;color:var(--muted);margin-bottom:7px;display:flex;align-items:center;gap:7px}
.message-meta::before{content:"A";display:grid;place-items:center;width:20px;height:20px;border-radius:6px;color:var(--red);background:#faeeeb;font-size:10px;font-weight:700;flex-shrink:0}
.message-b .message-meta{justify-content:flex-end}.message-b .message-meta::before{content:"B";background:#fff1c2;color:var(--amber)}
.bubble{padding:17px 20px;border-radius:0 16px 16px 16px;background:#f7f6f3;white-space:pre-wrap;font-size:14px;line-height:1.85;border:1px solid #f0eeea}
.message-b .bubble{background:var(--paper);border-color:#f5ebce;border-radius:16px 0 16px 16px}
.waiting{display:flex;align-items:center;gap:12px;width:fit-content;max-width:95%;padding:11px 15px;margin:0 0 24px;border-radius:12px;background:#f7f6f3;color:var(--muted);font-size:12px;overflow-wrap:anywhere;scroll-margin-bottom:24px}
.waiting.message-b{background:var(--paper)}.dots{display:flex;gap:4px;flex-shrink:0}.dots span{width:5px;height:5px;border-radius:50%;background:currentColor;animation:waiting-bounce 1.2s ease-in-out infinite}.dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}
@keyframes waiting-bounce{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-4px);opacity:1}}
#notice{background:#fff0ed;padding:14px;border-left:3px solid var(--red);font-size:14px}
#judgement{margin-top:32px;border:1px solid #ead38d;border-top:4px solid var(--yellow);border-radius:14px;padding:22px;background:#fffefa}
#judgement .section-heading{margin-bottom:20px}.result-kicker{font-size:11px;color:var(--muted);margin:0}
#winner{font-size:26px;color:var(--red);letter-spacing:-.6px;margin:2px 0 12px}
#judgement[data-winner-side="b"] #winner{color:var(--amber)}
#summary{font-size:14px}#tie-break{padding:12px 14px;background:var(--paper);border-radius:10px;font-size:13px}
.score-row{padding:14px 0;border-top:1px solid var(--line)}.score-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:13px;font-weight:650}
.score-top span:last-child{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}.score-detail,.score-reason,.footnote{font-size:11px;color:var(--muted);margin:6px 0}
.score-meter{appearance:none;width:100%;height:5px;border:0;border-radius:6px;overflow:hidden;display:block;margin:9px 0 10px;background:#eeeae0}
.score-meter::-webkit-progress-bar{background:#eeeae0}.score-meter::-webkit-progress-value{background:var(--red);border-radius:6px}.score-meter::-moz-progress-bar{background:var(--red);border-radius:6px}
.score-row.side-b .score-meter::-webkit-progress-value{background:#c69722}.score-row.side-b .score-meter::-moz-progress-bar{background:#c69722}
#round-comments{padding-left:20px;font-size:12px;color:var(--muted)}.footnote{line-height:1.7;margin-top:12px}
#shopping{min-width:0;border:1px solid var(--line);border-radius:18px;padding:20px 22px;background:#fff}
.shopping-heading{padding:0 0 18px;border-bottom:1px solid var(--line)}.shopping-heading h2{font-size:20px;margin:4px 0;letter-spacing:-.7px}.shopping-heading p{font-size:11px;color:var(--muted);margin:0}
.shopping-card{padding:19px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.shopping-card h2{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;margin:0 0 10px}
.card-tag{font-size:10px;color:var(--muted);font-weight:400}.store-card #store{font-size:12px;margin:0}#data-source{font-size:10px}
#draft-lines{padding:0;margin:0;list-style:none}.draft-line{padding:11px 0;border-bottom:1px dashed var(--line)}.draft-line:last-child{border-bottom:0}
.line-top{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:600}.line-top span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums}.line-detail{font-size:11px;color:var(--muted);margin:3px 0 0}
#draft-lines .empty-cart{font-size:12px;color:var(--muted);padding:12px 0}#draft-total{font-size:15px;font-weight:750;color:var(--red);border-top:1px solid var(--line);padding-top:12px;margin:12px 0 0;font-variant-numeric:tabular-nums}
#checkout-status,#checkout-amount{font-size:12px}.next-steps{margin:18px 0 0;font-size:11px;line-height:1.8;color:var(--muted);background:#f8f7f4;border-radius:9px;padding:12px}
#history-section{margin-top:32px}#battle-history:empty::after{content:"下一局开始后，这里的故事还会继续。";font-size:12px;color:var(--muted)}
#battle-history details{border-bottom:1px solid var(--line);padding:13px 0;overflow-wrap:anywhere}#battle-history summary{cursor:pointer;font-size:13px;font-weight:600}#battle-history p{font-size:12px;color:var(--muted)}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:11px;margin-top:40px;padding-top:18px;display:flex;justify-content:space-between;align-items:center;gap:16px}footer p{margin:0}.footer-brand{font-size:17px;font-weight:800;color:#a69e8b;letter-spacing:-.6px}
a:focus-visible,summary:focus-visible{outline:2px solid var(--red);outline-offset:4px;border-radius:3px}[hidden]{display:none!important}
@media(max-width:800px){main{padding:20px 24px 28px}.watch-layout{grid-template-columns:minmax(0,1fr);gap:28px}#shopping{padding:20px 24px}.shopping-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.match{max-width:600px}.arena{padding-left:20px;padding-right:20px}.phase{margin-left:-20px;margin-right:-20px}}
@media(max-width:540px){main{padding:16px 16px 24px}.site-header{margin-bottom:20px;gap:8px}.brand{font-size:16px;gap:7px}.brand-mark{width:28px;height:28px;font-size:21px;border-radius:8px}.brand-caption{display:none}#connection{font-size:10px;gap:5px}
.arena{padding:20px 12px 0;border-radius:18px}.intro{font-size:11px;margin-bottom:10px}.intro .eyebrow{font-size:10px}h1{font-size:24px;letter-spacing:-.8px}.match{grid-template-columns:minmax(0,1fr) 48px minmax(0,1fr);gap:0;margin-top:2px;margin-bottom:12px}
.contender{padding:0 0 4px}.portrait{height:110px;width:142px}.avatar{font-size:62px}.contender h2{font-size:14px}.agent-label{font-size:11px}.side-label{font-size:9px}.candidate{font-size:12px;margin-top:8px;line-height:1.6}.contender-state{font-size:11px;margin-top:6px;padding:1px 8px}.versus>span{font-size:23px}.versus p{font-size:10px}.turns{gap:4px}.phase{margin-left:-12px;margin-right:-12px;font-size:11px;padding:9px 14px}
.watch-layout{margin-top:24px}.section-heading{margin-bottom:18px}.section-heading h2{font-size:16px}.section-heading>span{font-size:10px}#messages li{width:94%;margin-bottom:20px}.bubble{padding:14px 15px;font-size:14px}.message-meta{font-size:10px}#judgement{padding:18px}#winner{font-size:23px}
.shopping-grid{grid-template-columns:1fr;gap:0}#shopping{padding:18px 20px}footer{display:block;text-align:center;margin-top:28px}footer p{margin-top:8px}}
@media(prefers-reduced-motion:reduce){.dots span{animation:none}}
`;
