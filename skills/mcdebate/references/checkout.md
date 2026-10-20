# 结账：房主与付款人分别推进

先 get_room_state 刷新，再读取 room.payer、checkout 和本人身份。checkout 是公开摘要；付款人从 `room.checkout_details.quote` 或已领取方案的 quote 读取完整报价与取餐编码，以房间 server_time 判断有效期。使用客户端已连接的麦当劳官方工具，按实际定义填参，不运行项目脚本或索取账户 Token。

`AGENT_REPORTED` 是真实路径的资料/结果上报，不能当成模拟标记，也不代表后端已独立核验。若本人留有对应的官方 `calculate-price` 成功回执和 QUOTED 上报记录，这份报价已经过官方只读核价；展示时不能仅凭 `AGENT_REPORTED` 字样声称“尚未官方核价”。缺少回执时只说房间记录了报价、后端未独立核验，不编造其来源。只有 `TEST_FIXTURE` 使用 simulate_checkout；来源未知先核对，不能凭门店或服务的名称改判来源。真实路径中当前没有可调用的 calculate-price，就说明需启用官方连接器并停止核价；query_demo_catalog 不能检查官方连接或补报价。缺登录/权限同样说明缺失项，不降级成模拟。

**先按来源分流：**`TEST_FIXTURE` 的 `simulate_checkout(operation="quote")` 成功回执已把报价写入房间；直接展示模拟报价和有效期，等用户确认具体方案。不要再调用 `report_checkout(outcome="QUOTED")` 或官方 `calculate-price`。下文的“官方核价 → 上报 QUOTED → 官方建单”只适用于 `AGENT_REPORTED`。测试房间进入 SUBMITTING 时仍按该工具要求使用 `report_checkout(SUBMITTING)`，随后只用模拟工具建单。

工具可见性看本会话实际工具列表。店名或商品编码像“示例”，不等于工具不可见或房间必为 TEST_FIXTURE；在已固定的 AGENT_REPORTED 方案上，先让官方只读工具核对，若返回明确无效编码再如实处理。要判断缺工具，先看当前可调用列表中是否有精确名称 `calculate-price`，不能从房间状态或示例商品编码推断它“不在列表”；可见就调用，不能一边看到该工具，一边告诉用户“缺少核价工具”。

## 没有固定方案：先检查已有提名

`checkout=null` 不等于“尚未提名付款人”。先看 room.payer，保留已有候选和接受状态；只有房主能提名、prepare，只有候选本人能接受。房主本人也可以兼任付款人，此时由自己依次完成两种角色的动作。

用户指定的人与现有 payer.player_id 相同，就复用该提名：未接受时等待，已接受时准备方案。重复 nominate_payer 会推进候选版本并把 accepted 重置为 false，可能使另一端刚接受的结果失效；用户再次说“由B付款”不要求重复提名B。

| 状态 | 房主下一步 | 候选/付款人下一步 |
| --- | --- | --- |
| 无 payer，用户要求结账 | 缺人选才询问；已明确则 nominate_payer | 非房主等待提名，不替房主操作 |
| payer 已有候选，accepted=false | 候选符合用户选择就保留；持续读取等待其接受，不重新提名 | 是本人则按自己用户的同意 accept_payer_role，带当前 candidate_version；未同意才询问 |
| accepted=true，checkout 为空或 CANCELLED/NO_ORDER，用户仍要结账 | 清单非空、无当前局时 prepare_checkout，带最新 expected_draft_version 和稳定 event_id；缺前提处理缺项 | 若非房主，持续读取等待 PREPARED；若也是房主，直接完成 prepare |

等待使用 `get_room_state(since=0,wait_ms=5000)`，每次响应后继续判断；服务端通用 `await_user` 不改变表中的职责。自己已经同意承担付款责任，就不要再次接受或反复问“继续吗”。但接受付款责任不等于确认某个具体订单。

另一端还在执行时继续轮询，不只等一次就让用户去催。等待超过5分钟或宿主执行中断时，说明哪端需恢复及“选择 mcdebate，说继续”的操作；不能保证已经结束的另一端自动运行。暂停等待不取消清单或订单。

## 已有固定方案：按当前状态续接

固定后冻结清单和新局。本人不是 checkout.payer_player_id 时，不领取方案、核价、替对方确认或创建订单；用户正在等结账进度时读取共享状态，等到付款人交付订单/需要用户决定时说明当前进度。订单号和支付链接不通过房间转交。

| checkout.status | 指定付款人的下一步 |
| --- | --- |
| PREPARED | get_checkout_package 领取固定方案，使用 checkout_id、稳定 event_id；不是等待新的用户选择。 |
| HANDED_OFF | 复用已领取方案，本地缺失才再取；随后官方 calculate-price 核价，不重建交接。 |
| QUOTED | 报价未过期、用户已确认当前同一方案时，直接按当前 checkout.version 上报 SUBMITTING，不重复 calculate-price。过期且官方核价工具可见时，立即调用 calculate-price，成功后先 report_checkout(QUOTED)，再展示新报价请用户确认，不先问“是否重新核价”，也不因价格变化跳过上报。`report_checkout(QUOTED)` 只记录新报价，不创建订单；只有 SUBMITTING/create-order 需要新方案的购买确认。过期确认不直接当成提交授权。 |
| SUBMITTING/UNKNOWN | 已知 orderId 用 query-order，否则 order-list 核对同一付款账户。索要已有结果已包含这次只读查询，无需另问“是否查单”；确有账户切换迹象才确认。空列表只说明本次未查到，保留 UNKNOWN，不能据此上报 NO_ORDER、取消当前方案或建议重下；报价过期不妨碍查原订单。 |
| ORDER_CREATED/PAID | 先刷新房间，复用本客户端保存的官方 payH5Url；缺失先查该订单，准确区分待支付/已支付。 |
| ORDER_CANCELLED | 告知取消，不当作 NO_ORDER 重下；新一餐须用户明确新开。 |

