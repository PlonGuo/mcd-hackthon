# mcdebate · 麦麦辩论局

**让 AI 替你辩，和朋友一起点麦当劳。**

你想吃麦乐鸡，朋友想吃薯条。各自选中 `mcdebate` 技能，让两位 Agent 为自己的选餐立场辩一场；你们打开观战链接，看四条发言和 AI 裁判的结果，再决定买什么。点餐清单持续保留，可以先点餐、插入一局对战，再继续加购。

这是基于麦当劳官方 MCP 的参赛 Skill 项目，由自建房间 MCP 提供跨客户端协作与实时观战。适合一起点餐的朋友、情侣和同事。项目为独立参赛作品，非麦当劳官方产品。

- [mcdebate Skill 源文件](skills/mcdebate/SKILL.md)
- [Skill 版本、变更说明与导入包](skill-releases/README.md)
- [麦当劳 MCP 集成说明](MCP_INTEGRATION.md)
- [参赛声明](CONTEST_DECLARATION.md)

## 能做什么

- **两位 Agent 跨客户端协作**：房主创建房间，另一方用房间号或邀请加入；双方保留各自身份和凭证。
- **用真实门店与餐品选餐**：用户给出大概地点，Agent 调用官方 MCP 搜索门店，用户确认后锁定到店自取门店，再查询菜单、单品和价格。
- **实时观战、四条定胜负**：每局两轮、A/B 各两条发言，独立裁判评分并给出唯一胜者；网页自动滚动、展示等待动画，断线后可重新连接。
- **自由穿插点餐与对战**：维护共享点餐草稿和个人项目，支持多局；胜者只产生推荐，不自动加购或删除另一方餐品。
- **衔接真实点餐与支付**：指定付款人接受角色、核价并确认具体方案后，通过麦当劳官方 MCP 建单并提供官方链接。用户通过链接或官方页面二维码进入麦当劳 App，在购物车查看餐品并继续下单、支付。

观战网页只读；加购、改数量和结账由 Agent 按用户意图操作。这里的“清单”是项目自己的点餐草稿，并非麦当劳官方购物车。

## 安装与开始

### 1. 两边分别连接 MCP

每个参与选品的客户端启用以下服务：

| 服务 | 地址 | 传输方式 | 认证 |
| --- | --- | --- | --- |
| mcdebate 房间服务 | `https://47.243.195.171/mcp` | Streamable HTTP | 无服务级 Token 或自定义 headers；入房后使用自己的短期玩家凭证 |
| 麦当劳官方 MCP | `https://mcp.mcd.cn` | Streamable HTTP | 用户自己的麦当劳 MCP Token |

