import { RoomError } from '../core.ts';
import type { ShoppingRoom, Item, Player } from './types.ts';
export function fail(code: string, message: string, status=409): never { throw new RoomError(code,message,status,'get_room_state'); }
export function emit(room: ShoppingRoom, type: string, now: number, actor: string | null=null) { room.events.push({sequence:++room.sequence,type,player_id:actor,created_at:now}); }
export function player(room: ShoppingRoom, actor: string | null): Player { const p=room.players.find(p=>p.player_id===actor);if(!p)fail('UNAUTHORIZED','玩家凭证无效',401);return p; }
export function host(room: ShoppingRoom, actor: string) { if(actor!==room.host_player_id)fail('FORBIDDEN','只有房主可执行此操作',403); }
export function storeRequired(room: ShoppingRoom) { if(!room.context)fail('STORE_REQUIRED','请先由用户确认并锁定门店'); }
export function fresh(item: Item, now: number) { if(now-item.queried_at>600000 || now-item.received_at>600000 || item.queried_at>now+120000)fail('QUOTE_EXPIRED','参考报价已过期，请重新查询同一餐品'); }
export function getItem(room: ShoppingRoom, itemId: string | undefined) { const item=room.items.find(i=>i.item_id===itemId);if(!item)fail('ITEM_NOT_FOUND','餐品资料不存在',404);return item; }
function canonical(value: unknown): string { if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value); }
export function replay(room: ShoppingRoom, action: string, input: {event_id:string}, actor: string): boolean {
  const previous=room._receipts[input.event_id];if(!previous)return false;
  if(previous.actor!==actor||previous.action!==action||previous.payload!==canonical(input))fail('EVENT_CONFLICT','事件编号已用于其他操作或内容');return true;
}
export function receipt(room: ShoppingRoom, action: string, input: {event_id:string}, actor: string) {
  if(Object.keys(room._receipts).length>=1000)fail('ROOM_LIMIT','本次会话操作过多，请新建房间');
  room._receipts[input.event_id]={actor,action,payload:canonical(input)};
}
