import type { ModelConfig } from '../../src/model-config.ts';
/** 只重试尚未交给客户端执行工具的模型请求；裁判调用不走此函数。 */
export async function requestAgentCompletion(config:ModelConfig,body:Record<string,unknown>,signal:AbortSignal,{fetchImpl=fetch,delayMs=1000,onRetry=(status:number,attempt:number)=>console.error(`${config.provider} HTTP ${status}，测试Agent有限重试 ${attempt}/2`),onAttempt=()=>{}}:{fetchImpl?:typeof fetch;delayMs?:number;onRetry?:(status:number,attempt:number)=>void;onAttempt?:()=>void}={}):Promise<unknown>{
  for(let attempt=0;attempt<3;attempt++){
    signal.throwIfAborted();onAttempt();
    const response=await fetchImpl(config.endpoint,{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)]),headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.key},body:JSON.stringify(body)});
    if(!response.ok){
      await response.body?.cancel();
      if([429,503].includes(response.status)&&attempt<2){
        onRetry(response.status,attempt+1);
        await new Promise<void>((resolve,reject)=>{
          const aborted=()=>{clearTimeout(timer);signal.removeEventListener('abort',aborted);reject(new Error('测试已取消'));};
          const timer=setTimeout(()=>{signal.removeEventListener('abort',aborted);resolve();},delayMs*(attempt+1));signal.addEventListener('abort',aborted,{once:true});if(signal.aborted)aborted();
        });continue;
      }
      throw new Error(config.provider+' HTTP '+response.status);
    }
    if(!response.body)throw new Error('Model empty body');
    const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder();
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)throw new Error('Model response too large');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
    return JSON.parse(text);
  }
  throw new Error('Model request budget exceeded');
}
