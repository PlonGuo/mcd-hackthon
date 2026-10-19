import test from 'node:test';
import assert from 'node:assert/strict';
import { grade, runScenario } from '../scripts/skill-eval.ts';

const scenario = {id:'url',prompt:'给我观战链接',replies:{},checks:{urls:['https://watch.example.invalid/watch/abc/0123456789abcdef']}};
const trace = {calls:[],messages:['[观战](https://watch.example.invalid/watch/abc/0123456789abcdef)'],errors:[],stopped:'answer'};
const passed = (s,t) => grade(s,t).every(check=>check.passed);
test('评估必须拒绝观战链接中间漏字符，不能靠域名或前缀判通过',()=>{
  assert.equal(passed(scenario,trace),true);
  assert.equal(passed(scenario,{...trace,messages:['**https://watch.example.invalid/watch/abc/0123456789abcdef**']}),true);
  assert.equal(passed(scenario,{...trace,messages:['[观战](https://watch.example.invalid/watch/abc/012345abcdef)']}),false);
});
test('评估拒绝未知订单再建单、错误身份和公开凭证',()=>{
  const s={...scenario,checks:{calls:[{name:'create-order',max:0}],privateToken:'own-token',roomId:'room'}};
  const good={...trace,messages:['先查询原订单'],calls:[{name:'get_room_state',args:{player_token:'own-token',room_id:'room'}}]};
  assert.equal(passed(s,good),true);
  for(const changed of [
    {...good,calls:[...good.calls,{name:'create-order',args:{}}]},
    {...good,calls:[{name:'get_room_state',args:{player_token:'other-token',room_id:'room'}}]},
    {...good,messages:['请转发 own-token']},
    {...good,calls:[{name:'submit_argument',args:{player_token:'own-token',room_id:'room',text:'own-token'}}]},
  ]) assert.equal(passed(s,changed),false);
});
test('评估分别检查成功次数、等待参数和结账顺序',()=>{
  const s={...scenario,checks:{calls:[{name:'get_room_state',args:{wait_ms:5000},min:2},{name:'prepare_checkout',min:1,max:1}],order:['get_room_state','prepare_checkout']}};
  const good={...trace,calls:[{name:'get_room_state',args:{wait_ms:5000}},{name:'get_room_state',args:{wait_ms:5000}},{name:'prepare_checkout',args:{}}]};
  assert.equal(passed(s,good),true);
  assert.equal(passed(s,{...good,calls:good.calls.slice(1)}),false);
  assert.equal(passed(s,{...good,calls:[good.calls[2],...good.calls.slice(0,2)]}),false);
});
const config={provider:'deepseek',model:'test-model',endpoint:'https://model.example.invalid/chat',key:'not-a-real-key'};
const tool={name:'create-order',description:'创建订单',inputSchema:{type:'object',properties:{quantity:{type:'integer',minimum:1}},required:['quantity'],additionalProperties:false}};
test('评估工具始终使用本地返回：模型提出真实建单也不会请求业务网络',async()=>{
  const urls=[];let n=0;
  const result=await runScenario({id:'isolation',prompt:'创建订单',replies:{'create-order':[{result:{orderId:'fake'}}]},checks:{}},'技能正文','参考',[tool],config,{fetchImpl:async(url,options)=>{
    urls.push(url);n++;
    return Response.json({choices:[{message:n===1?{content:null,tool_calls:[{id:'c1',type:'function',function:{name:'create-order',arguments:'{"quantity":1}'}}]}:{content:'已创建'},finish_reason:n===1?'tool_calls':'stop'}]});
  }});
  assert.deepEqual(urls,[config.endpoint,config.endpoint]);
  assert.equal(result.calls.length,1);assert.deepEqual(result.errors,[]);
});
test('工具参数不合法必须失败，不能用固定成功响应把错误掩盖',async()=>{
  const result=await runScenario({id:'invalid',prompt:'创建订单',maxSteps:1,replies:{'create-order':[{result:{orderId:'fake'}}]},checks:{}},'正文','参考',[tool],config,{fetchImpl:async()=>Response.json({choices:[{message:{content:null,tool_calls:[{id:'c1',type:'function',function:{name:'create-order',arguments:'{"quantity":0}'}}]},finish_reason:'tool_calls'}]})});
  assert.ok(result.errors.some(e=>e.includes('INVALID_ARGUMENT')));
  assert.equal(passed({id:'invalid',prompt:'',replies:{},checks:{}},result),false);
});
test('模型提前结束时记录停止，不注入继续调用提示来替 Skill 纠错',async()=>{
  let n=0;
  const result=await runScenario({id:'early',prompt:'等对手加入',replies:{},checks:{}},'正文','参考',[],config,{fetchImpl:async()=>{n++;return Response.json({choices:[{message:{content:'等你说继续'},finish_reason:'stop'}]});}});
  assert.equal(n,1);assert.equal(result.stopped,'answer');assert.deepEqual(result.calls,[]);
});
test('允许模型同批读取参考和状态，不把两个独立读取误判为技能失败',async()=>{
  let n=0;
  const read={name:'get_room_state',description:'读取',inputSchema:{type:'object',properties:{},additionalProperties:false}};
  const result=await runScenario({id:'reads',prompt:'继续',replies:{get_room_state:[{result:{ok:true}}]},checks:{}},'正文','参考',[read],config,{fetchImpl:async()=>{
    n++;return Response.json({choices:[{message:n===1?{content:null,tool_calls:[{id:'r1',type:'function',function:{name:'read_skill_reference',arguments:'{"path":"references/checkout.md"}'}},{id:'r2',type:'function',function:{name:'get_room_state',arguments:'{}'}}]}:{content:'等待确认'},finish_reason:n===1?'tool_calls':'stop'}]});
  }});
  assert.deepEqual(result.errors,[]);assert.equal(result.calls.length,2);
});
