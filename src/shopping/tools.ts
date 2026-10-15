import { schemas } from './schemas.ts';
import { checkoutSchemas } from './checkout-schemas.ts';
export const shoppingDefinitions={
  set_room_context:{action:'context',description:'仅房主在用户明确选择后锁定门店，一经确定不可更换；地点不含私人住址。',schema:schemas.context},
  report_item:{action:'item',description:'上报自己查询的单品摘要与参考报价；服务端填写来源与报告者。开发资料须标明测试。',schema:schemas.item},
  update_order_draft:{action:'draft',description:'编辑待买清单。add须item_id、owner和quantity；set_quantity须line_id和quantity；remove只须line_id。须最新expected_draft_version和唯一event_id，不等于下单。',schema:schemas.draft},
  create_battle:{action:'battle',description:'双方入房锁店后发起一局；完成或取消当前局才能再创建。使用唯一event_id。',schema:schemas.battle},
  cancel_battle:{action:'cancel',description:'任一辩手可以取消本局，保留清单和历史。',schema:schemas.cancel},
  resolve_recommendation:{action:'recommendation',description:'仅房主按用户明确答复采纳或忽略建议；采纳须数量，不自动删除输方商品。',schema:schemas.recommendation},
  nominate_payer:{action:'payer-nominate',description:'房主提名本房间付款人；提名不等于接受或付款授权，须候选本人调用accept_payer_role。',schema:checkoutSchemas.nominate},
  accept_payer_role:{action:'payer-accept',description:'候选本人向自己的用户询问并取得同意后接受付款责任，使用当前candidate_version；不等于批准下单或付款。',schema:checkoutSchemas.accept},
  prepare_checkout:{action:'checkout-prepare',description:'房主按当前expected_draft_version固定非空清单；须付款人已接受、当前无对战。结账期间冻结改单和新局。',schema:checkoutSchemas.prepare},
  get_checkout_package:{action:'checkout-package',description:'仅指定付款人领取固定门店和清单方案，领取有状态副作用。随后直连官方核价；测试房间改用simulate_checkout。结果未知重放同一event_id。',schema:checkoutSchemas.package},
  report_checkout:{action:'checkout-report',description:'仅付款人报告直连结果，所有上报须expected_checkout_version。查询之前记录该版本，旧查询结果不能换成最新版本冒充新结果。QUOTED须total_cents及从官方核价返回的take_way_options（code/title）；向用户展示完整方案并通过宿主审批后，SUBMITTING须quote_id、expected_total_cents和用户选择的take_way_code，然后仅发起一次官方create-order。超时报告UNKNOWN，先query-order/order-list核对，禁止盲目重下。确认未下单才NO_ORDER，创建成功ORDER_CREATED，用户自行在官方页面付款并查单后PAID。均仅AGENT_REPORTED，不能充当官方证明。禁止传订单号、支付链接、电话、Token。测试房间仅允许SUBMITTING，其余结果走simulate_checkout。',schema:checkoutSchemas.report},
  cancel_checkout:{action:'checkout-cancel',description:'房主或付款人取消尚未领取的结账方案；不是取消官方订单。领取后须付款人核对并报告NO_ORDER；未知结果不能直接取消。',schema:checkoutSchemas.cancel},
  simulate_checkout:{action:'checkout-simulate',description:'仅TEST_FIXTURE测试房间：quote模拟核价，create模拟建单（须已SUBMITTING），query核对模拟订单，pay模拟付款（不扣钱），abandon放弃尚未提交的模拟结账。create支持success/rejected/timeout_created/timeout_no_order故障情景；其他操作须省略scenario。所有结果保持测试标记，不调用麦当劳。',schema:checkoutSchemas.simulate},
};
