import test from 'node:test';
import assert from 'node:assert/strict';
import { createShoppingRoom, transitionShopping, tickShopping, viewShopping, claimShoppingJudge, finishShoppingJudge, shoppingWatchView } from '../src/shopping/room.ts';

const now = 1000000;
const identity = {room_id:'a'.repeat(24),player_id:'A',token_hash:'hashA'};
function setup() {
  let room=createShoppingRoom({name:'甲',topic:'一起点餐',mode:'shopping'},identity,now,{source:'TEST_FIXTURE',judgeEnabled:true});
  room=transitionShopping(room,'join',{name:'乙'},null,now,{player_id:'B',token_hash:'hashB'}).room;
  const apply=(action,input,actor='A',at=now)=>{const out=transitionShopping(room,action,input,actor,at);room=out.room;return out;};
  const lock=()=>apply('context',{store_code:'TEST_STORE',name:'测试门店',address:'测试路1号',fulfillment:'SELF_PICKUP',expected_context_version:0});
  const item=(actor,code,price=1000)=>{apply('item',{meal_code:code,name:code,spec:'单份',unit_price_cents:price,queried_at:now},actor);return room.items.find(i=>i.reporter_player_id===actor&&i.meal_code===code).item_id;};
  const battle=(a,b)=>{apply('battle',{topic:'鸡块还是薯条',event_id:'new_'+room.battles.length});const id=room.active_battle_id;apply('ready',{battle_id:id,candidate_item_id:a,ready:true});apply('ready',{battle_id:id,candidate_item_id:b,ready:true},'B');apply('start',{battle_id:id});return id;};
  return {get room(){return room;},apply,lock,item,battle};
}
const fails=(fn,code)=>assert.throws(fn,e=>e.code===code);
const result={scores:[{player_id:'A',fit:30,evidence:20,response:15,humor:7,total:72,reason:'理由A'},{player_id:'B',fit:31,evidence:20,response:15,humor:7,total:73,reason:'理由B'}],winner_player_id:'B',tie_break:null,round_comments:[{round:1,comment:'一'},{round:2,comment:'二'}],summary:'测试判决'};

test('购物会话先锁店，禁止未确认写入、越权锁店和更换门店',()=>{
  const f=setup();fails(()=>f.item('A','鸡块'),'STORE_REQUIRED');
  fails(()=>f.apply('context',{store_code:'x',name:'x',address:'x',fulfillment:'SELF_PICKUP',expected_context_version:0},'B'),'FORBIDDEN');
  f.lock();assert.equal(f.room.context.version,1);assert.equal(f.room.context.source,'TEST_FIXTURE');
  fails(()=>f.lock(),'STORE_LOCKED');assert.equal(f.room.status,'OPEN');
});

test('清单版本、行权限、同事件重放和资料快照独立于对战',()=>{
  const f=setup();f.lock();const a=f.item('A','鸡块');const b=f.item('B','薯条',1200);
  const add={operation:'add',item_id:a,owner:'self',quantity:2,expected_draft_version:0,event_id:'add1'};
  f.apply('draft',add);assert.equal(f.room.draft.total_cents,2000);
  assert.equal(f.apply('draft',add).replayed,true);assert.equal(f.room.draft.version,1);
  fails(()=>f.apply('draft',{...add,quantity:3}),'EVENT_CONFLICT');
  fails(()=>f.apply('draft',{...add,event_id:'stale'}),'DRAFT_CONFLICT');
  const line=f.room.draft.lines[0].line_id;
  fails(()=>f.apply('draft',{operation:'remove',line_id:line,expected_draft_version:1,event_id:'steal'},'B'),'FORBIDDEN');
  f.item('A','鸡块',1500);assert.equal(f.room.draft.total_cents,2000);
  const battle=f.battle(a,b);const version=f.room.draft.version;
  f.apply('draft',{operation:'add',item_id:b,owner:'self',quantity:1,expected_draft_version:version,event_id:'during'},'B');
  assert.equal(f.room.battles[0].status,'ACTIVE');assert.equal(f.room.draft.total_cents,3200);
  assert.equal(f.room.battles[0].candidates.A.unit_price_cents,1500);
  fails(()=>f.apply('say',{battle_id:'old',turn_id:'old',event_id:'old',text:'旧局'}),'STALE_BATTLE');
  assert.equal(f.room.active_battle_id,battle);
});

test('四条后裁判独立领取，结果留档、采纳幂等，第二局不覆盖清单和历史',()=>{
  const f=setup();f.lock();const a=f.item('A','鸡块'),b=f.item('B','薯条');const id=f.battle(a,b);
  for(let i=0;i<4;i++){const current=f.room.battles[0].current_turn;f.apply('say',{battle_id:id,turn_id:current.turn_id,event_id:'say'+i,text:'观点'+i},i%2?'B':'A');}
  assert.equal(f.room.status,'OPEN');assert.equal(f.room.battles[0].status,'JUDGING');
  const job=claimShoppingJudge(f.room,now);assert.equal(job.battle_id,id);assert.equal(claimShoppingJudge(f.room,now),null);
  assert.equal(finishShoppingJudge(f.room,id,job.job_id,{result},now),true);
  assert.equal(f.room.active_battle_id,null);const rec=f.room.battles[0].recommendation;
  const accept={battle_id:id,recommendation_id:rec.recommendation_id,decision:'apply',quantity:2,expected_draft_version:0,event_id:'accept'};
  f.apply('recommendation',accept);assert.equal(f.room.draft.total_cents,2000);
  assert.equal(f.apply('recommendation',accept).replayed,true);
  const second=f.battle(a,b);assert.notEqual(second,id);assert.equal(f.room.battles.length,2);assert.equal(f.room.draft.lines.length,1);
  fails(()=>f.apply('say',{battle_id:id,turn_id:id+':1',event_id:'old-late',text:'迟到'}),'STALE_BATTLE');
  const publicView=shoppingWatchView(f.room);assert.equal(publicView.battles.length,2);
  const encoded=JSON.stringify(publicView);for(const privateField of ['hashA','hashB','_judge_job','_receipts','self_player_id'])assert.equal(encoded.includes(privateField),false);
});

