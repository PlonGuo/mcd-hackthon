# mcdebate 0.3.3 验证记录

日期：2026-10-18。状态：**供 review；服务端 0.6.5 尚未部署，豆包 Work / WorkBuddy 手机端尚未验收**。0.3.2 归档未修改。

## 变更与原因

- 多轮 DeepSeek 回归中，文本回执的观战 URL 偶尔漏字，付款人已接受职责时偶尔停止等待。服务端给新房间生成 32 位十六进制只读随机 token（128 bit），仍接受旧 64 位 token；MCP 文本 JSON 把工具返回的 `watch_url` 放在最前面。已接受付款责任的非房主在等待房主固定方案时，服务端明确给出 `get_room_state(wait_ms=5000)`。
- 模拟房间的 `simulate_checkout(quote)` 已直接写入房间报价，不得再 `report_checkout(QUOTED)`。0.3.3 主指令和结账参考按 `TEST_FIXTURE` / `AGENT_REPORTED` 分流；服务端过期模拟报价提示也同步说明这一点。
- `AGENT_REPORTED` 的 QUOTED 若仍有效、用户已确认同一方案，则按当前版本推进 SUBMITTING，不重复官方核价。报价过期则先只读重新核价，成功后上报新 QUOTED，再请用户确认新方案。

## 验证

| 检查 | 结果 |
| --- | --- |
| DeepSeek 入口/链接/付款人等待/模拟报价，每场景重复 5 次 | **24/25**；唯一失败遗漏 `create_room.mode=shopping`，交付的观战 URL 完整 |
| DeepSeek 当前服务端回执：真实有效报价、过期报价、模拟报价，每场景重复 5 次 | 最终修订后 **15/15** |
| DeepSeek 完整合成场景 | 最终修订后 **26/26** |
| 代码测试 | `pnpm test` **125/125** 通过；`pnpm run build:node`、类型检查通过；Worker dry-run 构建通过 |
| Skill 和导入包 | skill-creator `quick_validate.py` 通过；两份 ZIP 完整，归档源文件与导入内容一致，SHA256 校验通过 |

评估器只向 DeepSeek 发模型请求。房间和麦当劳工具结果均为本地合成数据，未创建真实订单或付款。模型轨迹保存在被 Git 忽略的 `.local/skill-evals/`；包括 `deepseek-033-targeted`、`deepseek-033-checkout-revised` 和 `deepseek-033-final-full`。曾发现过期报价场景使用旧版服务端 `checkout_guidance`，已对齐当前代码后重新测试；更正前的结果不并入最终统计。

人工抽查完整回归时，真实建单合成场景按正确工具顺序交付了模拟 URL，但答复先称它是官方真实链接，随后又识别出 `example.invalid` 是占位域名。自动检查只验证链接原值和操作顺序；**26/26 不代表用户文案或支付链接真实性已验收**。

## 剩余风险

- 入口测试中 DeepSeek 一次省略可选的 `mode=shopping`，即使 Skill 写明该参数。当前 MCP 为兼容旧版纯辩论房间，工具层仍允许省略；该失败会建成旧模式房间，不能算通过。
- 15/15 和 26/26 是有限样本，不保证每次稳定。真实手机宿主是否加载新版 Skill、是否连续轮询、是否完整展示链接，需在豆包 Work 与 WorkBuddy 分别实测。
- 服务端改动仍只在本地，公网目前尚未获得这些修正；真实麦当劳建单、官方支付跳转本轮均未触发。
