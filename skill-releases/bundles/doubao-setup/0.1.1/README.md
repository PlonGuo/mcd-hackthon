# 豆包 Work 安装资料包 0.1.1

这份资料包包含 mcdebate Skill 0.3.4 的豆包导入 ZIP、两个 MCP 的非敏感连接模板，以及操作说明。**它不是豆包原生 Plugin，也不能把外层 ZIP 直接上传到「技能」后自动安装两个 MCP。**先解压外层包，再把其中的 `mcdebate-doubao-0.3.4.zip` 导入豆包技能；两个 MCP 仍须在客户端连接器中配置。

1. 下载并解压 `mcdebate-doubao-setup-0.1.1.zip`，在豆包 Work 的技能管理中导入内部的 `mcdebate-doubao-0.3.4.zip`。
2. 在连接器设置中添加 `mcdebate`：Streamable HTTP，地址 `https://47.243.195.171/mcp`，无需 Header 或连接级 Token。若已有同名旧连接，确认它不再指向 `workers.dev`。
3. 添加 `mcd-mcp`：Streamable HTTP，地址 `https://mcp.mcd.cn`；在客户端认证或 Headers 设置中填 `Authorization: Bearer <你的个人 Token>`。Token 需由用户在[麦当劳官方平台](https://open.mcd.cn/mcp)申请，**不要把真实 Token 发给 Agent、写进公开 ZIP 或提交到仓库**。具体鉴权见[官方接入指南](https://github.com/M-China/mcd-mcp-server)。
4. 在新会话中启用 Skill 和两个 MCP，先检查工具可见，再发送“mcdebate 开始”。手机端是否继承桌面端连接需在实际客户端确认。

`mcp-servers.template.json` 只提供地址、传输类型和 Token 占位符，便于核对字段。若豆包版本支持从 JSON 导入连接器，可在客户端本地替换占位符；若只提供图形界面，就按上面的字段逐项填写。不要将已填真实 Token 的 JSON 发送到聊天。

豆包[开放平台](https://open.doubao.com/)目前介绍 Plugin 可以组合 Skill、MCP 与 CLI，但公开页面只显示内测入驻信息，尚无可核验的普通用户 Plugin ZIP 导入格式。因此当前不声称本资料包具备一键安装能力。它与 [WorkBuddy 专家整合包](../../workbuddy-expert/0.1.1/README.md)是两种不同的交付方式。