官方 Token 在 [麦当劳 MCP 开放平台](https://open.mcd.cn/mcp) 申请，接入方法见 [官方指南](https://github.com/M-China/mcd-mcp-server)。只把 Token 配置在客户端的私密认证设置中，不放进聊天、Skill、仓库或观战页面。

`/mcp` 是工具协议入口，不是观战网页。可以先访问 [服务健康检查](https://47.243.195.171/health)；观战地址由创建／加入工具实际返回。当前公网地址是临时 Demo 服务，不承诺长期保留；也可按 [部署说明](deploy/README.md) 自行部署。

### 2. 导入 mcdebate 技能

- 豆包 work：[下载 0.2.0 导入包](skill-releases/mcdebate/0.2.0/packages/mcdebate-doubao-0.2.0.zip)。在技能管理中选择上传技能，导入 ZIP。
- workbuddy：[下载 0.2.0 导入包](skill-releases/mcdebate/0.2.0/packages/mcdebate-workbuddy-0.2.0.zip)。进入“专家·技能·连接器 → 技能 → 添加技能 → 上传技能”，导入 ZIP。

完成后启用技能；手机端新建会话，手动选择 `mcdebate`，并确认两个 MCP 在当前会话可用。不同版本的客户端入口可能有差异，桌面端安装后要实际确认手机端是否可选。Skill 提供流程指引，不能强制宿主预加载 MCP 或持续后台执行。

### 3. 发起、加入、观战

发起方选中技能后发送：

> 开始。我支持麦乐鸡，对手支持薯条。

Agent 创建购物房间，返回房间号和观战链接；随后逐项询问缺少的地点、门店确认和选品信息。房主把双方分工同步到共享辩题，另一方不需要猜测房主私聊里的内容。

加入方选中技能后发送：

> 加入这个房间：〈房主给出的房间号或邀请链接〉

两边准备完成后，发送“开始对战”。双方 Agent 按回合提交发言，用户打开工具返回的完整 `watch_url` 观战。等待时持续调用 `get_room_state(wait_ms=5000)`；单次由服务器等待 5 秒，实际调用周期还包括宿主推理和网络耗时。

### 4. 决定买什么并结账

对战后可以继续说：

> 加一份中薯条。 / 麦乐鸡改成两份。 / 再来一局。

准备结账时说：

> 就按当前清单下单，给我支付链接。

Agent 推进付款人接受、固定清单和官方核价；用户确认具体门店、商品、数量、官方支持的取餐方式与最终金额后，才创建一次真实订单。已确认的同一有效方案不重复追问，报价变化则重新确认。创建成功后，只向付款人用户交付官方返回的链接。用户已验证通过官方链接或页面二维码可进入麦当劳 App，在购物车查看餐品，继续下单和支付；App 内的订单与支付操作由用户完成。

如果订单已创建，索要链接不会再建一单；提交结果未知时先查单。仅说“开始”或参与辩论不构成下单、付款授权。

## 当前验证范围

截至 **2026-10-15（北京时间）**，服务版本 **0.6.4**，Skill 版本 **0.2.0**。

| 内容 | 已验证范围 |
| --- | --- |
| 真实客户端 | 用户已用豆包 work 和 workbuddy 跑通手机端协作链路；新版 Skill 的四项反馈修正仍待手机端复测 |
| 官方查询与核价 | 开发联调已实际调用门店搜索、菜单、单品详情与核价 |
| 真实建单 | 开发联调已创建堂食／外带待支付订单各一份，并查询到待支付状态；不是模拟回执 |
| 官方 App 交接 | 用户已验证官方链接／页面二维码可进入麦当劳 App，在购物车查看餐品并继续下单、支付；订单、支付与取餐状态以官方 App 为准 |
| 房间与观战 | 公网 21 工具发现、创建／加入返回同一观战链接、网页 HTTP 200、5 秒等待、SSE、刷新与重连验证通过 |
| 自动检查 | 113 项代码测试、strict 类型检查、Workers/Node 构建及两种运行环境的 390/1280 页面检查通过；12 项 Skill 行为场景为独立模拟检查 |

本地 `fixture` 模式使用明确标注的测试资料与模拟交易；生产 `AGENT_REPORTED` 表示资料由 Agent 直连官方后上报，不能理解为模拟，也不代表后端独立核验了官方账户或支付结果。

仍在优化客户端工具发现、持续轮询、链接原样交付和立场同步。模型裁判可能超时或返回不合规范的结果，失败会明确展示，不伪造胜者；裁判评分是娱乐性选餐参考，不保证绝对客观。当前只做固定门店的到店自取，堂食／外带按官方核价选项确认，尚未接入外卖配送或套餐定制。

## 本地开发

需要 Node.js **22.18+**、pnpm **10.28.2**；CI 与服务器使用 Node.js 22.23.3。以下命令只安装、检查和运行本地服务，不创建麦当劳订单。

```sh
git clone https://github.com/PlonGuo/mcd-hackthon.git
cd mcd-hackthon
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
pnpm run build:node
MCDEBATE_PUBLIC_ORIGIN=http://127.0.0.1:8870 SHOPPING_DATA_MODE=fixture JUDGE_ENABLED=false node dist/node/server.mjs
```

健康检查：`http://127.0.0.1:8870/health`；本地 MCP：`http://127.0.0.1:8870/mcp`。服务仅监听本机；手机验收使用公网服务或自行部署的 HTTPS 地址。关闭裁判时可验证房间、页面和模拟结账，裁判会明确显示未配置，不生成虚假胜负。

需要完整模型裁判时，在不存在 `.dev.vars` 的情况下从 [示例](.dev.vars.example) 创建私密配置，填写 `DEEPSEEK_API_KEY`；已有文件只补充，不覆盖。默认模型为代码配置的 `deepseek-flash`，关闭思考模式。在另一轮启动中使用：

```sh
MCDEBATE_PUBLIC_ORIGIN=http://127.0.0.1:8870 SHOPPING_DATA_MODE=fixture JUDGE_ENABLED=true node --env-file=.dev.vars dist/node/server.mjs
```

裁判和模型开发测试会调用真实模型 API、消耗账户额度；`pnpm test` 不需要模型或麦当劳 Token。服务器不需要保存麦当劳账户 Token，官方业务由用户的客户端直连。

本地页面检查（保留上面的 fixture 服务，另一终端执行）：

```sh
pnpm exec playwright install chromium
BASE_URL=http://127.0.0.1:8870 pnpm run check:shopping-ui
BASE_URL=http://127.0.0.1:8870 pnpm run check:checkout-ui
```

也可使用原有 Workers 开发入口 `pnpm run dev:shopping`（默认 8790）。`pnpm run build` 只做类型检查和 Workers 部署 dry-run，`pnpm run build:node` 生成 Node 构建文件；两者不发布服务。独立模型测试、官方只读联调及真实建单工具的边界见 [MCP_INTEGRATION.md](MCP_INTEGRATION.md)。

## 实现与部署

```text
skills/mcdebate/       当前技能指令与按需读取的结账参考
skill-releases/       每次交付的版本快照、变更说明和平台导入包
src/mcp.ts            自建21个工具及MCP接入
src/shopping/         点餐草稿、多局对战、候选归属和结账状态
src/runtime/node/     Node运行时、SQLite持久化与超时任务
src/room-object.ts    房间控制器；Node和Workers复用业务规则
src/watch-page.ts     只读观战网页
scripts/lib/          官方查询/核价与真实建单适配
scripts/              开发测试、界面检查和显式联调入口
test/                 自动化测试
deploy/               服务器、Nginx、证书与发布说明
```

后端源码使用 TypeScript，MCP SDK 处理协议；普通服务器运行 Node.js + SQLite，Nginx 提供 HTTPS 与 SSE。Cloudflare Workers / Durable Objects 入口保留用于本地开发和可选部署。观战流推送已提交的完整发言，不是外部 Agent 内部逐字生成过程。

日常通过分支和 PR 修改；GitHub Actions 检查通过后，`main` 的同一提交才部署到服务器，健康检查失败回退旧版本。业务密钥、真实订单记录和运行数据不进入仓库。部署细节见 [deploy/README.md](deploy/README.md)。当前为单机创意 Demo，尚未按商业服务规模验收负载与长期可用性。

每次 Skill 交付在 [版本归档](skill-releases/README.md) 新增版本，历史版本不覆盖；当前源文件位于 `skills/mcdebate/`。

## 参赛材料

本仓库参与 [麦当劳程序员创意开发大赛](https://github.com/M-China/mcd-developer-innovation-challenge)。根目录提供比赛要求的 `README.md`、官方原样 `CONTEST_DECLARATION.md`、`MCP_INTEGRATION.md` 和项目源码。

`CONTEST_DECLARATION.md` 取自[官方原文](https://github.com/M-China/mcd-developer-innovation-challenge/blob/f50c8c8fa50516123ef6e5f8710d1ed72d563472/CONTEST_DECLARATION.md)，已逐字节核对，未改写。报名正文使用官方要求的字段格式：项目地址为裸链接，每个字段的标签与内容在同一行。[官方提交要求](https://github.com/M-China/mcd-developer-innovation-challenge#开发-skill)

`workbuddy.md` 是 WorkBuddy 专项奖励要求的真实开发对话材料，本轮未提供该文件，不把 WorkBuddy 作为客户端参与对战等同于使用其开发 Skill，也不编造开发记录。若申请该项奖励，需另行导出并审阅真实记录。配置、截图和提交材料不要包含真实凭证、支付链接或个人信息。`docs/` 为本地研发记录，按项目约定不发布；公开使用说明以根目录文档为准。
