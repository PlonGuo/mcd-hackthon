import { createHash } from 'node:crypto';
import type { Client } from '@modelcontextprotocol/client';
import { z } from 'zod';
import type { RoomView } from '../../src/types.ts';
import type { CheckoutPackage } from '../../src/shopping/types.ts';
import { callOfficialReadOnly, priceInput, normalizeQuote } from './mcd-readonly.ts';
import { FileOrderJournal, type OrderRecord } from './order-journal.ts';

type Room=Extract<RoomView,{mode:'shopping'}>;
type Report={checkout_id:string;expected_checkout_version:number;outcome:string;event_id:string;quote_id?:string;expected_total_cents?:number;take_way_code?:string};
export interface OrderRoomPort {state():Promise<Room>;report(input:Report):Promise<{room:Room;replayed?:boolean}>}
export interface OrderPlan {
  plan_id:string;room_id:string;checkout_id:string;checkout_version:number;payer_player_id:string;draft_version:number;quote_id:string;account_hash:string;expires_at:number;total_cents:number;
  take_way:{code:string;title:string};request:ReturnType<typeof priceInput>&{takeWayCode:string};
  store:{name:string;address:string};products:{code:string;name:string;quantity:number}[];
}
export interface OrderApproval {plan_id:string;total_cents:number;take_way_code:string}
interface Dependencies {official:Pick<Client,'callTool'>;room:OrderRoomPort;journal:FileOrderJournal;account_hash:string;now?:()=>number}
export const accountHash=(token:string)=>createHash('sha256').update(token.trim().replace(/^Bearer\s+/i,'')).digest('hex');
function digest(value:Omit<OrderPlan,'plan_id'>){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function validatePlan(plan:OrderPlan,account:string){const {plan_id,...content}=plan;if(digest(content)!==plan_id||plan.account_hash!==account)throw new Error('ORDER_PLAN_CHANGED_OR_ACCOUNT_MISMATCH');}
function checkRoom(plan:OrderPlan,room:Room){
  const c=room.checkout;
  if(room.status!=='OPEN'||room.data_source!=='AGENT_REPORTED'||room.room_id!==plan.room_id||!c||c.checkout_id!==plan.checkout_id||c.status!=='QUOTED'||c.version!==plan.checkout_version||room.self_player_id!==plan.payer_player_id||c.payer_player_id!==plan.payer_player_id||c.draft_version!==plan.draft_version)throw new Error('ORDER_ROOM_CHANGED');
  const quote=room.checkout_details?.quote;
  if(quote?.quote_id!==plan.quote_id||quote.total_cents!==plan.total_cents||quote.expires_at!==plan.expires_at||!quote.take_way_options.some(t=>t.code===plan.take_way.code&&t.title===plan.take_way.title))throw new Error('ORDER_QUOTE_CHANGED');
  const current=priceInput({source:room.data_source,context:room.context,draft:room.draft});const {takeWayCode,...request}=plan.request;
  if(JSON.stringify(current)!==JSON.stringify(request))throw new Error('ORDER_DRAFT_CHANGED');
}
export function buildOrderPlan(packet:CheckoutPackage,room:Room,takeWayCode:string,account_hash:string,now=Date.now()):OrderPlan{
  const request=priceInput(packet),c=room.checkout,q=packet.quote;
  if(!c||!q||packet.source!=='AGENT_REPORTED'||c.checkout_id!==packet.checkout_id||q.source!=='AGENT_REPORTED'||now>=q.expires_at)throw new Error('ORDER_QUOTE_REQUIRED');
  const take_way=q.take_way_options.find(t=>t.code===takeWayCode);if(!take_way)throw new Error('ORDER_TAKE_WAY_REQUIRED');
  z.string().regex(/^[a-f0-9]{64}$/).parse(account_hash);
  const content={room_id:room.room_id,checkout_id:packet.checkout_id,checkout_version:c.version,payer_player_id:c.payer_player_id,draft_version:packet.draft_version,quote_id:q.quote_id,account_hash,expires_at:q.expires_at,total_cents:q.total_cents,
    take_way:structuredClone(take_way),request:{...request,takeWayCode},store:{name:packet.context.name,address:packet.context.address},products:request.items.map(i=>({code:i.productCode,name:packet.draft.lines.find(l=>l.item.meal_code===i.productCode)!.item.name,quantity:i.quantity}))};
  const plan={plan_id:digest(content),...content};checkRoom(plan,room);return plan;
}
async function reply(client:Pick<Client,'callTool'>,name:'create-order'|'query-order'|'order-list',input:Record<string,unknown>){
  // 此模块与只读适配器分离，无支付、取消或自动重试分支。
  const result=await client.callTool({name,arguments:input},{timeout:15000});
  if(result.isError)throw new Error('ORDER_OFFICIAL_ERROR');
  const texts=result.content.filter(c=>c.type==='text');
  const raw=result.structuredContent??(texts.length===1?JSON.parse(texts[0].text):null);
  if(JSON.stringify(raw).length>1048576)throw new Error('ORDER_REPLY_TOO_LARGE');
  const body=z.object({success:z.literal(true),code:z.literal(200),data:z.unknown()}).parse(raw);return body.data;
}
function paymentUrl(raw:unknown){
  if(typeof raw!=='string'||raw.length>4096)return undefined;
  try{const url=new URL(raw);if(url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='mcd.cn'||url.hostname.endsWith('.mcd.cn')))return raw;}catch{/* 不跟随或执行上游URL */}
  return undefined;
}
async function reportRecord(plan:OrderPlan,record:OrderRecord,room:OrderRoomPort,expected:number){
  const desired=record.state;if(!['UNKNOWN','ORDER_CREATED','PAID','ORDER_CANCELLED'].includes(desired))return false;
  try{
    await room.report({checkout_id:plan.checkout_id,expected_checkout_version:expected,outcome:desired,event_id:`order_${desired}_${record.revision}_${plan.checkout_id}`});return true;
  }catch{return false;}
}
export async function submitOrder(plan:OrderPlan,approval:OrderApproval,deps:Dependencies):Promise<OrderRecord>{
  const {official,room,journal}=deps,now=deps.now??Date.now;validatePlan(plan,deps.account_hash);
  if(approval.plan_id!==plan.plan_id||approval.total_cents!==plan.total_cents||approval.take_way_code!==plan.take_way.code)throw new Error('ORDER_CONFIRMATION_REQUIRED');
  if(now()>=plan.expires_at)throw new Error('ORDER_QUOTE_EXPIRED');
  if(await journal.read(plan))throw new Error('ORDER_ALREADY_ATTEMPTED_QUERY_INSTEAD');
  checkRoom(plan,await room.state());
  const {takeWayCode,...priceRequest}=plan.request;
  const fresh=normalizeQuote(await callOfficialReadOnly(official,'calculate-price',priceRequest),priceRequest);
  if(fresh.total_cents!==plan.total_cents||!fresh.take_way_options.some(t=>t.code===plan.take_way.code&&t.title===plan.take_way.title))throw new Error('ORDER_PRICE_CHANGED_RECONFIRM');
  if(now()>=plan.expires_at)throw new Error('ORDER_QUOTE_EXPIRED');
  if(!await journal.claim(plan,{plan_id:plan.plan_id,account_hash:plan.account_hash,state:'CLAIMED',owner_pid:process.pid,dispatch_at:null,room_report_pending:true}))throw new Error('ORDER_ALREADY_ATTEMPTED_QUERY_INSTEAD');
  let record=(await journal.read(plan))!,expected=plan.checkout_version+1;
  try{
    const submitted=await room.report({checkout_id:plan.checkout_id,expected_checkout_version:plan.checkout_version,outcome:'SUBMITTING',quote_id:plan.quote_id,expected_total_cents:plan.total_cents,take_way_code:plan.take_way.code,event_id:`order_submit_${plan.checkout_id}`});
    if(submitted.replayed||submitted.room.checkout?.status!=='SUBMITTING')throw new Error('ORDER_SUBMISSION_ACK_UNKNOWN');
    expected=submitted.room.checkout.version;
    record=await journal.save(plan,record.revision,{state:'DISPATCHING',dispatch_at:now()});
  }catch{
    record=await journal.save(plan,record.revision,{state:'UNKNOWN'});
    const reported=await reportRecord(plan,record,room,expected);return journal.save(plan,record.revision,{room_report_pending:!reported});
  }
  let order: {order_id:string;payment_url?:string}|undefined;
  try{
    const data=z.object({orderId:z.string().min(1).max(200),payH5Url:z.string().optional(),orderDetail:z.object({orderId:z.string().optional()}).optional()}).parse(await reply(official,'create-order',plan.request));
    if(data.orderDetail?.orderId&&data.orderDetail.orderId!==data.orderId)throw new Error('ORDER_ID_MISMATCH');
    order={order_id:data.orderId,payment_url:paymentUrl(data.payH5Url)};
  }catch{/* 写请求任何失败均保持未知；不能根据错误或空历史自动重下。 */}
  record=await journal.save(plan,record.revision,order?{state:'ORDER_CREATED',...order}:{state:'UNKNOWN'});
  const reported=await reportRecord(plan,record,room,expected);return journal.save(plan,record.revision,{room_report_pending:!reported});
}
export async function queryOrder(plan:OrderPlan,deps:Dependencies):Promise<OrderRecord&{candidate_count?:number}>{
  validatePlan(plan,deps.account_hash);const {official,room,journal}=deps;
  let record=await journal.read(plan);if(!record||record.plan_id!==plan.plan_id||record.account_hash!==deps.account_hash)throw new Error('ORDER_ATTEMPT_NOT_FOUND');
  if(['CLAIMED','DISPATCHING'].includes(record.state)){
    let alive=true;try{process.kill(record.owner_pid,0);}catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='ESRCH')alive=false;}
    if(alive)throw new Error('ORDER_SUBMIT_IN_PROGRESS');
  }
  // 在查询前记录房间版本；迟到查询不能换上新版本冒充当前结果。
  const before=await room.state();if(before.checkout?.checkout_id!==plan.checkout_id||before.self_player_id!==plan.payer_player_id)throw new Error('ORDER_ROOM_CHANGED');
  if(!record.order_id){
    const data=z.object({list:z.array(z.object({storeCode:z.string(),orderId:z.string()})).max(500)}).parse(await reply(official,'order-list',{}));
    record=await journal.save(plan,record.revision,{state:'UNKNOWN'});
    const reported=await reportRecord(plan,record,room,before.checkout.version);record=await journal.save(plan,record.revision,{room_report_pending:!reported});
    return {...record,candidate_count:data.list.filter(o=>o.storeCode===plan.request.storeCode).length};
  }
  const data=z.object({orderId:z.string(),orderStatus:z.union([z.string(),z.int()]),pickupCode:z.string().max(200).optional(),lockerCode:z.string().max(200).optional(),lockerQrCode:z.string().max(4096).optional()}).parse(await reply(official,'query-order',{orderId:record.order_id}));
  if(data.orderId!==record.order_id)throw new Error('ORDER_ID_MISMATCH');
  const status=String(data.orderStatus),state=['2','4','6','8','10','已支付','已完成','已评价'].includes(status)?'PAID':['7','已取消'].includes(status)?'ORDER_CANCELLED':['1','待支付'].includes(status)?'ORDER_CREATED':null;
  if(!state)throw new Error('ORDER_STATUS_UNRECOGNIZED');
  if((record.state==='PAID'&&state==='ORDER_CREATED')||(record.state==='ORDER_CANCELLED'&&state!==record.state))throw new Error('ORDER_STALE_QUERY');
  record=await journal.save(plan,record.revision,{state,order_status:status,...(data.pickupCode?{pickup_code:data.pickupCode}:{}),...(data.lockerCode?{locker_code:data.lockerCode}:{}),...(data.lockerQrCode?{locker_qr_code:data.lockerQrCode}:{})});
  let expected=before.checkout.version;
  // 先恢复已创建，再推进支付/取消状态；不把PAID从SUBMITTING直接写入。
  let reported=true;
  if(['SUBMITTING','UNKNOWN'].includes(before.checkout.status)&&state!=='ORDER_CREATED'){
    const step=await room.report({checkout_id:plan.checkout_id,expected_checkout_version:expected,outcome:'ORDER_CREATED',event_id:`order_recover_${record.revision}_${plan.checkout_id}`}).catch(()=>null);
    if(step)expected=step.room.checkout!.version;else reported=false;
  }
  if(reported&&before.checkout.status!==state)reported=await reportRecord(plan,record,room,expected);
  return journal.save(plan,record.revision,{room_report_pending:!reported});
}
