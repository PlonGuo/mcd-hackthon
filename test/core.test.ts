import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, transition, tickRoom, viewRoom } from '../src/core.ts';

const NOW = 1_800_000_000_000;
const host = { room_id: 'abc123', player_id: 'host', token_hash: 'host-hash' };
const guest = { player_id: 'guest', token_hash: 'guest-hash' };
const input = { name: '房主', topic: '麦乐鸡还是薯条', expected_players: 2, max_turns: 4 };
const create = (overrides = {}) => createRoom({ ...input, ...overrides }, host, NOW);
const act = (room, action, data = {}, actor = 'host', now = NOW, identity) =>
  transition(room, action, data, actor, now, identity).room;
const join = room => act(room, 'join', { name: '玩家 B' }, null, NOW, guest);
function readyRoom() {
  let room = join(create());
  room = act(room, 'ready', { ready: true });
  return act(room, 'ready', { ready: true }, 'guest');
}
const start = () => act(readyRoom(), 'start');
const say = (room, actor, event_id, text = '我的观点') =>
  act(room, 'say', { turn_id: room.current_turn.turn_id, event_id, text }, actor);
const rejects = (fn, code) => assert.throws(fn, error => error.code === code);

test('创建和加入分配独立身份，公开快照不泄露凭证摘要', () => {
  const original = create();
  const room = join(original);
  assert.equal(original.players.length, 1);
  assert.deepEqual(room.players.map(p => p.player_id), ['host', 'guest']);
  const view = viewRoom(room, 'host', 0, NOW);
  assert.equal(view.self_player_id, 'host');
  assert.equal(view.joined_players, 2);
  assert.equal(JSON.stringify(view).includes('host-hash'), false);
  assert.equal(JSON.stringify(view).includes('token_hash'), false);
  rejects(() => viewRoom(room, 'impostor', 0, NOW), 'UNAUTHORIZED');
});

test('创建参数拒绝空值、错误类型及越界，不改变合法状态', () => {
  for (const data of [null, [], { ...input, expected_players: 1 },
    { ...input, expected_players: '2' }, { ...input, max_turns: 13 },
    { ...input, topic: ' ' }, { ...input, name: 'a'.repeat(41) }]) {
    rejects(() => createRoom(data, host, NOW), 'INVALID_ARGUMENT');
  }
  rejects(() => act(create(), 'ready', { ready: 'true' }), 'INVALID_ARGUMENT');
});

test('省略可选数值使用默认值，但显式 null 不能绕过类型校验', () => {
  assert.equal(createRoom({ name: 'A', topic: '辩题' }, host, NOW).expected_players, 2);
  rejects(() => create({ expected_players: null }), 'INVALID_ARGUMENT');
  rejects(() => create({ max_turns: null }), 'INVALID_ARGUMENT');
});

test('开局必须凑齐且全员 Ready，只有房主可以开局', () => {
  rejects(() => act(create(), 'start'), 'ROOM_NOT_READY');
  rejects(() => act(join(create()), 'start'), 'ROOM_NOT_READY');
  rejects(() => act(readyRoom(), 'start', {}, 'guest'), 'FORBIDDEN');
  const room = start();
  assert.equal(room.status, 'ACTIVE');
  assert.equal(room.current_turn.player_id, 'host');
  assert.equal(room.current_turn.deadline_at, NOW + 30_000);
});

test('取消 Ready 会退回 WAITING，离线玩家阻止开局', () => {
  assert.equal(act(readyRoom(), 'ready', { ready: false }, 'guest').status, 'WAITING');
  rejects(() => act(readyRoom(), 'start', {}, 'host', NOW + 30_001), 'PLAYER_OFFLINE');
});

test('满员、开局后加入及未认证写请求被拒绝', () => {
  rejects(() => act(join(create()), 'join', { name: 'C' }, null, NOW,
    { player_id: 'third', token_hash: 'third-hash' }), 'ROOM_FULL');
  rejects(() => act(start(), 'join', { name: 'C' }, null, NOW, guest), 'INVALID_STATE');
  rejects(() => act(join(create()), 'ready', { ready: true }, 'impostor'), 'UNAUTHORIZED');
});

