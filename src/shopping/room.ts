import { parse, schemas } from './schemas.ts';
import { emit, fail, player, host, storeRequired } from './common.ts';
import { editDraft, decideRecommendation } from './cart.ts';
import { battleAction } from './battle.ts';
import { CHECKOUT_ACTIONS, checkoutAction, checkoutLocked, tickCheckout, publicCheckout, payerCheckoutDetails } from './checkout.ts';
import type { ShoppingRoom, Identity, Source, Battle, CheckoutPackage } from './types.ts';
export { claimShoppingJudge, finishShoppingJudge } from './battle.ts';
export const isShoppingRoom=(room: unknown): room is ShoppingRoom => !!room&&typeof room==='object'&&'mode' in room&&room.mode==='shopping';
export function createShoppingRoom(raw: unknown, identity: Identity, now: number, {source='AGENT_REPORTED',judgeEnabled=false,turnMs=120000}: {source?:Source;judgeEnabled?:boolean;turnMs?:number}={}): ShoppingRoom {
  const input=parse(schemas.create,raw);
  if(!identity.room_id)fail('INVALID_ARGUMENT','缺少房间号',400);
  return {mode:'shopping',room_id:identity.room_id,host_player_id:identity.player_id,topic:input.topic,status:'OPEN',players:[{...identity,name:input.name,agent_label:input.agent_label??'',last_seen_at:now,ready:false}],context:null,items:[],draft:{version:0,lines:[],total_cents:0},battles:[],active_battle_id:null,sequence:1,events:[{sequence:1,type:'ROOM_CREATED',player_id:identity.player_id,created_at:now}],created_at:now,expires_at:now+1800000,_turn_ms:turnMs,_judge_enabled:judgeEnabled,_data_source:source,_receipts:{}};
}
export function tickShopping(original: ShoppingRoom, now: number): ShoppingRoom {
  const room=structuredClone(original);const battle=room.battles.find(b=>b.battle_id===room.active_battle_id);
  tickCheckout(room,now);
  if(now>=room.expires_at&&room.status!=='EXPIRED'){room.status='EXPIRED';emit(room,'ROOM_EXPIRED',now);}
  if(room.status!=='OPEN'&&battle){battle.current_turn=null;battle.status='CANCELLED';if(battle.judgement.status==='PENDING')battle.judgement={status:'FAILED',error_code:'JUDGE_CANCELLED'};room.active_battle_id=null;emit(room,'BATTLE_CANCELLED',now);}
  else if(battle?.status==='ACTIVE'&&battle.current_turn&&now>=battle.current_turn.deadline_at){battle.status='PAUSED';battle.current_turn=null;emit(room,'TURN_TIMEOUT',now);}
  else if(battle?.status==='JUDGING'&&battle._judge_job&&now>=battle._judge_job.deadline_at){battle.status='FAILED';battle.judgement={status:'FAILED',error_code:'JUDGE_TIMEOUT'};room.active_battle_id=null;emit(room,'JUDGE_FAILED',now);}
  return room;
}
export function transitionShopping(original: ShoppingRoom, action: string, raw: unknown, actorId: string | null, now: number, identity?: Identity): {room:ShoppingRoom;replayed?:boolean;checkout_package?:CheckoutPackage} {
  const room=tickShopping(original,now);
  // 观战/点餐仍按原TTL结束；仅保留付款人对既有交接结果的有限核对窗口。
  const outcome=raw&&typeof raw==='object'&&'outcome' in raw?String(raw.outcome):'';
  const query=raw&&typeof raw==='object'&&'operation' in raw&&raw.operation==='query';
  const recovery=!!room.checkout&&now<room.checkout.reconcile_until&&((action==='checkout-report'&&['UNKNOWN','NO_ORDER','ORDER_CREATED','PAID','ORDER_CANCELLED'].includes(outcome))||(action==='checkout-simulate'&&query));
  if(room.status==='EXPIRED'&&action!=='state'&&!recovery)fail('ROOM_EXPIRED','房间已过期；仅付款人可在核对窗口内报告已有订单结果',410);
  const actor=action==='join'?null:player(room,actorId);
  if(room.status==='CLOSED'&&!['state','close','checkout-report','checkout-simulate'].includes(action))fail('ROOM_CLOSED','房间已关闭');
  if(room.status==='CLOSED'&&action==='checkout-report'&&(!raw||typeof raw!=='object'||!('outcome' in raw)||!['UNKNOWN','NO_ORDER','ORDER_CREATED','PAID','ORDER_CANCELLED'].includes(String(raw.outcome))))fail('ROOM_CLOSED','关闭后只能核对已有订单结果');
  if(room.status==='CLOSED'&&action==='checkout-simulate'&&(!raw||typeof raw!=='object'||!('operation' in raw)||raw.operation!=='query'))fail('ROOM_CLOSED','关闭后只能查询已有模拟订单');
  if(actor)actor.last_seen_at=now;
  let replayed:boolean|undefined;let checkout_package:CheckoutPackage|undefined;
  if(action==='join'){
    const input=parse(schemas.join,raw);if(room.status!=='OPEN'||room.players.length>=2)fail('ROOM_FULL','房间已满或关闭');
    if(!identity||room.players.some(p=>p.player_id===identity.player_id||p.token_hash===identity.token_hash))fail('IDENTITY_CONFLICT','玩家身份无效');
    room.players.push({...identity,name:input.name,agent_label:input.agent_label??'',last_seen_at:now,ready:false});
  } else if(action==='state'){parse(schemas.state,raw);return {room};}
  else if(action==='close'){parse(schemas.close,raw);host(room,actor!.player_id);room.status='CLOSED';emit(room,'ROOM_CLOSED',now,actorId);return {room:tickShopping(room,now)};}
  else if(action==='context'){
    const input=parse(schemas.context,raw);host(room,actor!.player_id);if(room.context)fail('STORE_LOCKED','门店已固定，换店请新建房间');
    room.context={version:1,store_code:input.store_code,name:input.name,address:input.address,fulfillment:input.fulfillment,source:room._data_source};
  } else {
    storeRequired(room);
    if(CHECKOUT_ACTIONS.includes(action)){
      const result=checkoutAction(room,action,raw,actor!.player_id,now);replayed=result.replayed;checkout_package=result.checkout_package;
    }else if(checkoutLocked(room)&&['draft','recommendation','battle','ready','start','say','cancel'].includes(action))fail('CHECKOUT_LOCKED','结账或订单处理中，清单已固定；先核对订单结果再继续');
    else if(action==='item'){
      const input=parse(schemas.item,raw);if(input.queried_at>now+120000||now-input.queried_at>600000)fail('QUOTE_EXPIRED','请使用新查询的参考报价');
      const existing=room.items.find(i=>i.reporter_player_id===actorId&&i.meal_code===input.meal_code&&i.spec===input.spec);
      if(!existing&&room.items.length>=100)fail('ITEM_LIMIT','每房间最多100条餐品资料');
      const data={...input,store_code:room.context!.store_code,reporter_player_id:actor!.player_id,received_at:now,source:room._data_source};
      if(existing)Object.assign(existing,data,{version:existing.version+1});else room.items.push({...data,item_id:crypto.randomUUID(),version:1});
    } else if(action==='draft')replayed=editDraft(room,raw,actor!.player_id,now);
    else if(action==='recommendation')replayed=decideRecommendation(room,raw,actor!.player_id,now);
    else replayed=battleAction(room,action,raw,actor!.player_id,now);
  }
  if(!replayed)emit(room,action.toUpperCase(),now,actorId);return {room,...(replayed===undefined?{}:{replayed}),...(checkout_package?{checkout_package}:{})};
}
function publicBattle(b: Battle) { return {battle_id:b.battle_id,topic:b.topic,status:b.status,ready:Object.fromEntries(Object.entries(b.ready).map(([id,item])=>[id,!!item])),candidates:structuredClone(b.candidates),arguments:b.arguments.map(({event_id,...arg})=>({...arg})),current_turn:structuredClone(b.current_turn),judgement:structuredClone(b.judgement),recommendation:structuredClone(b.recommendation)}; }
export function shoppingWatchView(room: ShoppingRoom) {
  const battle=room.battles.find(b=>b.battle_id===room.active_battle_id)??room.battles.at(-1);
  return {mode:'shopping' as const,room_id:room.room_id,topic:battle?.topic??room.topic,status:room.status,sequence:room.sequence,turn_index:battle?.arguments.length??0,max_turns:4,current_player_id:battle?.current_turn?.player_id??null,players:room.players.map(p=>({player_id:p.player_id,name:p.name,agent_label:p.agent_label})),arguments:battle?.arguments.map(a=>({sequence:a.sequence,player_id:a.player_id,text:a.text,created_at:a.created_at}))??[],judgement:battle?.judgement,context:structuredClone(room.context),draft:structuredClone(room.draft),active_battle_id:room.active_battle_id,battles:room.battles.map(publicBattle),data_source:room._data_source,checkout:publicCheckout(room)};
}
export function viewShopping(room: ShoppingRoom, actorId: string, since=0, now: number) {
  player(room,actorId);if(!Number.isInteger(since)||since<0||since>room.sequence)fail('INVALID_ARGUMENT','游标无效',400);
  const view=shoppingWatchView(room);return {...view,payer:structuredClone(room.payer??null),checkout_details:payerCheckoutDetails(room,actorId),self_player_id:actorId,host_player_id:room.host_player_id,created_at:room.created_at,expires_at:room.expires_at,server_time:now,items:structuredClone(room.items),players:room.players.map(({token_hash,...p})=>({...p,online:now-p.last_seen_at<=30000})),current_turn:room.battles.find(b=>b.battle_id===room.active_battle_id)?.current_turn??null,expected_players:2,joined_players:room.players.length,events:room.events.filter(e=>e.sequence>since)};
}
