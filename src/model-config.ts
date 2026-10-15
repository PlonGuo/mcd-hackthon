export interface ModelEnv {MODEL_PROVIDER?:string;OPENAI_API_KEY?:string;OPENAI_MODEL?:string;DEEPSEEK_API_KEY?:string;DEEPSEEK_MODEL?:string}
export interface ModelConfig {provider:'openai'|'deepseek';endpoint:string;key:string;model:string}
export function modelConfig(env:ModelEnv):ModelConfig {
  const provider=env.MODEL_PROVIDER??'openai';
  if(provider==='deepseek'){
    if(!env.DEEPSEEK_API_KEY?.trim())throw new Error('请配置DEEPSEEK_API_KEY');
    return {provider,endpoint:'https://api.deepseek.com/chat/completions',key:env.DEEPSEEK_API_KEY,model:env.DEEPSEEK_MODEL||'deepseek-flash'};
  }
  if(provider!=='openai')throw new Error('MODEL_PROVIDER须为openai或deepseek');
  if(!env.OPENAI_API_KEY?.trim())throw new Error('请配置OPENAI_API_KEY');
  return {provider,endpoint:'https://api.openai.com/v1/chat/completions',key:env.OPENAI_API_KEY,model:env.OPENAI_MODEL||'gpt-5-nano'};
}
export function modelOptions(config:ModelConfig,maxTokens:number):Record<string,unknown> {
  if(config.provider==='deepseek')return {model:config.model,max_tokens:maxTokens,thinking:{type:'disabled'}};
  const firstGpt5=['gpt-5','gpt-5-mini','gpt-5-nano'].some(m=>config.model===m||config.model.startsWith(m+'-2025'));
  return {model:config.model,max_completion_tokens:maxTokens,...(/^gpt-[56]/.test(config.model)?{reasoning_effort:firstGpt5?'minimal':'none'}:{})};
}
