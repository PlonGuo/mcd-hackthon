import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './room-fixture.ts';

test('创建加入共用只读URL，观众不占席/不刷新在线/无操作权',async()=>{
  const f=fixture();const {a,b,path}=await f.create();
  assert.equal(a.watch_url,b.watch_url);
  assert.equal(a.room._watch_token,undefined);
  const watch=new URL(a.watch_url).pathname;
  const before=structuredClone(f.stored.players);
  const snapshot=await f.api(watch+'/snapshot');assert.equal(snapshot.status,200);
  assert.deepEqual(f.stored.players,before);
  assert.equal(snapshot.data.arguments.length,0);
  assert.equal((await f.request(watch+'/snapshot',{})).status,405);
  assert.equal((await f.api(path+'/start',{},f.stored._watch_token)).status,401);
  const wrong=watch.slice(0,-1)+(watch.endsWith('0')?'1':'0');
  assert.equal((await f.request(wrong+'/snapshot')).status,403);
  f.controller.watchHub.close();
});
test('观战基址错误导致加入失败时不占用席位，恢复配置后可加入',async()=>{
  const f=fixture();const a=await f.api('/_create/'+ 'a'.repeat(24),{name:'A',topic:'分享'});
  const path='/rooms/'+a.data.room.room_id;
  f.controller.env.MCDEBATE_PUBLIC_ORIGIN='https://room.internal';
  assert.equal((await f.api(path+'/join',{name:'B'})).status,503);
  assert.equal(f.stored.players.length,1);
  f.controller.env.MCDEBATE_PUBLIC_ORIGIN='http://localhost:8787';
  assert.equal((await f.api(path+'/join',{name:'B'})).status,201);
});
test('正在观看不锁住发言，注册与提交并发无消息缺口，重连完整历史',async()=>{
  const f=fixture();const {a,b,path}=await f.create();
  await f.api(path+'/ready',{ready:true},a.player_token);await f.api(path+'/ready',{ready:true},b.player_token);
  const start=await f.api(path+'/start',{},a.player_token);
  const watch=new URL(a.watch_url).pathname;
  const [stream,say]=await Promise.all([f.request(watch+'/events'),f.api(path+'/say',{
    event_id:'once',turn_id:start.data.room.current_turn.turn_id,text:'鸡块分着吃'},a.player_token)]);
  assert.equal(say.status,200);
  const reader=stream.body.getReader();let seen;
  for(let i=0;i<2;i++){const text=new TextDecoder().decode((await reader.read()).value);seen=JSON.parse(text.split('data: ')[1]);if(seen.arguments.length)break;}
  assert.equal(seen.arguments.length,1);
  assert.equal(JSON.stringify(seen).includes(a.player_token),false);
  await reader.cancel();assert.equal(f.controller.watchHub.size,0);
  const fresh=await f.request(watch+'/events');const next=fresh.body.getReader();
  assert.match(new TextDecoder().decode((await next.read()).value),/鸡块分着吃/);
  await next.cancel();
  const room=f.stored;room.expires_at=Date.now()-1;f.stored=room;
  assert.equal((await f.request(watch+'/snapshot')).status,410);
});
