import { RESPONSE_HEADERS } from './http.ts';

import { watchHtml as html } from './watch/markup.ts';
import { watchCss as css } from './watch/styles.ts';
import { particlesScript } from './watch/particles.ts';

const js=String.raw`
'use strict';
const $=id=>document.getElementById(id);let source,last=-1,finished=false,checking=false,lastRoom,connected=false,lastBattle=null;
let effects=[],celebrated=null;
const path=location.pathname.replace(/\/$/,'');
function mountEffects(){
  if(effects.length)return;
  for(const side of ['a','b']){
    try{const effect=mountMorphingParticles($('particles-'+side),side.toUpperCase());effects.push(effect);effect.ready.catch(()=>{effect.dispose();});}
    catch{effects.push(null);}
  }
  updateStage();
}
function updateStage(){
  $('connection').dataset.state=connected?'live':finished?'ended':'offline';
  if(!lastRoom)return;
  const room=lastRoom,battle=room.mode==='shopping'?(room.battles.find(b=>b.battle_id===room.active_battle_id)??room.battles.at(-1)):null;
  const running=room.mode==='shopping'?room.status==='OPEN'&&battle?.status==='ACTIVE':room.status==='ACTIVE';
  const result=room.judgement?.status==='SUCCEEDED'?room.judgement.result:null;
  const winKey=result?(battle?.battle_id??room.room_id)+':'+result.winner_player_id:null;
  for(let i=0;i<2;i++){
    const side=i?'b':'a',element=$('player-'+side),player=room.players[i];
    const winner=Boolean(player&&result?.winner_player_id===player.player_id);
    const active=Boolean(player&&running&&connected&&room.current_player_id===player.player_id);
    element.classList.toggle('active',active);element.classList.toggle('is-winner',winner);
    $('state-'+side).textContent=winner?'本局胜者':!player?'等待入场':active?'等待发言':!connected&&!finished?'连接恢复中':running?'等待回合':result?'本局完成':battle?.status==='JUDGING'||room.judgement?.status==='PENDING'?'等待判决':'已入场';
    effects[i]?.setMode(!connected&&!finished?'offline':winner?'winner':active?'active':'idle',winKey!==celebrated);
  }
  if(winKey)celebrated=winKey;
}
function checkoutLabel(c){return ({PREPARED:'清单已固定，等待付款人领取',HANDED_OFF:'付款人已领取，等待最终核价',QUOTED:'已核价，等待付款人确认',SUBMITTING:'正在创建订单，请勿重复提交',UNKNOWN:'订单结果未知，正在等待付款人查单',ORDER_CREATED:'订单已创建，等待付款',PAID:c.source==='TEST_FIXTURE'?'模拟付款完成':'付款人上报已支付（未独立核验）',ORDER_CANCELLED:'付款人上报订单已取消',NO_ORDER:'已确认未下单，可继续点餐',CANCELLED:'结账已取消，可继续点餐'}[c.status]??c.status);}
function updateWaiting(){
  const room=lastRoom,visible=connected&&!finished&&(room?.mode==='shopping'?room.battles.find(b=>b.battle_id===room.active_battle_id)?.status==='ACTIVE':room?.status==='ACTIVE')&&Boolean(room.current_player_id);
  $('waiting').hidden=!visible;
  if(visible){$('waiting-name').textContent='等待 '+playerName(room,room.current_player_id)+' 发言';$('waiting').classList.toggle('message-b',room.current_player_id===room.players[1]?.player_id);}
  updateStage();
}
function scrollLatest(element){requestAnimationFrame(()=>element.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'end'}));}
function stop(){finished=true;connected=false;source?.close();updateWaiting();$('connection').textContent='对局已结束';}
function notice(text){$('notice').hidden=!text;$('notice').textContent=text;}
function playerName(room,id){return room.players.find(p=>p.player_id===id)?.name??'辩手';}
function renderShopping(room){
  const shopping=room.mode==='shopping';$('shopping').hidden=!shopping;$('history-section').hidden=!shopping;if(!shopping)return;
  $('store').textContent=room.context?room.context.name+' · '+room.context.address:'等待用户确认门店';
  $('data-source').textContent=room.data_source==='TEST_FIXTURE'?'测试数据 · 非官方门店或报价':'Agent 查询后上报 · 参考价';
  $('draft-lines').replaceChildren(...room.draft.lines.map(line=>{
    const li=document.createElement('li');li.className='draft-line';
    const top=document.createElement('div');top.className='line-top';const name=document.createElement('span'),price=document.createElement('span');
    name.textContent=line.item.name;price.textContent='¥'+(line.item.unit_price_cents*line.quantity/100).toFixed(2);top.append(name,price);
    const detail=document.createElement('p');detail.className='line-detail';detail.textContent=line.item.spec+' × '+line.quantity+' · '+(line.owner_player_id?playerName(room,line.owner_player_id):'共享');
    li.append(top,detail);return li;
  }));
  if(!room.draft.lines.length){const li=document.createElement('li');li.className='empty-cart';li.textContent='还没有商品，可回到 Agent 直接点餐。';$('draft-lines').append(li);}
  $('draft-total').textContent='参考合计 ¥'+(room.draft.total_cents/100).toFixed(2);
  const c=room.checkout,locked=c&&!['NO_ORDER','CANCELLED'].includes(c.status);$('checkout').hidden=!c;
  if(c){
    $('checkout-status').textContent=checkoutLabel(c)+' · '+playerName(room,c.payer_player_id)+'负责结账';
    $('checkout-amount').textContent=c.total_cents===null?'尚未取得最终报价':(c.source==='TEST_FIXTURE'?'模拟应付':'付款账户核价')+' ¥'+(c.total_cents/100).toFixed(2)+(c.take_way_title?' · '+c.take_way_title:c.take_way_titles?.length?' · 待选择：'+c.take_way_titles.join(' / '):'');
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
  $('topic').textContent=room.topic;$('progress').textContent=room.turn_index+' / '+room.max_turns+' 条发言';$('count').textContent=room.arguments.length+' 条发言';
  $('turns').replaceChildren(...Array.from({length:room.max_turns},(_,i)=>{const dot=document.createElement('span');dot.className=i<room.turn_index?'done':i===room.turn_index?'current':'';return dot;}));
  for(let i=0;i<2;i++){
    const element=$('player-'+(i?'b':'a')),player=room.players[i];
    element.querySelector('h2').textContent=player?.name??'等待对手';
    element.querySelector('.agent-label').textContent=player?(player.agent_label||'已入场'):'尚未入场';
    const candidate=battle?.candidates?.[i?'B':'A'],label=$('candidate-'+(i?'b':'a'));
    label.hidden=!candidate;label.textContent=candidate?'支持 '+candidate.name:'';
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
    $('judgement').dataset.winnerSide=result.winner_player_id===room.players[1]?.player_id?'b':'a';
    $('winner').textContent=result.winner_player_id?playerName(room,result.winner_player_id)+' 获胜':'历史对局未记录胜者';$('summary').textContent=result.summary;
    $('tie-break').hidden=!result.tie_break;$('tie-break').textContent=result.tie_break?'双方总分相同，裁判决胜：'+result.tie_break.reason:'';
    $('scores').replaceChildren(...result.scores.map(s=>{
      const row=document.createElement('div');row.className='score-row '+(s.player_id===room.players[1]?.player_id?'side-b':'side-a');
      const top=document.createElement('div');top.className='score-top';const name=document.createElement('span'),total=document.createElement('span');name.textContent=playerName(room,s.player_id);total.textContent=s.total+' / 100';top.append(name,total);
      const detail=document.createElement('p');detail.className='score-detail';detail.textContent='切题 '+s.fit+'/40 · 依据 '+s.evidence+'/30 · 回应 '+s.response+'/20 · 趣味 '+s.humor+'/10';
      const meter=document.createElement('progress');meter.className='score-meter';meter.max=100;meter.value=s.total;meter.setAttribute('aria-label',playerName(room,s.player_id)+' 本局得分');
      const reason=document.createElement('p');reason.className='score-reason';reason.textContent=s.reason;row.append(top,meter,detail,reason);return row;
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
window.addEventListener('pagehide',()=>{source?.close();connected=false;for(const effect of effects)effect?.dispose();effects=[];updateWaiting();});
window.addEventListener('pageshow',event=>{if(event.persisted){mountEffects();if(!finished)start();}});
mountEffects();
start();
`;

export function watchPageResponse(path: string) {
  const headers={...RESPONSE_HEADERS,'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"};
  if(path==='/watch.css')return new Response(css,{headers:{...headers,'Content-Type':'text/css; charset=utf-8'}});
  if(path==='/watch.js')return new Response(particlesScript+js,{headers:{...headers,'Content-Type':'text/javascript; charset=utf-8'}});
  return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
