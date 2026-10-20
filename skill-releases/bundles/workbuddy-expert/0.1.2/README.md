# WorkBuddy 专家安装包（试用版）

这个 0.1.2 整合包把 [mcdebate Skill 0.3.5](../../../mcdebate/0.3.5/SKILL.md) 与两个远程 MCP 的连接声明放在一起。它是 **WorkBuddy 专家包**，需按[WorkBuddy 专家开发文档](https://open.workbuddy.cn/docs/expert)导入专家入口，不能作为普通 Skill ZIP 上传。首次召唤专家时，WorkBuddy 文档描述会逐个引导连接依赖；已连接的依赖不重复引导。

包内只有 MCP 地址和 Token 输入表单定义，**没有麦当劳官方服务程序，也没有任何人的真实 Token**。每位用户仍需在[麦当劳官方平台](https://open.mcd.cn/mcp)申请个人 Token，并在 WorkBuddy 弹出的密码输入框中填写。mcdebate 房间服务无需连接级 Token。麦当劳 MCP 的地址、鉴权与协议见[官方指南](https://github.com/M-China/mcd-mcp-server)。

导入包：`mcdebate-workbuddy-expert-0.1.2.zip`。安装后召唤“mcdebate 点餐对战助手”，按卡片连接两个 MCP，再说“mcdebate 开始”。这是按公开文档制作的包；尚未在 WorkBuddy 实际上传、首次授权或手机端验证，不能称为已实现一键安装。

如果客户端早已连接名为 `mcdebate` 的旧 Cloudflare POC，请先在连接器详情确认它指向 `https://47.243.195.171/mcp`；仍指向 `workers.dev` 时更新或移除旧连接。已连接的同名依赖可能不会再次弹出引导卡片。

豆包 Work 的普通 Skill ZIP 也不会自动安装 MCP。豆包[开放平台](https://open.doubao.com/)列有可组合 Skill、MCP、CLI 的 Plugin 能力，但当前公开页面仅显示内测入驻信息，尚无可核验的用户导入包格式。因此本 WorkBuddy 包不能直接用于豆包；现阶段豆包仍需分别连接两个 MCP。

本项目独立开发，不是麦当劳官方产品。包中的临时 mcdebate 公网地址将来更换时，需要重新发布安装包。

本版新增准备阶段自动等待、自动准备与开局规则。配套服务端指引尚未部署；本版仅在本地做模型与代码验证，需部署后再在客户端验收。等待使用5秒长轮询；手机宿主挂起或执行超时后不能保证后台继续运行。
