import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, readBearer, hashToken, newToken, jsonResponse, errorResponse } from '../src/http.ts';
import { RoomError } from '../src/core.ts';

const post = (body, headers = { 'Content-Type': 'application/json' }) =>
  new Request('https://example.test/rooms', { method: 'POST', headers, body });
const rejects = (fn, code) => assert.rejects(fn, e => e.code === code);

test('HTTP 接收 JSON 对象，拒绝非法 JSON、数组和非 JSON 请求', async () => {
  assert.deepEqual(await readJson(post('{"ready":true}')), { ready: true });
  await rejects(() => readJson(post('{')), 'INVALID_JSON');
  await rejects(() => readJson(post('[]')), 'INVALID_ARGUMENT');
  await rejects(() => readJson(post('null')), 'INVALID_ARGUMENT');
  await rejects(() => readJson(post('{}', { 'Content-Type': 'text/plain' })), 'UNSUPPORTED_MEDIA_TYPE');
});

test('HTTP 同时限制声明的大小和实际流大小', async () => {
  await rejects(() => readJson(post('{}', { 'Content-Type': 'application/json', 'Content-Length': '20000' })), 'BODY_TOO_LARGE');
  await rejects(() => readJson(post(JSON.stringify({ text: 'x'.repeat(17_000) }))), 'BODY_TOO_LARGE');
});

test('认证必须使用 Bearer 玩家 token，凭证只存摘要', async () => {
  const token = newToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(newToken(), token);
  const request = new Request('https://example.test', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(readBearer(request), token);
  assert.throws(() => readBearer(new Request('https://example.test')), e => e.code === 'UNAUTHORIZED');
  assert.throws(() => readBearer(new Request('https://example.test', { headers: { Authorization: token } })), e => e.code === 'UNAUTHORIZED');
  assert.equal(await hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('响应禁止缓存，业务错误结构化，未知异常不暴露内部细节', async () => {
  const ok = jsonResponse({ room_id: 'example' }, 201);
  assert.equal(ok.status, 201);
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await ok.json(), { ok: true, data: { room_id: 'example' } });
  const bad = errorResponse(new RoomError('NOT_YOUR_TURN', '未轮到你', 409, 'wait_for_turn'));
  assert.equal(bad.status, 409);
  assert.deepEqual((await bad.json()).error, {
    code: 'NOT_YOUR_TURN', message: '未轮到你', expected_action: 'wait_for_turn', retryable: false,
  });
  const internal = errorResponse(new Error('secret storage implementation'));
  assert.equal(internal.status, 500);
  assert.equal((await internal.text()).includes('secret'), false);
});
