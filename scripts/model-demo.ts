import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { modelConfig } from '../src/model-config.ts';
import { schemas } from '../src/shopping/schemas.ts';
import { ModelAgent } from './lib/model-agent.ts';
import type { RoomView } from '../src/types.ts';
import type { shoppingWatchView } from '../src/shopping/room.ts';
type Room=Extract<RoomView,{mode:'shopping'}>;
type Snapshot=ReturnType<typeof shoppingWatchView>;
const catalogSchema=z.object({source:z.literal('TEST_FIXTURE'),stores:z.array(schemas.context.omit({expected_context_version:true})).min(1),items:z.array(schemas.item).min(3)});
const endpoint=process.argv.slice(2).find(a=>a!=='--')??'http://localhost:8790/mcp';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(endpoint).hostname),'测试驱动仅允许本地');
const config=modelConfig(process.env),a=new ModelAgent('麦乐鸡方',endpoint,config),b=new ModelAgent('薯条方',endpoint,config);
const lifecycle=new AbortController(),signal=AbortSignal.any([lifecycle.signal,AbortSignal.timeout(540000)]),started=Date.now();
process.once('SIGINT',()=>lifecycle.abort());process.once('SIGTERM',()=>lifecycle.abort());
const evidence='.superpowers/sdd/2026-10-15-shopping';
const state=async()=>{const data=await a.call('get_room_state');assert.ok('mode' in data.room&&data.room.mode==='shopping');return data.room as Room;};
let heartbeatTask:Promise<void>|undefined,watchTask:Promise<void>|undefined;
const watchAbort=new AbortController();
const snapshots:{sequence:number;draft_version:number;battles:{id:string;status:string;judge:string}[]}[]=[],streamErrors:string[]=[];
const heartbeat=setInterval(()=>{if(heartbeatTask)return;heartbeatTask=Promise.all([a,b].filter(agent=>agent.identity).map(agent=>agent.call('get_room_state'))).then(()=>{}).catch(()=>{console.error('测试客户端心跳失败');lifecycle.abort();}).finally(()=>{heartbeatTask=undefined;});},10000);
async function observe(url:string){
  const response=await fetch(url+'/events',{signal:AbortSignal.any([signal,watchAbort.signal])});assert.equal(response.status,200);assert.ok(response.body);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  let ready!:()=>void;const first=new Promise<void>(resolve=>{ready=resolve;});
  watchTask=(async()=>{
    try{while(true){
      const {value,done}=await reader.read();if(done){if(!watchAbort.signal.aborted)throw new Error('SSE_STREAM_ENDED');break;}buffer+=decoder.decode(value,{stream:true});if(buffer.length>262144)throw new Error('SSE_FRAME_TOO_LARGE');
      let split;while((split=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);const data=frame.split('\n').find(s=>s.startsWith('data: '));if(!data)continue;
        const snapshot=JSON.parse(data.slice(6)) as Snapshot;
        for(const agent of [a,b])if(agent.identity)assert.equal(data.includes(agent.identity.player_token),false);
        snapshots.push({sequence:snapshot.sequence,draft_version:snapshot.draft.version,battles:snapshot.battles.map(b=>({id:b.battle_id,status:b.status,judge:b.judgement.status}))});ready();
      }
    }}catch(error){if(!watchAbort.signal.aborted){streamErrors.push(error instanceof Error?error.name:'SSE_ERROR');ready();}}
    finally{await reader.cancel().catch(()=>{});}
  })();
  await first;assert.deepEqual(streamErrors,[]);
}
try{
  await Promise.all([a.connect(),b.connect()]);
  await a.call('create_room',{mode:'shopping',name:'麦乐鸡方',agent_label:config.provider+'测试 A',topic:'一起点餐'});assert.ok(a.identity&&a.watchUrl);
  await mkdir(evidence,{recursive:true});await writeFile(evidence+'/live-view.json',JSON.stringify({room_id:a.identity.room_id,watch_url:a.watchUrl,source:'TEST_FIXTURE'}));
  await observe(a.watchUrl);
  const menu=catalogSchema.parse(await a.call('query_demo_catalog'));
  // 以下是明确写死的模拟用户选择，不让模型自行制造人类授权。
  await a.call('set_room_context',{...menu.stores[0],expected_context_version:0});
  for(const code of ['TEST_NUGGETS','TEST_COLA'])await a.call('report_item',menu.items.find(i=>i.meal_code===code)!);
  let room=await state();const nuggets=room.items.find(i=>i.meal_code==='TEST_NUGGETS')!,cola=room.items.find(i=>i.meal_code==='TEST_COLA')!;
  await a.call('update_order_draft',{operation:'add',item_id:cola.item_id,owner:'shared',quantity:1,expected_draft_version:room.draft.version,event_id:'before-battle-cola'});
  b.joinRoomId=a.identity.room_id;await b.call('join_room',{name:'薯条方',agent_label:config.provider+'测试 B'});
  const otherMenu=catalogSchema.parse(await b.call('query_demo_catalog'));await b.call('report_item',otherMenu.items.find(i=>i.meal_code==='TEST_FRIES')!);
  room=await state();const fries=room.items.find(i=>i.meal_code==='TEST_FRIES')!;
  assert.equal(nuggets.unit_price_cents,1300);assert.equal(fries.unit_price_cents,1200);assert.equal(room.draft.lines[0].owner_player_id,null);assert.equal(room.draft.total_cents,900);
  console.log('通过：真实MCP锁店、资料上报、先点可乐，来源TEST_FIXTURE');
  for(let round=1;round<=2;round++){
    await a.call('create_battle',{topic:'麦乐鸡还是薯条',event_id:'create-battle-'+round});room=await state();const battle_id=room.active_battle_id!;
    await a.call('set_ready',{battle_id,candidate_item_id:nuggets.item_id,ready:true});await b.call('set_ready',{battle_id,candidate_item_id:fries.item_id,ready:true});
    await Promise.all([a.call('get_room_state'),b.call('get_room_state')]);await a.call('start_debate',{battle_id});
    for(let turn=0;turn<4;turn++){
      const agent=turn%2?b:a;
      if(round===1&&turn===1){
        room=await state();await b.call('update_order_draft',{operation:'add',item_id:fries.item_id,owner:'self',quantity:1,expected_draft_version:room.draft.version,event_id:'during-battle-fries'});
        assert.equal((await state()).battles[0].status,'ACTIVE');console.log('通过：对战进行中，B独立加入个人薯条');
      }
      const own=await agent.call('get_room_state'),context=own.room as Room,current=context.current_turn!;
      assert.equal(current.player_id,context.self_player_id);
      console.log('生成并提交：第'+round+'局，第'+(turn+1)+'条');
      await agent.task(`你支持${turn%2?'薯条':'麦乐鸡'}。当前battle_id=${battle_id}，turn_id=${current.turn_id}。请根据下面真实MCP状态生成一条中文辩论观点，并实际调用submit_argument提交。每次只提交一条，目标60到100字，最多200字；使用event_id=demo_${battle_id}_${turn+1}，不得更改。第一轮提出理由，第二轮回应对方关键理由并收束，可承认有效理由。不得编造官方事实，候选是测试资料。\n当前状态：${JSON.stringify(context)}`,['submit_argument'],signal);
      room=await state();assert.equal(room.battles.at(-1)!.arguments.length,turn+1);
    }
    room=await state();while(room.battles.at(-1)!.judgement.status==='PENDING'){signal.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,1000));room=await state();}
    const battle=room.battles.at(-1)!;assert.equal(battle.status,'FINISHED',JSON.stringify(battle.judgement));assert.equal(battle.judgement.status,'SUCCEEDED');assert.equal(room.status,'OPEN');
    assert.equal(battle.candidates.A?.meal_code,'TEST_NUGGETS');assert.equal(battle.candidates.B?.meal_code,'TEST_FRIES');
    console.log('通过：第'+round+'局真实模型四条发言及唯一胜者判决');
    if(round===1){
      assert.equal(room.draft.lines.length,2);
      await a.call('resolve_recommendation',{battle_id,recommendation_id:battle.recommendation!.recommendation_id,decision:'apply',quantity:1,expected_draft_version:room.draft.version,event_id:'accept-first-winner'});
      assert.equal((await state()).draft.lines.length,3);console.log('通过：模拟用户确认采纳1份胜者餐品，既有清单保留');
    }
  }
  const final=await state();assert.equal(final.battles.length,2);assert.equal(final.draft.lines.length,3);
  const waitUntil=Date.now()+3000;while((snapshots.at(-1)?.sequence??0)<final.sequence&&Date.now()<waitUntil)await new Promise(resolve=>setTimeout(resolve,20));
  for(const battle of final.battles)assert.ok(snapshots.some(s=>s.battles.some(b=>b.id===battle.battle_id&&b.judge==='SUCCEEDED')),'SSE必须收到每局真实判决');
  assert.deepEqual(streamErrors,[]);
  const result={checked_at:new Date().toISOString(),source:'TEST_FIXTURE',mode:'确定性点餐场景 + 两个模型分别实际调用submit_argument + 独立模型裁判；非真实客户端验收',provider:config.provider,model:config.model,room_id:a.identity.room_id,watch_url:a.watchUrl,elapsed_ms:Date.now()-started,model_calls:{A:a.apiRequests,B:b.apiRequests,judge:2},tool_calls:{A:a.toolCalls,B:b.toolCalls},sse:{snapshots,stream_errors:streamErrors},room:final};
  await writeFile(evidence+'/model-result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:true,provider:config.provider,model:config.model,watch_url:a.watchUrl,battles:2,lines:3,model_calls:result.model_calls,sse_snapshots:snapshots.length,elapsed_ms:result.elapsed_ms}));
}catch(error){
  console.error('FAIL:',error instanceof Error?error.message:'测试失败');process.exitCode=1;
  if(a.identity)try{const failed=await a.call('get_room_state');await mkdir(evidence,{recursive:true});await writeFile(evidence+'/model-failure.json',JSON.stringify({provider:config.provider,model:config.model,room:failed.room},null,2));await a.call('close_room');}catch{console.error('未能确认失败测试房间关闭');}
}finally{clearInterval(heartbeat);await heartbeatTask;watchAbort.abort();await watchTask;await Promise.allSettled([a.close(),b.close()]);}
