import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createNodeRuntime } from '../src/runtime/node/rooms.ts';
import { createNodeServer } from '../src/runtime/node/server.ts';

const env={MCDEBATE_PUBLIC_ORIGIN:'https://192.0.2.1',SHOPPING_DATA_MODE:'fixture',JUDGE_ENABLED:'false'};
const req=(path,body,token)=>new Request(env.MCDEBATE_PUBLIC_ORIGIN+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function api(runtime,path,body,token){const r=await runtime.fetch(req(path,body,token));return {status:r.status,...await r.json()};}

test('Node uses persistent rooms, serializes concurrent writes, and resumes a watch stream after restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'mcdebate-node-'));const dbPath=join(directory,'rooms.sqlite');
  let runtime=createNodeRuntime({dbPath,env});
  try{
    const a=(await api(runtime,'/rooms',{name:'A',topic:'鸡块还是薯条'})).data;
    const path='/rooms/'+a.room.room_id,token=a.player_token;
    const b=(await api(runtime,path+'/join',{name:'B'})).data;
    await api(runtime,path+'/ready',{ready:true},token);await api(runtime,path+'/ready',{ready:true},b.player_token);
    const started=(await api(runtime,path+'/start',{},token)).data.room;
    const reader=(await runtime.fetch(new Request(a.watch_url+'/events'))).body.getReader();
    const first=new TextDecoder().decode((await reader.read()).value);assert.match(first,/event: snapshot/);assert.equal(first.includes(token),false);
    const argument={turn_id:started.current_turn.turn_id,event_id:'same-event',text:'鸡块更适合分享'};
    const replies=await Promise.all([api(runtime,path+'/say',argument,token),api(runtime,path+'/say',argument,token)]);
    assert.deepEqual(replies.map(x=>x.data.replayed).sort(),[false,true]);
    assert.match(new TextDecoder().decode((await reader.read()).value),/鸡块更适合分享/);
    await reader.cancel();await runtime.close();runtime=createNodeRuntime({dbPath,env});
    const restored=(await api(runtime,path+'/state',undefined,token)).data.room;
    assert.equal(restored.arguments.length,1);assert.equal(restored.arguments[0].text,'鸡块更适合分享');
    assert.equal((await api(runtime,path+'/state',undefined,'f'.repeat(64))).status,401);
    const watch=await runtime.fetch(new Request(a.watch_url+'/events'));const resumed=watch.body.getReader();
    assert.match(new TextDecoder().decode((await resumed.read()).value),/鸡块更适合分享/);await resumed.cancel();
    assert.throws(()=>createNodeRuntime({dbPath,env}),/locked/,'同一数据库拒绝启动第二进程实例');
  }finally{await runtime.close();await rm(directory,{recursive:true,force:true});}
});

test('Node restores overdue alarms without client traffic and expires closed room storage after retention',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'mcdebate-alarms-')),dbPath=join(directory,'rooms.sqlite');
  let runtime=createNodeRuntime({dbPath,env,alarmIntervalMs:10});
  try{
    const a=(await api(runtime,'/rooms',{name:'A',topic:'恢复超时'})).data;await runtime.close();
    const db=new DatabaseSync(dbPath);const row=db.prepare('SELECT body FROM rooms WHERE room_id=?').get(a.room.room_id);
    const room=JSON.parse(row.body);room.expires_at=Date.now()-100;db.prepare('UPDATE rooms SET body=?,alarm_at=NULL,retain_until=? WHERE room_id=?').run(JSON.stringify(room),Date.now()+60000,a.room.room_id);db.close();
    runtime=createNodeRuntime({dbPath,env,alarmIntervalMs:10});
    await new Promise(r=>setTimeout(r,100));await runtime.close();
    const saved=new DatabaseSync(dbPath);const actual=JSON.parse(saved.prepare('SELECT body FROM rooms WHERE room_id=?').get(a.room.room_id).body);assert.equal(actual.status,'EXPIRED');
    saved.prepare('UPDATE rooms SET retain_until=? WHERE room_id=?').run(Date.now()-1,a.room.room_id);saved.close();
    runtime=createNodeRuntime({dbPath,env,alarmIntervalMs:10});await new Promise(r=>setTimeout(r,100));
    assert.equal((await api(runtime,'/rooms/'+a.room.room_id+'/state',undefined,a.player_token)).status,404);
  }finally{await runtime.close();await rm(directory,{recursive:true,force:true});}
});

