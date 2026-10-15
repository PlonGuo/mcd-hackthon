import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelAgent } from '../scripts/lib/model-agent.ts';
function fakeAgent(toolReply,toolName='set_ready'){
  let calls=0;const observed=[];
  const agent=new ModelAgent('测试','http://localhost:8790/mcp',{provider:'openai',endpoint:'https://api.openai.com/v1/chat/completions',key:'api-private',model:'gpt-5-nano'},{fetchImpl:async(url,options)=>{
    calls++;observed.push(JSON.parse(options.body));return Response.json({choices:[{finish_reason:calls===1?'tool_calls':'stop',message:calls===1?{content:null,tool_calls:[{id:'call-1',type:'function',function:{name:toolName,arguments:JSON.stringify(toolName==='set_ready'?{ready:true}:{name:'甲',topic:'题目'})}}]}:{content:'已完成'}}]});
  }});
  agent.identity=toolName==='set_ready'?{room_id:'a'.repeat(24),player_token:'b'.repeat(64)}:undefined;
  agent.tools=[{name:toolName,inputSchema:{type:'object',properties:{ready:{type:'boolean'}}}}];agent.client.callTool=async()=>toolReply;
  return {agent,observed,get calls(){return calls;}};
}
test('模型说完成不等于工具成功：必需操作失败或根本未执行均不能完成阶段',async()=>{
  const f=fakeAgent({isError:true,structuredContent:{ok:false,error:{code:'ROOM_NOT_READY',message:'尚未就绪',expected_action:'get_room_state',retryable:false}}});
  await assert.rejects(()=>f.agent.task('设置准备',['set_ready'],AbortSignal.timeout(1000)),/阶段缺少成功工具/);
  assert.equal(f.calls,4);const contents=JSON.stringify(f.observed);assert.equal(contents.includes('api-private'),false);assert.equal(contents.includes('b'.repeat(64)),false);
});
test('创建结果未知立即终止，不再次请求模型，也不自动重建房间',async()=>{
  const f=fakeAgent({isError:true,structuredContent:{ok:false,error:{code:'INTERNAL_ERROR',message:'注册结果未知',expected_action:'registration_unknown',retryable:false}}},'create_room');
  await assert.rejects(()=>f.agent.task('创建房间',['create_room'],AbortSignal.timeout(1000)),/registration_unknown/);assert.equal(f.calls,1);
});

test('模型提前结束时只提醒未完成操作，继续成功后不重复创建身份',async()=>{
  let requests=0;const tools=[];
  const agent=new ModelAgent('测试','http://localhost:8790/mcp',{provider:'openai',endpoint:'https://api.openai.com/v1/chat/completions',key:'api-private',model:'gpt-5-nano'},{fetchImpl:async()=>{
    requests++;const name=requests===1?'create_room':'query_demo_catalog';
    return Response.json({choices:[{finish_reason:requests%2?'tool_calls':'stop',message:requests%2?{content:null,tool_calls:[{id:'call-'+requests,type:'function',function:{name,arguments:JSON.stringify(name==='create_room'?{name:'甲',topic:'测试'}:{})}}]}:{content:'已完成'}}]});
  }});
  agent.tools=['create_room','query_demo_catalog'].map(name=>({name,inputSchema:{type:'object',properties:{}}}));
  agent.client.callTool=async({name})=>{tools.push(name);return {structuredContent:{ok:true,data:name==='create_room'?{room:{room_id:'a'.repeat(24)},player_token:'b'.repeat(64)}:{source:'TEST_FIXTURE'}}};};
  await agent.task('创建并查询测试目录',['create_room','query_demo_catalog'],AbortSignal.timeout(1000));
  assert.deepEqual(tools,['create_room','query_demo_catalog']);assert.equal(requests,3);
});

test('必需工具成功后立即结束阶段，不再请求模型导致重复或撤销操作',async()=>{
  let requests=0,executions=0;
  const agent=new ModelAgent('测试','http://localhost:8790/mcp',{provider:'openai',endpoint:'https://api.openai.com/v1/chat/completions',key:'api-private',model:'gpt-5-nano'},{fetchImpl:async()=>{
    requests++;return Response.json({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'x'+requests,type:'function',function:{name:'set_ready',arguments:JSON.stringify({ready:requests===1})}}]}}]});
  }});
  agent.tools=[{name:'set_ready',inputSchema:{type:'object',properties:{ready:{type:'boolean'}}}}];agent.identity={room_id:'a'.repeat(24),player_token:'b'.repeat(64)};
  agent.client.callTool=async()=>{executions++;return {structuredContent:{ok:true,data:{room:{}}}};};
  await agent.task('准备一次',['set_ready'],AbortSignal.timeout(1000));assert.equal(requests,1);assert.equal(executions,1);
});

test('SDK文字形式的工具校验错误可修正，反馈脱敏且不误报协议断连',async()=>{
  let requests=0,executions=0;const sent=[];
  const agent=new ModelAgent('测试','http://localhost:8790/mcp',{provider:'openai',endpoint:'https://api.openai.com/v1/chat/completions',key:'api-private',model:'gpt-5-nano'},{fetchImpl:async(url,options)=>{
    requests++;sent.push(JSON.parse(options.body));return Response.json({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'call-'+requests,type:'function',function:{name:'submit_argument',arguments:JSON.stringify({text:requests===1?'过长':'已修正'})}}]}}]});
  }});
  agent.tools=[{name:'submit_argument',inputSchema:{type:'object',properties:{text:{type:'string'}}}}];agent.identity={room_id:'a'.repeat(24),player_token:'b'.repeat(64)};
  agent.client.callTool=async()=>{executions++;return executions===1?{isError:true,content:[{type:'text',text:'text超过限制 api-private '+ 'b'.repeat(64)}]}:{structuredContent:{ok:true,data:{room:{}}}};};
  await agent.task('提交一条',['submit_argument'],AbortSignal.timeout(1000));assert.equal(executions,2);
  const feedback=sent[1].messages.at(-1).content;assert.match(feedback,/TOOL_INPUT_REJECTED/);assert.equal(feedback.includes('api-private'),false);assert.equal(feedback.includes('b'.repeat(64)),false);
});
