import type { AppEnv, RoomContext } from './runtime/types.ts';
import { createRoom, transition, tickRoom, viewRoom, RoomError } from './core.ts';
import { readJson, readBearer, hashToken, newToken, jsonResponse, errorResponse } from './http.ts';
import { buildWatchView, buildWatchUrl, authorizeWatch } from './watch-view.ts';
import { createWatchHub } from './watch-stream.ts';
import { watchPageResponse } from './watch-page.ts';
import { callJudge, validateJudgeResult } from './judge.ts';
import { claimJudge, finishJudge } from './judge-state.ts';
import { isShoppingRoom, createShoppingRoom, transitionShopping, tickShopping, viewShopping, claimShoppingJudge, finishShoppingJudge } from './shopping/room.ts';
import type { StoredRoom, JudgeOutcome } from './types.ts';
const tick=(room:StoredRoom,now:number):StoredRoom=>isShoppingRoom(room)?tickShopping(room,now):tickRoom(room,now);
const view=(room:StoredRoom,actor:string,since:number,now:number)=>isShoppingRoom(room)?viewShopping(room,actor,since,now):viewRoom(room,actor,since,now);
export class RoomController {
  ctx: RoomContext; env:AppEnv; fetchImpl:typeof fetch; watchHub:ReturnType<typeof createWatchHub>;
  constructor(ctx:RoomContext, env:AppEnv, {fetchImpl=fetch}: {fetchImpl?:typeof fetch}={}) {this.ctx=ctx;this.env=env;this.fetchImpl=fetchImpl;this.watchHub=createWatchHub();}
  async fetch(request:Request):Promise<Response> {
    const response=await this.ctx.blockConcurrencyWhile(async()=>{
      try{return await this.handle(request);}catch(error){if(!(error instanceof RoomError))console.error('Room storage request failed:',error instanceof Error?error.name:'Unknown');return errorResponse(error);}
    });
    this.ctx.waitUntil(this.runPendingJudge().catch(()=>{console.error('Judge task could not finish');}));return response;
  }
  async save(room:StoredRoom) {
    await this.ctx.storage.put('room',room);this.watchHub.publish(buildWatchView(room));let next=room.expires_at;
    if(isShoppingRoom(room)){
      const battle=room.battles.find(b=>b.battle_id===room.active_battle_id);
      if(battle?.current_turn)next=Math.min(next,battle.current_turn.deadline_at);
      if(battle?.judgement.status==='PENDING'&&battle._judge_job)next=Math.min(next,battle._judge_job.deadline_at);
      if(room.checkout?.status==='SUBMITTING'&&room.checkout.submission_deadline_at!==null)next=Math.min(next,room.checkout.submission_deadline_at);
    } else {
      if(room.status==='ACTIVE'&&room.current_turn)next=Math.min(next,room.current_turn.deadline_at);
      if(room.judgement?.status==='PENDING'&&room._judge_job)next=Math.min(next,room._judge_job.deadline_at);
    }
    if(['EXPIRED','CLOSED'].includes(room.status)){
      if(isShoppingRoom(room)&&room.checkout?.status==='SUBMITTING'&&room.checkout.submission_deadline_at!==null)await this.ctx.storage.setAlarm(room.checkout.submission_deadline_at);
      else await this.ctx.storage.deleteAlarm();
    }else await this.ctx.storage.setAlarm(next);
  }
  async handle(request:Request):Promise<Response> {
    const url=new URL(request.url);
    const watch=/^\/watch\/([a-f0-9]{24})\/([a-f0-9]{64})(?:\/(snapshot|events))?$/.exec(url.pathname);
    if(watch){
      if(request.method!=='GET')throw new RoomError('METHOD_NOT_ALLOWED','只读观战不支持此操作',405);
      const room=await this.ctx.storage.get<StoredRoom>('room');await authorizeWatch(room,watch[2],Date.now());
      const snapshot=buildWatchView(room!);if(!watch[3])return watchPageResponse(url.pathname);
      return watch[3]==='events'?this.watchHub.subscribe(snapshot,request.signal,{expiresAt:room!.expires_at}):jsonResponse(snapshot);
    }
    const parts=url.pathname.split('/'),action=parts[1]==='_create'?'create':parts[3];
    const input=request.method==='POST'?await readJson(request):{};
    let room=await this.ctx.storage.get<StoredRoom>('room');const now=Date.now();
    if(action==='create'){
      if(room)throw new RoomError('ROOM_EXISTS','房间已存在',409);
      const token=newToken(),identity={room_id:parts[2],player_id:crypto.randomUUID(),token_hash:await hashToken(token)};
      const options={judgeEnabled:this.env.JUDGE_ENABLED==='true',turnMs:Number(this.env.DEMO_TURN_MS??120000)};
      room=input.mode==='shopping'?createShoppingRoom(input,identity,now,{...options,source:this.env.SHOPPING_DATA_MODE==='fixture'?'TEST_FIXTURE':'AGENT_REPORTED'}):createRoom(input,identity,now,options);
      room._watch_token=newToken();room._watch_token_hash=await hashToken(room._watch_token);
      const watch_url=buildWatchUrl(this.env.MCDEBATE_PUBLIC_ORIGIN,room.room_id,room._watch_token);
      await this.save(room);return jsonResponse({room:view(room,identity.player_id,0,now),player_id:identity.player_id,player_token:token,watch_url},201);
    }
    if(!room)throw new RoomError('ROOM_NOT_FOUND','房间不存在',404,'check_room_id');
    const before=room.sequence;room=tick(room,now);if(room.sequence!==before)await this.save(room);
    if(action==='join'){
      const watch_url=room._watch_token?buildWatchUrl(this.env.MCDEBATE_PUBLIC_ORIGIN,room.room_id,room._watch_token):undefined;
      const token=newToken(),identity={player_id:crypto.randomUUID(),token_hash:await hashToken(token)};
      room=isShoppingRoom(room)?transitionShopping(room,action,input,null,now,identity).room:transition(room,action,input,null,now,identity).room;
      await this.save(room);return jsonResponse({room:view(room,identity.player_id,0,now),player_id:identity.player_id,player_token:token,watch_url},201);
    }
    const tokenHash=await hashToken(readBearer(request)),actor=room.players.find(p=>p.token_hash===tokenHash);
    if(!actor)throw new RoomError('UNAUTHORIZED','玩家凭证无效',401,'authenticate');
    let since=0;
    if(action==='state'){
      const value=url.searchParams.get('since')??'0';if(!/^\d{1,10}$/.test(value))throw new RoomError('INVALID_ARGUMENT','since须为非负整数');since=Number(value);
      view(room,actor.player_id,since,now);if(room.status==='EXPIRED')return jsonResponse({room:view(room,actor.player_id,since,now)});
    }
    const result=isShoppingRoom(room)?transitionShopping(room,action,input,actor.player_id,now):transition(room,action,input,actor.player_id,now);
    await this.save(result.room);return jsonResponse({room:view(result.room,actor.player_id,since,now),...(result.replayed===undefined?{}:{replayed:result.replayed}),...('checkout_package' in result&&result.checkout_package?{checkout_package:result.checkout_package}:{})});
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async()=>{const room=await this.ctx.storage.get<StoredRoom>('room');if(room)await this.save(tick(room,Date.now()));});await this.runPendingJudge();
  }
  async runPendingJudge() {
    const job=await this.ctx.blockConcurrencyWhile(async()=>{
      let room=await this.ctx.storage.get<StoredRoom>('room');if(!room)return null;
      const before=room.sequence;room=tick(room,Date.now());
      const job=isShoppingRoom(room)?claimShoppingJudge(room,Date.now()):claimJudge(room,Date.now());
      if(job||room.sequence!==before)await this.save(room);return job;
    });
    if(!job)return;
    let outcome:JudgeOutcome;
    try{const raw=await callJudge(this.env,job.input,{fetchImpl:this.fetchImpl,timeoutMs:Math.max(1,job.deadline_at-Date.now())});outcome={result:validateJudgeResult(raw,job.parties)};}
    catch(error){outcome={error_code:error instanceof RoomError&&error.code.startsWith('JUDGE_')?error.code:'JUDGE_INVALID_REPLY'};}
    await this.ctx.blockConcurrencyWhile(async()=>{
      let room=await this.ctx.storage.get<StoredRoom>('room');if(!room)return;
      const before=room.sequence;room=tick(room,Date.now());
      if(isShoppingRoom(room)&&'battle_id' in job&&typeof job.battle_id==='string')finishShoppingJudge(room,job.battle_id,job.job_id,outcome,Date.now());
      else if(!isShoppingRoom(room))finishJudge(room,job.job_id,outcome,Date.now());
      if(room.sequence!==before)await this.save(room);
    });
  }
}
