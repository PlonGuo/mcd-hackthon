import type { LegacyRoom } from './types.ts';
import type { Identity } from './shopping/types.ts';
import {reserveJudge,tickJudge,publicJudgement} from './judge-state.ts';
export const TURN_MS = 30_000;
export const ROOM_MS = 30 * 60_000;
export const ONLINE_MS = 30_000;

export class RoomError extends Error {
  code: string; status: number; expected_action: string; retryable: boolean;
  constructor(code: string, message: string, status = 400, expected_action = 'correct_request', retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.expected_action = expected_action;
    this.retryable = retryable;
  }
}

function reject(code: string, message: string, status?: number, action?: string, retryable?: boolean): never {
  throw new RoomError(code, message, status, action, retryable);
}

export function objectInput(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reject('INVALID_ARGUMENT', '参数必须是 JSON 对象');
  }
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    reject('INVALID_ARGUMENT', '包含不支持的参数');
  }
}

function textInput(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max) {
    reject('INVALID_ARGUMENT', `${label}须为 1–${max} 字的文本`);
  }
  return value.trim();
}

function integerInput(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    reject('INVALID_ARGUMENT', `${label}须为 ${min}–${max} 的整数`);
  }
  return value;
}

function player(input: Record<string, unknown>, identity: Identity, now: number) {
  return {
    player_id: identity.player_id,
    token_hash: identity.token_hash,
    name: textInput(input.name, '玩家名称', 40),
    agent_label: input.agent_label === undefined ? '' : textInput(input.agent_label, 'Agent 名称', 40),
    ready: false,
    last_seen_at: now,
  };
}

function event(room: LegacyRoom, type: string, now: number, player_id: string | null = null) {
  room.sequence += 1;
  room.events.push({ sequence: room.sequence, type, player_id, created_at: now });
}

export function createRoom(input: unknown, identity: Identity & {room_id:string}, now: number, {judgeEnabled=false,turnMs=TURN_MS}={}) {
  objectInput(input, ['name', 'agent_label', 'topic', 'expected_players', 'max_turns']);
  const room: LegacyRoom = {
    room_id: identity.room_id,
    host_player_id: identity.player_id,
    topic: textInput(input.topic, '辩题', 200),
    expected_players: integerInput(input.expected_players === undefined ? 2 : input.expected_players, '预计人数', 2, 4),
    max_turns: integerInput(input.max_turns === undefined ? 4 : input.max_turns, '总发言次数', 2, 12),
    status: 'WAITING',
    players: [player(input, identity, now)],
    arguments: [],
    events: [],
    sequence: 0,
    turn_index: 0,
    current_turn: null,
    created_at: now,
    expires_at: now + ROOM_MS,
  };
  if(judgeEnabled && room.expected_players===2 && room.max_turns===4){
    room._turn_ms=integerInput(turnMs,'服务端回合超时',30000,600000);
    room.judgement={status:'NOT_STARTED'};
  }
  event(room, 'ROOM_CREATED', now, identity.player_id);
  return room;
}

export function tickRoom(original: LegacyRoom, now: number) {
  const room = structuredClone(original);
  if (room.status !== 'EXPIRED' && now >= room.expires_at) {
    room.status = 'EXPIRED';
    room.current_turn = null;
    event(room, 'ROOM_EXPIRED', now);
  } else if (room.status === 'ACTIVE' && now >= room.current_turn!.deadline_at) {
    room.status = 'PAUSED';
    room.current_turn = null;
    event(room, 'TURN_TIMEOUT', now);
  }
  return tickJudge(room,now);
}

function requirePlayer(room: LegacyRoom, id: string | null) {
  const actor = room.players.find(p => p.player_id === id);
  if (!actor) reject('UNAUTHORIZED', '玩家凭证无效', 401, 'authenticate');
  return actor;
}

function requireHost(room: LegacyRoom, actorId: string | null) {
  if (actorId !== room.host_player_id) reject('FORBIDDEN', '只有房主可以执行此操作', 403, 'ask_host');
}

function requireLobby(room: LegacyRoom) {
  if (!['WAITING', 'READY'].includes(room.status)) {
    reject('INVALID_STATE', '当前房间不能加入或更改 Ready', 409, 'get_room_state');
  }
}

function setTurn(room: LegacyRoom, now: number) {
  room.current_turn = {
    turn_id: `${room.room_id}:${room.turn_index + 1}`,
    player_id: room.players[room.turn_index % room.players.length].player_id,
    deadline_at: now + (room._turn_ms??TURN_MS),
  };
}

