import { parse } from './schemas.ts';
import { checkoutSchemas } from './checkout-schemas.ts';
import { fail, host, player, receipt, replay, emit } from './common.ts';
import { checkDraftVersion } from './cart.ts';
import type { Checkout, CheckoutPackage, CheckoutStatus, ShoppingRoom, TakeWay } from './types.ts';

export const CHECKOUT_ACTIONS=['payer-nominate','payer-accept','checkout-prepare','checkout-package','checkout-cancel','checkout-report','checkout-simulate'];
export function checkoutLocked(room: ShoppingRoom): boolean {
  return !!room.checkout&&!['CANCELLED','NO_ORDER'].includes(room.checkout.status);
}
function current(room: ShoppingRoom, id: string): Checkout {
  if(!room.checkout||room.checkout.checkout_id!==id)fail('STALE_CHECKOUT','结账方案已变化，请读取最新状态');
  return room.checkout;
}
function payer(checkout: Checkout, actor: string) {if(checkout.payer_player_id!==actor)fail('FORBIDDEN','只有本次指定付款人可执行',403);}
function requireStatus(checkout: Checkout, statuses: CheckoutStatus[]) {
  if(!statuses.includes(checkout.status))fail('CHECKOUT_STATE','当前结账状态不允许此操作；未知结果须先查询，不能重复下单');
}
function packet(checkout: Checkout): CheckoutPackage {
  return structuredClone({checkout_id:checkout.checkout_id,draft_version:checkout.draft_version,context:checkout.context,draft:checkout.draft,source:checkout.source,quote:checkout.quote});
}
function setQuote(checkout: Checkout, total: number, now: number, expiresAt: number, takeWays: TakeWay[]) {
  requireStatus(checkout,['HANDED_OFF','QUOTED']);
  if(!takeWays.length||new Set(takeWays.map(t=>t.code)).size!==takeWays.length)fail('INVALID_ARGUMENT','最终核价须提供不重复的官方取餐方式选项',400);
  checkout.quote={quote_id:crypto.randomUUID(),total_cents:total,currency:'CNY',expires_at:Math.min(now+180000,expiresAt),source:checkout.source,take_way_options:structuredClone(takeWays)};
  checkout.take_way=null;
  checkout.status='QUOTED';
}
export function tickCheckout(room: ShoppingRoom, now: number) {
  const checkout=room.checkout;
  if(checkout?.status==='SUBMITTING'&&checkout.submission_deadline_at!==null&&now>=checkout.submission_deadline_at){
    checkout.status='UNKNOWN';checkout.submission_deadline_at=null;checkout.updated_at=now;checkout.version++;emit(room,'CHECKOUT_UNKNOWN',now);
  }
}
export function publicCheckout(room: ShoppingRoom) {
  const c=room.checkout;if(!c)return null;
  return {checkout_id:c.checkout_id,version:c.version,payer_player_id:c.payer_player_id,draft_version:c.draft_version,status:c.status,source:c.source,
    total_cents:c.quote?.total_cents??null,currency:'CNY',quote_expires_at:c.quote?.expires_at??null,updated_at:c.updated_at,reconcile_until:c.reconcile_until,
    take_way_title:c.take_way?.title??null,take_way_titles:c.quote?.take_way_options?.map(t=>t.title)??[]};
}
export function payerCheckoutDetails(room: ShoppingRoom, actor: string) {
  const c=room.checkout;return c&&c.payer_player_id===actor?{quote:structuredClone(c.quote),take_way:structuredClone(c.take_way??null)}:null;
}

