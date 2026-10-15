import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './room-fixture.ts';
import {createRoom,transition,viewRoom} from '../src/core.ts';
const result=()=>({scores:[{side:'A',fit:32,evidence:18,response:15,humor:8,reason:'切题'},
  {side:'B',fit:30,evidence:18,response:14,humor:8,reason:'回应较弱'}],round_comments:[{round:1,comment:'立场'},{round:2,comment:'交锋'}],summary:'双方交锋',decision:{side:'A',reason:'回应具体'}});
async function play(f){const players=await f.create(),{a,b,path}=players;
  await f.api(path+'/ready',{ready:true},a.player_token);await f.api(path+'/ready',{ready:true},b.player_token);
  let r=(await f.api(path+'/start',{},a.player_token)).data.room;let last;
  for(let i=0;i<4;i++){
    last={event_id:'judge-'+i,turn_id:r.current_turn.turn_id,text:i%2?'薯条值得分享':'鸡块按块分享'};
    const replies=await Promise.all([f.api(path+'/say',last,i%2?b.player_token:a.player_token),f.api(path+'/say',last,i%2?b.player_token:a.player_token)]);
    assert.deepEqual(replies.map(x=>x.data.replayed).sort(),[false,true]);r=replies[0].data.room;
  }
  return {...players,last,r};
}
test('可信配置设置120秒，新裁判房间不暴露内部job；旧房间保留30秒',()=>{
  const now=1000,id={room_id:'a'.repeat(24),player_id:'A',token_hash:'hash'};
  const input={name:'A',topic:'鸡块还是薯条'};
  const legacy=createRoom(input,id,now);const demo=createRoom(input,id,now,{judgeEnabled:true,turnMs:120000});
  assert.equal(demo._turn_ms,120000);assert.equal(legacy._turn_ms??30000,30000);
  assert.equal(demo.judgement.status,'NOT_STARTED');
  assert.throws(()=>createRoom({...input,judgeEnabled:true},id,now));
  assert.equal(viewRoom(demo,'A',0,now)._turn_ms,undefined);
});
test('并发提交/重放只调用一次模型，等待模型不阻塞状态，成功由后端映射赢家',async()=>{
  let resolve,entered;const pending=new Promise(r=>resolve=r),started=new Promise(r=>entered=r);let calls=0;
  const f=fixture({MODEL_PROVIDER:'deepseek',JUDGE_ENABLED:'true',DEMO_TURN_MS:'120000',DEEPSEEK_API_KEY:'private'},async()=>{calls++;entered();return pending;});
  const {a,b,path,last,r}=await play(f);await started;
  assert.equal(r.status,'FINISHED');assert.equal(r.judgement.status,'PENDING');
  assert.equal((await f.api(path+'/state',undefined,a.player_token)).data.room.judgement.status,'PENDING');
  await f.api(path+'/say',last,b.player_token);assert.equal(calls,1);
  assert.equal((await f.api(path+'/say',{...last,event_id:'fifth'},a.player_token)).status,409);
  resolve(Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result())}}]}));await f.drain();
  const final=(await f.api(path+'/state',undefined,a.player_token)).data.room;
  assert.equal(final.judgement.status,'SUCCEEDED');assert.equal(final.judgement.result.winner_player_id,a.player_id);
  assert.equal(final._judge_job,undefined);assert.equal(JSON.stringify(final).includes('private'),false);
});
test('关闭期间模型晚回不覆盖房间；错误结果无伪造赢家',async()=>{
  let resolve,entered;const started=new Promise(r=>entered=r);const pending=new Promise(r=>resolve=r);
  const f=fixture({MODEL_PROVIDER:'deepseek',JUDGE_ENABLED:'true',DEEPSEEK_API_KEY:'private'},async()=>{entered();return pending;});
  const {a,path}=await play(f);await started;await f.api(path+'/close',{},a.player_token);
  resolve(Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result())}}]}));await f.drain();
  assert.equal(f.stored.status,'CLOSED');assert.notEqual(f.stored.judgement.status,'SUCCEEDED');
  const bad=fixture({MODEL_PROVIDER:'deepseek',JUDGE_ENABLED:'true',DEEPSEEK_API_KEY:'private'},async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{}'}}]}));
  await play(bad);await bad.drain();assert.equal(bad.stored.judgement.status,'FAILED');assert.equal(bad.stored.judgement.result,undefined);
});
test('同分决胜经控制器传到玩家和只读观众，不增加模型调用',async()=>{
  let calls=0;const raw=result();raw.scores[1]={...raw.scores[0],side:'B'};
  raw.decision={side:'B',reason:'第二轮回应更贴近共享场景'};
  const f=fixture({MODEL_PROVIDER:'deepseek',JUDGE_ENABLED:'true',DEEPSEEK_API_KEY:'private'},async()=>{
    calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]});
  });
  const {a,b,path}=await play(f);await f.drain();
  const actor=(await f.api(path+'/state',undefined,a.player_token)).data.room.judgement;
  const viewer=(await f.api(new URL(a.watch_url).pathname+'/snapshot')).data.judgement;
  assert.equal(calls,1);assert.equal(viewer.status,'SUCCEEDED');
  assert.deepEqual(viewer,actor);assert.equal(viewer.result.winner_player_id,b.player_id);
  assert.deepEqual(viewer.result.scores.map(s=>s.total),[73,73]);
  assert.deepEqual(viewer.result.tie_break,{player_id:b.player_id,reason:'第二轮回应更贴近共享场景'});
  f.controller.watchHub.close();
});
test('重建控制器遇已领取任务不再次调用；alarm截止后标失败',async()=>{
  const f=fixture({JUDGE_ENABLED:'true'});await play(f);await f.drain();
  const room=f.stored;room.judgement={status:'PENDING'};room._judge_job={job_id:'restarted',claimed:true,deadline_at:Date.now()+1000};
  let calls=0;const cold=fixture({MODEL_PROVIDER:'deepseek',JUDGE_ENABLED:'true',DEEPSEEK_API_KEY:'private'},async()=>{calls++;throw new Error('must not call');});cold.stored=room;
  await cold.controller.runPendingJudge();assert.equal(calls,0);
  room._judge_job.deadline_at=Date.now()-1;cold.stored=room;await cold.controller.alarm();
  assert.equal(cold.stored.judgement.status,'FAILED');assert.equal(cold.stored.judgement.error_code,'JUDGE_TIMEOUT');
  assert.equal(calls,0);
});
