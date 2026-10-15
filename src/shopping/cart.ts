import { schemas, parse } from './schemas.ts';
import { fail, fresh, getItem, host, receipt, replay } from './common.ts';
import type { ShoppingRoom, Item } from './types.ts';
export function checkDraftVersion(room: ShoppingRoom, expected: number) { if(room.draft.version!==expected)fail('DRAFT_CONFLICT','清单已变化，请读取最新清单并确认修改'); }
function sameOffer(a:Item,b:Item) {return a.item_id===b.item_id&&a.meal_code===b.meal_code&&a.store_code===b.store_code&&a.name===b.name&&a.spec===b.spec&&a.unit_price_cents===b.unit_price_cents&&a.source===b.source;}
export function addLine(room: ShoppingRoom, item: Item, owner: string | null, quantity: number) {
  const line=room.draft.lines.find(l=>l.item.item_id===item.item_id&&l.owner_player_id===owner);
  if(line){
    if(!sameOffer(line.item,item))fail('PRICE_CHANGED','已有行参考价或规格变化，请明确移除旧行后重新添加');
    if(line.quantity+quantity>20)fail('QUANTITY_LIMIT','每行最多20份');line.item=structuredClone(item);line.quantity+=quantity;
  } else {if(room.draft.lines.length>=50)fail('DRAFT_LIMIT','每份清单最多50行');room.draft.lines.push({line_id:crypto.randomUUID(),owner_player_id:owner,item:structuredClone(item),quantity});}
}
export function updateTotal(room: ShoppingRoom) { room.draft.version++;room.draft.total_cents=room.draft.lines.reduce((sum,l)=>sum+l.item.unit_price_cents*l.quantity,0); }
export function editDraft(room: ShoppingRoom, raw: unknown, actor: string, now: number) {
  const input=parse(schemas.draft,raw);if(replay(room,'draft',input,actor))return true;checkDraftVersion(room,input.expected_draft_version);
  if(input.operation==='add'){
    if(!input.item_id||!input.owner||!input.quantity||input.line_id)fail('INVALID_ARGUMENT','add须item_id、owner和quantity，必须省略line_id',400);
    if(input.owner==='shared')host(room,actor);const item=getItem(room,input.item_id);fresh(item,now);
    addLine(room,item,input.owner==='shared'?null:actor,input.quantity);
  } else {
    if(!input.line_id||input.item_id||input.owner||(input.operation==='remove'&&input.quantity!==undefined))fail('INVALID_ARGUMENT','修改须指定现有行，不接受餐品或归属覆盖',400);
    const line=room.draft.lines.find(l=>l.line_id===input.line_id);if(!line)fail('LINE_NOT_FOUND','清单行不存在',404);
    if(line.owner_player_id===null)host(room,actor);else if(line.owner_player_id!==actor)fail('FORBIDDEN','只能修改自己的个人项目',403);
    if(input.operation==='remove')room.draft.lines=room.draft.lines.filter(l=>l!==line);
    else {if(!input.quantity)fail('INVALID_ARGUMENT','请指定数量',400);const current=getItem(room,line.item.item_id);fresh(current,now);if(!sameOffer(line.item,current))fail('PRICE_CHANGED','参考价或规格变化，请展示变化后移除旧行并重新添加');line.item=structuredClone(current);line.quantity=input.quantity;}
  }
  updateTotal(room);receipt(room,'draft',input,actor);return false;
}
export function decideRecommendation(room: ShoppingRoom, raw: unknown, actor: string, now: number) {
  const input=parse(schemas.recommendation,raw);if(replay(room,'recommendation',input,actor))return true;host(room,actor);checkDraftVersion(room,input.expected_draft_version);
  const rec=room.battles.find(b=>b.battle_id===input.battle_id)?.recommendation;
  if(!rec||rec.recommendation_id!==input.recommendation_id)fail('RECOMMENDATION_NOT_FOUND','建议不存在',404);
  if(rec.status!=='PENDING')fail('RECOMMENDATION_RESOLVED','此建议已经处理');
  if(input.decision==='apply'){
    if(!input.quantity)fail('INVALID_ARGUMENT','采纳前请确认数量',400);
    const item=getItem(room,rec.item.item_id);fresh(item,now);
    // 历史建议的价格不可悄悄替换；刷新有变化时，由用户显式添加当前餐品。
    if(!sameOffer(item,rec.item))fail('PRICE_CHANGED','历史建议资料已刷新，请展示变化后直接添加当前餐品');
    addLine(room,item,null,input.quantity);updateTotal(room);rec.status='APPLIED';
  } else {if(input.quantity!==undefined)fail('INVALID_ARGUMENT','忽略建议不接受数量',400);rec.status='DISMISSED';}
  receipt(room,'recommendation',input,actor);return false;
}
