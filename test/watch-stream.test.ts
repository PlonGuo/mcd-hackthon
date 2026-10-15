import test from 'node:test';
import assert from 'node:assert/strict';
import { createWatchHub } from '../src/watch-stream.ts';
const decode=chunk=>new TextDecoder().decode(chunk.value);
test('SSE首次快照、增量发布、重复序号、取消和连接限制',async()=>{
  const hub=createWatchHub({heartbeatMs:20000,maxSubscribers:1});
  const stop=new AbortController();
  const r=hub.subscribe({sequence:1,arguments:[]},stop.signal);
  assert.match(r.headers.get('Content-Type'),/text\/event-stream/);
  assert.equal(r.headers.get('Cache-Control'),'no-store');
  const reader=r.body.getReader();
  assert.match(decode(await reader.read()),/id: 1/);
  assert.equal(hub.subscribe({sequence:1},new AbortController().signal).status,429);
  hub.publish({sequence:1});
  hub.publish({sequence:2,arguments:[{text:'真实发言'}]});
  assert.match(decode(await reader.read()),/真实发言/);
  stop.abort(); assert.equal(hub.size,0); await reader.cancel();
});
test('慢消费者断开、重新订阅带完整快照，已中断不注册',async()=>{
  const hub=createWatchHub();
  const r=hub.subscribe({sequence:1},new AbortController().signal);
  for(let i=2;i<20;i++) hub.publish({sequence:i});
  assert.equal(hub.size,0);
  await r.body.cancel();
  const fresh=hub.subscribe({sequence:20,arguments:[{text:'历史也在'}]},new AbortController().signal);
  const reader=fresh.body.getReader();
  assert.match(decode(await reader.read()),/历史也在/);
  await reader.cancel(); assert.equal(hub.size,0);
  const aborted=new AbortController();aborted.abort();
  assert.equal(hub.subscribe({sequence:1},aborted.signal).status,499);
});
test('关闭hub清理所有stream，过期事件送达后关闭',async()=>{
  const hub=createWatchHub(); const r=hub.subscribe({sequence:1},new AbortController().signal);
  const reader=r.body.getReader();await reader.read();
  hub.publish({sequence:2,status:'EXPIRED'});
  assert.match(decode(await reader.read()),/EXPIRED/);
  assert.equal((await reader.read()).done,true);
  assert.equal(hub.size,0);
});
