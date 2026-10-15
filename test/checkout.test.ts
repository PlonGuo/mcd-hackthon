import test from 'node:test';
import assert from 'node:assert/strict';
import { createShoppingRoom, transitionShopping, tickShopping, viewShopping, shoppingWatchView } from '../src/shopping/room.ts';

const now=1_000_000;
function setup(source='TEST_FIXTURE') {
  let room=createShoppingRoom({mode:'shopping',name:'甲',topic:'结账测试'},{room_id:'a'.repeat(24),player_id:'A',token_hash:'hashA'},now,{source});
  room=transitionShopping(room,'join',{name:'乙'},null,now,{player_id:'B',token_hash:'hashB'}).room;
  const apply=(action,input,actor='A',at=now)=>{const value=action==='checkout-report'?{expected_checkout_version:tickShopping(room,at).checkout?.version,...(input.outcome==='QUOTED'?{take_way_options:[{code:'eat-in',title:'堂食'},{code:'take-in-store',title:'外带'}]}:{}),...input}:input;const result=transitionShopping(room,action,value,actor,at);room=result.room;return result;};
  apply('context',{store_code:'STORE',name:'门店',address:'公开地址',fulfillment:'SELF_PICKUP',expected_context_version:0});
  apply('item',{meal_code:'MEAL',name:'鸡块',spec:'单份',unit_price_cents:1300,queried_at:now});
  apply('draft',{operation:'add',item_id:room.items[0].item_id,owner:'shared',quantity:2,expected_draft_version:0,event_id:'cart'});
  const nominate=()=>apply('payer-nominate',{candidate_player_id:'B',event_id:'nominate'});
  const accept=()=>apply('payer-accept',{candidate_version:room.payer.version,event_id:'accept'},'B');
  const prepare=()=>{apply('checkout-prepare',{expected_draft_version:room.draft.version,event_id:'prepare'});return room.checkout.checkout_id;};
  const ready=()=>{nominate();accept();const id=prepare();apply('checkout-package',{checkout_id:id,event_id:'package'},'B');return id;};
  const simulate=(id,operation,scenario,at=now)=>apply('checkout-simulate',{checkout_id:id,operation,...(scenario?{scenario}:{}),event_id:'mock_'+operation},'B',at);
  const confirm=(id,at=now)=>apply('checkout-report',{checkout_id:id,outcome:'SUBMITTING',quote_id:room.checkout.quote.quote_id,expected_total_cents:room.checkout.quote.total_cents,...(source==='AGENT_REPORTED'?{take_way_code:'take-in-store'}:{}),event_id:'submit'},'B',at);
  return {get room(){return room;},apply,nominate,accept,prepare,ready,simulate,confirm};
}
const fails=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('付款人必须由房主提名、本人接受最新版本；重放不重复提名',()=>{
  const f=setup();fails(()=>f.apply('payer-nominate',{candidate_player_id:'B',event_id:'bad'},'B'),'FORBIDDEN');
  f.nominate();assert.equal(f.room.payer.accepted,false);assert.equal(f.apply('payer-nominate',{candidate_player_id:'B',event_id:'nominate'}).replayed,true);
  fails(()=>f.apply('payer-accept',{candidate_version:1,event_id:'stolen'}),'FORBIDDEN');
  f.apply('payer-nominate',{candidate_player_id:'A',event_id:'changed'});
  fails(()=>f.apply('payer-accept',{candidate_version:1,event_id:'stale'},'B'),'PAYER_CONFLICT');
  fails(()=>f.prepare(),'PAYER_REQUIRED');
  f.apply('payer-accept',{candidate_version:2,event_id:'self'});assert.equal(f.room.payer.accepted,true);
});

test('结账固定清单并冻结改单与新局；领取前取消可继续点餐',()=>{
  const f=setup();f.nominate();f.accept();
  fails(()=>f.apply('checkout-prepare',{expected_draft_version:0,event_id:'stale'}),'DRAFT_CONFLICT');
  const id=f.prepare();assert.equal(f.room.checkout.status,'PREPARED');
  const change={operation:'set_quantity',line_id:f.room.draft.lines[0].line_id,quantity:3,expected_draft_version:1,event_id:'edit'};
  fails(()=>f.apply('draft',change),'CHECKOUT_LOCKED');
  fails(()=>f.apply('battle',{topic:'再战',event_id:'battle'}),'CHECKOUT_LOCKED');
  fails(()=>f.apply('payer-nominate',{candidate_player_id:'A',event_id:'switch'}),'CHECKOUT_LOCKED');
  f.apply('checkout-cancel',{checkout_id:id,event_id:'cancel'});f.apply('draft',change);
  assert.equal(f.room.draft.total_cents,3900);assert.equal(f.room.status,'OPEN');
  const active=setup();active.nominate();active.accept();active.apply('battle',{topic:'未结束',event_id:'battle'});
  fails(()=>active.prepare(),'BATTLE_BUSY');
});

