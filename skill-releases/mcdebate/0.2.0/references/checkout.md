# 真实订单与结账交接

用户说下单、结账、创建订单给支付链接时立即按以下流程推进，不把请求当成闲聊或拒绝为“只是模拟”。本技能使用宿主中已连接的麦当劳官方 MCP 工具；读取实际工具定义填参，不运行项目本地脚本、不索取账户Token、不把未知字段伪造成官方接口。

## 判断来源和已有订单

- 先get_room_state，读取room.data_source及checkout。AGENT_REPORTED表示资料/状态由Agent上报，生产路径允许官方核价和真实建单，不证明后端独立核验；TEST_FIXTURE才是模拟，只使用simulate_checkout并明确不会扣款。source未知先核对，不猜。
- 已有ORDER_CREATED/PAID订单且用户只要链接：从付款人本客户端已保存官方响应中取payH5Url，缺失再用该账户的query-order/order-list核对。只查询已有订单，不再prepare或create-order。ORDER_CREATED不等于已付款。
- 按当前checkout.status续接，不把“尚未创建订单”理解为重新提名/准备：

| 当前状态 | 续接动作 |
| --- | --- |
| 无checkout，或CANCELLED/NO_ORDER且用户要重新结账 | 复用已接受的当前付款人；尚未提名/接受才补齐，随后准备新方案。 |
| PREPARED | 保留已有payer_player_id、checkout_id和固定清单；由该付款人get_checkout_package领取，不重复nominate/accept/prepare。 |
| HANDED_OFF | 该付款人复用已领方案；本地缺方案可get_checkout_package取回，随后核价，不重建交接。 |
| QUOTED | 复用该付款人、固定清单和有效报价，进入方案确认/提交；过期重新核价。 |
| SUBMITTING/UNKNOWN | 先查同一账户已有订单，绝不因索要链接再次create-order；按查单结果处理。 |
| ORDER_CREATED/PAID | 返回已有官方链接或查该订单，不重新建单。 |
| ORDER_CANCELLED | 告知实际取消状态；不当作NO_ORDER重下，另餐需用户明确新开。 |

尚缺数量或具体商品时先确认缺项。领取、核价、查单和建单由付款人Agent继续；房主仍完成提名和prepare_checkout等房主步骤。当前Agent不冒用他人身份或改提名绕过锁。不要输出臆测门店、总价、订单号或链接。

## 付款人与固定清单

1. 房主nominate_payer(candidate_player_id,event_id)；候选本人询问自己的用户并accept_payer_role接受当前candidate_version。用户已明确自己承担付款责任时可据此接受；一方不能替另一方接受。接受责任不是批准某个未展示的订单或自动付款。
2. 房主prepare_checkout，带最新expected_draft_version和稳定event_id，要求非空清单、无当前局。固定后冻结清单/新局；只有付款人get_checkout_package(checkout_id,event_id)领取方案，重放使用同一event_id。
3. 付款人用官方calculate-price对固定门店、商品编码/数量和SELF_PICKUP核价，读取官方实际定义。读取查询前的expected_checkout_version，随后report_checkout(QUOTED,total_cents,take_way_options,event_id)。金额为分，take_way_options来自实际官方返回，不猜堂食/外带编码。真实官方接口已在本项目完成核价/建单联调；不要因不了解项目代码就断言没有真实能力，仍须核对当前宿主是否实际有该工具和登录权限。

## 确认后创建一次并交付链接

4. 展示具体店名/地址、完整商品与数量、实际总价、官方支持的堂食/外带选项。用户若已确认当前同一有效方案，沿用确认；信息缺失、价格/规格/方式变化或方案过期才重新确认。遵守宿主实际审批，不能用房间SUBMITTING回执代替人的批准。
5. 报告SUBMITTING，绑定checkout_id、查询前版本、quote_id、expected_total_cents、用户确认的take_way_code和稳定event_id。仅明确成功且当前仍可提交才用官方create-order创建一次，参数采用官方定义和同一方案；未知/重放回执先核对，不再次建单。
6. 从官方成功响应data中读取orderId、payH5Url，并检查实际成功状态；有同一订单的返回/详情时核对一致。向付款人用户原样交付payH5Url，例如“订单已创建、待支付：[打开麦当劳支付](官方返回原URL)”。链接是否打开App由官方页面和手机环境决定，不保证自动唤起；用户自行完成付款。没有真实成功响应不宣称下单完成，返回缺链接也不能自行拼接。
7. 私下保存订单号、支付链接与查询所需信息；向房间仅report_checkout(ORDER_CREATED)等允许的状态，不上报orderId/payH5Url/取餐码/电话/账户Token。查询实际付款结果后才能报告PAID，不能因给出链接就报告已支付。

## 异常与模拟分支

- 每次report_checkout使用查询前保存的expected_checkout_version；版本冲突丢弃旧查询，重新读取核对，旧查询结果不能换成新版本。报价过期重新核价，变化重新确认。
- create-order超时或结果未知，报告UNKNOWN，先query-order/order-list核对；没有查到、空历史或网络报错均不自动授权重下。SUBMITTING满60秒也转UNKNOWN。不要用新event_id绕过未知结果。
- 确认未下单才NO_ORDER恢复清单。ORDER_CANCELLED不代表退款成功，也不能报告NO_ORDER重新建单。已建单后修改餐品不修改旧订单，新一餐新会话。
- 缺少官方工具、登录或权限时准确说明当前缺少哪一步，不把真实房间降级成模拟，也不调用simulate_checkout绕过。
- TEST_FIXTURE房间：仅simulate_checkout进行quote/create/query/pay/abandon，始终说明是测试，不生成真实支付链接。领取前可cancel_checkout，领取后未提交可模拟abandon；未知结果先query，不可abandon。
- close_room/过期不会取消官方订单；过期后24小时仅付款人核对已有结果，不能重新核价/创建；观战URL按原TTL结束。
