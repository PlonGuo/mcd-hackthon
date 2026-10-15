import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './room-fixture.ts';
import { executeRoomTool } from '../src/mcp.ts';
import { watchPageResponse } from '../src/watch-page.ts';

const raw={scores:[{side:'A',fit:30,evidence:20,response:15,humor:8,reason:'甲'},{side:'B',fit:31,evidence:20,response:15,humor:8,reason:'乙'}],round_comments:[{round:1,comment:'一'},{round:2,comment:'二'}],summary:'交锋',decision:{side:'B',reason:'回应更好'}};
test('购物工具通过共用存储，裁判后SSE继续接收清单与第二局且不泄漏私密数据',async()=>{
  let calls=0;const f=fixture({MODEL_PROVIDER:'deepseek',JUDGE_ENABLED:'true',SHOPPING_DATA_MODE:'fixture',DEEPSEEK_API_KEY:'test-only'},async(url,options)=>{
    calls++;const body=JSON.parse(options.body);assert.equal(body.messages[1].content.includes('TEST_FIXTURE'),true);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]});
  });
  const env={SHOPPING_DATA_MODE:'fixture',ROOMS:{idFromName:n=>n,get:()=>({fetch:r=>f.controller.fetch(r)})}};
  const call=async(name,args)=>{const out=await executeRoomTool(env,name,args);assert.equal(out.isError,false,JSON.stringify(out.structuredContent));return out.structuredContent.data;};
  const a=await call('create_room',{mode:'shopping',name:'A',topic:'持续点餐'}),room_id=a.room.room_id;
  const A={room_id,player_token:a.player_token},b=await call('join_room',{room_id,name:'B'}),B={room_id,player_token:b.player_token};
  const catalog=(await call('query_demo_catalog',{}));assert.equal(catalog.source,'TEST_FIXTURE');
  await call('set_room_context',{...A,...catalog.stores[0],expected_context_version:0});
  for(const [identity,item] of [[A,catalog.items[0]],[B,catalog.items[1]]])await call('report_item',{...identity,...item});
  let state=(await call('get_room_state',A)).room;const ai=state.items[0].item_id,bi=state.items[1].item_id;
  await call('update_order_draft',{...A,operation:'add',item_id:ai,owner:'self',quantity:1,expected_draft_version:0,event_id:'cart1'});
  const watchPath=new URL(a.watch_url).pathname,abort=new AbortController();
  const response=await f.request(watchPath+'/events',undefined,undefined,'GET',abort.signal),reader=response.body.getReader();
  const read=async()=>new TextDecoder().decode((await reader.read()).value);
  await read();
  const started=await call('create_battle',{...A,topic:'鸡块还是薯条',event_id:'battle1'}),battle_id=started.room.active_battle_id;
  assert.match(await read(),/PREPARING/);
  await call('set_ready',{...A,battle_id,candidate_item_id:ai,ready:true});await read();
  await call('set_ready',{...B,battle_id,candidate_item_id:bi,ready:true});await read();
  await call('start_debate',{...A,battle_id});await read();
  for(let i=0;i<4;i++){
    state=(await call('get_room_state',i%2?B:A)).room;
    await call('submit_argument',{...(i%2?B:A),battle_id,turn_id:state.current_turn.turn_id,event_id:'speech'+i,text:'测试观点'+i});await read();
  }
  await f.drain();assert.equal(calls,1);
  // 判决与任务领取各有快照；持续读到判决后再进行下一次清单编辑。
  let chunk='';while(!chunk.includes('SUCCEEDED'))chunk=await read();
  state=(await call('get_room_state',A)).room;assert.equal(state.status,'OPEN');assert.equal(state.battles[0].judgement.status,'SUCCEEDED');
  await call('update_order_draft',{...B,operation:'add',item_id:bi,owner:'self',quantity:1,expected_draft_version:1,event_id:'cart2'});
  assert.match(await read(),/"version":2/);
  const next=await call('create_battle',{...A,topic:'下一局',event_id:'battle2'});const last=await read();
  assert.notEqual(next.room.active_battle_id,battle_id);assert.equal(next.room.battles.length,2);assert.match(last,/下一局/);
  for(const secret of [a.player_token,b.player_token,'token_hash','_judge_job','_receipts'])assert.equal(last.includes(secret),false);
  abort.abort();await reader.cancel();await f.drain();
});
test('观战页面包含门店、持续清单、历史与只读下一步提示',async()=>{
  const html=await watchPageResponse('/watch/test').text();for(const id of ['store','draft-lines','draft-total','battle-history','next-steps'])assert.match(html,new RegExp('id="'+id+'"'));
});
