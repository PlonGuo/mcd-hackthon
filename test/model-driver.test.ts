import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAgentCompletion } from '../scripts/lib/model-request.ts';

test('测试Agent遇临时503有限重试，成功响应按原消息请求，不执行任何工具',async()=>{
  let calls=0;const seen=[];
  const result=await requestAgentCompletion({provider:'openai',endpoint:'https://api.openai.com/v1/chat/completions',key:'private-test-key',model:'gpt-5-nano'},{model:'test',messages:[{role:'user',content:'阶段任务'}]},AbortSignal.timeout(1000),{
    delayMs:1,fetchImpl:async(url,options)=>{calls++;seen.push(JSON.parse(options.body));assert.equal(options.headers.Authorization,'Bearer private-test-key');return calls===1?Response.json({error:'busy'},{status:503}):Response.json({choices:[]});},onRetry:()=>{},
  });
  assert.equal(calls,2);assert.deepEqual(seen[0],seen[1]);assert.deepEqual(result,{choices:[]});
});
test('测试Agent最多三次，认证失败不重试，错误不包含密钥或上游正文',async()=>{
  for(const [status,expected] of [[503,3],[401,1]]){
    let calls=0;await assert.rejects(()=>requestAgentCompletion({provider:'openai',endpoint:'https://api.openai.com/v1/chat/completions',key:'private-test-key',model:'gpt-5-nano'},{},AbortSignal.timeout(1000),{delayMs:1,fetchImpl:async()=>{calls++;return new Response({provider:'openai',endpoint:'https://api.openai.com/v1/chat/completions',key:'private-test-key',model:'gpt-5-nano'},{status});},onRetry:()=>{}}),e=>e.message==='openai HTTP '+status);
    assert.equal(calls,expected);
  }
});
