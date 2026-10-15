import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

// 仅握手和读取工具定义，不调用查询账户、核价、下单、领券、取消或支付工具。
const token=process.env.MCD_MCP_TOKEN?.trim();
if(!token){console.error('请在.dev.vars配置MCD_MCP_TOKEN；不要把Token发到聊天。');process.exitCode=1;}
else {
  const client=new Client({name:'mcdebate-readonly-schema-probe',version:'0.5.0'});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.mcd.cn'),{requestInit:{headers:{Authorization:'Bearer '+token.replace(/^Bearer\s+/i,'')}}}),{timeout:15000});
    const selected=new Set(['query-nearby-stores','query-meals','query-meal-detail','calculate-price','create-order','query-order','order-list','cancel-order']);
    const tools:Awaited<ReturnType<Client['listTools']>>['tools']=[];let cursor:string|undefined;
    for(let page=0;page<20;page++){
      const result=await client.listTools(cursor?{cursor}:{},{timeout:15000});tools.push(...result.tools.filter(t=>selected.has(t.name)));cursor=result.nextCursor;if(!cursor)break;
    }
    assert.equal(cursor,undefined,'官方工具分页未完整读取');
    const missing=[...selected].filter(n=>!tools.some(t=>t.name===n));assert.deepEqual(missing,[],'缺少所需官方工具定义');
    await mkdir('.superpowers/sdd/2026-10-15-checkout',{recursive:true});
    await writeFile('.superpowers/sdd/2026-10-15-checkout/official-tool-schemas.json',JSON.stringify({checked_at:new Date().toISOString(),source:'OFFICIAL_TOOL_METADATA',notice:'仅工具定义；未执行任何业务工具',tools},null,2));
    console.log(JSON.stringify({ok:true,tools:tools.map(t=>t.name),business_calls:0}));
  }catch{console.error('官方工具定义读取失败：请检查Token有效性和网络；未执行任何业务工具。');process.exitCode=1;}
  finally{await client.close().catch(()=>{});}
}
