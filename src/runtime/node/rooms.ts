import app from '../../app.ts';
import { RoomController } from '../../room-object.ts';
import type { AppEnv, RoomContext } from '../types.ts';
import type { StoredRoom } from '../../types.ts';
import { RoomDatabase } from './storage.ts';
import { RoomError } from '../../core.ts';
import { errorResponse } from '../../http.ts';

type Options = { dbPath: string; env: Omit<AppEnv,'ROOMS'>; alarmIntervalMs?: number; maxRooms?: number; fetchImpl?: typeof fetch };
type Entry = { controller: RoomController; tail: Promise<unknown>; jobs: Set<Promise<unknown>>; pending: number; lastUsed: number };
export function createNodeRuntime({dbPath,env: config,alarmIntervalMs=250,maxRooms=2000,fetchImpl=fetch}: Options) {
  const database = new RoomDatabase(dbPath,maxRooms), entries = new Map<string,Entry>();
  let closing = false, ticking = false;
  const alarmTasks=new Map<string,Promise<unknown>>();
  const env: AppEnv = {...config,ROOMS:{idFromName: name=>name,get: id=>({fetch: request=>entry(String(id)).controller.fetch(request)})}};
  function entry(id: string): Entry {
    if (closing) throw new RoomError('SERVER_BUSY','服务正在重启，请稍后重试',503);
    if (!/^[a-f0-9]{24}$/.test(id)) throw new RoomError('INVALID_ARGUMENT','房间号无效');
    const found = entries.get(id);
    if (found) { found.lastUsed=Date.now(); return found; }
    evict();
    if(entries.size>=500) throw new RoomError('SERVER_BUSY','活跃房间较多，请稍后再试',503);
    const state: Entry = {controller:null!,tail:Promise.resolve(),jobs:new Set(),pending:0,lastUsed:Date.now()};
    const ctx: RoomContext = {
      storage: {
        async get<T>(key: string) { if(key!=='room')throw new Error('Unsupported storage key');return database.read(id) as T|undefined; },
        async put(key: string,value: unknown) { if(key!=='room')throw new Error('Unsupported storage key');database.write(id,value as StoredRoom); },
        async setAlarm(time: number) { database.setAlarm(id,time); },
        async deleteAlarm() { database.setAlarm(id,null); },
      },
      blockConcurrencyWhile<T>(fn: ()=>Promise<T>) {
        state.pending++;
        const task = state.tail.then(fn);
        state.tail = task.catch(()=>{}).finally(()=>{state.pending--;});
        return task;
      },
      waitUntil(task: Promise<unknown>) {
        const guarded=task.catch(()=>console.error('Room background task failed')).finally(()=>state.jobs.delete(guarded));
        state.jobs.add(guarded);
      },
    };
    state.controller=new RoomController(ctx,env,{fetchImpl});entries.set(id,state);return state;
  }
  function evict(force=false) {
    for(const [id,e] of entries)if(!e.pending&&!e.jobs.size&&!e.controller.watchHub.size&&(force||entries.size>=400||Date.now()-e.lastUsed>60000))entries.delete(id);
  }
  async function tick() {
    if(ticking||closing)return;ticking=true;
    try {
      for(const id of database.due(Date.now())) {
        if(alarmTasks.has(id))continue;
        const e=entry(id);
        const task=e.controller.alarm().catch(()=>console.error('Room alarm task failed')).finally(()=>{alarmTasks.delete(id);e.jobs.delete(task);});
        alarmTasks.set(id,task);e.jobs.add(task);
      }
      for(const id of database.purge(Date.now())) { entries.get(id)?.controller.watchHub.close();entries.delete(id); }
      evict();
    }catch(error){ console.error('Room alarm failed:',error instanceof Error?error.name:'Unknown'); }
    finally{ticking=false;}
  }
  const timer=setInterval(()=>{void tick();},alarmIntervalMs);timer.unref();
  return {
    env,
    async fetch(request: Request) {
      if(closing)return errorResponse(new RoomError('SERVER_BUSY','服务正在重启',503));
      const path=new URL(request.url).pathname;
      if(['/','/debug','/debug.js','/debug.css'].includes(path))return new Response('Not Found',{status:404});
      return app.fetch(request,env);
    },
    async close() {
      if(closing)return;closing=true;clearInterval(timer);
      for(const e of entries.values())e.controller.watchHub.close();
      while(ticking)await new Promise(resolve=>setTimeout(resolve,5));
      for(const e of entries.values()){await e.tail;await Promise.allSettled(e.jobs);await e.tail;}
      evict(true);database.close();
    },
  };
}
export type NodeRuntime = ReturnType<typeof createNodeRuntime>;
