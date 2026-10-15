# mcdebate skill 版本归档

这里保存每次交付给用户 review 和导入的实际版本。当前可编辑源文件在 [skills/mcdebate](../skills/mcdebate/SKILL.md)；历史版本从当时实际生成的 ZIP 中恢复，旧版本不覆盖、不追改。

| 版本 | 主指令 | 结账参考 | 豆包导入包 | workbuddy 导入包 |
| --- | --- | --- | --- | --- |
| 0.1.0 | [SKILL.md](mcdebate/0.1.0/SKILL.md) | [checkout.md](mcdebate/0.1.0/references/checkout.md) | [ZIP](mcdebate/0.1.0/packages/mcdebate-doubao-0.1.0.zip) | [ZIP](mcdebate/0.1.0/packages/mcdebate-workbuddy-0.1.0.zip) |
| 0.2.0 | [SKILL.md](mcdebate/0.2.0/SKILL.md) | [checkout.md](mcdebate/0.2.0/references/checkout.md) | [ZIP](mcdebate/0.2.0/packages/mcdebate-doubao-0.2.0.zip) | [ZIP](mcdebate/0.2.0/packages/mcdebate-workbuddy-0.2.0.zip) |

每个版本包含完整的通用源文件及依赖的 references、当时的两份平台导入包，以及 packages/SHA256SUMS。两种导入包的指令正文一致；workbuddy 包补充平台要求的展示名、中英文描述、版本和作者字段。

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

## 后续交付约定

1. 继续在 skills/mcdebate 中修改当前版本。
2. 每次交付前更新技能版本号，在本目录新增 mcdebate/<版本>/，保存该次完整源文件、参考资料和两种导入包。
3. 已交付版本目录保持不变；发现问题在新版本修正，不能用新内容覆盖旧版本。
4. 检查归档源文件与导入包一致、ZIP完整、哈希一致，更新本页变更摘要，并明确实际验证范围。
5. 目录位于项目根部的 skill-releases，而不是可安装的 skills 目录，避免将多个历史版本混入当前技能安装入口。

对照 review 时，可以在 VS Code 中选中两个版本的 SKILL.md 使用“选择以进行比较 / 与所选项目进行比较”；结账参考也可用同样方式比较。
