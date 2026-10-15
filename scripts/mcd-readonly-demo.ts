import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { chromium } from 'playwright';
import { z } from 'zod';
import { callOfficialReadOnly, searchInput, pickupInput, priceInput, normalizeStores, normalizeItem, normalizeQuote } from './lib/mcd-readonly.ts';
import type { RoomView } from '../src/types.ts';
import type { CheckoutPackage } from '../src/shopping/types.ts';
import type { shoppingWatchView } from '../src/shopping/room.ts';

type Room=Extract<RoomView,{mode:'shopping'}>;
interface Data {room:Room;player_id?:string;player_token?:string;watch_url?:string;checkout_package?:CheckoutPackage}
const evidence='.superpowers/sdd/2026-10-15-checkout';
export async function runOfficialReadOnlyDemo({city,keyword,storeCode,productCodes,endpoint,token}: {city:string;keyword:string;storeCode:string;productCodes:string[];endpoint:string;token:string}){
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(endpoint).hostname),'仅允许本地房间');
  z.array(z.string().min(1).max(100)).min(1).max(2).parse(productCodes);assert.equal(new Set(productCodes).size,productCodes.length);
  const official=new Client({name:'mcdebate-official-readonly',version:'0.5.1'}),host=new Client({name:'readonly-room-host',version:'0.5.1'}),payer=new Client({name:'readonly-room-payer',version:'0.5.1'});
  const apiCalls:string[]=[];let A:Record<string,string>|undefined,watchUrl='';
  const read=async(name:string,input:unknown)=>{apiCalls.push(name);return callOfficialReadOnly(official,name,input);};
  const call=async(client:Client,name:string,args:Record<string,unknown>):Promise<Data>=>{
    const reply=await client.callTool({name,arguments:args},{timeout:15000});assert.equal(reply.isError,false,'房间工具失败：'+name);
    const body=reply.structuredContent as {ok:boolean;data:Data};assert.equal(body?.ok,true);return body.data;
  };
  try{
    await official.connect(new StreamableHTTPClientTransport(new URL('https://mcp.mcd.cn'),{requestInit:{headers:{Authorization:'Bearer '+token.replace(/^Bearer\s+/i,'')}}}),{timeout:15000});
    const stores=normalizeStores(await read('query-nearby-stores',searchInput(city,keyword)));
    const selected=stores.find(s=>s.store_code===storeCode);assert.ok(selected,'确认的门店未出现在本次官方搜索中');assert.equal(selected.business_status,true,'当前门店不可营业，不继续核价');
    const menu=await read('query-meals',pickupInput(storeCode));
    const items=[];
    for(const code of productCodes){const detail=await read('query-meal-detail',{...pickupInput(storeCode),code});items.push(normalizeItem(menu,detail,code,Date.now()));}
    await Promise.all([host.connect(new StreamableHTTPClientTransport(new URL(endpoint))),payer.connect(new StreamableHTTPClientTransport(new URL(endpoint)))]);
    const created=await call(host,'create_room',{mode:'shopping',name:'选品方（只读联调）',topic:'真实餐品核价 · 不下单'});assert.ok(created.player_token&&created.watch_url);assert.equal(created.room.data_source,'AGENT_REPORTED','须使用独立reported环境，禁止把真实资料写进测试来源房间');
    A={room_id:created.room.room_id,player_token:created.player_token};watchUrl=created.watch_url;
    const joined=await call(payer,'join_room',{room_id:created.room.room_id,name:'付款方（只读联调）'});assert.ok(joined.player_token&&joined.player_id);
    const B={room_id:created.room.room_id,player_token:joined.player_token};
    const {business_status,distance,...store}=selected;
    // 门店是用户已确认的选择；各一份商品和角色接受是只读测试场景，不是消费授权。
    await call(host,'set_room_context',{...A,...store,expected_context_version:0});
    let draftVersion=0;
    for(const [i,item] of items.entries()){
      const client=i%2?payer:host,identity=i%2?B:A;
      const reported=await call(client,'report_item',{...identity,...item});
      const candidate=reported.room.items.find(p=>p.meal_code===item.meal_code&&p.reporter_player_id===reported.room.self_player_id);assert.ok(candidate);
      const added=await call(client,'update_order_draft',{...identity,operation:'add',item_id:candidate.item_id,owner:i%2?'self':'shared',quantity:1,expected_draft_version:draftVersion,event_id:'sample_'+i});draftVersion=added.room.draft.version;
    }
    await call(host,'nominate_payer',{...A,candidate_player_id:joined.player_id,event_id:'nominate'});
    await call(payer,'accept_payer_role',{...B,candidate_version:1,event_id:'accept_scenario'});
    const prepared=await call(host,'prepare_checkout',{...A,expected_draft_version:draftVersion,event_id:'prepare'}),checkout_id=prepared.room.checkout!.checkout_id;
    const received=await call(payer,'get_checkout_package',{...B,checkout_id,event_id:'package'});assert.ok(received.checkout_package);
    const version=received.room.checkout!.version,request=priceInput(received.checkout_package);
    const quote=normalizeQuote(await read('calculate-price',request),request);
    const quoted=await call(payer,'report_checkout',{...B,checkout_id,expected_checkout_version:version,outcome:'QUOTED',total_cents:quote.total_cents,take_way_options:quote.take_way_options,event_id:'quoted'});
    assert.equal(quoted.room.checkout!.status,'QUOTED');assert.equal(quoted.room.checkout!.source,'AGENT_REPORTED');assert.equal(quoted.room.checkout!.total_cents,quote.total_cents);
    const response=await fetch(watchUrl+'/snapshot',{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);
    const body=await response.json() as {ok:boolean;data:ReturnType<typeof shoppingWatchView>};assert.equal(body.ok,true);
    const serialized=JSON.stringify(body.data);
    for(const secret of [token,A.player_token,B.player_token,'quote_id','checkout_details','checkout_package','payment_url','_receipts'])assert.equal(serialized.includes(secret),false);
    const browser=await chromium.launch({headless:true});
    try{for(const width of [390,1280]){
      const page=await browser.newPage({viewport:{width,height:800}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(watchUrl);await page.locator('#connection').filter({hasText:'现场已连接'}).waitFor();
      assert.match(await page.locator('#checkout-status').innerText(),/等待付款人确认/);assert.match(await page.locator('#checkout-source').innerText(),/付款人 Agent 上报/);
      assert.equal(await page.locator('#checkout-amount').innerText(),`付款账户核价 ¥${(quote.total_cents/100).toFixed(2)} · 固定清单版本 ${draftVersion} · 待选择：${quote.take_way_options.map(t=>t.title).join(' / ')}`);
      assert.equal(await page.locator('#draft-lines li').count(),items.length);assert.match(await page.locator('#data-source').innerText(),/Agent 查询后上报/);
      await page.reload();await page.locator('#connection').filter({hasText:'现场已连接'}).waitFor();assert.match(await page.locator('#checkout-status').innerText(),/等待付款人确认/);
      assert.equal(await page.locator('button').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
      await mkdir(evidence,{recursive:true});await page.screenshot({path:`${evidence}/official-quote-${width}.png`,fullPage:true});await page.close();
    }}finally{await browser.close();}
    const result={ok:true,checked_at:new Date().toISOString(),source:'OFFICIAL_MCP_READ_ONLY',room_source:'AGENT_REPORTED',notice:'一个获授权官方账户+两套本地测试身份；商品各一份及角色接受为只读测试场景，未确认下单、未调用写工具',store,items,quote,official_calls:apiCalls,write_calls:0,model_calls:0,watch_url:watchUrl,room:body.data};
    await writeFile(evidence+'/official-readonly-result.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify({ok:true,store:store.name,total_cents:quote.total_cents,products:quote.products,take_way_options:quote.take_way_options,official_calls:apiCalls,write_calls:0,checkout:'QUOTED',watch_url:watchUrl}));
    return result;
  }catch(error){if(A)try{await call(host,'close_room',A);}catch{console.error('未能确认只读测试房间关闭');}throw error;}
  finally{await Promise.allSettled([official.close(),host.close(),payer.close()]);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const {values}=parseArgs({options:{city:{type:'string'},keyword:{type:'string'},store:{type:'string'},products:{type:'string'},endpoint:{type:'string',default:'http://localhost:8791/mcp'}}});
    const token=process.env.MCD_MCP_TOKEN?.trim();assert.ok(token,'请先配置.dev.vars中的MCD_MCP_TOKEN');
    assert.ok(values.city&&values.keyword&&values.store&&values.products,'须提供用户确认的--city/--keyword/--store及核价样本--products');
    await runOfficialReadOnlyDemo({city:values.city,keyword:values.keyword,storeCode:values.store,productCodes:values.products.split(','),endpoint:values.endpoint,token});
  }catch(error){console.error('FAIL: 官方只读联调未完成；错误类型：'+(error instanceof Error?error.name:'Unknown')+'。没有调用官方写工具。');process.exitCode=1;}
}
