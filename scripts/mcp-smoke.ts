import { z } from 'zod';
import type { CheckBody, LegacyData } from './check-types.ts';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export async function runMcpSmoke(endpoint: string, {onCreated}: {onCreated?:(host:LegacyData)=>Promise<void>}={}) {
  const url = new URL(endpoint);
  assert.ok(['http:', 'https:'].includes(url.protocol));
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const a = new Client({ name: 'mcdebate-smoke-A', version: '1.0.0' });
  const b = new Client({ name: 'mcdebate-smoke-B', version: '1.0.0' });
  const sessions: [Client,{room_id:string;player_token:string}][] = [];
  const call = (client: Client, name: string, args: Record<string,unknown>) => client.callTool({ name, arguments: args });
  const data = (result: Awaited<ReturnType<Client["callTool"]>> | undefined): LegacyData => {
    assert.ok(result);assert.equal(result.isError, false, '工具返回业务错误');
    const body = result.structuredContent as CheckBody;
    assert.deepEqual(JSON.parse(result.content[0].type==='text'?result.content[0].text:'null'), body);
    assert.equal(body.ok, true);
    return body.data;
  };
  const bad = async (client: Client, name: string, args: Record<string,unknown>, code?: string) => {
    const result = await call(client, name, args);
    assert.equal(result.isError, true);
    if (code) assert.equal((result.structuredContent as CheckBody).error.code, code);
  };
  try {
    await Promise.all([a.connect(new StreamableHTTPClientTransport(url)), b.connect(new StreamableHTTPClientTransport(url))]);
    const tools = z.object({tools:z.array(z.object({name:z.string()}))}).parse(await a.listTools()).tools.map(t => t.name);
    assert.deepEqual(tools, ['create_room','join_room','set_ready','start_debate','get_room_state','submit_argument','close_room','set_room_context','report_item','update_order_draft','create_battle','cancel_battle','resolve_recommendation','nominate_payer','accept_payer_role','prepare_checkout','get_checkout_package','report_checkout','cancel_checkout','simulate_checkout','query_demo_catalog']);
    const host = data(await call(a, 'create_room', { name:'A', topic:'麦乐鸡还是薯条', expected_players:2, max_turns:4 }));
    const room_id = host.room.room_id;
    const A = { room_id, player_token:host.player_token };
    sessions.push([a, A]);
    if(onCreated)await onCreated(host);
    const attempts = await Promise.all(['B','C'].map(name => call(b,'join_room',{room_id,name})));
    assert.equal(attempts.filter(r=>r.isError).length,1);
    assert.equal((attempts.find(r=>r.isError)!.structuredContent as CheckBody).error.code,'ROOM_FULL');
    const guest = data(attempts.find(r=>!r.isError));
    const B = { room_id, player_token:guest.player_token };
    assert.notEqual(host.player_id,guest.player_id);
    assert.notEqual(A.player_token,B.player_token);
    await bad(b,'get_room_state',{...B,player_token:'0'.repeat(64)},'UNAUTHORIZED');
    await bad(b,'get_room_state',{...B,is_host:true});
    await bad(a,'create_room',{name:'X',topic:'x'.repeat(201)});
    await bad(a,'start_debate',A,'ROOM_NOT_READY');
    data(await call(a,'set_ready',{...A,ready:true}));
    data(await call(b,'set_ready',{...B,ready:true}));
    await bad(b,'start_debate',B,'FORBIDDEN');
    await bad(b,'close_room',B,'FORBIDDEN');
    let state = data(await call(a,'start_debate',A));
    assert.equal(state.next_action,'submit_argument');
    const repeat = data(await call(a,'get_room_state',A));
    assert.equal(repeat.next_request.arguments.event_id,state.next_request.arguments.event_id);
    const raw = await fetch(new URL(`/rooms/${room_id}/state`,url), { headers:{ Authorization:`Bearer ${A.player_token}` } });
    assert.equal(raw.status,200);
    assert.equal((await raw.json() as CheckBody).data.room.room_id,room_id);
    const lines = ['麦乐鸡适合分享','薯条也能分享，为什么选择麦乐鸡','麦乐鸡按块数分更方便','薯条按份分也方便'];
    await bad(b,'submit_argument',{...B,turn_id:state.room.current_turn!.turn_id,event_id:'wrong',text:'错误回合'},'NOT_YOUR_TURN');
    await bad(a,'submit_argument',{...A,turn_id:'old',event_id:'old',text:'旧回合'},'STALE_TURN');
    let last;
    for (let i=0;i<4;i++) {
      const client=i%2?b:a, identity=i%2?B:A;
      state=data(await call(client,'get_room_state',identity));
      const cursor=state.room.sequence;
      assert.equal(state.next_action,'submit_argument');
      const args={...identity,...state.next_request.arguments,text:lines[i]};
      let waiting;
      if(i===0) waiting=call(b,'get_room_state',{...B,wait_ms:2000});
      const start=Date.now();
      const replies=await Promise.all([call(client,'submit_argument',args),call(client,'submit_argument',args)]);
      const elapsed=Date.now()-start;
      assert.deepEqual(replies.map(r=>data(r).replayed).sort(),[false,true]);
      if(waiting) {
        const after=data(await waiting);
        if(local) {
          assert.equal(after.room.arguments.length,1);
          assert.equal(after.room.current_turn!.player_id,guest.player_id);
          // 只有本地计时能用于判断锁阻塞；公网延迟不能据此判定实现失败。
          assert.ok(elapsed<1800,`写操作被等待阻塞或服务过慢: ${elapsed}ms`);
        }
      }
      const delta=data(await call(client,'get_room_state',{...identity,since:cursor}));
      assert.equal(delta.room.arguments.length,1);
      await bad(client,'submit_argument',{...args,text:'改变原消息'},'EVENT_CONFLICT');
      last={client,args};
    }
    assert.ok(last);assert.equal(data(await call(last.client,'submit_argument',last.args)).replayed,true);
    let finished=data(await call(a,'get_room_state',A));
    const judgeStarted=Date.now();
    while(finished.room.judgement?.status==='PENDING'&&Date.now()-judgeStarted<70000) {
      finished=data(await call(a,'get_room_state',{...A,wait_ms:2000}));
    }
    assert.notEqual(finished.room.judgement?.status,'PENDING','裁判未在预算内结束');
    assert.equal(finished.room.status,'FINISHED');
    assert.equal(finished.next_action,'stop');
    assert.deepEqual(finished.room.arguments.map(x=>x.text),lines);
    assert.equal(JSON.stringify(finished).includes(A.player_token),false);
    assert.equal(JSON.stringify(finished).includes(B.player_token),false);
    const other=data(await call(a,'create_room',{name:'Other',topic:'独立房间'}));
    const O={room_id:other.room.room_id,player_token:other.player_token};
    sessions.push([a,O]);
    await bad(a,'get_room_state',{room_id:O.room_id,player_token:A.player_token},'UNAUTHORIZED');
    data(await call(a,'close_room',O));
    data(await call(a,'close_room',A));
    assert.equal(data(await call(a,'get_room_state',A)).room.status,'CLOSED');
    console.log('PASS: MCP 握手/二十一个工具、双身份、并发加入、四条发言、重试/权限、增量、事务外等待和 HTTP 互通');
    return { room_id, watch_url:host.watch_url, judgement:finished.room.judgement, messages:4, status:'CLOSED', tools:tools.length, wait_nonblocking_checked:local };
  } finally {
    for(const [client,identity] of sessions) {
      try { await call(client,'close_room',identity); }
      catch { console.error('MCP smoke cleanup could not confirm room closure'); }
    }
    await Promise.allSettled([a.close(),b.close()]);
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2).filter(v=>v!=='--');
  if(args.length!==1) { console.error('用法：pnpm run smoke:mcp -- http://localhost:8787/mcp'); process.exitCode=1; }
  else try { await runMcpSmoke(args[0]); }
  catch(error) { console.error('FAIL:',error instanceof Error?error.message:'Unknown error'); process.exitCode=1; }
}