export function transition(original: LegacyRoom, action: string, input: unknown, actorId: string | null, now: number, identity?: Identity) {
  const room = tickRoom(original, now);
  if (room.status === 'EXPIRED') reject('ROOM_EXPIRED', '房间已过期', 410, 'create_room');
  const actor = action === 'join' ? null : requirePlayer(room, actorId);
  if (actor) actor.last_seen_at = now;

  switch (action) {
    case 'join': {
      objectInput(input, ['name', 'agent_label']);
      requireLobby(room);
      if (room.players.length >= room.expected_players) reject('ROOM_FULL', '房间人数已满', 409, 'create_room');
      if (!identity) reject('INVALID_ARGUMENT', '缺少玩家身份');
      if (room.players.some(p => p.player_id === identity.player_id || p.token_hash === identity.token_hash)) {
        reject('IDENTITY_CONFLICT', '玩家身份重复', 409);
      }
      room.players.push(player(input, identity, now));
      event(room, 'PLAYER_JOINED', now, identity.player_id);
      break;
    }
    case 'ready': {
      objectInput(input, ['ready']);
      requireLobby(room);
      if (typeof input.ready !== 'boolean') reject('INVALID_ARGUMENT', 'ready 须为布尔值');
      if (actor!.ready !== input.ready) {
        actor!.ready = input.ready;
        event(room, 'READY_CHANGED', now, actorId);
      }
      room.status = room.players.length === room.expected_players && room.players.every(p => p.ready)
        ? 'READY' : 'WAITING';
      break;
    }
    case 'start': {
      objectInput(input, []);
      requireHost(room, actorId);
      if (room.status !== 'READY') reject('ROOM_NOT_READY', '人数未凑齐、尚未全员 Ready，或已经开局', 409, 'get_room_state');
      if (room.players.some(p => now - p.last_seen_at > ONLINE_MS)) {
        reject('PLAYER_OFFLINE', '有玩家近期未在线，请全员刷新状态后开局', 409, 'get_room_state', true);
      }
      room.status = 'ACTIVE';
      setTurn(room, now);
      event(room, 'DEBATE_STARTED', now, actorId);
      break;
    }
    case 'say': {
      objectInput(input, ['turn_id', 'event_id', 'text']);
      const text = textInput(input.text, '发言', 200);
      if (typeof input.event_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(input.event_id)) {
        reject('INVALID_ARGUMENT', 'event_id 须为 1–80 位字母、数字、下划线或连字符');
      }
      if (typeof input.turn_id !== 'string' || !input.turn_id || input.turn_id.length > 100) {
        reject('INVALID_ARGUMENT', 'turn_id 须为有效回合标识');
      }
      const previous = room.arguments.find(a => a.event_id === input.event_id);
      if (previous) {
        if (previous.player_id !== actorId || previous.turn_id !== input.turn_id || previous.text !== text) {
          reject('EVENT_CONFLICT', 'event_id 已用于不同内容或玩家', 409, 'get_room_state');
        }
        return { room, replayed: true };
      }
      if (room.status !== 'ACTIVE') reject('INVALID_STATE', '当前房间不能发言', 409, 'get_room_state');
      if (room.current_turn!.player_id !== actorId) reject('NOT_YOUR_TURN', '当前不是你的发言回合', 409, 'wait_for_turn');
      if (room.current_turn!.turn_id !== input.turn_id) reject('STALE_TURN', '回合已改变，请重新读取状态', 409, 'get_room_state');
      event(room, 'ARGUMENT_SUBMITTED', now, actorId);
      room.arguments.push({
        sequence: room.turn_index + 1, event_sequence: room.sequence,
        turn_id: input.turn_id, event_id: input.event_id,
        player_id: actorId, text, created_at: now,
      });
      room.turn_index += 1;
      if (room.turn_index >= room.max_turns) {
        room.status = 'FINISHED';
        room.current_turn = null;
        event(room, 'DEBATE_FINISHED', now);
        reserveJudge(room,now);
      } else setTurn(room, now);
      return { room, replayed: false };
    }
    case 'state':
      objectInput(input, []);
      break;
    case 'close':
      objectInput(input, []);
      requireHost(room, actorId);
      if (room.status !== 'CLOSED') {
        room.status = 'CLOSED';
        room.current_turn = null;
        event(room, 'ROOM_CLOSED', now, actorId);
        tickJudge(room,now);
      }
      break;
    default:
      reject('UNKNOWN_ACTION', '不支持的操作', 404);
  }
  return { room };
}

export function viewRoom(room: LegacyRoom, actorId: string, since = 0, now = Date.now()) {
  requirePlayer(room, actorId);
  integerInput(since, 'since', 0, room.sequence);
  return {
    room_id: room.room_id, host_player_id: room.host_player_id, self_player_id: actorId,
    topic: room.topic, expected_players: room.expected_players, joined_players: room.players.length,
    max_turns: room.max_turns, status: room.status, sequence: room.sequence,
    turn_index: room.turn_index, current_turn: structuredClone(room.current_turn),
    created_at: room.created_at, expires_at: room.expires_at, server_time: now,
    ...(room.judgement?{judgement:publicJudgement(room)}:{}),
    players: room.players.map(({ token_hash, ...p }) => ({ ...p, online: now - p.last_seen_at <= ONLINE_MS })),
    arguments: room.arguments.filter(a => a.event_sequence > since).map(({ event_id, ...a }) => ({ ...a })),
    events: room.events.filter(e => e.sequence > since).map(e => ({ ...e })),
  };
}
