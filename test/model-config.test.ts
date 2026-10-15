import test from 'node:test';
import assert from 'node:assert/strict';
import { modelConfig, modelOptions } from '../src/model-config.ts';

test('默认OpenAI，缺少密钥时不回落DeepSeek；不把密钥放进请求正文',()=>{
  assert.throws(()=>modelConfig({DEEPSEEK_API_KEY:'unused'}),/OPENAI_API_KEY/);
  const config=modelConfig({OPENAI_API_KEY:'test-only',OPENAI_MODEL:'gpt-5-mini'});
  assert.equal(config.endpoint,'https://api.openai.com/v1/chat/completions');
  assert.deepEqual(modelOptions(config,4096),{model:'gpt-5-mini',max_completion_tokens:4096,reasoning_effort:'minimal'});
  assert.equal(JSON.stringify(modelOptions(config,4096)).includes('test-only'),false);
});
test('显式DeepSeek保留关闭长推理；OpenAI的其他模型不带DeepSeek专属参数',()=>{
  const deepseek=modelConfig({MODEL_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'test-only'});
  assert.equal(deepseek.endpoint,'https://api.deepseek.com/chat/completions');
  assert.deepEqual(modelOptions(deepseek,100),{model:'deepseek-flash',max_tokens:100,thinking:{type:'disabled'}});
  const openai=modelConfig({MODEL_PROVIDER:'openai',OPENAI_API_KEY:'test-only',OPENAI_MODEL:'gpt-4.1-mini'});
  assert.deepEqual(modelOptions(openai,100),{model:'gpt-4.1-mini',max_completion_tokens:100});
});
