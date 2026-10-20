# mcdebate skill 版本归档

这里保存每次交付给用户 review 和导入的实际版本。当前可编辑源文件在 [skills/mcdebate](../skills/mcdebate/SKILL.md)；历史版本从当时实际生成的 ZIP 中恢复，旧版本不覆盖、不追改。

| 版本 | 主指令 | 结账参考 | 豆包导入包 | workbuddy 导入包 |
| --- | --- | --- | --- | --- |
| 0.1.0 | [SKILL.md](mcdebate/0.1.0/SKILL.md) | [checkout.md](mcdebate/0.1.0/references/checkout.md) | [ZIP](mcdebate/0.1.0/packages/mcdebate-doubao-0.1.0.zip) | [ZIP](mcdebate/0.1.0/packages/mcdebate-workbuddy-0.1.0.zip) |
| 0.2.0 | [SKILL.md](mcdebate/0.2.0/SKILL.md) | [checkout.md](mcdebate/0.2.0/references/checkout.md) | [ZIP](mcdebate/0.2.0/packages/mcdebate-doubao-0.2.0.zip) | [ZIP](mcdebate/0.2.0/packages/mcdebate-workbuddy-0.2.0.zip) |
| 0.3.0（review） | [SKILL.md](mcdebate/0.3.0/SKILL.md) | [checkout.md](mcdebate/0.3.0/references/checkout.md) | [ZIP](mcdebate/0.3.0/packages/mcdebate-doubao-0.3.0.zip) | [ZIP](mcdebate/0.3.0/packages/mcdebate-workbuddy-0.3.0.zip) |
| 0.3.1（review） | [SKILL.md](mcdebate/0.3.1/SKILL.md) | [checkout.md](mcdebate/0.3.1/references/checkout.md) | [ZIP](mcdebate/0.3.1/packages/mcdebate-doubao-0.3.1.zip) | [ZIP](mcdebate/0.3.1/packages/mcdebate-workbuddy-0.3.1.zip) |
| 0.3.2（review） | [SKILL.md](mcdebate/0.3.2/SKILL.md) | [checkout.md](mcdebate/0.3.2/references/checkout.md) | [ZIP](mcdebate/0.3.2/packages/mcdebate-doubao-0.3.2.zip) | [ZIP](mcdebate/0.3.2/packages/mcdebate-workbuddy-0.3.2.zip) |
| 0.3.3（review） | [SKILL.md](mcdebate/0.3.3/SKILL.md) | [checkout.md](mcdebate/0.3.3/references/checkout.md) | [ZIP](mcdebate/0.3.3/packages/mcdebate-doubao-0.3.3.zip) | [ZIP](mcdebate/0.3.3/packages/mcdebate-workbuddy-0.3.3.zip) |
| 0.3.4（review） | [SKILL.md](mcdebate/0.3.4/SKILL.md) | [checkout.md](mcdebate/0.3.4/references/checkout.md) | [ZIP](mcdebate/0.3.4/packages/mcdebate-doubao-0.3.4.zip) | [ZIP](mcdebate/0.3.4/packages/mcdebate-workbuddy-0.3.4.zip) |

每个版本包含完整的通用源文件及依赖的 references、当时的两份平台导入包，以及 packages/SHA256SUMS。两种导入包的指令正文一致；workbuddy 包补充平台要求的展示名、中英文描述、版本和作者字段。

给最终用户安装时按客户端只选一份 `bundles/` 交付物，不必再单独发送上表 `packages/` 的 Skill ZIP：

| 客户端 | 交付物 | 内容与限制 |
| --- | --- | --- |
| WorkBuddy | [专家整合包 0.1.1](bundles/workbuddy-expert/0.1.1/README.md) | 内含 Skill 0.3.4 与两个 MCP 的依赖声明；从专家入口导入，首次使用由用户填写官方 Token。实际客户端导入待验证。 |
| 豆包 work | [安装资料包 0.1.1](bundles/doubao-setup/0.1.1/README.md) | 内含 Skill 0.3.4 导入 ZIP、两条 MCP 的配置模板和说明；解压后分步安装，不能作为原生 Plugin 一键导入。 |

两份 bundle 独立编号，只引用已归档的 Skill 0.3.4，不追改历史版本。豆包开放平台虽说明 Plugin 可组合 Skill 与 MCP，但目前公开页面只提供内测入驻信息，没有足够的导入格式说明可制作可靠的豆包原生 Plugin 包。两种客户端均需用户自行提供麦当劳官方 Token。

## 0.1.0 · 首次手机链路版本

- 选择技能后说“开始”，默认创建购物房间；支持加入和续接已有房间。
- 固定门店、上报单品、维护持续清单、穿插多局对战，按需读取结账参考。
- 用户已确认手机端链路打通；随后实测发现观战URL漏字符、等待中停止、双方立场混淆和真实订单被误判为模拟。

## 0.2.0 · 四项实测反馈修正