test('Node HTTP exposes 21 MCP tools on configured HTTPS origin and rejects forged Host, Origin and absolute paths',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'mcdebate-http-'));
  const runtime=createNodeRuntime({dbPath:join(directory,'rooms.sqlite'),env});const server=createNodeServer(runtime);
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
    const send=(path,body,headers={})=>new Promise((resolve,reject)=>{const request=httpRequest(base+path,{method:body===undefined?'GET':'POST',headers:{Host:'192.0.2.1','Content-Type':'application/json',Accept:'application/json, text/event-stream',...headers}},response=>{const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));});request.on('error',reject);request.end(body===undefined?undefined:JSON.stringify(body));});
    const rpc=(body,headers={})=>send('/mcp',body,headers);
    const init=await rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'node-test',version:'1.0'}}});assert.equal(init.status,200);await init.text();
    const tools=await rpc({jsonrpc:'2.0',id:2,method:'tools/list'});const toolText=await tools.text();const body=JSON.parse(toolText.startsWith('event:')?toolText.split('\n').find(line=>line.startsWith('data: ')).slice(6):toolText);assert.equal(body.result.tools.length,21);
    assert.equal((await rpc({}, {Origin:'https://evil.example'})).status,403);
    assert.equal((await rpc({}, {Host:'evil.example'})).status,403);
    assert.equal((await send('/health')).status,200);
    assert.equal((await send('/debug')).status,404);
    assert.equal((await rpc({payload:'x'.repeat(17000)})).status,413);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await runtime.close();await rm(directory,{recursive:true,force:true});}
});

test('a slow judge alarm does not delay another room turn deadline',async()=>{
  const {reserveJudge}=await import('../src/judge-state.ts');
  const directory=await mkdtemp(join(tmpdir(),'mcdebate-isolation-')),dbPath=join(directory,'rooms.sqlite');
  let release;const pending=new Promise(resolve=>{release=resolve;});let entered;const calling=new Promise(resolve=>{entered=resolve;});
  let runtime=createNodeRuntime({dbPath,env:{...env,JUDGE_ENABLED:'true',DEEPSEEK_API_KEY:'test-only'}});
  try{
    const first=(await api(runtime,'/rooms',{name:'A',topic:'裁判等待'})).data;await api(runtime,'/rooms/'+first.room.room_id+'/join',{name:'B'});
    const second=(await api(runtime,'/rooms',{name:'A',topic:'独立超时'})).data,path='/rooms/'+second.room.room_id;
    const b=(await api(runtime,path+'/join',{name:'B'})).data;
    await api(runtime,path+'/ready',{ready:true},second.player_token);await api(runtime,path+'/ready',{ready:true},b.player_token);await api(runtime,path+'/start',{},second.player_token);await runtime.close();
    const db=new DatabaseSync(dbPath);
    for(const a of [first,second]){
      const room=JSON.parse(db.prepare('SELECT body FROM rooms WHERE room_id=?').get(a.room.room_id).body);
      if(a===first){room.status='FINISHED';reserveJudge(room,Date.now());room._judge_job.input.arguments=['A','B','A','B'].map(side=>({side,text:'简短观点'}));}
      else room.current_turn.deadline_at=Date.now()-1;
      db.prepare('UPDATE rooms SET body=?,alarm_at=? WHERE room_id=?').run(JSON.stringify(room),Date.now()-1,a.room.room_id);
    }db.close();
    runtime=createNodeRuntime({dbPath,env:{...env,JUDGE_ENABLED:'true',DEEPSEEK_API_KEY:'test-only'},alarmIntervalMs:10,fetchImpl:async()=>{entered();return pending;}});
    let deadline;await Promise.race([calling,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('judge did not start')),1000);})]).finally(()=>clearTimeout(deadline));await new Promise(resolve=>setTimeout(resolve,100));
    const watch=(await api(runtime,new URL(second.watch_url).pathname+'/snapshot')).data;
    assert.equal(watch.status,'PAUSED');
  }finally{release(Response.json({choices:[{finish_reason:'stop',message:{content:'{}'}}]}));await runtime.close();await rm(directory,{recursive:true,force:true});}
});

test('Node configuration rejects unsafe origins and missing judge credentials, defaults to reported data',async()=>{
  const {nodeConfig}=await import('../src/runtime/node/config.ts');
  assert.throws(()=>nodeConfig({MCDEBATE_PUBLIC_ORIGIN:'ftp://localhost',JUDGE_ENABLED:'false'}));
  assert.throws(()=>nodeConfig({MCDEBATE_PUBLIC_ORIGIN:'http://192.0.2.1',JUDGE_ENABLED:'false'}));
  assert.throws(()=>nodeConfig({MCDEBATE_PUBLIC_ORIGIN:'https://example.com/path',JUDGE_ENABLED:'false'}));
  assert.throws(()=>nodeConfig({MCDEBATE_PUBLIC_ORIGIN:'https://user:pass@example.com',JUDGE_ENABLED:'false'}));
  assert.throws(()=>nodeConfig({MCDEBATE_PUBLIC_ORIGIN:'https://example.com'}),/DEEPSEEK_API_KEY/);
  assert.throws(()=>nodeConfig({PORT:'0',JUDGE_ENABLED:'false'}),/PORT/);
  const config=nodeConfig({JUDGE_ENABLED:'false'});assert.equal(config.env.SHOPPING_DATA_MODE,'reported');assert.equal(config.env.MODEL_PROVIDER,'deepseek');
});