test('取消裁判中局拒绝晚回，不清空清单；暂停局取消后可再战',()=>{
  const f=setup();f.lock();const a=f.item('A','鸡块'),b=f.item('B','薯条');const id=f.battle(a,b);
  for(let i=0;i<4;i++)f.apply('say',{battle_id:id,turn_id:f.room.battles[0].current_turn.turn_id,event_id:'cancel'+i,text:'观点'},i%2?'B':'A');
  const job=claimShoppingJudge(f.room,now);f.apply('cancel',{battle_id:id},'B');
  assert.equal(finishShoppingJudge(f.room,id,job.job_id,{result},now),false);assert.equal(f.room.battles[0].recommendation,null);
  const next=f.battle(a,b);const ticked=tickShopping(f.room,now+120001);assert.equal(ticked.battles[1].status,'PAUSED');
  fails(()=>transitionShopping(ticked,'battle',{topic:'新局',event_id:'blocked'},'A',now+120001),'BATTLE_BUSY');
  const cancelled=transitionShopping(ticked,'cancel',{battle_id:next},'A',now+120001).room;assert.equal(cancelled.status,'OPEN');assert.equal(cancelled.active_battle_id,null);
});

test('输入严格限制、报价过期、清单与对战版本分离，关闭和过期禁止写入',()=>{
  const f=setup();f.lock();fails(()=>f.apply('item',{meal_code:'x',name:'x',spec:'x',unit_price_cents:1.5,queried_at:now}),'INVALID_ARGUMENT');
  fails(()=>f.apply('item',{meal_code:'x',name:'x',spec:'x',unit_price_cents:1,queried_at:now,source:'OFFICIAL'}),'INVALID_ARGUMENT');
  const a=f.item('A','鸡块'),b=f.item('B','薯条');f.battle(a,b);assert.equal(f.room.draft.version,0);
  fails(()=>f.apply('draft',{operation:'add',item_id:a,owner:'shared',quantity:1,expected_draft_version:0,event_id:'shared'},'B'),'FORBIDDEN');
  fails(()=>f.apply('draft',{operation:'add',item_id:a,owner:'self',quantity:1,expected_draft_version:0,event_id:'staleprice'},'A',now+600001),'QUOTE_EXPIRED');
  const view=viewShopping(f.room,'A',0,now);assert.equal(view.self_player_id,'A');assert.equal(view.draft.version,0);
  f.apply('close',{});fails(()=>f.item('A','new'),'ROOM_CLOSED');
  assert.equal(tickShopping(f.room,now+1800001).status,'EXPIRED');
});

test('同内容报价刷新后允许改单与采纳历史建议，实质价格变化仍须明确处理',()=>{
  const f=setup();f.lock();const a=f.item('A','鸡块'),b=f.item('B','薯条');
  f.apply('draft',{operation:'add',item_id:a,owner:'self',quantity:1,expected_draft_version:0,event_id:'fresh-add'});
  const id=f.battle(a,b);
  for(let i=0;i<4;i++)f.apply('say',{battle_id:id,turn_id:f.room.battles[0].current_turn.turn_id,event_id:'fresh-say'+i,text:'观点'},i%2?'B':'A');
  const job=claimShoppingJudge(f.room,now);finishShoppingJudge(f.room,id,job.job_id,{result},now);
  const later=now+600001;
  f.apply('item',{meal_code:'鸡块',name:'鸡块',spec:'单份',unit_price_cents:1000,queried_at:later},'A',later);
  f.apply('item',{meal_code:'薯条',name:'薯条',spec:'单份',unit_price_cents:1000,queried_at:later},'B',later);
  f.apply('draft',{operation:'set_quantity',line_id:f.room.draft.lines[0].line_id,quantity:2,expected_draft_version:1,event_id:'fresh-qty'},'A',later);
  assert.equal(f.room.draft.total_cents,2000);
  f.apply('recommendation',{battle_id:id,recommendation_id:f.room.battles[0].recommendation.recommendation_id,decision:'apply',quantity:1,expected_draft_version:2,event_id:'fresh-rec'},'A',later);
  assert.equal(f.room.draft.total_cents,3000);
  f.apply('item',{meal_code:'鸡块',name:'鸡块',spec:'单份',unit_price_cents:2000,queried_at:later},'A',later);
  fails(()=>f.apply('draft',{operation:'set_quantity',line_id:f.room.draft.lines[0].line_id,quantity:3,expected_draft_version:3,event_id:'price-change'},'A',later),'PRICE_CHANGED');
});