- 明确从工具结果 data.watch_url 原样复制完整观战URL，不拼接API路径、不截断token。
- 等待对手时持续使用 wait_ms=5000；online=false不关闭房间，保留宿主执行限制与续接说明。服务端0.6.4配套支持5秒等待；0.1.0使用2秒等待。
- 按self_player_id/host_player_id识别A/B，将双方对战分工写入共享topic，并用reporter_player_id筛选本人候选。当前没有独立偏好字段，分工不是购买授权。
- 明确AGENT_REPORTED是真实路径资料上报，TEST_FIXTURE才模拟；使用官方建单回执中的payH5Url，已有结账按状态续接，已有订单只取链接或查单，不重复创建。
- 验证记录：113代码测试、12项独立模拟行为场景、CI和公网接口回归通过；未在这轮创建真实麦当劳订单或支付，手机端新版规则待用户复测。

## 0.3.0 · 角色交接与行为回归 review 版

- 明确开始/续接的首个动作，按本人席位选择候选；本人刷新候选资料后重新设置本局准备。
- 分清自己推进、等对方和问用户；房主复用已有付款人提名，付款人持续等方案，兼容房主自己付款。
- 明确结账各步使用成功回执的新版本，UNKNOWN＋空列表保留未知，不以用户确认替代前次请求未受理的证据。
- 新增22个合成行为场景与最小评估脚本。最终一次同条件对比：0.2.0自动检查15/22、0.3.0自动检查21/22；120项代码测试与类型检查通过。
- 报价过期仍可能多问；人工另发现链接续接跳过刷新、注册未知时建议重试等问题。自动通过不代表全部语义正确或手机稳定，详见 [验证记录](mcdebate/0.3.0/VALIDATION.md)。本轮未部署、未做真实交易，等待手机验收。

## 0.3.1 · 过期报价与异常续接修订版

- 旧链接和 UNKNOWN 结果先刷新；UNKNOWN 同账户只读查单。报价过期时先重新核价、上报新 QUOTED，再让用户确认新方案；候选刷新后重新准备。
- 注册身份未返回时明确无法恢复，缺原观战链接绝不拼 URL；结账冻结期间不建议直接改单，辩论说明也约束未经资料支持的事实。
- 新增一组相似门店编码的合成报价场景。最终完整模型回归自动检查21/23，两个失败均为报价过期后仍停下询问。测试与限制见 [验证记录](mcdebate/0.3.1/VALIDATION.md)。手机与真实业务仍待验收。

## 0.3.2 · 链接交付与过期报价修订版

- 观战链接改为独立一行原样交付，不手写 Markdown 链接；无法核对完整原值时不交付残缺链接。
- 付款人对过期报价先只读重新核价并上报，再让用户确认新方案；服务端本地引导文字同步修正，但尚未部署。
- 初次 DeepSeek 针对性回归15/15、随机链接5/5、完整合成场景24/24；代码测试121/121。后续三轮完整重复回归 **70/72**，失败发生在文本回执链接截断及付款人提前停止等待；定向追加 **9/10**。手机端和真实官方业务仍待验收，详见 [初次验证记录](mcdebate/0.3.2/VALIDATION.md)和[重复回归补充记录](../evals/mcdebate/RESULTS-2026-10-18-032-repeat.md)。

## 0.3.3 · 结账来源与有效报价分支修订版

- `TEST_FIXTURE` 的模拟核价成功后不再上报真实路径的 QUOTED；已有有效报价且用户确认同一方案时，不重复核价，直接按当前版本推进 SUBMITTING。
- 配套服务端 0.6.5 缩短新观战 token、将文本回执中的原始链接置前，并为已接受付款责任的非房主提供持续等待指引；旧观战链接继续有效。
- DeepSeek 最终关键结账分支重复回归 **15/15**、完整合成场景 **26/26**，代码测试 **125/125**。另一次入口定向测试 **24/25**，失败时遗漏 `create_room.mode=shopping`，链接本身完整；不据此宣称手机端稳定。详见 [验证记录](mcdebate/0.3.3/VALIDATION.md)。本轮未部署、未调用真实麦当劳交易。

## 0.3.4 · 清单删除与撤回边界 review 版

- 把删除本人商品、撤回加购、减数量和改成指定数量映射到 `update_order_draft` 的 `remove` / `set_quantity`，先刷新清单并按行归属判断权限；房主不能修改对方个人行。
- 补明已固定结账、撤回本局准备、拒绝推荐、门店已锁定时的处理；价格展示与辩论发言增加来源和长度校验。
- 购物清单定向合成回归 **9/9**，一次完整合成回归 **29/29**，代码测试 **125/125**。最后报价措辞补充后的定向回归 **1/2**，失败是模型跳过状态刷新后展示旧会话报价；最终措辞未重跑完整回归。真实订单取消与退款仍未覆盖，详见[验证记录](mcdebate/0.3.4/VALIDATION.md)。

## 后续交付约定

1. 继续在 skills/mcdebate 中修改当前版本。
2. 每次交付前更新技能版本号，在本目录新增 mcdebate/<版本>/，保存该次完整源文件、参考资料和两种导入包。
3. 已交付版本目录保持不变；发现问题在新版本修正，不能用新内容覆盖旧版本。
4. 检查归档源文件与导入包一致、ZIP完整、哈希一致，更新本页变更摘要，并明确实际验证范围。
5. 目录位于项目根部的 skill-releases，而不是可安装的 skills 目录，避免将多个历史版本混入当前技能安装入口。

对照 review 时，可以在 VS Code 中选中两个版本的 SKILL.md 使用“选择以进行比较 / 与所选项目进行比较”；结账参考也可用同样方式比较。
