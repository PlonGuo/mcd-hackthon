import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { runCheckoutSmoke } from './checkout-smoke.ts';

const base=process.env.BASE_URL??'http://localhost:8790';
const browser=await chromium.launch({headless:true});
try{
  for(const width of [390,1280]){
    const page=await browser.newPage({viewport:{width,height:800}}),errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    try{
      await runCheckoutSmoke(new URL('/mcp',base).href,{onStage:async(stage,url,snapshot)=>{
        if(stage==='入房'){await page.goto(url);await page.locator('#connection').filter({hasText:'现场已连接'}).waitFor();return;}
        const c=snapshot.checkout;assert.ok(c);
        await page.waitForFunction(status=>document.getElementById('checkout-status')?.textContent?.includes(status),{
          PREPARED:'等待付款人领取',CANCELLED:'结账已取消',NO_ORDER:'已确认未下单',QUOTED:'等待付款人确认',SUBMITTING:'正在创建订单',UNKNOWN:'订单结果未知',ORDER_CREATED:'等待付款',PAID:'模拟付款完成',ORDER_CANCELLED:'订单已取消',HANDED_OFF:'等待最终核价',
        }[c.status]);
        assert.match(await page.locator('#checkout-source').innerText(),/模拟订单/);
        assert.equal(await page.locator('#connection').innerText(),'现场已连接');
        if(stage==='待确认'){assert.match(await page.locator('#checkout-amount').innerText(),/39.00/);await page.reload();await page.locator('#connection').filter({hasText:'现场已连接'}).waitFor();assert.match(await page.locator('#checkout-status').innerText(),/等待付款人确认/);}
        if(stage==='订单未知'){assert.match(await page.locator('#next-steps').innerText(),/不要重新下单/);await page.reload();await page.locator('#connection').filter({hasText:'现场已连接'}).waitFor();assert.match(await page.locator('#checkout-status').innerText(),/订单结果未知/);}
        if(stage==='模拟付款完成'){
          assert.equal(await page.locator('button').count(),0);assert.match(await page.locator('#next-steps').innerText(),/新建房间/);
          await page.reload();await page.locator('#connection').filter({hasText:'现场已连接'}).waitFor();assert.match(await page.locator('#checkout-status').innerText(),/模拟付款完成/);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
          await mkdir('.superpowers/sdd/2026-10-15-checkout',{recursive:true});await page.screenshot({path:'.superpowers/sdd/2026-10-15-checkout/checkout-'+width+'.png',fullPage:true});
        }
      }});
      console.log(JSON.stringify({ui:true,width,checks:['21工具真实MCP','取消后改单','领取后未下单恢复','核价/确认/模拟建单/模拟付款','未知查单不重下','SSE持续','刷新恢复','测试来源','只读无付款入口','无溢出/页面错误']}));
    }finally{await page.close();}
  }
}finally{await browser.close();}
