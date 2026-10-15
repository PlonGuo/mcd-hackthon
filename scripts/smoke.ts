import type { CheckBody, CheckResponse } from './check-types.ts';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export async function runSmoke(base: string) {
  const origin = new URL(base).origin;
  const api = async (path: string, { token, body, method = body === undefined ? 'GET' : 'POST' }: {token?:string;body?:Record<string,unknown>;method?:string} = {}) => {
    const response = await fetch(origin + path, {
      method, signal: AbortSignal.timeout(10_000),
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    return { status: response.status, ...(await response.json() as CheckBody) };
  };
  const good = (response: CheckResponse | undefined) => { assert.ok(response);assert.equal(response.ok, true, JSON.stringify(response.error)); return response.data; };
  const bad = (response: CheckResponse | undefined, status: number, code: string) => {
    assert.ok(response);
    assert.equal(response.status, status);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, code);
  };
  good(await api('/health'));
  bad(await api('/rooms', { body: { name: 'A', topic: ' ', expected_players: 2 } }), 400, 'INVALID_ARGUMENT');
  const host = good(await api('/rooms', { body: { name: 'A', topic: '麦乐鸡还是薯条', expected_players: 2, max_turns: 4 } }));
  const path = `/rooms/${host.room.room_id}`;
  const attempts = await Promise.all(['B', 'C'].map(name => api(path + '/join', { body: { name } })));
  assert.deepEqual(attempts.map(a => a.status).sort(), [201, 409]);
  const guest = good(attempts.find(a => a.ok));
  bad(attempts.find(a => !a.ok), 409, 'ROOM_FULL');
  assert.notEqual(host.player_id, guest.player_id);
  assert.notEqual(host.player_token, guest.player_token);
  const a = host.player_token, b = guest.player_token;
  const state = async (token = a, since = 0) => good(await api(path + `/state?since=${since}`, { token })).room;
  assert.equal(JSON.stringify(host.room).includes(host.player_token), false);
  assert.equal(JSON.stringify(await state()).includes('token_hash'), false);
  bad(await api(path + '/state'), 401, 'UNAUTHORIZED');
  bad(await api(path + '/ready', { token: 'f'.repeat(64), body: { ready: true } }), 401, 'UNAUTHORIZED');
  bad(await api(path + '/start', { token: a, body: {} }), 409, 'ROOM_NOT_READY');
  good(await api(path + '/ready', { token: a, body: { ready: true } }));
  good(await api(path + '/ready', { token: b, body: { ready: true } }));
  bad(await api(path + '/start', { token: b, body: {} }), 403, 'FORBIDDEN');
  let room = good(await api(path + '/start', { token: a, body: {} })).room;
  const wrong = { event_id: 'wrong', turn_id: room.current_turn!.turn_id, text: '越权发言' };
  bad(await api(path + '/say', { token: b, body: wrong }), 409, 'NOT_YOUR_TURN');
  bad(await api(path + '/say', { token: a, body: { ...wrong, turn_id: 'old' } }), 409, 'STALE_TURN');
  const lines = ['麦乐鸡适合分享', '薯条也能分享', '你的观点值得回应', '我回应刚才的反驳'];
  for (let i = 0; i < 4; i += 1) {
    const token = i % 2 ? b : a;
    const cursor = room.sequence;
    const body = { event_id: `smoke-${i}`, turn_id: room.current_turn!.turn_id, text: lines[i] };
    const replies = await Promise.all([api(path + '/say', { token, body }), api(path + '/say', { token, body })]);
    assert.equal(replies.every(r => r.ok), true);
    assert.deepEqual(replies.map(r => r.data.replayed).sort(), [false, true]);
    room = await state();
    assert.equal(room.arguments.length, i + 1);
    assert.equal((await state(a, cursor)).arguments.length, 1);
  }
  assert.equal(room.status, 'FINISHED');
  assert.deepEqual(room.arguments.map(m => m.text), lines);
  bad(await api(path + '/close', { token: b, body: {} }), 403, 'FORBIDDEN');
  const other = good(await api('/rooms', { body: { name: '另一房主', topic: '独立房间' } }));
  bad(await api(`/rooms/${other.room.room_id}/state`, { token: a }), 401, 'UNAUTHORIZED');
  good(await api(`/rooms/${other.room.room_id}/close`, { token: other.player_token, body: {} }));
  good(await api(path + '/close', { token: a, body: {} }));
  assert.equal((await state()).status, 'CLOSED');
  console.log('PASS: 两客户端 HTTP 流程、并发加入、并发幂等、权限、增量消息、完成和关闭');
  return { room_id: room.room_id, player_id: host.player_id, player_token: a };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args.length !== 1) {
    console.error('用法：pnpm run smoke -- http://localhost:8787');
    process.exitCode = 1;
  } else {
    try { await runSmoke(args[0]); }
    catch (error) { console.error('FAIL:', error instanceof Error?error.message:'Unknown error'); process.exitCode = 1; }
  }
}