test('只有付款人可领取固定方案，公开页面和对方不可见私有核价标识',()=>{
  const f=setup();f.nominate();f.accept();const id=f.prepare();
  fails(()=>f.apply('checkout-package',{checkout_id:id,event_id:'steal'}),'FORBIDDEN');
  const packet=f.apply('checkout-package',{checkout_id:id,event_id:'package'},'B').checkout_package;
  assert.equal(packet.draft.lines[0].quantity,2);assert.equal(packet.context.store_code,'STORE');
  fails(()=>f.apply('checkout-cancel',{checkout_id:id,event_id:'cancel'}),'CHECKOUT_IN_PROGRESS');
  f.simulate(id,'quote');
  const encoded=JSON.stringify(shoppingWatchView(f.room));
  for(const secret of ['hashA','hashB','_demo_order','quote_id','checkout_package','payment_url'])assert.equal(encoded.includes(secret),false);
  assert.equal(viewShopping(f.room,'A',0,now).checkout_details,null);
  assert.equal(viewShopping(f.room,'B',0,now).checkout_details.quote.quote_id,f.room.checkout.quote.quote_id);
});

test('测试核价、确认、创建、模拟支付是独立步骤；金额或报价过期必须重确认',()=>{
  const f=setup(),id=f.ready();f.simulate(id,'quote');assert.equal(f.room.checkout.quote.total_cents,2600);
  fails(()=>f.simulate(id,'create'),'CHECKOUT_STATE');
  fails(()=>f.apply('checkout-report',{checkout_id:id,outcome:'SUBMITTING',quote_id:f.room.checkout.quote.quote_id,expected_total_cents:1,event_id:'wrong'},'B'),'QUOTE_CHANGED');
  fails(()=>f.confirm(id,now+180001),'CHECKOUT_QUOTE_EXPIRED');
  f.confirm(id);f.simulate(id,'create');assert.equal(f.room.checkout.status,'ORDER_CREATED');
  assert.equal(f.room.checkout.source,'TEST_FIXTURE');assert.equal(f.room.status,'OPEN');
  f.simulate(id,'pay');assert.equal(f.room.checkout.status,'PAID');
  assert.equal(f.simulate(id,'pay').replayed,true);assert.equal(f.room.draft.total_cents,2600);
  fails(()=>f.apply('checkout-prepare',{expected_draft_version:1,event_id:'again'}),'CHECKOUT_LOCKED');
});

test('创建超时保持未知，禁止重复创建；查到订单后才能继续模拟支付',()=>{
  const f=setup(),id=f.ready();f.simulate(id,'quote');f.confirm(id);f.simulate(id,'create','timeout_created');
  assert.equal(f.room.checkout.status,'UNKNOWN');
  fails(()=>f.apply('checkout-simulate',{checkout_id:id,operation:'create',event_id:'retry'},'B'),'CHECKOUT_STATE');
  fails(()=>f.apply('checkout-cancel',{checkout_id:id,event_id:'blind_cancel'}),'CHECKOUT_IN_PROGRESS');
  f.simulate(id,'query');assert.equal(f.room.checkout.status,'ORDER_CREATED');f.simulate(id,'pay');
  const noOrder=setup(),other=noOrder.ready();noOrder.simulate(other,'quote');noOrder.confirm(other);noOrder.simulate(other,'create','timeout_no_order');
  noOrder.simulate(other,'query');assert.equal(noOrder.room.checkout.status,'NO_ORDER');
  noOrder.apply('draft',{operation:'remove',line_id:noOrder.room.draft.lines[0].line_id,expected_draft_version:1,event_id:'resume'});
  assert.equal(noOrder.room.draft.lines.length,0);
});

test('正式路径只保存Agent上报，严格拒绝模拟调用、支付链接和伪造可信来源',()=>{
  const f=setup('AGENT_REPORTED'),id=f.ready();
  fails(()=>f.simulate(id,'quote'),'TEST_DATA_DISABLED');
  fails(()=>f.apply('checkout-report',{checkout_id:id,outcome:'PAID',event_id:'skip'},'B'),'CHECKOUT_STATE');
  f.apply('checkout-report',{checkout_id:id,outcome:'QUOTED',total_cents:2800,event_id:'quote'},'B');
  assert.equal(f.room.checkout.quote.total_cents,2800);assert.equal(f.room.draft.total_cents,2600);
  fails(()=>f.apply('checkout-report',{checkout_id:id,outcome:'QUOTED',total_cents:2800,payment_url:'https://secret.invalid',event_id:'leak'},'B'),'INVALID_ARGUMENT');
  fails(()=>f.apply('checkout-report',{checkout_id:id,outcome:'ORDER_CREATED',source:'OFFICIAL',event_id:'fake'},'B'),'INVALID_ARGUMENT');
  f.confirm(id);f.apply('checkout-report',{checkout_id:id,outcome:'UNKNOWN',event_id:'unknown'},'B');
  f.apply('checkout-report',{checkout_id:id,outcome:'ORDER_CREATED',event_id:'created'},'B');
  f.apply('checkout-report',{checkout_id:id,outcome:'PAID',event_id:'paid'},'B');
  assert.equal(f.room.checkout.source,'AGENT_REPORTED');
  fails(()=>f.apply('checkout-report',{checkout_id:id,outcome:'NO_ORDER',event_id:'contradiction'},'B'),'CHECKOUT_STATE');
});

