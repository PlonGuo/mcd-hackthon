import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRoomTool, handleMcpRequest, TOOL_NAMES } from '../src/mcp.ts';

const roomId = 'a'.repeat(24), token = 'b'.repeat(64);
function fakeEnv(body = { ok: true, data: { room: { room_id: roomId, self_player_id: 'A', host_player_id: 'A',
  status: 'WAITING', players: [{ player_id: 'A', ready: false }], expected_players: 2, joined_players: 1,
  current_turn: null, turn_index: 0 } } }) {
  const calls = [];
  return { calls, ROOMS: { idFromName: n => n, get: () => ({ fetch: async r => {
    calls.push(r);
    return Response.json(body, { status: body.ok ? 200 : 403 });
  } }) } };
}
test('二十一个 MCP 工具映射到同一个房间入口，成功双格式一致', async () => {
  assert.deepEqual(TOOL_NAMES, ['create_room','join_room','set_ready','start_debate','get_room_state','submit_argument','close_room','set_room_context','report_item','update_order_draft','create_battle','cancel_battle','resolve_recommendation','nominate_payer','accept_payer_role','prepare_checkout','get_checkout_package','report_checkout','cancel_checkout','simulate_checkout','query_demo_catalog']);
  const env = fakeEnv();
  const result = await executeRoomTool(env, 'set_ready', { room_id: roomId, player_token: token, ready: true });
  assert.equal(result.isError, false);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.deepEqual(await env.calls[0].json(), { ready: true });
  assert.equal(env.calls[0].headers.get('Authorization'), `Bearer ${token}`);
  assert.equal(JSON.stringify(result).includes(token), false);
});
test('房间业务错误 isError=true，未知异常脱敏，创建失败不建议自动重试', async () => {
  const error = { ok: false, error: { code: 'FORBIDDEN', message: '仅房主', expected_action: 'ask_host', retryable: false } };
  const r = await executeRoomTool(fakeEnv(error), 'close_room', { room_id: roomId, player_token: token });
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent.error.code, 'FORBIDDEN');
  const env = { ROOMS: { idFromName: n => n, get: () => ({ fetch: () => { throw new Error('secret token'); } }) } };
  const unknown = await executeRoomTool(env, 'create_room', { name: 'A', topic: '题目' });
  assert.equal(unknown.isError, true);
  assert.equal(unknown.structuredContent.error.retryable, false);
  assert.equal(unknown.structuredContent.error.expected_action, 'registration_unknown');
  assert.equal(JSON.stringify(unknown).includes('secret token'), false);
  const returned = await executeRoomTool(fakeEnv({ok:false,error:{code:'INTERNAL_ERROR',message:'内部失败',retryable:true,expected_action:'retry_later'}}),
    'create_room',{name:'A',topic:'题目'});
  assert.equal(returned.structuredContent.error.retryable,false);
  assert.equal(returned.structuredContent.error.expected_action,'registration_unknown');
});
test('损坏的 MCP JSON 返回协议错误而非房间业务响应', async () => {
  const r=await handleMcpRequest(new Request('http://localhost:8787/mcp',{method:'POST',
    headers:{'Content-Type':'application/json'},body:'{'}),fakeEnv(),{waitUntil(){}});
  const body=await r.json();
  assert.equal(body.jsonrpc,'2.0');
  assert.equal(body.error.code,-32700);
});
test('无效凭证、自报角色、越界参数在工具校验处拒绝，不触达 DO', async () => {
  const env = fakeEnv();
  for (const args of [
    { room_id: roomId, player_token: 'wrong' },
    { room_id: roomId, player_token: token, is_host: true },
    { room_id: roomId, player_token: token, wait_ms: 2001 },
    { room_id: roomId, player_token: token, wait_ms: 0.1 },
  ]) await assert.rejects(() => executeRoomTool(env, 'get_room_state', args));
  await assert.rejects(() => executeRoomTool(env,'submit_argument',{ room_id:roomId,player_token:token,turn_id:'t',event_id:'e',text:'x'.repeat(201) }));
  assert.equal(env.calls.length, 0);
});
test('MCP 拒绝超限请求和不受信任 Origin/Host', async () => {
  const env = fakeEnv(), ctx = { waitUntil() {} };
  const large = await handleMcpRequest(new Request('http://localhost:8787/mcp', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(17000) }) }), env, ctx);
  assert.equal(large.status, 413);
  const wrongOrigin = await handleMcpRequest(new Request('http://localhost:8787/mcp', { method:'POST',
    headers: { 'Content-Type':'application/json', Host:'localhost:8787', Origin:'https://evil.example' }, body:'{}' }),env,ctx);
  assert.equal(wrongOrigin.status, 403);
  assert.match((await wrongOrigin.json()).error.message,/Invalid Origin/);
  const wrongHost = await handleMcpRequest(new Request('http://evil.example/mcp', { method:'POST',
    headers: { 'Content-Type':'application/json', Host:'evil.example' }, body:'{}' }),env,ctx);
  assert.equal(wrongHost.status, 403);
  assert.match((await wrongHost.json()).error.message,/Invalid Host/);
  assert.equal(env.calls.length,0);
  const good=await handleMcpRequest(new Request('http://localhost:8787/mcp',{method:'POST',headers:{
    Host:'localhost:8787','Content-Type':'application/json',Accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',
      capabilities:{},clientInfo:{name:'valid-origin-test',version:'1.0.0'}}})}),env,ctx);
  assert.equal(good.status,200);
  const initialized=await good.text();
  assert.match(initialized,/watch_url/,'初始化指引应要求展示观战链接');
  assert.match(initialized,/PENDING/,'发言结束后仍需等待真实裁判');
});
