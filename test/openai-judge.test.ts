import test from 'node:test';
import assert from 'node:assert/strict';
import { callJudge } from '../src/judge.ts';
const input={topic:'测试对战',arguments:[{side:'A',text:'甲'},{side:'B',text:'乙'},{side:'A',text:'甲回应'},{side:'B',text:'乙回应'}]};
const raw={scores:[{side:'A',fit:30,evidence:20,response:15,humor:8,reason:'甲'},{side:'B',fit:31,evidence:20,response:15,humor:8,reason:'乙'}],round_comments:[{round:1,comment:'一'},{round:2,comment:'二'}],summary:'交锋',decision:{side:'B',reason:'回应更好'}};
test('OpenAI裁判用独立密钥、默认nano和严格JSON Schema，不发送DeepSeek专属参数',async()=>{
  let count=0;
  await callJudge({MODEL_PROVIDER:'openai',OPENAI_API_KEY:'test-openai'},input,{fetchImpl:async(url,options)=>{
    count++;assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-openai');
    const body=JSON.parse(options.body);assert.equal(body.model,'gpt-5-nano');assert.equal(body.reasoning_effort,'minimal');assert.equal('thinking' in body,false);assert.equal('max_tokens' in body,false);
    assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);
    assert.ok(body.response_format.json_schema.schema.required.includes('decision'));
    assert.equal(JSON.stringify(body).includes('test-openai'),false);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]});
  }});assert.equal(count,1);
});
