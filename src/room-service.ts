import type { AppEnv } from './runtime/types.ts';
import type { ApiBody } from './types.ts';
import { RoomError } from './core.ts';
import { newToken, errorResponse } from './http.ts';
import { CHECKOUT_ACTIONS } from './shopping/checkout.ts';
const ROOM_ACTIONS=['join','ready','start','state','say','close','context','item','draft','battle','cancel','recommendation',...CHECKOUT_ACTIONS];

export async function handleWatchRequest(request: Request, env: AppEnv) {
  const match=/^\/watch\/([a-f0-9]{24})\/([a-f0-9]{64})(?:\/(snapshot|events))?$/.exec(new URL(request.url).pathname);
  if(!match) return null;
  if(request.method!=='GET') return errorResponse(new RoomError('METHOD_NOT_ALLOWED','只读观战不支持此操作',405));
  return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
}

export async function handleRoomRequest(request: Request, env: AppEnv) {
  const url = new URL(request.url);
  if (url.pathname === '/rooms') {
    if (request.method !== 'POST') return errorResponse(new RoomError('METHOD_NOT_ALLOWED', '请求方法不支持', 405));
    const roomId = newToken(12);
    url.pathname = `/_create/${roomId}`;
    return env.ROOMS.get(env.ROOMS.idFromName(roomId)).fetch(new Request(url, request));
  }
  const match = /^\/rooms\/([a-f0-9]{24})\/([a-z-]+)$/.exec(url.pathname);
  if (!match||!ROOM_ACTIONS.includes(match[2])) return null;
  if (request.method !== (match[2] === 'state' ? 'GET' : 'POST')) {
    return errorResponse(new RoomError('METHOD_NOT_ALLOWED', '请求方法不支持', 405));
  }
  return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
}

export async function invokeRoomAction(env: AppEnv, { action, room_id, player_token, input = {}, since = 0 }: {action:string;room_id?:string;player_token?:string;input?:Record<string,unknown>;since?:number}) {
  if (!['create',...ROOM_ACTIONS].includes(action)) {
    throw new RoomError('INVALID_ARGUMENT', '不支持的房间动作');
  }
  if (action !== 'create' && !/^[a-f0-9]{24}$/.test(room_id ?? '')) {
    throw new RoomError('INVALID_ARGUMENT', 'room_id 须为 24 位十六进制房间号');
  }
  if (!['create', 'join'].includes(action) && !/^[a-f0-9]{64}$/.test(player_token ?? '')) {
    throw new RoomError('UNAUTHORIZED', '玩家凭证格式无效', 401, 'authenticate');
  }
  if (action === 'state' && (!Number.isInteger(since) || since < 0 || since > 9_999_999_999)) {
    throw new RoomError('INVALID_ARGUMENT', 'since 须为有效非负整数');
  }
  const path = action === 'create' ? '/rooms' : `/rooms/${room_id}/${action}`;
  const url = new URL(path, 'https://room.internal');
  if (action === 'state') url.searchParams.set('since', String(since));
  const headers = new Headers();
  if (player_token) headers.set('Authorization', `Bearer ${player_token}`);
  if (action !== 'state') headers.set('Content-Type', 'application/json');
  const response = await handleRoomRequest(new Request(url, {
    method: action === 'state' ? 'GET' : 'POST', headers,
    ...(action === 'state' ? {} : { body: JSON.stringify(input) }),
  }), env);
  if(!response)throw new RoomError('NOT_FOUND','房间动作不存在',404);
  return { status: response.status, body: await response.json() as ApiBody };
}
