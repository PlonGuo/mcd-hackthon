import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './room-fixture.ts';
import { executeRoomTool } from '../src/mcp.ts';
import { buildAgentView } from '../src/agent-view.ts';
import { watchPageResponse } from '../src/watch-page.ts';

async function setup(source='fixture'){
  const f=fixture({SHOPPING_DATA_MODE:source},()=>{throw new Error('模拟结账不得访问上游');});
  const env={ROOMS:{idFromName:n=>n,get:()=>({fetch:r=>f.controller.fetch(r)})}};
  const call=async(name,args)=>{const value=name==='report_checkout'?{expected_checkout_version:f.stored.checkout.version,...args}:args;const result=await executeRoomTool(env,name,value);assert.equal(result.isError,false,JSON.stringify(result.structuredContent));return result.structuredContent.data;};
  const bad=async(name,args,code)=>{const result=await executeRoomTool(env,name,args);assert.equal(result.isError,true);assert.equal(result.structuredContent.error.code,code);};
  const a=await call('create_room',{mode:'shopping',name:'甲',topic:'结账'}),room_id=a.room.room_id,A={room_id,player_token:a.player_token};
  const b=await call('join_room',{room_id,name:'乙'}),B={room_id,player_token:b.player_token};
  await call('set_room_context',{...A,store_code:'TEST',name:'测试门店',address:'测试路',fulfillment:'SELF_PICKUP',expected_context_version:0});
  const item=await call('report_item',{...A,meal_code:'TEST_MEAL',name:'鸡块',spec:'一份',unit_price_cents:1000,queried_at:Date.now()});
  await call('update_order_draft',{...A,operation:'add',item_id:item.room.items[0].item_id,owner:'shared',quantity:2,expected_draft_version:0,event_id:'cart'});
  await call('nominate_payer',{...A,candidate_player_id:b.player_id,event_id:'nominate'});
  await call('accept_payer_role',{...B,candidate_version:1,event_id:'accept'});
  const prepared=await call('prepare_checkout',{...A,expected_draft_version:1,event_id:'prepare'}),checkout_id=prepared.room.checkout.checkout_id;
  return {f,call,bad,a,b,A,B,checkout_id};
}

test('MCP完整模拟结账经同一DO和SSE，付款人方案单独返回且观众持续只读',async()=>{
  const {f,call,bad,a,b,A,B,checkout_id}=await setup();
  const abort=new AbortController(),path=new URL(a.watch_url).pathname;
  const response=await f.request(path+'/events',undefined,undefined,'GET',abort.signal),reader=response.body.getReader();
  const read=async()=>{const result=await reader.read();assert.equal(result.done,false);return new TextDecoder().decode(result.value);};
  try{
    await read();await bad('get_checkout_package',{...A,checkout_id,event_id:'steal'},'FORBIDDEN');
    const p=await call('get_checkout_package',{...B,checkout_id,event_id:'package'});assert.equal(p.checkout_package.draft.total_cents,2000);await read();
    const quoted=await call('simulate_checkout',{...B,checkout_id,operation:'quote',event_id:'quote'});const chunk=await read();
    const quote=quoted.room.checkout_details.quote;assert.equal(quote.total_cents,2000);
    for(const secret of [quote.quote_id,a.player_token,b.player_token,'checkout_package','checkout_details','_demo_order'])assert.equal(chunk.includes(secret),false);
    assert.equal((await call('get_room_state',A)).room.checkout_details,null);
    await call('report_checkout',{...B,checkout_id,outcome:'SUBMITTING',quote_id:quote.quote_id,expected_total_cents:2000,event_id:'submit'});await read();
    assert.ok(f.alarm<=Date.now()+60000);
    const create={...B,checkout_id,operation:'create',scenario:'timeout_created',event_id:'create'};
    await call('simulate_checkout',create);assert.match(await read(),/UNKNOWN/);
    assert.equal((await call('simulate_checkout',create)).replayed,true);
    await bad('simulate_checkout',{...create,event_id:'new_attempt'},'CHECKOUT_STATE');
    await call('simulate_checkout',{...B,checkout_id,operation:'query',event_id:'query'});assert.match(await read(),/ORDER_CREATED/);
    await call('simulate_checkout',{...B,checkout_id,operation:'pay',event_id:'pay'});assert.match(await read(),/PAID/);
    const final=(await call('get_room_state',B)).room;
    assert.equal(final.status,'OPEN');assert.equal(final.checkout.source,'TEST_FIXTURE');assert.equal(final.draft.version,1);
    assert.equal(buildAgentView(final).allowed_actions.includes('update_order_draft'),false);
    await bad('create_battle',{...A,topic:'不能再下同一单',event_id:'afterpaid'},'CHECKOUT_LOCKED');
  }finally{abort.abort();await reader.cancel();await f.drain();}
});

