import { RoomController } from '../src/room-object.ts';

export function fixture(env={},fetchImpl=fetch) {
  let stored, alarm, queue=Promise.resolve();const background=[];
  const ctx={
    storage:{get:async()=>structuredClone(stored),put:async(k,value)=>{stored=structuredClone(value);},
      setAlarm:async t=>{alarm=t;},deleteAlarm:async()=>{alarm=undefined;}},
    blockConcurrencyWhile(fn){const p=queue.then(fn);queue=p.catch(()=>{});return p;},
    waitUntil(p){background.push(p);},
  };
  const controller=new RoomController(ctx,{MCDEBATE_PUBLIC_ORIGIN:'http://localhost:8787',...env},{fetchImpl});
  const request=(path,body,token,method=body===undefined?'GET':'POST',signal)=>controller.fetch(new Request(`http://localhost:8787${path}`,{
    method,signal,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  }));
  async function api(path,body,token){const r=await request(path,body,token);return {status:r.status,...await r.json()};}
  async function create(){const a=await api('/_create/'+ 'a'.repeat(24),{name:'A',topic:'鸡块还是薯条',expected_players:2,max_turns:4});
    const b=await api('/rooms/'+a.data.room.room_id+'/join',{name:'B'});return {a:a.data,b:b.data,path:'/rooms/'+a.data.room.room_id};}
  return {controller,ctx,request,api,create,background,get stored(){return stored;},set stored(v){stored=structuredClone(v);},get alarm(){return alarm;},
    async drain(){while(background.length) await Promise.all(background.splice(0));}};
}
