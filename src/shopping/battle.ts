import { parse, schemas } from './schemas.ts';
import { emit, fail, fresh, getItem, host, receipt, replay } from './common.ts';
import type { Battle, ShoppingRoom, JudgeJob, Outcome, Side } from './types.ts';
export function activeBattle(room: ShoppingRoom, id: string): Battle {
  if(room.active_battle_id!==id)fail('STALE_BATTLE','当前对局已改变，请读取最新状态');
  const battle=room.battles.find(b=>b.battle_id===id);if(!battle)fail('BATTLE_NOT_FOUND','对局不存在',404);return battle;
}
export function setTurn(room: ShoppingRoom, battle: Battle, now: number) {
  battle.current_turn={turn_id:`${battle.battle_id}:${battle.arguments.length+1}`,player_id:room.players[battle.arguments.length%2].player_id,deadline_at:now+room._turn_ms};
}
export function battleAction(room: ShoppingRoom, action: string, raw: unknown, actor: string, now: number): boolean | undefined {
  if(action==='battle'){
    const input=parse(schemas.battle,raw);if(replay(room,action,input,actor))return true;
    if(room.active_battle_id)fail('BATTLE_BUSY','请先完成或取消当前局');
    if(room.players.length!==2)fail('ROOM_NOT_READY','请等待第二位玩家加入');
    if(room.battles.length>=20)fail('BATTLE_LIMIT','每个房间最多20局');
    const id=crypto.randomUUID();room.battles.push({battle_id:id,topic:input.topic,status:'PREPARING',ready:{},candidates:{},arguments:[],current_turn:null,judgement:{status:'NOT_STARTED'},recommendation:null});
    room.active_battle_id=id;receipt(room,action,input,actor);return false;
  }
  if(action==='say'){
    const input=parse(schemas.say,raw);
    // 重放只对当前/最近完成局有效，不允许旧回合被当成新局输入。
    if(room.active_battle_id!==input.battle_id&&room.active_battle_id!==null)fail('STALE_BATTLE','当前对局已改变');
    if(replay(room,action,input,actor))return true;
    const battle=activeBattle(room,input.battle_id);
    if(battle.status!=='ACTIVE'||!battle.current_turn)fail('INVALID_STATE','当前局不能发言');
    if(battle.current_turn.player_id!==actor)fail('NOT_YOUR_TURN','尚未轮到你');
    if(battle.current_turn.turn_id!==input.turn_id)fail('STALE_TURN','回合已改变');
    battle.arguments.push({sequence:battle.arguments.length+1,event_sequence:room.sequence+1,turn_id:input.turn_id,event_id:input.event_id,player_id:actor,text:input.text,created_at:now});
    receipt(room,action,input,actor);
    if(battle.arguments.length===4){
      battle.current_turn=null;
      if(!room._judge_enabled){battle.status='FAILED';battle.judgement={status:'FAILED',error_code:'JUDGE_NOT_CONFIGURED'};room.active_battle_id=null;}
      else {
        battle.status='JUDGING';battle.judgement={status:'PENDING'};
        const candidates=(['A','B'] as Side[]).map(side=>{const item=battle.candidates[side]!;return {side,name:item.name,spec:item.spec,unit_price_cents:item.unit_price_cents,source:item.source};});
        battle._judge_job={job_id:crypto.randomUUID(),battle_id:battle.battle_id,claimed:false,deadline_at:Math.min(now+60000,room.expires_at),parties:room.players.map((p,i)=>({side:i?'B':'A',player_id:p.player_id})),input:{topic:battle.topic,arguments:battle.arguments.map(a=>({side:a.player_id===room.players[0].player_id?'A':'B',text:a.text})),candidates}};
      }
    } else setTurn(room,battle,now);return false;
  }
  if(action==='ready'){
    const input=parse(schemas.ready,raw);const battle=activeBattle(room,input.battle_id);
    if(battle.status!=='PREPARING')fail('INVALID_STATE','本局已开始，不能更改准备');
    if(input.ready){const item=getItem(room,input.candidate_item_id);if(item.reporter_player_id!==actor)fail('FORBIDDEN','请选择自己查询上报的候选',403);fresh(item,now);battle.ready[actor]=structuredClone(item);}
    else battle.ready[actor]=null;
  } else if(action==='start'){
    const input=parse(schemas.start,raw);host(room,actor);const battle=activeBattle(room,input.battle_id);
    if(battle.status!=='PREPARING'||!room.players.every(p=>battle.ready[p.player_id]))fail('ROOM_NOT_READY','双方尚未选好候选并准备');
    for(const p of room.players){if(now-p.last_seen_at>30000)fail('PLAYER_OFFLINE','请双方刷新状态后开局');const snapshot=battle.ready[p.player_id]!;fresh(snapshot,now);if(getItem(room,snapshot.item_id).version!==snapshot.version)fail('CANDIDATE_CHANGED','候选资料变化，请重新准备');}
    battle.candidates={A:structuredClone(battle.ready[room.players[0].player_id]!),B:structuredClone(battle.ready[room.players[1].player_id]!)};battle.status='ACTIVE';setTurn(room,battle,now);
  } else if(action==='cancel'){
    const input=parse(schemas.cancel,raw);const battle=activeBattle(room,input.battle_id);battle.status='CANCELLED';battle.current_turn=null;
    if(battle.judgement.status==='PENDING')battle.judgement={status:'FAILED',error_code:'JUDGE_CANCELLED'};room.active_battle_id=null;
  } else fail('UNKNOWN_ACTION','不支持的操作',404);
}
export function claimShoppingJudge(room: ShoppingRoom, now: number): JudgeJob | null {
  if(room.status!=='OPEN')return null;const battle=room.battles.find(b=>b.battle_id===room.active_battle_id),job=battle?._judge_job;
  if(!battle||battle.status!=='JUDGING'||battle.judgement.status!=='PENDING'||!job||job.claimed||now>=job.deadline_at)return null;
  job.claimed=true;return structuredClone(job);
}
export function finishShoppingJudge(room: ShoppingRoom, battleId: string, jobId: string, outcome: Outcome, now: number): boolean {
  const battle=room.battles.find(b=>b.battle_id===battleId),job=battle?._judge_job;
  if(room.status!=='OPEN'||now>=room.expires_at||room.active_battle_id!==battleId||!battle||battle.status!=='JUDGING'||battle.judgement.status!=='PENDING'||!job?.claimed||job.job_id!==jobId||now>=job.deadline_at)return false;
  if('result' in outcome){
    const winner=job.parties.find(p=>p.player_id===outcome.result.winner_player_id);if(!winner)fail('JUDGE_INVALID_REPLY','胜者不属于本局');
    battle.judgement={status:'SUCCEEDED',result:structuredClone(outcome.result)};battle.status='FINISHED';
    battle.recommendation={recommendation_id:crypto.randomUUID(),item:structuredClone(battle.candidates[winner.side]!),status:'PENDING'};
  } else {battle.status='FAILED';battle.judgement={status:'FAILED',error_code:outcome.error_code};}
  room.active_battle_id=null;emit(room,'JUDGE_COMPLETED',now);return true;
}
