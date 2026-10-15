import type { CheckBody, LegacyData } from './check-types.ts';
import type { buildWatchView } from '../src/watch-view.ts';
type Snapshot=ReturnType<typeof buildWatchView>;
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export async function runWatchSmoke(base: string){
  const origin=new URL(base).origin;let host:LegacyData|undefined,guest:LegacyData|undefined;const readers:{reader:ReadableStreamDefaultReader<Uint8Array>;controller:AbortController}[]=[];
  const api=async(path: string,body?: Record<string,unknown>,token?:string)=>{
    const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',signal:AbortSignal.timeout(10000),
      headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const value=await response.json() as CheckBody;assert.equal(value.ok,true,value.error?.code);return value.data;
  };
  async function connect(url: string){
    const controller=new AbortController();const response=await fetch(url+'/events',{signal:controller.signal});
    assert.equal(response.status,200);assert.match(response.headers.get('Content-Type')??'',/text\/event-stream/);
    const reader=response.body!.getReader();readers.push({reader,controller});let buffer='';const decoder=new TextDecoder();
    return {async next(predicate: (snapshot:Snapshot)=>boolean){
      const timer=setTimeout(()=>controller.abort(),10000);
      try{while(true){
        let split=buffer.indexOf('\n\n');
        if(split<0){const result=await reader.read();assert.equal(result.done,false,'流提前结束');buffer+=decoder.decode(result.value,{stream:true});continue;}
        const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);
        const data=frame.split('\n').find(line=>line.startsWith('data: '));if(!data)continue;
        const snapshot=JSON.parse(data.slice(6)) as Snapshot;
        for(const secret of [host!.player_token,guest!.player_token])assert.equal(JSON.stringify(snapshot).includes(secret),false);
        if(predicate(snapshot))return snapshot;
      }}finally{clearTimeout(timer);}
    },async close(){controller.abort();try{await reader.cancel();}catch{}}};
  }
  try{
    host=await api('/rooms',{name:'麦乐鸡方',agent_label:'测试客户端 A',topic:'测试对局：麦乐鸡还是薯条',expected_players:2,max_turns:4});
    const path='/rooms/'+host.room.room_id;
    guest=await api(path+'/join',{name:'薯条方',agent_label:'测试客户端 B'});
    assert.equal(host.watch_url,guest.watch_url);assert.equal(new URL(host.watch_url).origin,origin);
    const watch=new URL(host.watch_url).pathname;
    assert.equal((await fetch(host.watch_url)).status,200);
    assert.equal((await fetch(host.watch_url+'/snapshot',{method:'POST'})).status,405);
    const wrong=watch.slice(0,-1)+(watch.endsWith('0')?'1':'0');assert.equal((await fetch(origin+wrong+'/snapshot')).status,403);
    const before=(await api(path+'/state',undefined,host.player_token)).room;
    const first=await connect(host.watch_url),second=await connect(host.watch_url);
    await first.next(s=>s.arguments.length===0);await second.next(s=>s.arguments.length===0);
    const observer=await api(watch+'/snapshot');assert.equal((observer as unknown as Snapshot).players.length,2);
    await api(path+'/ready',{ready:true},host.player_token);await api(path+'/ready',{ready:true},guest.player_token);
    let room=(await api(path+'/start',{},host.player_token)).room;
    const lines=['麦乐鸡按块分更方便。','薯条可以放中间，大家分享。','按块分能明确每人的数量。','分享方式不同，不代表哪种更好吃。'];
    for(let i=0;i<4;i++){
      room=(await api(path+'/say',{event_id:'watch-'+i,turn_id:room.current_turn!.turn_id,text:lines[i]},i%2?guest.player_token:host.player_token)).room;
      const streamed=await first.next(s=>s.arguments.length===i+1);assert.equal(streamed.arguments.at(-1)!.text,lines[i]);
      await second.next(s=>s.arguments.length===i+1);
      if(i===2){await second.close();const reconnected=await connect(host.watch_url);assert.equal((await reconnected.next(s=>s.arguments.length===3)).arguments[0].text,lines[0]);await reconnected.close();}
      if(i===2)break;
    }
    // 另起订阅接收最后一条，先前第二位观众已断开。
    const lastWatch=await connect(host.watch_url);await lastWatch.next(s=>s.arguments.length===3);
    room=(await api(path+'/say',{event_id:'watch-3',turn_id:room.current_turn!.turn_id,text:lines[3]},guest.player_token)).room;
    await first.next(s=>s.arguments.length===4);await lastWatch.next(s=>s.arguments.length===4);
    assert.equal(room.status,'FINISHED');assert.deepEqual(room.arguments.map(a=>a.text),lines);
    console.log('PASS: 共用只读URL、双观众SSE、四条真实提交、中途重连、只读权限和未阻塞发言（固定测试文本）');
    return {room_id:host.room.room_id,watch_url:host.watch_url};
  }finally{
    for(const {reader,controller} of readers){controller.abort();try{await reader.cancel();}catch{}}
    if(host)await api('/rooms/'+host.room.room_id+'/close',{},host.player_token);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2).filter(a=>a!=='--');
  try{assert.equal(args.length,1,'传入Worker基址');await runWatchSmoke(args[0]);}
  catch(e){console.error('FAIL:',e instanceof Error?e.message:'Unknown error');process.exitCode=1;}
}