export function checkoutAction(room: ShoppingRoom, action: string, raw: unknown, actor: string, now: number): {replayed:boolean;checkout_package?:CheckoutPackage} {
  if(action==='payer-nominate'){
    const input=parse(checkoutSchemas.nominate,raw);host(room,actor);
    if(replay(room,action,input,actor))return {replayed:true};
    if(checkoutLocked(room))fail('CHECKOUT_LOCKED','结账期间不能更换付款人');
    player(room,input.candidate_player_id);
    room.payer={version:(room.payer?.version??0)+1,player_id:input.candidate_player_id,accepted:false};
    receipt(room,action,input,actor);return {replayed:false};
  }
  if(action==='payer-accept'){
    const input=parse(checkoutSchemas.accept,raw);
    if(replay(room,action,input,actor))return {replayed:true};
    if(checkoutLocked(room))fail('CHECKOUT_LOCKED','结账期间不能更换付款人');
    if(!room.payer||room.payer.version!==input.candidate_version)fail('PAYER_CONFLICT','付款候选已变化，请读取最新版本');
    if(room.payer.player_id!==actor)fail('FORBIDDEN','必须由候选本人接受付款责任',403);
    room.payer.accepted=true;receipt(room,action,input,actor);return {replayed:false};
  }
  if(action==='checkout-prepare'){
    const input=parse(checkoutSchemas.prepare,raw);host(room,actor);
    if(replay(room,action,input,actor))return {replayed:true};
    if(checkoutLocked(room))fail('CHECKOUT_LOCKED','请先处理已有结账或订单，不能再次创建');
    checkDraftVersion(room,input.expected_draft_version);
    if(!room.payer?.accepted)fail('PAYER_REQUIRED','请先提名付款人，并由本人接受');
    if(room.active_battle_id)fail('BATTLE_BUSY','请先完成或取消当前对战');
    if(!room.draft.lines.length)fail('EMPTY_DRAFT','清单为空，不能结账');
    if((room._checkout_history?.length??0)>=20)fail('CHECKOUT_LIMIT','本房间结账次数已达上限，请新建房间');
    if(room.checkout)(room._checkout_history??=[]).push(structuredClone(room.checkout));
    room.checkout={checkout_id:crypto.randomUUID(),version:1,payer_player_id:room.payer.player_id,payer_version:room.payer.version,draft_version:room.draft.version,
      context:structuredClone(room.context!),draft:structuredClone(room.draft),status:'PREPARED',source:room._data_source,quote:null,created_at:now,updated_at:now,submission_deadline_at:null,reconcile_until:room.expires_at+86400000};
    receipt(room,action,input,actor);return {replayed:false};
  }
  if(action==='checkout-package'){
    const input=parse(checkoutSchemas.package,raw),c=current(room,input.checkout_id);payer(c,actor);
    const repeated=replay(room,action,input,actor);
    if(!repeated){requireStatus(c,['PREPARED','HANDED_OFF','QUOTED','SUBMITTING','UNKNOWN','ORDER_CREATED','PAID']);if(c.status==='PREPARED'){c.status='HANDED_OFF';c.updated_at=now;c.version++;}receipt(room,action,input,actor);}
    return {replayed:repeated,checkout_package:packet(c)};
  }
  if(action==='checkout-cancel'){
    const input=parse(checkoutSchemas.cancel,raw),c=current(room,input.checkout_id);
    if(actor!==room.host_player_id&&actor!==c.payer_player_id)fail('FORBIDDEN','只有房主或付款人可取消未领取方案',403);
    if(replay(room,action,input,actor))return {replayed:true};
    if(c.status!=='PREPARED')fail('CHECKOUT_IN_PROGRESS','方案已领取，须付款人核对并上报未下单；此操作不会取消官方订单');
    c.status='CANCELLED';c.updated_at=now;c.version++;receipt(room,action,input,actor);return {replayed:false};
  }
  if(action==='checkout-report'){
    const input=parse(checkoutSchemas.report,raw),c=current(room,input.checkout_id);payer(c,actor);
    if(replay(room,action,input,actor))return {replayed:true};
    if(input.expected_checkout_version!==c.version)fail('CHECKOUT_CONFLICT','结账状态已变化，丢弃旧查询结果；重新读取并核对当前订单，不能重新创建');
    // 这些标识约束的是房间交接，不证明宿主已取得真人审批或官方交易已完成。
    if(input.outcome==='QUOTED'){
      if(input.total_cents===undefined||!input.take_way_options||input.quote_id!==undefined||input.expected_total_cents!==undefined||input.take_way_code!==undefined)fail('INVALID_ARGUMENT','核价上报须total_cents和官方take_way_options',400);
    }else if(input.outcome==='SUBMITTING'){
      if(input.quote_id===undefined||input.expected_total_cents===undefined||input.total_cents!==undefined||input.take_way_options!==undefined)fail('INVALID_ARGUMENT','提交前须指定quote_id、expected_total_cents及选定的take_way_code',400);
    }else if(input.total_cents!==undefined||input.quote_id!==undefined||input.expected_total_cents!==undefined||input.take_way_options!==undefined||input.take_way_code!==undefined)fail('INVALID_ARGUMENT','此结果不接受报价或取餐方式字段',400);
    if(c.source==='TEST_FIXTURE'&&input.outcome!=='SUBMITTING')fail('TEST_REPORT_DISABLED','测试结果必须由模拟订单工具产生，不能上报成真实交易');
    if(input.outcome==='QUOTED')setQuote(c,input.total_cents!,now,room.expires_at,input.take_way_options!);
    else if(input.outcome==='SUBMITTING'){
      requireStatus(c,['QUOTED']);
      if(!c.quote||now>=c.quote.expires_at)fail('CHECKOUT_QUOTE_EXPIRED','最终报价已过期，请重新核价并确认');
      if(c.quote.quote_id!==input.quote_id||c.quote.total_cents!==input.expected_total_cents)fail('QUOTE_CHANGED','最终金额或报价已变化，请重新展示并确认');
      const takeWay=c.quote.take_way_options?.find(t=>t.code===input.take_way_code);
      if((c.source==='AGENT_REPORTED'||input.take_way_code!==undefined)&&!takeWay)fail('TAKE_WAY_REQUIRED','须由付款用户从最终核价返回的方式中选择堂食或外带');
      c.take_way=structuredClone(takeWay??c.quote.take_way_options?.[0]??{code:'TEST_TAKEAWAY',title:'外带（模拟）'});
      c.status='SUBMITTING';c.submission_deadline_at=Math.min(now+60000,room.expires_at);
    }else if(input.outcome==='UNKNOWN'){
      requireStatus(c,['SUBMITTING','UNKNOWN']);c.status='UNKNOWN';c.submission_deadline_at=null;
    }else if(input.outcome==='NO_ORDER'){
      requireStatus(c,['HANDED_OFF','QUOTED','UNKNOWN']);c.status='NO_ORDER';c.submission_deadline_at=null;
    }else if(input.outcome==='ORDER_CREATED'){
      requireStatus(c,['SUBMITTING','UNKNOWN']);c.status='ORDER_CREATED';c.submission_deadline_at=null;
    }else if(input.outcome==='ORDER_CANCELLED'){requireStatus(c,['ORDER_CREATED','PAID']);c.status='ORDER_CANCELLED';}
    else {requireStatus(c,['ORDER_CREATED']);c.status='PAID';}
    c.updated_at=now;c.version++;receipt(room,action,input,actor);return {replayed:false};
  }
  if(action==='checkout-simulate'){
    const input=parse(checkoutSchemas.simulate,raw),c=current(room,input.checkout_id);payer(c,actor);
    if(room._data_source!=='TEST_FIXTURE'||c.source!=='TEST_FIXTURE')fail('TEST_DATA_DISABLED','当前房间禁止模拟订单');
    if(replay(room,action,input,actor))return {replayed:true};
    if(input.operation!=='create'&&input.scenario!==undefined)fail('INVALID_ARGUMENT','只有模拟创建可指定故障情景',400);
    if(input.operation==='quote')setQuote(c,c.draft.total_cents,now,room.expires_at,[{code:'TEST_TAKEAWAY',title:'外带（模拟）'}]);
    else if(input.operation==='create'){
      requireStatus(c,['SUBMITTING']);
      const scenario=input.scenario??'success';
      if(scenario==='success'||scenario==='timeout_created')c._demo_order={status:'ORDER_CREATED'};
      c.status=scenario==='success'?'ORDER_CREATED':scenario==='rejected'?'NO_ORDER':'UNKNOWN';c.submission_deadline_at=null;
    }else if(input.operation==='pay'){
      requireStatus(c,['ORDER_CREATED']);if(!c._demo_order)fail('CHECKOUT_STATE','不存在模拟订单');
      c._demo_order.status='PAID';c.status='PAID';
    }else if(input.operation==='abandon'){
      requireStatus(c,['HANDED_OFF','QUOTED']);c.status='NO_ORDER';
    }else {
      requireStatus(c,['UNKNOWN','ORDER_CREATED','PAID']);c.status=c._demo_order?.status??'NO_ORDER';
    }
    c.updated_at=now;c.version++;receipt(room,action,input,actor);return {replayed:false};
  }
  fail('UNKNOWN_ACTION','不支持的结账操作',404);
}
