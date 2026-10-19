import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRoomRequest, handleWatchRequest, invokeRoomAction } from '../src/room-service.ts';

function fakeEnv() {
  const calls = [];
  return { calls, ROOMS: {
    idFromName: name => name,
    get: id => ({ fetch: async request => {
      calls.push({ id, request, body: request.method === 'POST' ? await request.json() : null });
      return Response.json({ ok: true, data: { room: { room_id: id } } }, { status: 200 });
    } }),
  } };
}
const room = 'a'.repeat(24), token = 'b'.repeat(64);

test('HTTP 与内部动作使用同一房间对象，凭证进入请求头不进入正文', async () => {
  const env = fakeEnv();
  const r = await invokeRoomAction(env, { action: 'say', room_id: room, player_token: token,
    input: { turn_id: 'turn-1', event_id: 'event-1', text: '观点' } });
  assert.equal(r.body.ok, true);
  const call = env.calls[0];
  assert.equal(call.id, room);
  assert.equal(call.request.headers.get('Authorization'), `Bearer ${token}`);
  assert.deepEqual(call.body, { turn_id: 'turn-1', event_id: 'event-1', text: '观点' });
  assert.equal(new URL(call.request.url).pathname, `/rooms/${room}/say`);
  await handleRoomRequest(new Request(`https://poc.test/rooms/${room}/state?since=2`), env);
  assert.equal(env.calls[1].id, room);
});

test('固定动作拒绝任意路径和非法房间，拒绝后不访问 DO', async () => {
  const env = fakeEnv();
  for (const input of [{ action: 'https://example.com' }, { action: 'state', room_id: '../other', player_token: token }]) {
    await assert.rejects(() => invokeRoomAction(env, input), e => e.code === 'INVALID_ARGUMENT');
  }
  assert.equal(env.calls.length, 0);
});

test('HTTP 非房间路由返回 null，错误方法不访问 DO，创建生成独立房间', async () => {
  const env = fakeEnv();
  assert.equal(await handleRoomRequest(new Request('https://poc.test/health'), env), null);
  const bad = await handleRoomRequest(new Request(`https://poc.test/rooms/${room}/say`), env);
  assert.equal(bad.status, 405);
  assert.equal(env.calls.length, 0);
  await invokeRoomAction(env, { action: 'create', input: { name: 'A', topic: '题目' } });
  assert.match(env.calls[0].id, /^[a-f0-9]{24}$/);
  assert.equal(new URL(env.calls[0].request.url).pathname, `/_create/${env.calls[0].id}`);
});

test('公开观战路由接受新32位和旧64位token，拒绝截断链接',async()=>{
  const env=fakeEnv();
  for(const size of [32,64]){
    const path=`/watch/${room}/${'c'.repeat(size)}/snapshot`;
    assert.equal((await handleWatchRequest(new Request('https://poc.test'+path),env))?.status,200);
  }
  assert.equal(await handleWatchRequest(new Request(`https://poc.test/watch/${room}/${'c'.repeat(48)}/snapshot`),env),null);
  assert.equal(env.calls.length,2);
});
