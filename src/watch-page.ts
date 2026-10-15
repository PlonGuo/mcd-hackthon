import { RESPONSE_HEADERS } from './http.ts';

const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>麦麦辩论局 · 观战</title><link rel="stylesheet" href="/watch.css"><script src="/watch.js" defer></script></head>
<body><main><header><a class="brand" href="#">麦麦辩论局<span>观众席</span></a><span id="connection" role="status">正在连接</span></header>
<section class="arena"><p class="intro">把点餐分歧，交给你的 Agent。</p><h1 id="topic">等待对局信息</h1>
<div class="match"><div class="contender a" id="player-a"><span class="avatar">A</span><h2>等待房主</h2><p>尚未入场</p></div>
<div class="versus"><span>对决</span><p id="progress">等待开局</p></div>
<div class="contender b" id="player-b"><span class="avatar">B</span><h2>等待对手</h2><p>尚未入场</p></div></div>
<p id="phase" class="phase" role="status">正在读取房间</p></section>
<p id="notice" role="alert" hidden></p>
<section id="shopping" hidden aria-label="点餐清单"><div class="shopping-grid"><div class="shopping-card"><h2>本次门店</h2><p id="store">等待确认门店</p><p id="data-source" class="footnote"></p></div><div class="shopping-card"><h2>待买清单</h2><ul id="draft-lines"></ul><p id="draft-total"></p><p class="footnote">自由点餐时可修改；结账期间固定清单。参考合计不等于官方应付金额。</p></div></div><div id="checkout" class="shopping-card" hidden aria-label="结账进度"><h2>结账进度</h2><p id="checkout-status" role="status"></p><p id="checkout-amount"></p><p id="checkout-source" class="footnote"></p></div><p id="next-steps" class="next-steps"></p></section>
<section class="conversation" aria-label="对战记录"><div class="section-heading"><h2>现场交锋</h2><span id="count">0 条发言</span></div>
<p id="empty">辩手还没发言。开局后，双方观点会在这里出现。</p><ol id="messages" aria-live="polite" aria-relevant="additions"></ol>
<div id="waiting" class="waiting" role="status" hidden><span id="waiting-name"></span><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span></div></section>
<section id="judgement" hidden><div class="section-heading"><h2>裁判判决</h2><span>AI 裁判</span></div><h3 id="winner"></h3>
<p id="summary"></p><p id="tie-break" hidden></p><div id="scores"></div><ol id="round-comments"></ol><p class="footnote">按统一规则评价本局表现；偏好判断不代表餐品客观优劣。</p></section>
<section id="history-section" hidden><h2>对战历史</h2><div id="battle-history"></div></section>
<footer>你正在观看双方真实提交的发言。页面不会参与对战，也不会替你下单。</footer></main></body></html>`;

const css=`
:root{font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#202526;background:#fff;line-height:1.7;--red:#b82428;--yellow:#ffcc32;--muted:#62686b}
*{box-sizing:border-box}body{margin:0;border-top:7px solid var(--yellow)}main{max-width:960px;margin:auto;padding:22px 28px 45px}
header{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:30px}.brand{font-weight:800;font-size:20px;text-decoration:none;color:var(--red)}.brand span{font-size:12px;margin-left:10px;color:var(--muted);font-weight:500}#connection{font-size:13px;color:var(--muted)}
.arena{text-align:center;background:#fff8df;border-radius:24px;padding:26px 24px 20px}.intro{font-size:14px;color:var(--muted);margin:0 0 7px}h1{font-size:clamp(26px,5vw,38px);line-height:1.3;margin:0 0 24px;overflow-wrap:anywhere}
.match{display:grid;grid-template-columns:minmax(0,1fr) 90px minmax(0,1fr);align-items:center;gap:16px}.avatar{display:inline-grid;place-items:center;width:54px;height:54px;background:var(--red);color:white;font-size:25px;font-weight:800;border-radius:50%}.b .avatar{background:var(--yellow);color:#322600}.contender{padding:12px;border-radius:16px;border:2px solid transparent}.contender.active{border-color:var(--red);background:white}.b.active{border-color:#a17d00}.contender h2{font-size:19px;margin:9px 0 2px;overflow-wrap:anywhere}.contender p{font-size:13px;margin:0;color:var(--muted);overflow-wrap:anywhere}.versus>span{font-size:21px;font-weight:800}.versus p{font-size:12px;margin:3px 0;color:var(--muted)}.phase{margin:18px 0 0;font-size:14px;font-weight:600}
.conversation,#judgement{margin-top:30px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #e5e8e9;padding-bottom:12px;margin-bottom:18px}.section-heading h2{font-size:19px;margin:0}.section-heading span{font-size:13px;color:var(--muted)}#empty{color:var(--muted);font-size:14px;text-align:center;padding:24px 0}
#messages{padding:0;list-style:none;margin:0}#messages li{width:86%;margin:0 0 20px;overflow-wrap:anywhere}.message-b{margin-left:auto!important}.message-meta{font-size:12px;color:var(--muted);margin-bottom:6px}.message-b .message-meta{text-align:right}.bubble{padding:16px 20px;border-radius:4px 18px 18px 18px;background:#f5f6f7;border-left:3px solid var(--red);white-space:pre-wrap}.message-b .bubble{background:#fff8df;border-left:0;border-right:3px solid #b88b00;border-radius:18px 4px 18px 18px}
.waiting{display:flex;align-items:center;gap:12px;width:fit-content;max-width:95%;padding:12px 16px;margin:0 0 20px;border-radius:14px;background:#f5f6f7;color:var(--muted);font-size:13px;overflow-wrap:anywhere}.waiting.message-b{background:#fff8df}.dots{display:flex;gap:5px;flex-shrink:0}.dots span{width:6px;height:6px;border-radius:50%;background:currentColor;animation:waiting-bounce 1.2s ease-in-out infinite}.dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}@keyframes waiting-bounce{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-5px);opacity:1}}#tie-break{padding:12px 14px;background:#fff8df;border-radius:10px;font-size:14px}
#notice{background:#fff0ed;padding:14px;border-left:3px solid var(--red);font-size:14px}#judgement{border:2px solid var(--yellow);border-radius:18px;padding:22px}#winner{font-size:24px;color:var(--red);margin:8px 0}.score-row{padding:14px 0;border-bottom:1px solid #e5e8e9}.score-top{display:flex;justify-content:space-between;gap:12px;font-weight:700}.score-detail,.score-reason,.footnote{font-size:13px;color:var(--muted);margin:5px 0}#round-comments{padding-left:22px;font-size:14px}.footnote{margin-top:16px}footer{color:var(--muted);font-size:12px;text-align:center;margin-top:36px}[hidden]{display:none!important}
.shopping-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}.shopping-card{border:1px solid #e5e8e9;border-radius:16px;padding:18px;overflow-wrap:anywhere}.shopping-card h2,#history-section h2{font-size:19px;margin-top:0}#draft-lines{padding-left:20px;font-size:14px}#draft-total{font-weight:700;color:var(--red)}.next-steps{padding:14px 18px;background:#fff8df;border-radius:12px;font-size:14px}#history-section{margin-top:30px}#battle-history details{border-bottom:1px solid #e5e8e9;padding:14px 0;overflow-wrap:anywhere}#battle-history summary{cursor:pointer;font-weight:600}#battle-history p{font-size:14px}
@media(max-width:540px){.shopping-grid{grid-template-columns:1fr}main{padding:18px 16px 28px}header{margin-bottom:20px}.arena{padding:22px 12px}.match{grid-template-columns:minmax(0,1fr) 48px minmax(0,1fr);gap:3px}.contender{padding:9px 5px}.contender h2{font-size:15px}.avatar{width:44px;height:44px;font-size:21px}.versus>span{font-size:16px}#messages li{width:95%}.bubble{padding:14px 16px}#judgement{padding:16px}}
@media(prefers-reduced-motion:reduce){.dots span{animation:none}}
`;

const js=String.raw`
'use strict';
const $=id=>document.getElementById(id);let source,last=-1,finished=false,checking=false,lastRoom,connected=false,lastBattle=null;
const path=location.pathname.replace(/\/$/,'');
function checkoutLabel(c){return ({PREPARED:'清单已固定，等待付款人领取',HANDED_OFF:'付款人已领取，等待最终核价',QUOTED:'已核价，等待付款人确认',SUBMITTING:'正在创建订单，请勿重复提交',UNKNOWN:'订单结果未知，正在等待付款人查单',ORDER_CREATED:'订单已创建，等待付款',PAID:c.source==='TEST_FIXTURE'?'模拟付款完成':'付款人上报已支付（未独立核验）',ORDER_CANCELLED:'付款人上报订单已取消',NO_ORDER:'已确认未下单，可继续点餐',CANCELLED:'结账已取消，可继续点餐'}[c.status]??c.status);}
function updateWaiting(){
  const room=lastRoom,visible=connected&&!finished&&(room?.mode==='shopping'?room.battles.find(b=>b.battle_id===room.active_battle_id)?.status==='ACTIVE':room?.status==='ACTIVE')&&Boolean(room.current_player_id);
  $('waiting').hidden=!visible;
  if(visible){$('waiting-name').textContent='等待 '+playerName(room,room.current_player_id)+' 发言';$('waiting').classList.toggle('message-b',room.current_player_id===room.players[1]?.player_id);}
}
function scrollLatest(element){requestAnimationFrame(()=>element.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'end'}));}
function stop(){finished=true;connected=false;source?.close();updateWaiting();$('connection').textContent='对局已结束';}
function notice(text){$('notice').hidden=!text;$('notice').textContent=text;}
function playerName(room,id){return room.players.find(p=>p.player_id===id)?.name??'辩手';}
function renderShopping(room){
  const shopping=room.mode==='shopping';$('shopping').hidden=!shopping;$('history-section').hidden=!shopping;if(!shopping)return;
  $('store').textContent=room.context?room.context.name+' · '+room.context.address+' · 到店自取':'等待用户确认门店';
  $('data-source').textContent=room.data_source==='TEST_FIXTURE'?'测试数据 · 非官方门店或报价':'Agent 查询后上报 · 参考价';
  $('draft-lines').replaceChildren(...room.draft.lines.map(line=>{const li=document.createElement('li');li.textContent=line.item.name+' · '+line.item.spec+' × '+line.quantity+' · '+(line.owner_player_id?playerName(room,line.owner_player_id):'共享')+' · ¥'+(line.item.unit_price_cents*line.quantity/100).toFixed(2);return li;}));
  if(!room.draft.lines.length){const li=document.createElement('li');li.textContent='还没有商品，可回到 Agent 直接点餐。';$('draft-lines').append(li);}
  $('draft-total').textContent='参考合计 ¥'+(room.draft.total_cents/100).toFixed(2)+' · 清单版本 '+room.draft.version;
  const c=room.checkout,locked=c&&!['NO_ORDER','CANCELLED'].includes(c.status);$('checkout').hidden=!c;
  if(c){
    $('checkout-status').textContent=checkoutLabel(c)+' · '+playerName(room,c.payer_player_id)+'负责结账';
    $('checkout-amount').textContent=c.total_cents===null?'尚未取得最终报价':(c.source==='TEST_FIXTURE'?'模拟应付':'付款账户核价')+' ¥'+(c.total_cents/100).toFixed(2)+' · 固定清单版本 '+c.draft_version+(c.take_way_title?' · '+c.take_way_title:c.take_way_titles?.length?' · 待选择：'+c.take_way_titles.join(' / '):'');
    $('checkout-source').textContent=c.source==='TEST_FIXTURE'?'模拟订单 · 不是真实麦当劳订单，模拟付款不会扣钱。':'付款人 Agent 上报 · 房间未独立核验官方订单或付款；真实状态请在官方系统确认。';
  }
  $('next-steps').textContent=room.status!=='OPEN'?'本次点餐会话已结束；关闭或过期不会取消已有官方订单，请到付款人 Agent 核对。':locked?c.status==='UNKNOWN'||c.status==='SUBMITTING'?'请回到付款人 Agent 查单，结果未知时不要重新下单。':c.status==='QUOTED'?'请回到付款人 Agent 核对完整清单和最终金额，确认后才提交订单。':c.status==='ORDER_CANCELLED'?'本次订单已取消，付款或退款情况请到官方系统确认；如需重新点餐请新建房间。':c.status==='PAID'?'本次订单流程已结束；新一餐请新建房间。':c.status==='ORDER_CREATED'?'请在付款人 Agent 提供的官方页面完成支付；观战页不展示支付链接。':'结账期间清单已固定，请回到付款人 Agent 继续；领取前可以取消。':room.active_battle_id?'对战期间也可回到 Agent 继续点餐或修改清单。':'请回到 Agent 选择：继续点餐 / 再开一局 / 准备结账。本页只读。';
  $('battle-history').replaceChildren(...room.battles.filter(b=>b.battle_id!==room.active_battle_id).map((b,i)=>{
    const details=document.createElement('details'),summary=document.createElement('summary');
    const winner=b.judgement.status==='SUCCEEDED'?playerName(room,b.judgement.result.winner_player_id)+' 获胜':({CANCELLED:'已取消',FAILED:'评分失败',PAUSED:'已暂停'}[b.status]??b.status);
    summary.textContent='第 '+(i+1)+' 局 · '+b.topic+' · '+winner;details.append(summary);
    for(const argument of b.arguments){const p=document.createElement('p');p.textContent=playerName(room,argument.player_id)+'：'+argument.text;details.append(p);}
    if(b.judgement.status==='SUCCEEDED'){const p=document.createElement('p');p.textContent=b.judgement.result.scores.map(s=>playerName(room,s.player_id)+' '+s.total+'分').join(' / ')+'。'+b.judgement.result.summary;details.append(p);}
    if(b.recommendation){const p=document.createElement('p');p.textContent='建议：'+b.recommendation.item.name+' · '+({PENDING:'待用户选择',APPLIED:'已加入清单',DISMISSED:'已忽略'}[b.recommendation.status]);details.append(p);}return details;
  }));
}
function render(room){
  if(room.sequence<=last)return;last=room.sequence;lastRoom=room;
  renderShopping(room);
  const battle=room.mode==='shopping'?(room.battles.find(b=>b.battle_id===room.active_battle_id)??room.battles.at(-1)):null;
  if(room.mode==='shopping'&&lastBattle!==(battle?.battle_id??null)){lastBattle=battle?.battle_id??null;$('messages').replaceChildren();$('judgement').hidden=true;}
  $('topic').textContent=room.topic;$('progress').textContent=room.turn_index+'/'+room.max_turns+' 条';$('count').textContent=room.arguments.length+' 条发言';
  for(let i=0;i<2;i++){
    const element=$('player-'+(i?'b':'a')),player=room.players[i];
    element.querySelector('h2').textContent=player?.name??'等待对手';
    element.querySelector('p').textContent=player?(player.agent_label||'已入场'):'尚未入场';
    element.classList.toggle('active',Boolean(player&&player.player_id===room.current_player_id));
  }
  $('empty').hidden=room.arguments.length>0;
  const currentNodes=new Map([...$('messages').children].map(e=>[Number(e.dataset.sequence),e]));let newest,newJudgement=false;
  for(const argument of room.arguments){
    if(currentNodes.has(argument.sequence))continue;
    const li=document.createElement('li');li.dataset.sequence=argument.sequence;
    li.className=argument.player_id===room.players[1]?.player_id?'message-b':'message-a';
    const meta=document.createElement('div');meta.className='message-meta';
    meta.textContent='第 '+Math.ceil(argument.sequence/2)+' 轮 · '+playerName(room,argument.player_id);
    const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=argument.text;
    li.append(meta,bubble);$('messages').append(li);newest=li;
  }
  const j=room.judgement;
  let phase={WAITING:'等待双方入场并准备',READY:'双方已就绪，等待房主开局',ACTIVE:'轮到 '+playerName(room,room.current_player_id)+' 发言',
    PAUSED:'辩手响应超时，对局已暂停',CLOSED:'房主已关闭对局',EXPIRED:'房间已过期',FINISHED:'发言已结束，裁判尚未接入'}[room.status]??room.status;
  if(room.mode==='shopping')phase=room.status!=='OPEN'?({CLOSED:'房主已关闭会话',EXPIRED:'房间已过期'}[room.status]??room.status):({PREPARING:'双方选择候选并准备',ACTIVE:'轮到 '+playerName(room,room.current_player_id)+' 发言',JUDGING:'双方发言完成，裁判评分中',FINISHED:'本局结束，可继续点餐或再开一局',CANCELLED:'本局已取消，清单保留',FAILED:'本局评分失败，清单保留',PAUSED:'本局超时暂停，可取消后再战'}[battle?.status]??'自由点餐，可随时发起对战');
  if(room.status==='FINISHED'&&j?.status==='PENDING')phase='双方发言完成，裁判评分中';
  if(room.status==='FINISHED'&&j?.status==='FAILED')phase='裁判未能完成评分，本局没有判决（'+j.error_code+'）';
  if(j?.status==='SUCCEEDED'){
    phase='对局完成，裁判已给出结果';newJudgement=$('judgement').hidden;$('judgement').hidden=false;const result=j.result;
    $('winner').textContent=result.winner_player_id?playerName(room,result.winner_player_id)+' 获胜':'历史对局未记录胜者';$('summary').textContent=result.summary;
    $('tie-break').hidden=!result.tie_break;$('tie-break').textContent=result.tie_break?'双方总分相同，裁判决胜：'+result.tie_break.reason:'';
    $('scores').replaceChildren(...result.scores.map(s=>{
      const row=document.createElement('div');row.className='score-row';
      const top=document.createElement('div');top.className='score-top';const name=document.createElement('span'),total=document.createElement('span');name.textContent=playerName(room,s.player_id);total.textContent=s.total+' / 100';top.append(name,total);
      const detail=document.createElement('p');detail.className='score-detail';detail.textContent='切题 '+s.fit+'/40 · 依据 '+s.evidence+'/30 · 回应 '+s.response+'/20 · 趣味 '+s.humor+'/10';
      const reason=document.createElement('p');reason.className='score-reason';reason.textContent=s.reason;row.append(top,detail,reason);return row;
    }));
    $('round-comments').replaceChildren(...result.round_comments.map(c=>{const li=document.createElement('li');li.textContent='第 '+c.round+' 轮：'+c.comment;return li;}));
  }
  if(room.mode==='shopping'&&room.status==='OPEN'&&room.checkout&&!['CANCELLED','NO_ORDER'].includes(room.checkout.status))phase=checkoutLabel(room.checkout);
  $('phase').textContent=phase;
  updateWaiting();
  if(['CLOSED','EXPIRED'].includes(room.status)||(room.mode!=='shopping'&&(room.status==='PAUSED'||(room.status==='FINISHED'&&j?.status!=='PENDING'))))stop();
  if(newJudgement)scrollLatest($('judgement'));else if(newest)scrollLatest($('waiting').hidden?newest:$('waiting'));
}
async function snapshot(){
  const r=await fetch(path+'/snapshot',{cache:'no-store',signal:AbortSignal.timeout(10000)});const body=await r.json();
  if(!r.ok||!body.ok){const error=new Error(body.error?.message??'无法读取对局');error.status=r.status;throw error;}return body.data;
}
async function start(){
  try{
    render(await snapshot());if(finished)return;
    source=new EventSource(path+'/events');
    source.onopen=()=>{connected=true;$('connection').textContent='现场已连接';notice('');updateWaiting();};
    source.addEventListener('snapshot',event=>{try{render(JSON.parse(event.data));}catch{notice('收到的数据无法显示，请刷新页面。');}});
    source.onerror=async()=>{
      if(finished)return;connected=false;updateWaiting();$('connection').textContent='连接中断，正在重连';
      if(checking)return;checking=true;
      try{render(await snapshot());}catch(error){if([403,404,410].includes(error.status)){stop();$('connection').textContent='链接不可用';notice(error.message);}}
      finally{checking=false;}
    };
  }catch(error){$('connection').textContent='无法连接';notice(error.message+'。请检查观战链接，或刷新重试。');}
}
window.addEventListener('pagehide',()=>{source?.close();connected=false;updateWaiting();});
window.addEventListener('pageshow',event=>{if(event.persisted&&!finished)start();});
start();
`;

export function watchPageResponse(path: string) {
  const headers={...RESPONSE_HEADERS,'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"};
  if(path==='/watch.css')return new Response(css,{headers:{...headers,'Content-Type':'text/css; charset=utf-8'}});
  if(path==='/watch.js')return new Response(js,{headers:{...headers,'Content-Type':'text/javascript; charset=utf-8'}});
  return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