**过期报价例：**付款人先读取状态确认 QUOTED 已过期 → 立即调用当前可见的官方 `calculate-price` → 成功后用读取到的 checkout.version 和官方返回的总价/取餐方式上报 `QUOTED` → 收到新版本与 quote 后，再告诉用户“旧报价已过期；这是新价格与差异，请确认新方案”。只读核价和上报报价都不等于创建订单，不先询问能否核价；价格变了也不能把上报留到用户确认之后。若工具实际拒绝编码或不可见，报告该回执，不自行推测。

**UNKNOWN 且列表为空时的答复：**“暂未查到这笔订单，结果仍未知，现在没有可交付的支付链接。可以稍后继续核对，或用已有订单号精确查询。”此时仅提供核对已有结果的后续，不提供“确认后解除 UNKNOWN/重新下单”或“先取消固定方案重新核价”；用户同意不证明前次请求没有生成订单。没有订单号和本人玩家凭证时，不能承诺靠房间号或观战链接恢复原订单核对身份。

领取方案有状态副作用，结果未知重放同一 event_id。领取前房主或付款人可 cancel_checkout；HANDED_OFF/QUOTED 阶段明确尚未发出建单请求、用户放弃结账时，付款人可报告 NO_ORDER。SUBMITTING 不能直接转 NO_ORDER，先按未知结果分支处理。已经发出而结果未知，须核对到具体结果或针对该次请求的明确未受理证据；空历史不是这种证据，不能用取消或 NO_ORDER 绕过。

## 核价、确认、只创建一次

1. **需要核价时才核价。** 本步骤只适用于 HANDED_OFF、QUOTED 报价过期或固定方案变化；有效且已确认的 QUOTED 跳到第3步。保存查询前的 expected_checkout_version，按固定门店、商品编码/数量、SELF_PICKUP 调官方 calculate-price。成功后立即 report_checkout(QUOTED)，金额为分，take_way_options 来自实际返回，不猜堂食/外带编码。只读核价与记录报价无需新增购买确认；不能先停在“是否同意新价格”，把 QUOTED 留到之后才上报。
2. **确认具体方案。** 展示店名/地址、完整餐品/数量、最终总价和实际支持的取餐方式。沿用用户已经明确确认的同一有效方案；信息缺失、价格/规格/方式变化、报价过期或版本冲突则重新核对并补确认。遵守宿主审批，不能用 SUBMITTING 回执代替用户批准。
3. **取得提交回执。** 使用 QUOTED 成功回执中的当前 checkout.version 和对应 quote，带 checkout_id、quote_id、expected_total_cents、已确认的 take_way_code 和稳定 event_id 上报 SUBMITTING。QUOTED 会推进版本，不能继续用核价前的旧版本。仅明确成功、非重放、当前仍可提交且本客户端尚未发起该次官方建单时，保存回执中的新版本，进入下一步；未知/重放回执先核对，不重新发起。
4. **调用一次 create-order。** 参数来自同一已确认方案和实际工具定义。等待这次结果，不能和依赖它的 report_checkout 并行。超时或结果未知先记录并报告 UNKNOWN，再 query-order/order-list；没有查到、空历史、错误和新的 event_id 都不授权重下。
5. **交付并报告。** 从官方成功响应 data 取 orderId、payH5Url，核对本次响应内的订单详情；字段齐全且一致时，无需额外 query-order。向付款人的用户原样显示“订单已创建、待支付：[打开麦当劳支付](原 payH5Url)”，私下保存原值。随后以当前正确版本向房间仅报告 ORDER_CREATED；上报失败不改变已经建单的事实，先读取核对，不再建单。

链接缺失就取已保存的原响应或查同一订单；仍无可用链接则说明实际情况，不能按 orderId 拼接或让用户重复下单冒充完成。官方页面能否唤起 App 取决于手机环境；交付链接不等于已付款，查询官方结果后才能报告 PAID。

**例：** 用户说“把刚才订单链接再给我一下”；状态为 ORDER_CREATED，本客户端留有官方 payH5Url。刷新状态后直接复制该原链接并注明待支付；不重新提名、prepare、核价或 create-order。仅索要链接并未授权一笔新订单。

## 版本、隐私与结束边界

- 版本按步骤衔接：例如领取方案 v2 → 官方核价 → QUOTED 上报绑定 v2，成功得到 v3 → SUBMITTING 绑定 v3，成功得到 v4 → 官方建单及结果上报绑定 v4。之后查单前重新读取并保存该次版本。版本冲突丢弃旧操作，重新读取核对，不把旧查询结果换成新版本；报价过期重新核价，变化后重新确认。
- 订单号、支付链接、取餐码、电话和账户 Token 留付款人客户端，不写观点、共享文件、房间上报或公开观战页；房间只接收业务状态。
- SUBMITTING 满60秒转 UNKNOWN 后仍先核对；无法查清就说明暂时没有可交付链接，保留 UNKNOWN，稍后续查。ORDER_CANCELLED 不代表退款成功，也不等于 NO_ORDER。已有订单不随清单变化，新一餐新会话。
- TEST_FIXTURE 的报价及订单结果仅由 simulate_checkout 的 quote/create/query/pay/abandon 产生，始终标为测试、不生成真实支付链接；SUBMITTING 是向房间报告已获确认的提交意图，不是报价或订单结果。create 仍须已 SUBMITTING；未知先 query，不可 abandon。
- close_room/过期不会取消官方订单。过期后24小时仅付款人核对已有结果，不重新核价/创建；观战 URL 仍按房间原 TTL 结束。
