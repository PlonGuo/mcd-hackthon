import assert from 'node:assert/strict';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { RoomView } from '../src/types.ts';
import type { CheckoutPackage } from '../src/shopping/types.ts';
import { searchInput, pickupInput, priceInput, callOfficialReadOnly, normalizeStores, normalizeItem, normalizeQuote } from './lib/mcd-readonly.ts';
import { accountHash, buildOrderPlan, submitOrder, queryOrder, type OrderPlan, type OrderRoomPort } from './lib/mcd-order.ts';
import { FileOrderJournal } from './lib/order-journal.ts';

type Room=Extract<RoomView,{mode:'shopping'}>;
interface Data {room:Room;player_id?:string;player_token?:string;watch_url?:string;checkout_package?:CheckoutPackage;replayed?:boolean}
interface Session {plan:OrderPlan;endpoint:string;identity:{room_id:string;player_token:string};watch_url:string}
const privateRoot=resolve('.local/mcd-order'),evidence='.superpowers/sdd/2026-10-15-checkout';
const clients:Client[]=[];
async function connect(url:string,name:string,token?:string){
  const client=new Client({name,version:'0.6.0'});clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(url),token?{requestInit:{headers:{Authorization:'Bearer '+token.replace(/^Bearer\s+/i,'')}}}:undefined),{timeout:15000});return client;
}
async function call(client:Client,name:string,args:Record<string,unknown>):Promise<Data>{
  const result=await client.callTool({name,arguments:args},{timeout:15000});
  const body=result.structuredContent as {ok:boolean;data:Data;error?:{code:string}};
  if(result.isError||!body?.ok)throw new Error('ORDER_ROOM_'+(body?.error?.code??'REQUEST_FAILED'));
  return body.data;
}
function roomPort(client:Client,identity:Session['identity']):OrderRoomPort{
  return {state:async()=>{const r=await call(client,'get_room_state',identity);return r.room;},report:async input=>call(client,'report_checkout',{...identity,...input})};
}
function localEndpoint(endpoint:string){const u=new URL(endpoint);if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password)throw new Error('ORDER_LOCAL_ENDPOINT_REQUIRED');return u.href;}
async function privateWrite(path:string,value:unknown){
  await mkdir(dirname(path),{recursive:true,mode:0o700});const file=await open(path,'wx',0o600);
  try{await file.writeFile(JSON.stringify(value,null,2));await file.sync();}finally{await file.close();}
}
async function main(){
  const {values}=parseArgs({options:{operation:{type:'string',default:'prepare'},city:{type:'string'},keyword:{type:'string'},store:{type:'string'},products:{type:'string'},'take-way':{type:'string'},endpoint:{type:'string',default:'http://localhost:8791/mcp'},plan:{type:'string'},'confirm-plan':{type:'string'}}});
  assert.ok(['prepare','submit','query'].includes(values.operation));const token=process.env.MCD_MCP_TOKEN?.trim();assert.ok(token,'ORDER_MCD_TOKEN_REQUIRED');
  const official=await connect('https://mcp.mcd.cn','mcdebate-order-client',token);
  if(values.operation==='prepare'){
    assert.ok(values.city&&values.keyword&&values.store&&values.products&&values['take-way'],'ORDER_PREPARATION_INPUT_REQUIRED');
    const endpoint=localEndpoint(values.endpoint),codes=values.products.split(',');assert.ok(codes.length>=1&&codes.length<=2&&new Set(codes).size===codes.length);
    const stores=normalizeStores(await callOfficialReadOnly(official,'query-nearby-stores',searchInput(values.city,values.keyword)));
    const store=stores.find(s=>s.store_code===values.store);assert.ok(store?.business_status,'ORDER_STORE_UNAVAILABLE');
    const menu=await callOfficialReadOnly(official,'query-meals',pickupInput(store.store_code));
    const items=[];for(const code of codes){const detail=await callOfficialReadOnly(official,'query-meal-detail',{...pickupInput(store.store_code),code});items.push(normalizeItem(menu,detail,code,Date.now()));}
    const host=await connect(endpoint,'order-host'),payer=await connect(endpoint,'order-payer');
    const created=await call(host,'create_room',{mode:'shopping',name:'点餐方（建单联调）',topic:'到店订单联调'});
    assert.ok(created.player_token&&created.watch_url);const A={room_id:created.room.room_id,player_token:created.player_token};
    assert.equal(created.room.data_source,'AGENT_REPORTED');
    const joined=await call(payer,'join_room',{room_id:A.room_id,name:'付款人（建单联调）'});assert.ok(joined.player_token&&joined.player_id);
    const B={room_id:A.room_id,player_token:joined.player_token};
    const {business_status,distance,...context}=store;await call(host,'set_room_context',{...A,...context,expected_context_version:0});
    let version=0;
    for(const [i,item] of items.entries()){
      const r=await call(host,'report_item',{...A,...item});const candidate=r.room.items.find(p=>p.meal_code===item.meal_code);assert.ok(candidate);
      const added=await call(host,'update_order_draft',{...A,operation:'add',item_id:candidate.item_id,owner:'shared',quantity:1,expected_draft_version:version,event_id:'order_cart_'+i});version=added.room.draft.version;
    }
    await call(host,'nominate_payer',{...A,candidate_player_id:joined.player_id,event_id:'payer'});await call(payer,'accept_payer_role',{...B,candidate_version:1,event_id:'accept'});
    const prepared=await call(host,'prepare_checkout',{...A,expected_draft_version:version,event_id:'checkout'}),checkout_id=prepared.room.checkout!.checkout_id;
    const received=await call(payer,'get_checkout_package',{...B,checkout_id,event_id:'package'});assert.ok(received.checkout_package);
    const request=priceInput(received.checkout_package),quote=normalizeQuote(await callOfficialReadOnly(official,'calculate-price',request),request);
    const way=quote.take_way_options.find(t=>t.code===values['take-way']||t.title===values['take-way']);assert.ok(way,'ORDER_TAKE_WAY_REQUIRED');
    const quoted=await call(payer,'report_checkout',{...B,checkout_id,expected_checkout_version:received.room.checkout!.version,outcome:'QUOTED',total_cents:quote.total_cents,take_way_options:quote.take_way_options,event_id:'quote'});
    const packet={...received.checkout_package,quote:quoted.room.checkout_details!.quote!};
    const plan=buildOrderPlan(packet,quoted.room,way.code,accountHash(token)),file=resolve(privateRoot,'plans',plan.plan_id+'.json');
    await privateWrite(file,{plan,endpoint,identity:B,watch_url:created.watch_url} satisfies Session);
    const summary={operation:'prepare',plan_id:plan.plan_id,plan_file:file,store:plan.store,products:plan.products,total_cents:plan.total_cents,take_way:plan.take_way,expires_at:plan.expires_at,watch_url:created.watch_url,official_write_calls:0};
    await mkdir(evidence,{recursive:true});await writeFile(evidence+'/order-plan-public.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));return;
  }
  assert.ok(values.plan,'ORDER_PLAN_FILE_REQUIRED');const path=resolve(values.plan);
  if(dirname(path)!==resolve(privateRoot,'plans'))throw new Error('ORDER_PRIVATE_PLAN_PATH_REQUIRED');
  const session=JSON.parse(await readFile(path,'utf8')) as Session;
  const payer=await connect(localEndpoint(session.endpoint),'order-payer-resume'),room=roomPort(payer,session.identity),journal=new FileOrderJournal(resolve(privateRoot,'attempts'));
  const deps={official,room,journal,account_hash:accountHash(token)};
  let result;
  if(values.operation==='submit'){
    assert.equal(values['confirm-plan'],session.plan.plan_id,'ORDER_EXPLICIT_PLAN_CONFIRMATION_REQUIRED');
    result=await submitOrder(session.plan,{plan_id:values['confirm-plan'],total_cents:session.plan.total_cents,take_way_code:session.plan.take_way.code},deps);
  }else result=await queryOrder(session.plan,deps);
  const summary={operation:values.operation,state:result.state,room_report_pending:result.room_report_pending,payment_link_available:!!result.payment_url,pickup_code_available:!!result.pickup_code,private_result_file:journal.path(session.plan),watch_url:session.watch_url};
  await mkdir(evidence,{recursive:true});await writeFile(evidence+'/order-live-public.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}
try{await main();}catch(error){const message=error instanceof Error&&/^ORDER_[A-Z_]+$/.test(error.message)?error.message:error instanceof Error?error.name:'Unknown';console.error('订单操作失败：'+message+'。不要重复建单，请先核对私密提交记录与官方订单。');process.exitCode=1;}
finally{await Promise.allSettled(clients.map(c=>c.close()));}
