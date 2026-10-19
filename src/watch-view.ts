import { isShoppingRoom, shoppingWatchView } from './shopping/room.ts';
import type { StoredRoom } from './types.ts';
import { RoomError } from './core.ts';
import { hashToken } from './http.ts';
import {publicJudgement} from './judge-state.ts';

export function buildWatchUrl(origin: string, roomId: string, token: string) {
  let url;
  try { url=new URL(origin); } catch { /* 配置错误不能泄露输入 */ }
  if (!url || !['http:','https:'].includes(url.protocol) || url.hostname==='room.internal' ||
      url.username || url.password || url.pathname!=='/' || url.search || url.hash ||
      !/^[a-f0-9]{24}$/.test(roomId) || !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(token)) {
    throw new RoomError('WATCH_NOT_CONFIGURED','观战入口配置无效',503,'contact_host');
  }
  return `${url.origin}/watch/${roomId}/${token}`;
}

export async function authorizeWatch(room: StoredRoom | undefined, token: string, now: number) {
  if (!room || !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(token) || !room._watch_token_hash ||
      await hashToken(token)!==room._watch_token_hash) {
    throw new RoomError('WATCH_UNAUTHORIZED','观战链接无效',403,'check_watch_url');
  }
  if(now>=room.expires_at || room.status==='EXPIRED')
    throw new RoomError('ROOM_EXPIRED','观战链接已过期',410,'create_room');
}

export function buildWatchView(room: StoredRoom) {
  if(isShoppingRoom(room))return shoppingWatchView(room);
  return {
    room_id:room.room_id,topic:room.topic,status:room.status,sequence:room.sequence,
    turn_index:room.turn_index,max_turns:room.max_turns,current_player_id:room.current_turn?.player_id??null,
    players:room.players.map(p=>({player_id:p.player_id,name:p.name,agent_label:p.agent_label??''})),
    arguments:room.arguments.map(a=>({sequence:a.sequence,player_id:a.player_id,text:a.text,created_at:a.created_at})),
    ...(room.judgement?{judgement:publicJudgement(room)}:{}),
  };
}
