import type { RoomView } from './types.ts';
export function buildAgentView(room: RoomView) {
  if('mode' in room&&room.mode==='shopping')return shoppingAgentView(room);
  const me = room.players.find(p => p.player_id === room.self_player_id);
  if (!me) return { allowed_actions: [], next_action: 'stop', wait_ms: 0, next_request: null };
  const host = room.self_player_id === room.host_player_id;
  const allowed_actions = ['get_room_state'];
  if (host && !['CLOSED', 'EXPIRED'].includes(room.status)) allowed_actions.push('close_room');
  const result = (next_action: string, args: Record<string, unknown> = {}, wait_ms = 0) => ({ allowed_actions, next_action, wait_ms,
    next_request: next_action === 'stop' ? null : { tool: next_action,
      arguments: { room_id: room.room_id, ...args }, credential_required: true } });
  const wait = () => result('get_room_state', { since: 0, wait_ms: 5000 }, 5000);
  if(room.status==='FINISHED' && room.judgement?.status==='PENDING')return wait();
  if (['FINISHED', 'PAUSED', 'CLOSED', 'EXPIRED'].includes(room.status)) return result('stop');
  if (['WAITING', 'READY'].includes(room.status)) {
    allowed_actions.push('set_ready');
    if (!me.ready) return result('set_ready', { ready: true });
    if (room.status === 'READY' && host && room.players.every(p => p.ready && p.online)) {
      allowed_actions.push('start_debate');
      return result('start_debate');
    }
    return wait();
  }
  if (room.status === 'ACTIVE' && room.current_turn?.player_id === me.player_id) {
    allowed_actions.push('submit_argument');
    return result('submit_argument', { turn_id: room.current_turn.turn_id,
      event_id: `arg_${room.room_id}_${room.turn_index + 1}_${me.player_id}` });
  }
  return wait();
}

function shoppingAgentView(room: Extract<RoomView,{mode:'shopping'}>) {
  const actions=['get_room_state'];
  const result=(next_action: string,args: Record<string,unknown>={})=>({allowed_actions:actions,next_action,wait_ms:next_action==='get_room_state'?5000:0,next_request:next_action==='stop'||next_action==='await_user'?null:{tool:next_action,arguments:{room_id:room.room_id,...args},credential_required:true}});
  const host=room.self_player_id===room.host_player_id;
  if(room.status!=='OPEN'){
    if(room.checkout?.payer_player_id===room.self_player_id&&room.server_time<room.checkout.reconcile_until){
      actions.push(room.checkout.source==='TEST_FIXTURE'?'simulate_checkout':'report_checkout');
      return {...result('await_user'),checkout_guidance:'房间已关闭或过期；仅付款人在过期后24小时内核对已有订单，不重新创建或付款。真实支付在官方页面由用户自行操作。测试模式只允许query。'};
    }
    return result('stop');
  }
  if(host)actions.push('close_room');
  if(!room.context){if(host)actions.push('set_room_context');return result('await_user');}
  const checkout=room.checkout,locked=checkout&&!['CANCELLED','NO_ORDER'].includes(checkout.status);
  if(locked){
    const payer=checkout.payer_player_id===room.self_player_id;
    if(checkout.status==='PREPARED'&&(host||payer))actions.push('cancel_checkout');
    if(payer){
      actions.push('get_checkout_package','report_checkout');
      if(checkout.source==='TEST_FIXTURE')actions.push('simulate_checkout');
    }
    const quoteExpired=checkout.status==='QUOTED'&&checkout.quote_expires_at!=null&&room.server_time>=checkout.quote_expires_at;
    const guidance=checkout.status==='UNKNOWN'||checkout.status==='SUBMITTING'?'先用付款人账户查询订单；结果未知禁止重复创建。':
      quoteExpired&&payer?(checkout.source==='TEST_FIXTURE'?'旧报价已过期；先用simulate_checkout(quote)重新模拟核价，成功即已更新房间报价，不再report_checkout(QUOTED)；请用户确认新方案，不能按旧报价建单。':'旧报价已过期；先用当前可见的官方工具只读重新核价，成功后上报新报价，再请用户确认新方案；旧确认不能授权建单。'):
      checkout.status==='QUOTED'?'向付款人展示固定门店、完整商品、数量和最终金额，并从核价选项中确认堂食/外带；房间上报不能代替宿主审批。':
      checkout.status==='ORDER_CREATED'?'用户自行打开官方支付链接付款，再查官方订单；支付链接不得进入公共房间。':
      checkout.status==='ORDER_CANCELLED'?'订单已取消；不代表退款已完成，如需重新点餐请新建房间。':
      checkout.status==='PAID'?'本清单已进入订单流程；测试结果或Agent上报不等于官方验证。新一餐请新建房间。':'指定付款人领取方案后重新核价；测试房间使用模拟工具。';
    return {...result('await_user'),checkout_guidance:guidance};
  }
  if(host)actions.push('nominate_payer');
  if(room.payer?.player_id===room.self_player_id&&!room.payer.accepted)actions.push('accept_payer_role');
  if(host&&room.payer?.accepted&&room.draft.lines.length&&!room.active_battle_id)actions.push('prepare_checkout');
  actions.push('report_item','update_order_draft');if(host)actions.push('resolve_recommendation');
  const battle=room.battles.find(b=>b.battle_id===room.active_battle_id);
  if(!battle){
    actions.push('create_battle');
    if(!host&&room.payer?.player_id===room.self_player_id&&room.payer.accepted&&!checkout&&room.draft.lines.length)
      return {...result('get_room_state',{since:0,wait_ms:5000}),checkout_guidance:'本人已接受付款责任，等待房主固定清单；继续5秒长轮询，不要求用户催房主。固定后由付款人领取方案并核价，购买仍需确认。'};
    return result('await_user');
  }
  actions.push('cancel_battle');
  if(battle.status==='PREPARING'){
    actions.push('set_ready');
    if(host&&room.players.length===2&&room.players.every(p=>battle.ready[p.player_id]&&p.online)){actions.push('start_debate');return result('start_debate',{battle_id:battle.battle_id});}
    return battle.ready[room.self_player_id]?result('get_room_state',{since:0,wait_ms:5000}):result('await_user');
  }
  if(battle.status==='ACTIVE'&&battle.current_turn?.player_id===room.self_player_id){actions.push('submit_argument');return result('submit_argument',{battle_id:battle.battle_id,turn_id:battle.current_turn.turn_id,event_id:`arg_${battle.battle_id}_${battle.arguments.length+1}`});}
  if(battle.status==='PAUSED')return result('await_user');
  return result('get_room_state',{since:0,wait_ms:5000});
}
