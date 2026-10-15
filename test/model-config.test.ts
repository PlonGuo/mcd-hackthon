import test from 'node:test';
import assert from 'node:assert/strict';
import { modelConfig, modelOptions } from '../src/model-config.ts';

test('默认DeepSeek，缺少密钥时不回落OpenAI；辩手和裁判共用非思考配置',()=>{
  assert.throws(()=>modelConfig({OPENAI_API_KEY:'unused'}),/DEEPSEEK_API_KEY/);
  const config=modelConfig({DEEPSEEK_API_KEY:'test-only'});
  assert.equal(config.provider,'deepseek');
  assert.equal(config.endpoint,'https://api.deepseek.com/chat/completions');
  assert.deepEqual(modelOptions(config,4096),{model:'deepseek-flash',max_tokens:4096,thinking:{type:'disabled'}});
  assert.equal(JSON.stringify(modelOptions(config,4096)).includes('test-only'),false);
});
test('OpenAI仅在显式选择时启用，保留旧模型参数兼容性',()=>{
  assert.throws(()=>modelConfig({MODEL_PROVIDER:'openai',DEEPSEEK_API_KEY:'unused'}),/OPENAI_API_KEY/);
  const config=modelConfig({MODEL_PROVIDER:'openai',OPENAI_API_KEY:'test-only',OPENAI_MODEL:'gpt-5-mini'});
  assert.equal(config.endpoint,'https://api.openai.com/v1/chat/completions');
  assert.deepEqual(modelOptions(config,4096),{model:'gpt-5-mini',max_completion_tokens:4096,reasoning_effort:'minimal'});
  const other=modelConfig({MODEL_PROVIDER:'openai',OPENAI_API_KEY:'test-only',OPENAI_MODEL:'gpt-4.1-mini'});
  assert.deepEqual(modelOptions(other,100),{model:'gpt-4.1-mini',max_completion_tokens:100});
});
