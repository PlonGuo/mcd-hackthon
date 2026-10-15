import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { schemas } from '../src/shopping/schemas.ts';
import type { RoomView } from '../src/types.ts';
import type { CheckoutPackage } from '../src/shopping/types.ts';
import type { shoppingWatchView } from '../src/shopping/room.ts';

type Room=Extract<RoomView,{mode:'shopping'}>;
type Snapshot=ReturnType<typeof shoppingWatchView>;
interface Data {room:Room;player_id?:string;player_token?:string;watch_url?:string;checkout_package?:CheckoutPackage;replayed?:boolean}
const catalogSchema=z.object({source:z.literal('TEST_FIXTURE'),stores:z.array(schemas.context.omit({expected_context_version:true})).min(1),items:z.array(schemas.item).min(2)});
export async function runCheckoutSmoke(endpoint: string, {onStage}: {onStage?:(stage:string,watchUrl:string,snapshot:Snapshot)=>Promise<void>}={}) {
  const url=new URL(endpoint);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'结账测试仅允许本地');
  const clients=[new Client({name:'checkout-host',version:'0.5.0'}),new Client({name:'checkout-payer',version:'0.5.0'})];
  const snapshots:{sequence:number;status:string|null}[]=[],streamErrors:string[]=[],stages:string[]=[];
  const abort=new AbortController();let watchTask:Promise<void>|undefined,watchUrl='',A:Record<string,string>|undefined,B:Record<string,string>|undefined;
  const call=async(client:Client,name:string,args:Record<string,unknown>):Promise<Data>=>{
    const reply=await client.callTool({name,arguments:args});assert.equal(reply.isError,false,'工具失败：'+name);
    assert.ok(reply.structuredContent);const body=reply.structuredContent as {ok:boolean;data:Data};assert.equal(body.ok,true);return body.data;
  };
  const bad=async(client:Client,name:string,args:Record<string,unknown>,code:string)=>{
    const reply=await client.callTool({name,arguments:args});assert.equal(reply.isError,true);assert.equal((reply.structuredContent as {error:{code:string}}).error.code,code);
  };
  const state=async()=>{assert.ok(A);return (await call(clients[0],'get_room_state',A)).room;};
  async function stage(label:string){
    const response=await fetch(watchUrl+'/snapshot',{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);
    const body=await response.json() as {ok:boolean;data:Snapshot};assert.equal(body.ok,true);
    stages.push(label);await onStage?.(label,watchUrl,body.data);
  }
  async function observe(){
    const response=await fetch(watchUrl+'/events',{signal:abort.signal});assert.equal(response.status,200);assert.ok(response.body);
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    let ready!:()=>void;const first=new Promise<void>(resolve=>{ready=resolve;});
    watchTask=(async()=>{
      try{while(true){
        const {value,done}=await reader.read();if(done){if(!abort.signal.aborted)throw new Error('SSE_ENDED_EARLY');break;}
        buffer+=decoder.decode(value,{stream:true});assert.ok(buffer.length<262144);
        let split;while((split=buffer.indexOf('\n\n'))>=0){
          const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);const data=frame.split('\n').find(s=>s.startsWith('data: '));if(!data)continue;
          const s=JSON.parse(data.slice(6)) as Snapshot;
          for(const secret of ['checkout_package','checkout_details','_demo_order','quote_id',A?.player_token,B?.player_token].filter((x):x is string=>!!x))assert.equal(data.includes(secret),false);
          snapshots.push({sequence:s.sequence,status:s.checkout?.status??null});ready();
        }
      }}catch(error){if(!abort.signal.aborted){streamErrors.push(error instanceof Error?error.message:'SSE_ERROR');ready();}}
      finally{await reader.cancel().catch(()=>{});}
    })();await first;assert.deepEqual(streamErrors,[]);
  }
  try{
    await Promise.all(clients.map(c=>c.connect(new StreamableHTTPClientTransport(url))));
    const tools=z.object({tools:z.array(z.object({name:z.string()}))}).parse(await clients[0].listTools()).tools;
    assert.equal(tools.length,21);assert.ok(tools.some(t=>t.name==='simulate_checkout'));
    const created=await call(clients[0],'create_room',{mode:'shopping',name:'房主甲',topic:'点餐与结账验证'});
    assert.ok(created.player_token&&created.watch_url);watchUrl=created.watch_url;
    const room_id=created.room.room_id;A={room_id,player_token:created.player_token};
    const joined=await call(clients[1],'join_room',{room_id,name:'付款人乙'});assert.ok(joined.player_token&&joined.player_id);
    B={room_id,player_token:joined.player_token};
    await observe();await stage('入房');
    const catalogReply=await clients[0].callTool({name:'query_demo_catalog',arguments:{}});assert.equal(catalogReply.isError,false);
    const menu=catalogSchema.parse((catalogReply.structuredContent as {data:unknown}).data);
    await call(clients[0],'set_room_context',{...A,...menu.stores[0],expected_context_version:0});
    const item=await call(clients[0],'report_item',{...A,...menu.items[0]});
    await call(clients[0],'update_order_draft',{...A,item_id:item.room.items[0].item_id,operation:'add',owner:'shared',quantity:2,expected_draft_version:0,event_id:'add'});
    await call(clients[0],'nominate_payer',{...A,candidate_player_id:joined.player_id,event_id:'nominate'});
    await bad(clients[0],'accept_payer_role',{...A,candidate_version:1,event_id:'steal_role'},'FORBIDDEN');
    await call(clients[1],'accept_payer_role',{...B,candidate_version:1,event_id:'accept'});
    async function prepare(event:string){const r=await call(clients[0],'prepare_checkout',{...A,expected_draft_version:(await state()).draft.version,event_id:event});return r.room.checkout!.checkout_id;}
    let checkout_id=await prepare('prepare_cancel');await stage('待领取');
    await call(clients[0],'cancel_checkout',{...A,checkout_id,event_id:'cancel'});await stage('取消结账');
    const room=await state();await call(clients[0],'update_order_draft',{...A,operation:'set_quantity',line_id:room.draft.lines[0].line_id,quantity:3,expected_draft_version:room.draft.version,event_id:'edit_after_cancel'});
    checkout_id=await prepare('prepare_abandon');
    await call(clients[1],'get_checkout_package',{...B,checkout_id,event_id:'package_abandon'});
    await call(clients[1],'simulate_checkout',{...B,checkout_id,operation:'abandon',event_id:'abandon'});await stage('未下单恢复');
    checkout_id=await prepare('prepare_order');
    await bad(clients[0],'get_checkout_package',{...A,checkout_id,event_id:'steal_packet'},'FORBIDDEN');
    const packet=await call(clients[1],'get_checkout_package',{...B,checkout_id,event_id:'package'});assert.equal(packet.checkout_package!.draft.lines[0].quantity,3);
    const quoted=await call(clients[1],'simulate_checkout',{...B,checkout_id,operation:'quote',event_id:'quote'}),quote=quoted.room.checkout_details!.quote!;
    assert.equal(quote.total_cents,3900);await stage('待确认');
    await bad(clients[1],'report_checkout',{...B,checkout_id,expected_checkout_version:quoted.room.checkout!.version,outcome:'SUBMITTING',quote_id:quote.quote_id,expected_total_cents:1,event_id:'wrong_total'},'QUOTE_CHANGED');
    // 这是测试场景提供的模拟用户确认，不是让模型制造真人授权。
    await call(clients[1],'report_checkout',{...B,checkout_id,expected_checkout_version:quoted.room.checkout!.version,outcome:'SUBMITTING',quote_id:quote.quote_id,expected_total_cents:quote.total_cents,event_id:'submit'});await stage('提交中');
    const create={...B,checkout_id,operation:'create',scenario:'timeout_created',event_id:'create'};
    await call(clients[1],'simulate_checkout',create);await stage('订单未知');
    assert.equal((await call(clients[1],'simulate_checkout',create)).replayed,true);
    await bad(clients[1],'simulate_checkout',{...create,event_id:'blind_retry'},'CHECKOUT_STATE');
    await bad(clients[0],'create_battle',{...A,topic:'不许绕过未知订单',event_id:'blocked_battle'},'CHECKOUT_LOCKED');
    await call(clients[1],'simulate_checkout',{...B,checkout_id,operation:'query',event_id:'lookup'});await stage('待付款');
    await call(clients[1],'simulate_checkout',{...B,checkout_id,operation:'pay',event_id:'pay'});await stage('模拟付款完成');
    const final=await state();assert.equal(final.checkout!.status,'PAID');assert.equal(final.draft.total_cents,3900);assert.equal(final.status,'OPEN');
    const deadline=Date.now()+3000;while((snapshots.at(-1)?.sequence??0)<final.sequence&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    for(const status of ['PREPARED','CANCELLED','NO_ORDER','QUOTED','SUBMITTING','UNKNOWN','ORDER_CREATED','PAID'])assert.ok(snapshots.some(s=>s.status===status),'SSE缺少'+status);
    assert.deepEqual(streamErrors,[]);
    const result={ok:true,checked_at:new Date().toISOString(),source:'TEST_FIXTURE',notice:'确定性模拟用户和模拟订单/支付；没有真实下单或扣款',watch_url:watchUrl,room_id,tools:tools.length,stages,sse:snapshots,stream_errors:streamErrors};
    await mkdir('.superpowers/sdd/2026-10-15-checkout',{recursive:true});await writeFile('.superpowers/sdd/2026-10-15-checkout/result.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify({ok:true,tools:tools.length,stages:stages.length,sse:snapshots.length,watch_url:watchUrl}));return result;
  }catch(error){if(A)try{await call(clients[0],'close_room',A);}catch{console.error('未能确认失败测试房间关闭');}throw error;}
  finally{abort.abort();await watchTask;await Promise.allSettled(clients.map(c=>c.close()));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await runCheckoutSmoke(process.argv.slice(2).find(a=>a!=='--')??'http://localhost:8790/mcp');}
  catch(error){console.error('FAIL:',error instanceof Error?error.message:'结账测试失败');process.exitCode=1;}
}