test('测试房间不能用上报伪造模拟订单；提交失联超时进入未知且关房不等于取消订单',()=>{
  const f=setup(),id=f.ready();
  fails(()=>f.apply('checkout-report',{checkout_id:id,outcome:'QUOTED',total_cents:1,event_id:'fake'},'B'),'TEST_REPORT_DISABLED');
  f.simulate(id,'quote');f.confirm(id);
  assert.equal(tickShopping(f.room,now+60001).checkout.status,'UNKNOWN');
  f.simulate(id,'create');f.apply('close',{});
  f.simulate(id,'query');assert.equal(f.room.checkout.status,'ORDER_CREATED');assert.equal(f.room.status,'CLOSED');
});

test('旧交接与旧回执不能作用于新清单；没有商品不能准备结账',()=>{
  const f=setup();f.nominate();f.accept();const old=f.prepare();f.apply('checkout-cancel',{checkout_id:old,event_id:'cancel'});
  f.apply('checkout-prepare',{expected_draft_version:1,event_id:'new_prepare'});const id=f.room.checkout.checkout_id;
  assert.notEqual(id,old);fails(()=>f.apply('checkout-package',{checkout_id:old,event_id:'late'},'B'),'STALE_CHECKOUT');
  f.apply('checkout-cancel',{checkout_id:id,event_id:'cancel2'});
  f.apply('draft',{operation:'remove',line_id:f.room.draft.lines[0].line_id,expected_draft_version:1,event_id:'remove'});
  fails(()=>f.apply('checkout-prepare',{expected_draft_version:2,event_id:'empty'}),'EMPTY_DRAFT');
});

test('提交前的未下单查询迟到不能解锁正在创建或未知的订单',()=>{
  const f=setup('AGENT_REPORTED'),id=f.ready();
  f.apply('checkout-report',{checkout_id:id,outcome:'QUOTED',total_cents:2600,event_id:'quote'},'B');
  const old=f.room.checkout.version;f.confirm(id);
  fails(()=>f.apply('checkout-report',{checkout_id:id,outcome:'NO_ORDER',expected_checkout_version:old,event_id:'late_no_order'},'B'),'CHECKOUT_CONFLICT');
  assert.equal(f.room.checkout.status,'SUBMITTING');
});

test('过期后付款人仅有24小时核对窗口，不能重新核价建单；记录不重新开房',()=>{
  const f=setup('AGENT_REPORTED'),id=f.ready();
  f.apply('checkout-report',{checkout_id:id,outcome:'QUOTED',total_cents:2600,event_id:'quote'},'B');f.confirm(id);
  const expired=f.room.expires_at+1;
  f.apply('checkout-report',{checkout_id:id,outcome:'ORDER_CREATED',event_id:'late_created'},'B',expired);
  assert.equal(f.room.status,'EXPIRED');assert.equal(f.room.checkout.status,'ORDER_CREATED');
  f.apply('checkout-report',{checkout_id:id,outcome:'PAID',event_id:'late_paid'},'B',expired+1);
  fails(()=>f.apply('checkout-report',{checkout_id:id,outcome:'QUOTED',total_cents:2600,event_id:'new_quote'},'B',expired),'ROOM_EXPIRED');
  fails(()=>f.apply('checkout-report',{checkout_id:id,outcome:'PAID',event_id:'too_late'},'B',expired+86400000),'ROOM_EXPIRED');
});

test('正式核价保留官方取餐选项，确认必须明确选择有效方式，不能猜默认值',()=>{
  const f=setup('AGENT_REPORTED'),id=f.ready();
  const options=[{code:'eat-in',title:'堂食'},{code:'take-in-store',title:'外带'}];
  f.apply('checkout-report',{checkout_id:id,outcome:'QUOTED',total_cents:2600,take_way_options:options,event_id:'quote'},'B');
  const quote=f.room.checkout.quote;
  const submit={checkout_id:id,outcome:'SUBMITTING',quote_id:quote.quote_id,expected_total_cents:2600,event_id:'submit_takeway'};
  fails(()=>f.apply('checkout-report',submit,'B'),'TAKE_WAY_REQUIRED');
  fails(()=>f.apply('checkout-report',{...submit,take_way_code:'GUESS'},'B'),'TAKE_WAY_REQUIRED');
  f.apply('checkout-report',{...submit,take_way_code:'take-in-store'},'B');
  assert.equal(f.room.checkout.take_way.title,'外带');assert.equal(shoppingWatchView(f.room).checkout.take_way_title,'外带');
});
