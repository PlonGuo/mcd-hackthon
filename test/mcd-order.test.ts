import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createShoppingRoom, transitionShopping, viewShopping, shoppingWatchView } from '../src/shopping/room.ts';
import { FileOrderJournal } from '../scripts/lib/order-journal.ts';
import { buildOrderPlan, submitOrder, queryOrder } from '../scripts/lib/mcd-order.ts';

const now=1_000_000,account='a'.repeat(64);
const price={success:true,code:200,data:{price:2750,originalPrice:2750,discount:0,productList:[{productCode:'1401',productName:'麦乐鸡5块',quantity:1,subtotal:1400},{productCode:'4810',productName:'中薯条',quantity:1,subtotal:1350}],takeWayList:[{code:'eat-in',title:'堂食'},{code:'take-in-store',title:'外带'}]}};
function setup(){
  let room=createShoppingRoom({mode:'shopping',name:'甲',topic:'真实订单代码测试'},{room_id:'a'.repeat(24),player_id:'A',token_hash:'hashA'},now);
  room=transitionShopping(room,'join',{name:'乙'},null,now,{player_id:'B',token_hash:'hashB'}).room;
  const apply=(action,input,actor='A')=>{const out=transitionShopping(room,action,input,actor,now);room=out.room;return out;};
  apply('context',{store_code:'1450601',name:'盛邦店',address:'四川北路1318号',fulfillment:'SELF_PICKUP',expected_context_version:0});
  for(const [i,p] of price.data.productList.entries()){
    apply('item',{meal_code:p.productCode,name:p.productName,spec:'默认规格',unit_price_cents:p.subtotal,queried_at:now});
    apply('draft',{operation:'add',item_id:room.items[i].item_id,owner:'shared',quantity:1,expected_draft_version:i,event_id:'add'+i});
  }
  apply('payer-nominate',{candidate_player_id:'B',event_id:'nominate'});apply('payer-accept',{candidate_version:1,event_id:'accept'},'B');
  apply('checkout-prepare',{expected_draft_version:2,event_id:'prepare'});
  const checkout_id=room.checkout.checkout_id;
  apply('checkout-package',{checkout_id,event_id:'package'},'B');
  apply('checkout-report',{checkout_id,expected_checkout_version:room.checkout.version,outcome:'QUOTED',total_cents:2750,take_way_options:price.data.takeWayList,event_id:'quote'},'B');
  const packet=apply('checkout-package',{checkout_id,event_id:'packet2'},'B').checkout_package;
  const state=()=>viewShopping(room,'B',0,now);
  const port={state:async()=>state(),report:async input=>{const out=apply('checkout-report',input,'B');return {room:state(),replayed:out.replayed};}};
  const calls=[];let status='1',createResponse,createError=false,reportError=false;
  const official={callTool:async request=>{
    calls.push(request);
    if(request.name==='calculate-price')return {content:[],structuredContent:price};
    if(request.name==='create-order'){
      if(createError)throw new Error('SECRET network timeout');
      return {content:[],structuredContent:createResponse??{success:true,code:200,data:{orderId:'PRIVATE_ORDER',payH5Url:'https://m.mcd.cn/mcp/scanToPay?orderId=PRIVATE_ORDER',orderDetail:{orderId:'PRIVATE_ORDER',orderStatus:'1'}}}};
    }
    if(request.name==='query-order')return {content:[],structuredContent:{success:true,code:200,data:{orderId:'PRIVATE_ORDER',orderStatus:status,pickupCode:'PRIVATE_PICKUP',lockerCode:'PRIVATE_LOCKER',deliveryInfo:{mobilePhone:'PRIVATE_PHONE'}}}};
    if(request.name==='order-list')return {content:[],structuredContent:{success:true,code:200,data:{list:[]}}};
    throw new Error('Unexpected official tool');
  }};
  const wrapped={state:port.state,report:async input=>{if(reportError&&input.outcome==='ORDER_CREATED')throw new Error('room unavailable');return port.report(input);}};
  return {packet,state,port:wrapped,official,calls,get room(){return room;},set status(v){status=v;},set createError(v){createError=v;},set createResponse(v){createResponse=v;},set reportError(v){reportError=v;}};
}
async function journal(t){const path=await mkdtemp(join(tmpdir(),'mcdebate-order-'));t.after(()=>rm(path,{recursive:true,force:true}));return new FileOrderJournal(path);}
function plan(f){return buildOrderPlan(f.packet,f.state(),'take-in-store',account,now);}
const approval=p=>({plan_id:p.plan_id,total_cents:p.total_cents,take_way_code:p.take_way.code});
const deps=(f,j)=>({official:f.official,room:f.port,journal:j,account_hash:account,now:()=>now});

