import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import type { RoomView } from '../src/types.ts';
type Room=Extract<RoomView,{mode:'shopping'}>;
interface Data {room:Room;player_token:string;watch_url:string}
const base=process.env.BASE_URL??'http://localhost:8790';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'仅运行本地测试');
async function api(path:string,body?:Record<string,unknown>,token?:string):Promise<Data>{
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  const value=await response.json() as {ok:boolean;data:Data};assert.equal(value.ok,true);return value.data;
}
const browser=await chromium.launch({headless:true});
try{
  for(const width of [390,1280]){
    const page=await browser.newPage({viewport:{width,height:720}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const a=await api('/rooms',{mode:'shopping',name:'甲',topic:'持续点餐'}),path='/rooms/'+a.room.room_id,ta=a.player_token;
    const b=await api(path+'/join',{name:'乙'}),tb=b.player_token;
    try{
      await page.goto(a.watch_url);await page.getByText('等待用户确认门店',{exact:true}).waitFor();
      await api(path+'/context',{store_code:'TEST_STORE',name:'测试门店 <script>window.__shopping_xss=true</script>',address:'测试路1号',fulfillment:'SELF_PICKUP',expected_context_version:0},ta);
      for(const [name,token] of [['鸡块',ta],['薯条',tb]])await api(path+'/item',{meal_code:name,name,spec:'单份',unit_price_cents:1000,queried_at:Date.now()},token);
      const initial=(await api(path+'/state',undefined,ta)).room,ai=initial.items[0].item_id,bi=initial.items[1].item_id;
      await api(path+'/draft',{operation:'add',item_id:ai,owner:'self',quantity:1,expected_draft_version:0,event_id:'cart'},ta);
      async function start(event_id:string){
        const created=await api(path+'/battle',{topic:'界面验证 '+event_id,event_id},ta),battle_id=created.room.active_battle_id!;
        await api(path+'/ready',{battle_id,candidate_item_id:ai,ready:true},ta);await api(path+'/ready',{battle_id,candidate_item_id:bi,ready:true},tb);
        const started=await api(path+'/start',{battle_id},ta);return {battle_id,room:started.room};
      }
      const first=await start('first');await page.locator('#waiting').waitFor({state:'visible'});
      await api(path+'/say',{battle_id:first.battle_id,turn_id:first.room.current_turn!.turn_id,event_id:'speech',text:'按块分享更方便。'.repeat(15)},ta);
      await page.waitForFunction(()=>document.querySelectorAll('#messages li').length===1);
      await page.waitForFunction(()=>{const rect=document.querySelector('#messages li:last-child')?.getBoundingClientRect();return !!rect&&rect.bottom<=innerHeight+2;});
      await api(path+'/draft',{operation:'add',item_id:bi,owner:'self',quantity:1,expected_draft_version:1,event_id:'cart2'},tb);
      await page.waitForFunction(()=>document.getElementById('draft-total')?.textContent?.includes('20.00'));
      await api(path+'/cancel',{battle_id:first.battle_id},tb);
      await page.waitForFunction(()=>document.querySelectorAll('#battle-history details').length===1&&document.getElementById('waiting')?.hidden);
      assert.equal(await page.locator('#connection').innerText(),'现场已连接');
      await start('second');await page.waitForFunction(()=>document.querySelectorAll('#messages li').length===0&&!document.getElementById('waiting')?.hidden);
      assert.equal(await page.locator('#draft-lines li').count(),2);assert.equal(await page.locator('#battle-history details').count(),1);
      await page.locator('#battle-history summary').click();assert.match(await page.locator('#battle-history').innerText(),/按块分享/);
      await page.reload();await page.locator('#waiting').waitFor({state:'visible'});assert.equal(await page.locator('#draft-lines li').count(),2);
      assert.match(await page.locator('#data-source').innerText(),/测试数据/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.evaluate(()=>Object.hasOwn(window,'__shopping_xss')),false);
      assert.deepEqual(errors,[]);
      await mkdir('.superpowers/sdd/2026-10-15-shopping',{recursive:true});await page.screenshot({path:'.superpowers/sdd/2026-10-15-shopping/shopping-'+width+'.png',fullPage:true});
      console.log(JSON.stringify({ok:true,width,checks:['门店/来源','持续清单','对战中改单','新局消息重置','历史展开','SSE跨局持续','刷新恢复','自动滚动','纯文本XSS','无溢出','无页面错误']}));
    }finally{await api(path+'/close',{},ta);await page.close();}
  }
}finally{await browser.close();}
