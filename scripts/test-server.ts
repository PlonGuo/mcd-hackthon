import { createTestHarness } from 'wrangler';
import { mkdir, writeFile } from 'node:fs/promises';
// 与CLI相同的Worker和Durable Object，在官方测试环境中让模型出站沿用Node进程代理。
const input=(origin:string)=>({workers:[{configPath:'./wrangler.jsonc',vars:{MCDEBATE_PUBLIC_ORIGIN:origin}}]});
await mkdir('.superpowers/sdd/2026-10-15-shopping',{recursive:true});
const server=createTestHarness(input('http://localhost'));
const {url}=await server.listen();await server.update(input(url.origin));
await writeFile('.superpowers/sdd/2026-10-15-shopping/test-origin.json',JSON.stringify({origin:url.origin}));
console.log('本地Worker测试入口：'+url.origin);
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.close().then(()=>process.exit(0)).catch(()=>process.exit(1));});