test('订单方案固定用户看到的门店、商品、金额和取餐方式；拒绝测试数据或无效方式',()=>{
  const f=setup(),p=plan(f);assert.equal(p.total_cents,2750);assert.equal(p.request.takeWayCode,'take-in-store');assert.equal('beCode' in p.request,false);assert.equal(p.request.items.length,2);
  assert.throws(()=>buildOrderPlan({...f.packet,source:'TEST_FIXTURE'},f.state(),'take-in-store',account,now));
  assert.throws(()=>buildOrderPlan(f.packet,f.state(),'guess',account,now));
});
test('真实建单只调用一次，官方支付链接只留客户端，重启后也禁止重复提交',async t=>{
  const f=setup(),j=await journal(t),p=plan(f);
  const r=await submitOrder(p,approval(p),deps(f,j));assert.equal(r.state,'ORDER_CREATED');assert.match(r.payment_url,/PRIVATE_ORDER/);
  assert.equal(f.room.checkout.status,'ORDER_CREATED');assert.equal(f.calls.filter(c=>c.name==='create-order').length,1);
  await assert.rejects(()=>submitOrder(p,approval(p),deps(f,new FileOrderJournal(j.directory))));
  assert.equal(f.calls.filter(c=>c.name==='create-order').length,1);
  const publicData=JSON.stringify(shoppingWatchView(f.room));for(const secret of ['PRIVATE_ORDER','PRIVATE_PICKUP','PRIVATE_PHONE','scanToPay'])assert.equal(publicData.includes(secret),false);
  assert.equal((await stat(j.path(p))).mode&0o777,0o600);
});
test('错误确认、换账户、过期或被修改的方案均在写请求前拒绝',async t=>{
  const f=setup(),j=await journal(t),p=plan(f);
  for(const [candidate,confirm,options] of [
    [p,{...approval(p),total_cents:1},deps(f,j)],
    [p,approval(p),{...deps(f,j),account_hash:'b'.repeat(64)}],
    [p,approval(p),{...deps(f,j),now:()=>p.expires_at+1}],
    [{...p,request:{...p.request,storeCode:'OTHER'}},approval(p),deps(f,j)],
  ])await assert.rejects(()=>submitOrder(candidate,confirm,options));
  assert.equal(f.calls.filter(c=>c.name==='create-order').length,0);
});
test('重新核价变化必须重新确认，不把旧价格提交到官方',async t=>{
  const f=setup(),j=await journal(t),p=plan(f);
  const changed={callTool:async()=>({content:[],structuredContent:{...price,data:{...price.data,price:2800,originalPrice:2800}}})};
  await assert.rejects(()=>submitOrder(p,approval(p),{...deps(f,j),official:changed}),/PRICE_CHANGED/);
  assert.equal(f.room.checkout.status,'QUOTED');assert.equal(await j.read(p),null);
});
test('并发或回执重放都不会再次创建订单',async t=>{
  const f=setup(),j=await journal(t),p=plan(f);
  await Promise.allSettled([submitOrder(p,approval(p),deps(f,j)),submitOrder(p,approval(p),deps(f,j))]);
  assert.equal(f.calls.filter(c=>c.name==='create-order').length,1);
  const other=setup(),k=await journal(t),q=plan(other),original=other.port.report;
  other.port.report=async input=>({...await original(input),replayed:true});
  const r=await submitOrder(q,approval(q),deps(other,k));assert.equal(r.state,'UNKNOWN');assert.equal(other.calls.filter(c=>c.name==='create-order').length,0);
});
test('超时和非法响应保持未知，不盲目重下；空历史也不冒充未下单',async t=>{
  const f=setup(),j=await journal(t),p=plan(f);f.createError=true;
  const r=await submitOrder(p,approval(p),deps(f,j));assert.equal(r.state,'UNKNOWN');assert.equal(f.room.checkout.status,'UNKNOWN');
  await assert.rejects(()=>submitOrder(p,approval(p),deps(f,j)));
  const q=await queryOrder(p,deps(f,j));assert.equal(q.state,'UNKNOWN');assert.equal(f.calls.filter(c=>c.name==='create-order').length,1);assert.equal(f.calls.at(-1).name,'order-list');
  const malformed=setup(),k=await journal(t),s=plan(malformed);malformed.createResponse={success:true,code:200,data:{anything:'PRIVATE_PHONE'}};
  assert.equal((await submitOrder(s,approval(s),deps(malformed,k))).state,'UNKNOWN');
});
test('官方已建单但房间上报失败，可查单恢复，不重复创建或误报已支付',async t=>{
  const f=setup(),j=await journal(t),p=plan(f);f.reportError=true;
  const r=await submitOrder(p,approval(p),deps(f,j));assert.equal(r.state,'ORDER_CREATED');assert.equal(r.room_report_pending,true);
  f.reportError=false;const restored=await queryOrder(p,deps(f,new FileOrderJournal(j.directory)));assert.equal(restored.state,'ORDER_CREATED');assert.equal(f.room.checkout.status,'ORDER_CREATED');
  f.status='2';const paid=await queryOrder(p,deps(f,j));assert.equal(paid.state,'PAID');assert.equal(paid.pickup_code,'PRIVATE_PICKUP');assert.equal(f.room.checkout.status,'PAID');
  assert.equal(JSON.stringify(paid).includes('PRIVATE_PHONE'),false);assert.equal(f.calls.filter(c=>c.name==='create-order').length,1);
});
test('官方未支付自动取消单独记录，不能退回未下单或继续修改原清单',async t=>{
  const f=setup(),j=await journal(t),p=plan(f);await submitOrder(p,approval(p),deps(f,j));f.status='7';
  const cancelled=await queryOrder(p,deps(f,j));assert.equal(cancelled.state,'ORDER_CANCELLED');assert.equal(f.room.checkout.status,'ORDER_CANCELLED');
});