test('只能当前玩家用最新 turn_id 发言，四条消息后结束', () => {
  let room = start();
  rejects(() => say(room, 'guest', 'wrong'), 'NOT_YOUR_TURN');
  rejects(() => act(room, 'say', { turn_id: 'stale', event_id: 'old', text: '观点' }), 'STALE_TURN');
  room = say(room, 'host', 'one', '麦乐鸡适合分享');
  assert.equal(room.current_turn.player_id, 'guest');
  room = say(room, 'guest', 'two', '薯条也能分享');
  room = say(room, 'host', 'three', '我回应你的观点');
  room = say(room, 'guest', 'four', '我回应你的反驳');
  assert.equal(room.status, 'FINISHED');
  assert.equal(room.current_turn, null);
  assert.deepEqual(room.arguments.map(a => a.sequence), [1, 2, 3, 4]);
  assert.equal(room.arguments[1].text, '薯条也能分享');
});

test('相同事件重试不重复发言，改变内容或冒用事件被拒绝', () => {
  const before = start();
  const data = { turn_id: before.current_turn.turn_id, event_id: 'retry', text: '观点 A' };
  const once = transition(before, 'say', data, 'host', NOW);
  const twice = transition(once.room, 'say', data, 'host', NOW + 1);
  assert.equal(twice.replayed, true);
  assert.equal(twice.room.arguments.length, 1);
  assert.equal(twice.room.current_turn.turn_id, once.room.current_turn.turn_id);
  rejects(() => transition(once.room, 'say', { ...data, text: '观点 B' }, 'host', NOW), 'EVENT_CONFLICT');
  rejects(() => transition(once.room, 'say', data, 'guest', NOW), 'EVENT_CONFLICT');
});

test('最后一条发言响应丢失后也能幂等重试', () => {
  let room = start();
  room = say(room, 'host', 'a');
  room = say(room, 'guest', 'b');
  room = say(room, 'host', 'c');
  const data = { turn_id: room.current_turn.turn_id, event_id: 'd', text: '结束' };
  room = act(room, 'say', data, 'guest');
  const retry = transition(room, 'say', data, 'guest', NOW + 1);
  assert.equal(retry.replayed, true);
  assert.equal(retry.room.arguments.length, 4);
});

test('增量读取只返回游标之后的消息，仍包含完整当前状态', () => {
  let room = start();
  room = say(room, 'host', 'a');
  const cursor = room.sequence;
  room = say(room, 'guest', 'b');
  const view = viewRoom(room, 'host', cursor, NOW);
  assert.equal(view.arguments.length, 1);
  assert.equal(view.arguments[0].player_id, 'guest');
  assert.equal(view.current_turn.player_id, 'host');
  assert.equal(viewRoom(room, 'host', view.sequence, NOW).events.length, 0);
  rejects(() => viewRoom(room, 'host', -1, NOW), 'INVALID_ARGUMENT');
});

test('回合到期暂停，不判胜负；房间到期禁止操作', () => {
  const room = start();
  assert.equal(tickRoom(room, NOW + 29_999).status, 'ACTIVE');
  const paused = tickRoom(room, NOW + 30_000);
  assert.equal(paused.status, 'PAUSED');
  assert.equal(paused.current_turn, null);
  assert.equal('winner_id' in paused, false);
  rejects(() => act(paused, 'say', { turn_id: room.current_turn.turn_id, event_id: 'late', text: '迟到' }), 'INVALID_STATE');
  const expired = tickRoom(room, NOW + 30 * 60_000);
  assert.equal(expired.status, 'EXPIRED');
  rejects(() => act(expired, 'ready', { ready: true }), 'ROOM_EXPIRED');
});

test('房主关闭房间，玩家不能越权关闭', () => {
  const room = start();
  rejects(() => act(room, 'close', {}, 'guest'), 'FORBIDDEN');
  const closed = act(room, 'close');
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.current_turn, null);
  rejects(() => act(closed, 'ready', { ready: true }), 'INVALID_STATE');
});

test('三人房间按加入顺序交替发言，不能超出预计人数', () => {
  let room = join(create({ expected_players: 3, max_turns: 6 }));
  room = act(room, 'join', { name: 'C' }, null, NOW, { player_id: 'third', token_hash: 'third-hash' });
  for (const actor of ['host', 'guest', 'third']) room = act(room, 'ready', { ready: true }, actor);
  room = act(room, 'start');
  for (const [i, actor] of ['host', 'guest', 'third', 'host', 'guest', 'third'].entries()) {
    assert.equal(room.current_turn.player_id, actor);
    room = say(room, actor, `msg-${i}`);
  }
  assert.equal(room.status, 'FINISHED');
});
