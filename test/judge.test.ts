import test from 'node:test';
import assert from 'node:assert/strict';
import {validateJudgeResult,callJudge} from '../src/judge.ts';
export const rawResult=()=>({scores:[{side:'A',fit:32,evidence:18,response:15,humor:8,reason:'切题且有效回应'},
  {side:'B',fit:30,evidence:18,response:14,humor:8,reason:'部分偏题'}],
  round_comments:[{round:1,comment:'双方提出立场'},{round:2,comment:'A回应更直接'}],summary:'双方均说明偏好，偏好不代表商品客观优劣',decision:{side:'A',reason:'回应更具体'}});
const parties=[{side:'A',player_id:'p1'},{side:'B',player_id:'p2'}];
const input={topic:'鸡块还是薯条',arguments:['A','B','A','B'].map(side=>({side,text:'分享方便'}))};
test('后端计算总分和身份，不同分时高分者获胜',()=>{
  const raw=rawResult();const r=validateJudgeResult(raw,parties);
  assert.equal(r.scores[0].total,73);assert.equal(r.winner_player_id,'p1');
});
test('同分保留原分数，按裁判决胜选出唯一真实玩家并公开理由',()=>{
  for(const [side,winner] of [['A','p1'],['B','p2']]){
    const raw=rawResult();raw.scores[1]={...raw.scores[0],side:'B'};
    raw.decision={side,reason:'最终回应更具体地说明了适用场景'};
    const r=validateJudgeResult(raw,parties);
    assert.deepEqual(r.scores.map(s=>s.total),[73,73]);
    assert.equal(r.winner_player_id,winner);
    assert.deepEqual(r.tie_break,{player_id:winner,reason:'最终回应更具体地说明了适用场景'});
  }
});
test('决胜缺失、非法身份、空理由及额外字段仍拒绝',()=>{
  for(const decision of [null,undefined,{side:'C',reason:'理由'},{side:'B',reason:' '},{side:'B',reason:'理由',private:'秘密'}]){
    const raw=rawResult();raw.scores[1]={...raw.scores[0],side:'B'};raw.decision=decision;
    assert.throws(()=>validateJudgeResult(raw,parties));
  }
});
test('模型不参与判断是否同分；备用选择不能推翻较高总分',()=>{
  const raw=rawResult();raw.decision={side:'B',reason:'模型备用选择B'};
  const r=validateJudgeResult(raw,parties);
  assert.deepEqual(r.scores.map(s=>s.total),[73,70]);
  assert.equal(r.winner_player_id,'p1');assert.equal(r.tie_break,null);
  raw.scores[0].fit=20;
  raw.decision={side:'A',reason:'模型备用选择A'};
  const reversed=validateJudgeResult(raw,parties);
  assert.equal(reversed.winner_player_id,'p2');assert.equal(reversed.tie_break,null);
});
test('拒绝缺项、浮点/越界、重复双方/轮次、模型指定赢家与额外键',()=>{
  const cases=[r=>delete r.scores[0].fit,r=>r.scores[0].fit=1.2,r=>r.scores[0].fit=41,
    r=>r.scores[1].side='A',r=>r.round_comments[1].round=1,r=>r.winner_player_id='p2',r=>r.scores[0].private='x'];
  for(const change of cases){const r=rawResult();change(r);assert.throws(()=>validateJudgeResult(r,parties));}
  assert.throws(()=>validateJudgeResult(rawResult(),[{side:'A',player_id:'p1'},{side:'B',player_id:'p1'}]));
});
test('官方API一次请求，结构化输入不包含私密配置或模型品牌',async()=>{
  let calls=0;const r=await callJudge({MODEL_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'private-key',DEEPSEEK_MODEL:'deepseek-flash'},input,{fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer private-key');const body=JSON.parse(options.body);
    assert.equal(body.stream,false);assert.equal(body.response_format.type,'json_object');
    assert.equal(JSON.stringify(body).includes('private-key'),false);assert.match(body.messages[0].content,/json/);
    assert.deepEqual(JSON.parse(body.messages[1].content),input);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(rawResult()),reasoning_content:'私密推理'}}]});
  }});
  assert.equal(calls,1);assert.equal(JSON.stringify(r).includes('私密推理'),false);
});
test('短对局裁判显式关闭默认长推理，让输出预算用于完整评分',async()=>{
  const r=await callJudge({MODEL_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'test-only'},input,{fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body),complete=body.thinking?.type==='disabled';
    // 来自真实截断：默认推理可能先耗尽预算，尚未产出完整评分。
    return Response.json({choices:[{finish_reason:complete?'stop':'length',message:{content:complete?JSON.stringify(rawResult()):''}}]});
  }});
  assert.equal(r.scores.length,2);assert.equal(r.decision.side,'A');
});
test('非法评分记录结构诊断，不记录密钥、响应内容或私密推理',async t=>{
  const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));
  const raw=rawResult();raw.summary='私密内容'.repeat(100);
  await assert.rejects(()=>callJudge({MODEL_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'private-key'},input,{fetchImpl:async()=>Response.json({choices:[{
    finish_reason:'stop',message:{content:JSON.stringify(raw),reasoning_content:'私密推理'},
  }]})}),e=>e.code==='JUDGE_INVALID_REPLY');
  assert.equal(logs.length,1);
  const diagnostic=JSON.parse(logs[0][1]);assert.deepEqual(diagnostic,[{code:'custom',path:['summary']}]);
  for(const secret of ['private-key','私密内容','私密推理'])assert.equal(JSON.stringify(logs).includes(secret),false);
});
test('缺密钥、HTTP失败、空/截断/非法输出不重试且不泄漏上游内容',async()=>{
  await assert.rejects(()=>callJudge({},input),e=>e.code==='JUDGE_NOT_CONFIGURED');
  for(const status of [401,429,500]){let calls=0;
    await assert.rejects(()=>callJudge({MODEL_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'x'},input,{fetchImpl:async()=>{calls++;return new Response('secret upstream',{status});}}),
      e=>e.code.startsWith('JUDGE_')&&!e.message.includes('secret'));
    assert.equal(calls,1);
  }
  for(const [content,finish_reason] of [['','stop'],['{','stop'],[JSON.stringify(rawResult()),'length']])
    await assert.rejects(()=>callJudge({MODEL_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'x'},input,{fetchImpl:async()=>Response.json({choices:[{finish_reason,message:{content}}]})}));
});
test('整体预算包含正文读取；过大响应拒绝',async()=>{
  await assert.rejects(()=>callJudge({MODEL_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'x'},input,{timeoutMs:10,
    fetchImpl:async()=>new Response(new ReadableStream({start(){}}))}),e=>e.code==='JUDGE_TIMEOUT');
  await assert.rejects(()=>callJudge({MODEL_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'x'},input,{fetchImpl:async()=>new Response('x'.repeat(70000))}),e=>e.code==='JUDGE_INVALID_REPLY');
});