test('建单请求正在等待时查单不能覆盖提交记录或丢失成功订单号',async t=>{
  const f=setup(),j=await journal(t),p=plan(f),original=f.official.callTool;
  let release,started;const pending=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  f.official.callTool=async request=>{if(request.name==='create-order'){started();await pending;}return original(request);};
  const writing=submitOrder(p,approval(p),deps(f,j));await entered;
  try{await assert.rejects(()=>queryOrder(p,deps(f,j)),/IN_PROGRESS/);}finally{release();}
  assert.equal((await writing).order_id,'PRIVATE_ORDER');
});

test('保存记录时进程被终止，重启后可读取并继续查单，不残留永久锁',async t=>{
  const f=setup(),j=await journal(t),p=plan(f);await submitOrder(p,approval(p),deps(f,j));
  const child=spawn(process.execPath,['--input-type=module','-e',`
    import {DatabaseSync} from 'node:sqlite';
    const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN IMMEDIATE');
    process.stdout.write('locked');setInterval(()=>{},1000);
  `,j.path(p)],{stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGKILL'));
  const ready=await Promise.race([once(child.stdout,'data').then(()=>true),once(child,'exit').then(()=>false)]);
  assert.equal(ready,true);const ended=once(child,'exit');child.kill('SIGKILL');await ended;
  assert.equal((await queryOrder(p,deps(f,new FileOrderJournal(j.directory)))).order_id,'PRIVATE_ORDER');
});

test('提交进程退出后只查历史保持未知，空历史不允许重下',async t=>{
  const f=setup(),j=await journal(t),p=plan(f);
  const child=spawn(process.execPath,['-e','process.exit(0)']);const deadPid=child.pid;await once(child,'exit');
  await j.claim(p,{plan_id:p.plan_id,account_hash:account,owner_pid:deadPid,state:'DISPATCHING',dispatch_at:now,room_report_pending:true});
  await f.port.report({checkout_id:p.checkout_id,expected_checkout_version:p.checkout_version,outcome:'SUBMITTING',quote_id:p.quote_id,expected_total_cents:p.total_cents,take_way_code:p.take_way.code,event_id:'crashed'});
  const result=await queryOrder(p,deps(f,j));assert.equal(result.state,'UNKNOWN');assert.equal(result.candidate_count,0);
  assert.equal(f.calls.filter(c=>c.name==='create-order').length,0);
  await assert.rejects(()=>submitOrder(p,approval(p),deps(f,j)),/ALREADY_ATTEMPTED/);
});
