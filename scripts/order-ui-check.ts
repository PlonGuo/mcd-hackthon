import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { chromium } from 'playwright';
import type { RoomView } from '../src/types.ts';
import type { CheckoutPackage } from '../src/shopping/types.ts';
import { FileOrderJournal } from './lib/order-journal.ts';
import { buildOrderPlan, submitOrder, queryOrder, type OrderRoomPort } from './lib/mcd-order.ts';

type Room=Extract<RoomView,{mode:'shopping'}>;
interface Data {room:Room;player_id?:string;player_token?:string;watch_url?:string;checkout_package?:CheckoutPackage;replayed?:boolean}
const endpoint=new URL('/mcp',process.env.BASE_URL??'http://localhost:8791').href;
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(endpoint).hostname));
const evidence='.superpowers/sdd/2026-10-15-checkout',directory=await mkdtemp(join(tmpdir(),'order-ui-mock-'));
const browser=await chromium.launch({headless:true}),results:unknown[]=[];
try{for(const width of [390,1280]){
  const host=new Client({name:'order-mock-host',version:'0.6.0'}),payer=new Client({name:'order-mock-payer',version:'0.6.0'});
  const page=await browser.newPage({viewport:{width,height:800}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const call=async(client:Client,name:string,args:Record<string,unknown>):Promise<Data>=>{
    const result=await client.callTool({name,arguments:args},{timeout:15000}),body=result.structuredContent as {ok:boolean;data:Data};
    assert.equal(result.isError,false,name);assert.equal(body.ok,true,name);return body.data;
  };
  try{
    await host.connect(new StreamableHTTPClientTransport(new URL(endpoint)));await payer.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
    assert.equal((await host.listTools()).tools.length,21);
    const created=await call(host,'create_room',{mode:'shopping',name:'模拟回执测试甲',topic:'MOCK ONLY · 没有调用麦当劳官方'});
    assert.ok(created.player_token&&created.watch_url);assert.equal(created.room.data_source,'AGENT_REPORTED');
    const A={room_id:created.room.room_id,player_token:created.player_token},joined=await call(payer,'join_room',{room_id:A.room_id,name:'模拟回执测试乙'});assert.ok(joined.player_token&&joined.player_id);
    const B={room_id:A.room_id,player_token:joined.player_token};
    await call(host,'set_room_context',{...A,store_code:'MOCK_STORE',name:'模拟门店（非真实订单）',address:'仅本地测试',fulfillment:'SELF_PICKUP',expected_context_version:0});
    const item=await call(host,'report_item',{...A,meal_code:'MOCK_MEAL',name:'模拟商品',spec:'默认',unit_price_cents:100,queried_at:Date.now()});assert.ok(item.room.items[0]);
    await call(host,'update_order_draft',{...A,operation:'add',item_id:item.room.items[0].item_id,owner:'shared',quantity:1,expected_draft_version:0,event_id:'add'});
    await call(host,'nominate_payer',{...A,candidate_player_id:joined.player_id,event_id:'nominate'});await call(payer,'accept_payer_role',{...B,candidate_version:1,event_id:'accept'});
    const prepared=await call(host,'prepare_checkout',{...A,expected_draft_version:1,event_id:'prepare'}),checkout_id=prepared.room.checkout!.checkout_id;
    const packet=await call(payer,'get_checkout_package',{...B,checkout_id,event_id:'package'});assert.ok(packet.checkout_package);
    const quoted=await call(payer,'report_checkout',{...B,checkout_id,expected_checkout_version:packet.room.checkout!.version,outcome:'QUOTED',total_cents:100,take_way_options:[{code:'take-in-store',title:'外带'}],event_id:'quote'});
    const plan=buildOrderPlan({...packet.checkout_package,quote:quoted.room.checkout_details!.quote!},quoted.room,'take-in-store','a'.repeat(64));
    const port:OrderRoomPort={state:async()=>(await call(payer,'get_room_state',B)).room,report:input=>call(payer,'report_checkout',{...B,...input})};
    const calls:string[]=[];let status='1';
    const result=(data:Record<string,unknown>)=>({content:[],structuredContent:{success:true,code:200,data}});
    const official:Pick<Client,'callTool'>={callTool:async request=>{
      calls.push(request.name);
      if(request.name==='calculate-price')return result({price:100,originalPrice:100,discount:0,productList:[{productCode:'MOCK_MEAL',productName:'模拟商品',quantity:1,subtotal:100}],takeWayList:[{code:'take-in-store',title:'外带'}]});
      if(request.name==='create-order')return result({orderId:'PRIVATE_MOCK_ORDER',payH5Url:'https://m.mcd.cn/mcp/scanToPay?orderId=PRIVATE_MOCK_ORDER'});
      if(request.name==='query-order')return result({orderId:'PRIVATE_MOCK_ORDER',orderStatus:status,pickupCode:'PRIVATE_PICKUP',lockerCode:'PRIVATE_LOCKER'});
      throw new Error('Unexpected mock tool');
    }};
    const deps={official,room:port,journal:new FileOrderJournal(directory),account_hash:'a'.repeat(64)};
    await page.goto(created.watch_url);await page.locator('#connection').filter({hasText:'现场已连接'}).waitFor();
    const submitted=await submitOrder(plan,{plan_id:plan.plan_id,total_cents:100,take_way_code:'take-in-store'},deps);assert.equal(submitted.state,'ORDER_CREATED');assert.ok(submitted.payment_url);
    await page.locator('#checkout-status').filter({hasText:'等待付款'}).waitFor();
    await mkdir(evidence,{recursive:true});await page.screenshot({path:`${evidence}/order-mock-pending-${width}.png`,fullPage:true});
    status='2';assert.equal((await queryOrder(plan,deps)).state,'PAID');await page.locator('#checkout-status').filter({hasText:'付款人上报已支付'}).waitFor();
    status='7';assert.equal((await queryOrder(plan,deps)).state,'ORDER_CANCELLED');await page.locator('#checkout-status').filter({hasText:'订单已取消'}).waitFor();
    await page.reload();await page.locator('#connection').filter({hasText:'现场已连接'}).waitFor();assert.match(await page.locator('#checkout-status').innerText(),/订单已取消/);
    const snapshot=JSON.stringify(await (await fetch(created.watch_url+'/snapshot')).json());
    for(const privateText of ['PRIVATE_MOCK_ORDER','PRIVATE_PICKUP','PRIVATE_LOCKER','scanToPay',A.player_token,B.player_token,'quote_id'])assert.equal(snapshot.includes(privateText),false);
    assert.equal(await page.locator('button').count(),0);assert.equal(await page.locator('a[href*="scanToPay"]').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
    assert.equal(calls.filter(c=>c==='create-order').length,1);
    await page.screenshot({path:`${evidence}/order-mock-cancelled-${width}.png`,fullPage:true});
    results.push({width,ok:true,source:'MOCK_OFFICIAL_RESPONSE',real_official_calls:0,stages:['QUOTED','ORDER_CREATED','PAID','ORDER_CANCELLED'],checks:['21工具真实HTTP/MCP','SSE连续更新','刷新恢复','公开投影隐私','只读无支付按钮','无溢出/页面异常'],mock_calls:calls});
    await call(host,'close_room',A);
  }finally{await page.close();await Promise.allSettled([host.close(),payer.close()]);}
}}finally{await browser.close();await rm(directory,{recursive:true,force:true});}
await writeFile(evidence+'/order-mock-ui.json',JSON.stringify({checked_at:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));