test('领取后取消结账须核对未下单；测试abandon释放清单并保持房间可继续',async()=>{
  const {call,bad,A,B,checkout_id}=await setup();
  await call('get_checkout_package',{...B,checkout_id,event_id:'package'});
  await bad('cancel_checkout',{...A,checkout_id,event_id:'cancel'},'CHECKOUT_IN_PROGRESS');
  await call('simulate_checkout',{...B,checkout_id,operation:'abandon',event_id:'abandon'});
  const resumed=await call('create_battle',{...A,topic:'继续',event_id:'resume'});
  assert.ok(resumed.room.active_battle_id);assert.equal(resumed.room.draft.lines.length,1);
});

test('控制器重建和alarm保留提交未知状态，不创建或支付任何上游订单',async()=>{
  const {f,call,B,checkout_id}=await setup();
  await call('get_checkout_package',{...B,checkout_id,event_id:'package'});
  const quoted=await call('simulate_checkout',{...B,checkout_id,operation:'quote',event_id:'quote'});
  await call('report_checkout',{...B,checkout_id,outcome:'SUBMITTING',quote_id:quoted.room.checkout_details.quote.quote_id,expected_total_cents:2000,event_id:'submit'});
  const stored=f.stored;stored.checkout.submission_deadline_at=Date.now()-1;f.stored=stored;
  const {RoomController}=await import('../src/room-object.ts');
  const rebuilt=new RoomController(f.ctx,{SHOPPING_DATA_MODE:'fixture'});
  await rebuilt.alarm();assert.equal(f.stored.checkout.status,'UNKNOWN');assert.equal(f.stored.checkout._demo_order,undefined);
  const query=await call('simulate_checkout',{...B,checkout_id,operation:'query',event_id:'query'});
  assert.equal(query.room.checkout.status,'NO_ORDER');
});

test('提交中关房仍保留超时alarm；关房不把提交当成取消',async()=>{
  const {f,call,A,B,checkout_id}=await setup();
  await call('get_checkout_package',{...B,checkout_id,event_id:'package'});
  const quoted=await call('simulate_checkout',{...B,checkout_id,operation:'quote',event_id:'quote'});
  await call('report_checkout',{...B,checkout_id,outcome:'SUBMITTING',quote_id:quoted.room.checkout_details.quote.quote_id,expected_total_cents:2000,event_id:'submit'});
  const deadline=f.alarm;await call('close_room',A);assert.equal(f.alarm,deadline);
  const stored=f.stored;stored.checkout.submission_deadline_at=Date.now()-1;f.stored=stored;
  await f.controller.alarm();assert.equal(f.stored.checkout.status,'UNKNOWN');assert.equal(f.stored.status,'CLOSED');
  assert.equal(f.alarm,undefined);
});

test('Agent指引只建议当前身份可执行的结账动作，不自动确认下单或支付',async()=>{
  const {call,A,B,checkout_id}=await setup();
  const host=await call('get_room_state',A),payer=await call('get_room_state',B);
  assert.equal(host.allowed_actions.includes('get_checkout_package'),false);
  assert.equal(payer.allowed_actions.includes('get_checkout_package'),true);
  assert.equal(host.allowed_actions.includes('update_order_draft'),false);
  await call('get_checkout_package',{...B,checkout_id,event_id:'package'});
  const quote=await call('simulate_checkout',{...B,checkout_id,operation:'quote',event_id:'quote'});
  assert.equal(quote.next_action,'await_user');assert.equal(quote.next_request,null);
});

test('观战页提供来源明确的订单状态，不包含付款入口和订单操作按钮',async()=>{
  const html=await watchPageResponse('/watch/test').text();
  assert.match(html,/id="checkout-status"/);assert.match(html,/id="checkout-source"/);
  const script=await watchPageResponse('/watch.js').text();assert.match(script,/模拟付款完成/);assert.match(script,/付款人 Agent 上报/);
  assert.doesNotMatch(html,/<button|payment_url/);
});
