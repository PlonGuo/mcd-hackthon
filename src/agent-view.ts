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
  const wait=(preparation_guidance:string)=>({...result('get_room_state',{since:0,wait_ms:5000}),preparation_guidance});
  const host=room.self_player_id===room.host_player_id;
  if(room.status!=='OPEN'){
    if(room.checkout?.payer_player_id===room.self_player_id&&room.server_time<room.checkout.reconcile_until){
      actions.push(room.checkout.source==='TEST_FIXTURE'?'simulate_checkout':'report_checkout');
      return {...result('await_user'),checkout_guidance:'房间已关闭或过期；仅付款人在过期后24小时内核对已有订单，不重新创建或付款。真实支付在官方页面由用户自行操作。测试模式只允许query。'};
    }
    return result('stop');
  }
  if(host)actions.push('close_room');
  if(!room.context){
    if(!host)return wait('等待房主确认并锁定门店；继续5秒轮询，不向加入者重复索取门店确认。已有本人信息先复用，锁店后自动查询本人候选。');
    actions.push('set_room_context');
    return {...result('await_user'),preparation_guidance:'仅缺地点或具体门店选择时询问用户；已有明确门店确认就直接锁店，之后继续本人筹备和等待加入，不再问是否准备好。'};
  }
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
    if(room.joined_players<2)return wait('等待另一位加入；本人已知立场的候选可以先查询上报，之后继续5秒轮询。双方到齐且用户已要求对战时直接建立本局，不再询问是否开局。');
    actions.push('create_battle');
    if(!host&&room.payer?.player_id===room.self_player_id&&room.payer.accepted&&!checkout&&room.draft.lines.length)
      return {...result('get_room_state',{since:0,wait_ms:5000}),checkout_guidance:'本人已接受付款责任，等待房主固定清单；继续5秒长轮询，不要求用户催房主。固定后由付款人领取方案并核价，购买仍需确认。'};
    if(!host&&!room.battles.length)return wait('首局尚在筹备；本人有可做的查询或上报先完成，随后继续5秒轮询等待房主建立本局。沿用已有共享立场，不让用户催房主或重复确认在线。');
    return {...result('await_user'),preparation_guidance:'服务端不知道本次用户意图；若已要求开始对战或再来一局，直接create_battle并自动筹备。仅缺真实选择才询问；刚结束一局且没有新意图时等待用户选择下一步。'};
  }
  actions.push('cancel_battle');
  if(battle.status==='PREPARING'){
    actions.push('set_ready');
    if(host&&room.players.length===2&&room.players.every(p=>battle.ready[p.player_id]&&p.online)){actions.push('start_debate');return result('start_debate',{battle_id:battle.battle_id});}
    return battle.ready[room.self_player_id]
      ?wait('本人已准备；继续5秒轮询等待对方准备或刷新在线状态，不撤回准备、不要求用户再说准备好了。房主见双方准备且在线就直接开局，加入者等房主开局。')
      :{...result('await_user'),preparation_guidance:'若本人立场已知且候选资料有效，直接set_ready；缺资料先官方查询并report_item，随后set_ready并继续轮询。准备是Agent操作，不需要用户额外回复准备好了；只在立场缺失或有冲突时询问。'};
  }
  if(battle.status==='ACTIVE'&&battle.current_turn?.player_id===room.self_player_id){actions.push('submit_argument');return result('submit_argument',{battle_id:battle.battle_id,turn_id:battle.current_turn.turn_id,event_id:`arg_${battle.battle_id}_${battle.arguments.length+1}`});}
  if(battle.status==='PAUSED')return result('await_user');
  return result('get_room_state',{since:0,wait_ms:5000});
}
