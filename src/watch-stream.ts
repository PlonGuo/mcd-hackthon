import { RESPONSE_HEADERS } from './http.ts';
interface Snapshot {sequence:number;status:string}
interface Subscriber {controller:ReadableStreamDefaultController<Uint8Array>;signal?:AbortSignal;last:number;abort:()=>void;timer?:ReturnType<typeof setInterval>;expiry?:ReturnType<typeof setTimeout>}
export function createWatchHub({heartbeatMs=20000,maxSubscribers=10}={}) {
  const subscribers=new Set<Subscriber>(), encode=new TextEncoder();
  const snapshotChunk=(s: Snapshot)=>encode.encode(`id: ${s.sequence}\nevent: snapshot\ndata: ${JSON.stringify(s)}\n\n`);
  function remove(sub: Subscriber,close=true) {
    if(!subscribers.delete(sub))return;
    clearInterval(sub.timer);clearTimeout(sub.expiry);sub.signal?.removeEventListener('abort',sub.abort);
    if(close)try{sub.controller.close();}catch{/* 消费者已经断开 */}
  }
  function send(sub: Subscriber,chunk: Uint8Array) {
    if((sub.controller.desiredSize??0)<=0){remove(sub);return;}
    try{sub.controller.enqueue(chunk);}catch{remove(sub);}
  }
  return {
    get size(){return subscribers.size;},
    subscribe(snapshot: Snapshot,signal?: AbortSignal,{expiresAt}: {expiresAt?:number}={}) {
      if(signal?.aborted)return new Response(null,{status:499});
      if(subscribers.size>=maxSubscribers)return new Response('观众席暂满，请稍后重试',{status:429,headers:RESPONSE_HEADERS});
      let sub: Subscriber;
      const stream=new ReadableStream<Uint8Array>({
        start(controller){
          sub={controller,signal,last:snapshot.sequence,abort:()=>remove(sub)};subscribers.add(sub);signal?.addEventListener('abort',sub.abort,{once:true});send(sub,snapshotChunk(snapshot));
          sub.timer=setInterval(()=>send(sub,encode.encode(': heartbeat\n\n')),heartbeatMs);sub.timer.unref?.();
          if(expiresAt){sub.expiry=setTimeout(()=>remove(sub),Math.max(0,expiresAt-Date.now()));sub.expiry.unref?.();}
        },cancel(){remove(sub,false);},
      },{highWaterMark:8});
      return new Response(stream,{headers:{...RESPONSE_HEADERS,'Content-Type':'text/event-stream; charset=utf-8'}});
    },
    publish(snapshot: Snapshot){const chunk=snapshotChunk(snapshot);for(const sub of subscribers){if(snapshot.sequence<=sub.last)continue;sub.last=snapshot.sequence;send(sub,chunk);if(['CLOSED','EXPIRED'].includes(snapshot.status))remove(sub);}},
    close(){for(const sub of subscribers)remove(sub);},
  };
}
