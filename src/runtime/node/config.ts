import { resolve, join } from 'node:path';
import type { AppEnv } from '../types.ts';

export function nodeConfig(input: NodeJS.ProcessEnv) {
  const origin=new URL(input.MCDEBATE_PUBLIC_ORIGIN??'http://127.0.0.1:8870');
  const local=['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  if(!['http:','https:'].includes(origin.protocol)||(origin.protocol!=='https:'&&!local)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('MCDEBATE_PUBLIC_ORIGIN 须为 HTTPS origin，本地调试除外');
  const port=Number(input.PORT??8870);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT 无效');
  const judge=input.JUDGE_ENABLED??'true';
  if(!['true','false'].includes(judge))throw new Error('JUDGE_ENABLED 无效');
  if(judge==='true'&&!input.DEEPSEEK_API_KEY?.trim())throw new Error('请配置 DEEPSEEK_API_KEY');
  const mode=input.SHOPPING_DATA_MODE??'reported';
  if(!['reported','fixture'].includes(mode))throw new Error('SHOPPING_DATA_MODE 无效');
  const env: Omit<AppEnv,'ROOMS'>={MCDEBATE_PUBLIC_ORIGIN:origin.origin,JUDGE_ENABLED:judge,
    DEMO_TURN_MS:'120000',SHOPPING_DATA_MODE:mode,MODEL_PROVIDER:'deepseek',
    DEEPSEEK_MODEL:input.DEEPSEEK_MODEL??'deepseek-flash',DEEPSEEK_API_KEY:input.DEEPSEEK_API_KEY};
  return {env,port,dbPath:join(resolve(input.DATA_DIR??'.local/node'),'rooms.sqlite'),release:input.RELEASE_SHA??'development'};
}
