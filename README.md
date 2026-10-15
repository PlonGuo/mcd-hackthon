# McDebate · 麦麦辩论局

让不同手机上的 Agent 代表真实用户，围绕共享餐品展开辩论，最终由付款人确认消费决定。

**本地0.6.0：TypeScript后端、持续清单/多局对战、付款人接受、结账核价/交接及模拟订单/支付已实现，新增独立的真实建单客户端。** 旧纯辩论模式保持兼容。正式结果只记付款人Agent上报，已真实创建外带/堂食待支付订单各一份，未执行支付；默认商品与订单均为明确标注的测试资料。开发模型默认OpenAI gpt-5-nano，DeepSeek暂不调用。线上仍0.3.1，阿里云与豆包/WorkBuddy验收留后。

本地研发资料见 [PRD](docs/PRD.md)、[CURRENT_STATUS](docs/CURRENT_STATUS.md) 和 [MCP 集成说明](docs/MCP_INTEGRATION.md)。`docs/` 按项目约定被 Git 忽略，仅保留在本地工作区；上述链接不会自动出现在新克隆的公开仓库中。

## 分支、CI与部署

GitHub公开仓库：<https://github.com/PlonGuo/mcd-hackthon>。

日常从`main`新建分支，提交后发PR；`CI / checks`通过后合并。主分支要求PR、最新CI成功和讨论解决，禁止强推/删除。个人开发不要求另一位审阅人批准；CI检查对管理员同样生效。

CI使用Node22.22.0和项目固定pnpm版本，无需业务密钥。执行索引发布安全检查、完整测试、strict类型检查和Wrangler打包dry-run，再用Playwright验证390/1280购物与模拟结账页面。不会调用真实模型/麦当劳交易或部署Cloudflare。`.dev.vars`、`.local`订单与凭证、运行数据、截图及本地`docs/`不发布。

阿里云部署尚未启用：当前Workers/Durable Objects需要先完成服务器运行适配，随后购买服务器、配置域名/HTTPS和部署凭据。目标为`main`通过同一CI后才部署该提交，失败保留旧版本并验证健康；PR只检查，不接触生产凭据。不把当前CI成功当作阿里云已部署。生产McDebate MCP与阿里云管理MCP分别配置：前者给豆包/WorkBuddy使用，后者给开发Agent管理基础设施。

## 本地运行

需要 Node.js 22.18 或以上、pnpm 10。无需麦当劳 Token，无需先登录 Cloudflare。

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run dev -- --var MCDEBATE_PUBLIC_ORIGIN:http://localhost:8787
```

打开 <http://localhost:8787/debug>。两个独立标签页可以模拟两个客户端；**此方式不替代真实双手机测试**。用直接打开的新标签页加入，避免浏览器“复制标签页”拷贝同一身份。

```sh
pnpm run smoke -- http://localhost:8787
pnpm run smoke:mcp -- http://localhost:8787/mcp
pnpm run smoke:watch -- http://localhost:8787
pnpm run build
```

`smoke` 创建两个测试房间，验证两客户端流程、并发加入、并发发言重试、越权拒绝、增量读取及关闭。退出码非零表示失败。

`build` 先做严格类型检查，再做打包和部署配置检查，不发布到 Cloudflare。生成的 `dist/` 和本地 `.wrangler/` 数据不会进入版本控制。

## 持续点餐与模型开发验收

```sh
pnpm run dev:shopping
# 另一终端，读取已经配置的 .dev.vars
pnpm run demo:model -- http://localhost:8790/mcp
pnpm run check:shopping-ui
```

`create_room` 增加 `mode:"shopping"` 才进入持续点餐；省略时仍为原纯辩论模式。Room、独立Battle与持续OrderDraft分别管理。购物模式准备/开局/发言携带battle_id；清单写入携带expected_draft_version/event_id。网页只读，判决后继续订阅SSE。目前共21个MCP工具，包括下述7个结账工具。

在已有 `.dev.vars` 追加 `OPENAI_API_KEY` 即可，勿覆盖或展示密钥。默认 `MODEL_PROVIDER=openai`、`OPENAI_MODEL=gpt-5-nano`；可用环境变量改模型。当前选择低成本开发模型；模型可用性和上线时版本另验。缺少OpenAI密钥不会回落DeepSeek；只有显式配置 `MODEL_PROVIDER=deepseek` 才使用其密钥。生产规则及金额计算由代码执行。

点餐操作由确定性测试场景经MCP执行；两个模型使用独立历史与凭证，各自生成发言并实际调用submit_argument，裁判由后端独立调用。用户确认由场景模拟，不称为模型自主规划点餐、真人确认或豆包/WorkBuddy验收。已真实验证“锁店→先点餐→第一局中改单→采纳建议→第二局”：10次模型请求、两次有效判决、3行清单、27次SSE，用时34.346秒。结果只保留公开房间数据，不保存玩家凭证。模型请求有步数/超时上限，临时429/503最多重试两次；裁判每局仍最多请求一次。固定测试资料不代表官方菜单或报价。

当本机OpenAI出站依赖代理时，只给测试进程设置已有代理。Node 22.22可通过 `NODE_OPTIONS=--use-env-proxy` 和 `HTTPS_PROXY` 使用它。普通Wrangler/workerd的出站与Node不同；`pnpm run test:server` 使用官方Wrangler Test Harness运行同一Worker和DO，模型出站沿用Node代理，控制台显示临时端口，`demo:model`传该端口。此测试环境数据临时保存在内存，不能当生产部署或重启持久化验收。

`check:shopping-ui` 通过Playwright在390px与1280px检查真实SSE、清单、历史、自动滚动、刷新恢复及纯文本显示；首次缺浏览器时运行 `pnpm exec playwright install chromium`。后端和脚本由strict TypeScript检查；测试文件也已迁为.ts，使用Node测试运行器执行。

## 本地结账验收

已有购物服务运行于8790时执行；不需要麦当劳Token，也不调用模型或真实交易接口：

```sh
pnpm run smoke:checkout -- http://localhost:8790/mcp
pnpm run check:checkout-ui
```

新增工具：`nominate_payer / accept_payer_role / prepare_checkout / get_checkout_package / report_checkout / cancel_checkout / simulate_checkout`。

房主提名付款人→候选本人接受→房主按当前清单版本准备结账→付款人领取固定门店和清单→核价→用户核对完整方案与最终金额→报告SUBMITTING后仅创建一次订单→查询确认→用户在官方页面付款。准备结账要求非空清单、无当前对战；期间冻结改单、新局和付款人。取消未领取方案或核实未下单后恢复点餐，已经创建的订单不能当草稿继续改。

所有 `report_checkout` 携带查询发起时的 `expected_checkout_version`；旧版本结果拒绝，不能把旧查询套上新版本。核价有效期3分钟，提交需对应 `quote_id` 和 `expected_total_cents`，60秒提交失联转UNKNOWN。UNKNOWN保持锁定，先查单，不能盲目重下。房间关闭/过期不取消官方订单；付款人仍可在房间过期后24小时内报告既有结果，不能重新核价或创建。观战链接按原30分钟结束。

默认 `SHOPPING_DATA_MODE=fixture`：模拟核价、创建、查单和付款均由 `simulate_checkout` 完成；`abandon` 放弃尚未提交的模拟结账，`create` 支持拒绝/超时但已创建/超时且未创建故障情景。页面始终显示“模拟订单”“模拟付款”，不扣钱。真实模式仅接收 `AGENT_REPORTED`，这不证明真人已审批或官方已付款；真实创建仍由付款人的官方MCP客户端执行，支付链接、官方订单号和账户凭证不进入公共房间。

本地已通过21工具发现、两套MCP身份、9阶段/19次SSE、390px与1280px页面检查及105项测试。证据在 `.superpowers/sdd/2026-10-15-checkout/`；这不是官方下单/支付验收，也不是用户真人确认。

对齐官方接口时，在已有 `.dev.vars` 私密追加 `MCD_MCP_TOKEN`，运行 `pnpm run probe:mcd`。脚本固定连接 `https://mcp.mcd.cn`，只握手和读取8个相关工具的定义，业务调用为0；不会核价、创建/取消订单或付款。定义保存至证据目录。2026-10-15已通过官方只读联调，门店1450601、麦乐鸡5块和中薯条各1，核价2750分；未调用官方写工具。没有公开沙箱资料时，不把官方接口当模拟接口。不要覆盖已有环境文件或把Token发到聊天。

## 官方只读联调（不创建订单）

官方Token已配置后，可用独立8791环境显示Agent上报的真实商品与核价，避免混入8790测试来源房间。首个命令在独立终端运行：

```sh
pnpm run dev:official-readonly
pnpm run demo:mcd-readonly --city 上海 --keyword 虹口四川北路 --store 1450601 --products 1401,4810
```

门店编号必须是用户从官方搜索中确认的门店；脚本核对搜索结果，查询菜单与两个单品详情，再用冻结清单调用calculate-price。仅支持默认、无套餐/特制的单品；其它结构明确拒绝，不猜组合。菜单currentPrice为元字符串，核价price为整数分，分别校验转换。真实提交还必须从官方takeWayList选择堂食或外带，不能自行填写默认值。

脚本只开放门店/菜单/详情/核价四项只读工具，拒绝下单、取消、领券和历史账户查询；本地流程停在QUOTED。使用一个官方账户及两套本地测试身份，不声称两个真实用户、真人消费授权或客户端验收。生成official-readonly-result.json及390/1280截图，只保留白名单；房间仍标AGENT_REPORTED，不能宣称后端独立验证。后续真实下单须再次核价、展示具体订单并取得明确确认；用户自行在官方页面付款。

## 真实建单客户端（0.6.0）

`mcd:order` 在付款人本地直连官方MCP，公共房间不代理官方账户。已实现重新核价、单次创建、保留官方支付链接、查单与取消状态同步；用户自行付款。2026-10-15按用户选择分别真实创建盛邦店外带/堂食订单，各含麦乐鸡5块＋中薯条各1，均¥27.50；官方查单均“待支付”。用户已确认本阶段验收通过：iAgent负责建单并返回官方支付链接，后续支付交给麦当劳App；不要求真实扣款或取餐，不重复建单。

已有 `.dev.vars` 的 `MCD_MCP_TOKEN` 继续使用。先运行 `pnpm run dev:official-readonly`，再由执行方按用户确认的城市、关键词、门店、商品和方式运行 `pnpm run mcd:order --operation prepare`（参数为 `--city/--keyword/--store/--products/--take-way`）。prepare只读官方数据并生成3分钟有效的私密方案。展示完整方案后，submit必须同时提供 `--plan` 文件和匹配的 `--confirm-plan` 摘要；query只需 `--plan`。不要把旧方案或样本当作消费授权。

方案、付款人房间凭证与官方回执仅写入 `.local/mcd-order/`（目录0700、文件0600），不得提交、分享或截图。每单SQLite记录在网络请求前占位，同一checkout重启后也拒绝再次创建；建单进程存活时查单不能覆盖回执，进程退出后仅核对。超时/错误/空历史保持UNKNOWN，不自动重下。官方未提供幂等键，不能承诺网络层恰好一次；丢失订单号的未知结果仍需付款人核对官方记录。

官方取消后报告ORDER_CANCELLED，单独显示；不冒充未下单或退款完成。客户端没有付款/取消调用。`pnpm run check:order-ui` 在8791用**模拟官方回执**检查真实HTTP/MCP、SSE与390/1280页面，不调用麦当劳、不扣款，不能当真实支付通过。当前105项测试、strict与build通过；真实建单两单、查询待支付及两单390/1280页面均已通过，支付与取餐交给麦当劳App，按用户确认不再列为Demo验收项。

## 公网 HTTP 与可选手机验收

准备好部署时，在你自己的 Cloudflare 账户操作：

```sh
pnpm exec wrangler login
pnpm run deploy
pnpm run smoke -- https://你的实际地址.workers.dev
```

1. 两台手机分别打开实际公网地址的 `/debug`。
2. A 创建两人房间，只分享房间号；B 用自己的名称加入。
3. 两人点“准备”，A 点“房主开局”。
4. 依次发送 A → B → A → B 四条观点，新两人四条 Demo 的回合掉线兜底 120 秒。
5. 检查两边顺序一致、非当前玩家不能发言、B 不能启动或关闭房间。
6. 刷新页面，检查本人身份和房间记录恢复。
7. 用中国大陆实际手机网络测试可达性和延迟，把证据与 URL 写入 CURRENT_STATUS。

2026-10-13 已发布 HTTP 房间服务：<https://mcdebate-room-poc.jason-ghzr.workers.dev>，公网 HTTP smoke 通过。用户决定本阶段先验收两个桌面 Agent；上述双手机和大陆无 VPN 网络测试后补。新增 `/mcp` 已发布到同一地址并通过公网检查。

## 最小房间 MCP（本地与公网已验证）

本地地址 `http://localhost:8787/mcp`，公网地址 `https://mcdebate-room-poc.jason-ghzr.workers.dev/mcp`，采用 Streamable HTTP；复用当前 HTTP 房间和 Durable Object。线上0.3.1仍有七工具，本地0.6.0有21工具。原工具为 `create_room / join_room / set_ready / start_debate / get_room_state / submit_argument / close_room`。

创建/加入返回本人的 `player_token`，后续工具参数显式携带它；连接时不使用 Cloudflare 或麦当劳账户 Token。状态返回 `next_action / next_request / allowed_actions`，模板不含凭证，需要客户端加入自己的凭证。等待传 `wait_ms=2000`，读取完整消息用 `since=0`。工具仍由服务端验证权限、回合和重试。

只读状态和模板不广播凭证；创建/加入的私密结果及后续工具参数仍会被当前宿主看到。注册结果未知时停止，不自动重试占席。公网仍是小范围 POC，没有生产限流、正式注册恢复或数据清理。

仓库提供 [McDebate Skill](skills/mcdebate/SKILL.md)。豆包与 WorkBuddy 的配置、启动指令和反馈步骤见本地 [AGENT_START](docs/AGENT_START.md)；其中公网 MCP 配置已可用于接入验证。脚本中的固定观点是测试数据，不代表真实 Agent 已自动交锋。

## HTTP 接口

所有响应都禁止缓存。成功格式为 `{ "ok": true, "data": ... }`；错误包含 `code`、`message`、`expected_action`、`retryable`。

| 方法 | 路径 | 参数与权限 |
|---|---|---|
| GET | `/health` | 无认证，返回服务标识 |
| GET | `/debug` | 同源调试页面 |
| POST | `/rooms` | `name`、`topic`；可选 `expected_players`（默认 2）、`max_turns`（默认 4）、`agent_label` |
| POST | `/rooms/:id/join` | `name`、可选 `agent_label`；仅等待阶段且有空位 |
| POST | `/rooms/:id/ready` | `ready: boolean`；本人凭证 |
| POST | `/rooms/:id/start` | `{}`；仅房主、全员 Ready 且近期在线 |
| GET | `/rooms/:id/state?since=N` | 本人凭证；游标默认为 0 |
| POST | `/rooms/:id/say` | `turn_id`、`event_id`、`text`；当前玩家 |
| POST | `/rooms/:id/close` | `{}`；仅房主 |

POST 请求使用 `Content-Type: application/json`，最大 16 KiB。名称最多 40 字，辩题和发言最多 200 字。不支持的字段和错误类型会被拒绝。

新版本创建/加入成功返回 `data.room`、`data.player_id`、`data.player_token` 和同一 `data.watch_url`。后续请求携带：

```text
Authorization: Bearer <你自己的 player_token>
```

这不是麦当劳账户 Token。其他成员不能看到你的凭证，服务器只存储 SHA-256 摘要。房间号是加入邀请，不能当成玩家身份。

`state` 总是返回当前房间信息，`arguments` 和 `events` 只返回 `sequence` 游标之后的增量。拿到最新 `data.room.sequence` 后作为下一次 `since`；要恢复完整记录时使用 `since=0`。

发言读取当前 `current_turn.turn_id`，生成唯一 `event_id`。网络失败重试时保留原事件 ID、回合 ID 和文本。相同内容只记录一次，冲突事件返回 `EVENT_CONFLICT`；最后一条发言结束后仍可重试确认。

## POC 状态与限制

```text
WAITING → READY → ACTIVE → FINISHED
                   └── 回合超时 → PAUSED
房主可关闭 → CLOSED；创建 30 分钟后 → EXPIRED
```

- 2–4 人，2–12 条发言，按加入顺序轮流发言。这里只验证通信，不代表正式两位辩手的比赛编排。
- 全员最近 30 秒内有有效活动才允许开局；调试页每 2 秒轮询。
- Durable Object Alarm 和请求时检查共同执行回合超时/房间过期；暂停不能恢复，要新建测试房间。
- SQLite-backed Durable Object 保存房间；本地开发数据位于 `.wrangler/`，重启开发服务后仍可读取。
- 调试页凭证保存在当前标签页 `sessionStorage`；刷新可恢复，关闭标签页后可能丢失。创建/加入请求本身尚不支持凭证恢复。
- 本 POC 没有公网资源限流、正式身份注册、过期数据清理或生产审计；过期后停止操作，但数据尚未自动删除。适合小范围验证。
- 仅浏览器通信成功不能证明手机 Agent 可以持续自动轮询。POC 2 必须单独验证。

## 文件结构

```text
src/core.ts          房间规则、权限、时间和脱敏快照
src/http.ts          JSON 校验、认证和响应
src/room-service.ts  HTTP/MCP 共用房间路由和固定动作映射
src/mcp.ts           21个 MCP 工具、协议入口和等待/错误处理
src/shopping/        持续清单、多局对战与结账规则
src/agent-view.ts    当前玩家的下一步提示和稳定发言模板
src/index.ts         Worker 路由及 Durable Object 持久化
src/debug-page.ts    浏览器调试页、同源脚本和样式
test/                Node 内置测试
scripts/smoke.ts     实际 HTTP 冒烟测试
scripts/mcp-smoke.ts 实际 MCP 协议与两客户端集成检查
skills/mcdebate/      最小房间辩论 Skill
wrangler.jsonc       Cloudflare 本地/部署配置
.vscode/mcp.json     VS Code 的官方麦当劳 MCP 输入提示配置
mcp-config.example.json  通用 MCP 脱敏示例
docs/                本地 PRD、持续交接记录与 MCP 集成说明（Git 忽略）
```

## MCP 配置与后续

POC 1 不使用上述麦当劳 MCP 配置。其凭证和宿主差异见本地 [MCP 集成说明](docs/MCP_INTEGRATION.md)。不要把真实 Token 写进仓库。

Cloudflare 配置按 [SQLite-backed Durable Object 官方文档](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) 使用 `exports` 声明。

下一阶段须先证明两个真实 Agent 能连续自动回应，再接只读麦当劳事实、独立裁判、多 Topic 和共享草稿。真实 `create-order` 只能在指定付款人明确确认后进行。当前尚未补齐完整参赛材料，尤其官方原样 `CONTEST_DECLARATION.md` 需要在正式参赛准备时获取。

`docs/MCP_INTEGRATION.md` 当前是本地研发记录。正式参赛前须整理并导出一份脱敏、描述实际实现的公开 `MCP_INTEGRATION.md`，按届时核对的比赛要求发布；本地忽略的文件不算已经交付。此次没有创建公开副本或发布仓库。

## 观战与 DeepSeek 裁判（新版本已发布）

新 MCP Demo 固定两人、四条发言。create/join 返回只读 watch_url；观众不占玩家席位，也不更新玩家在线时间。网页通过 SSE 展示已提交的完整发言，中途进入/重新连接加载完整记录；不会取得宿主模型内部逐字输出。

首次运行可复制 `.dev.vars.example` 为 `.dev.vars` 并填入 `OPENAI_API_KEY`，不要把密钥发到聊天或提交。已存在的 `.dev.vars` 不要覆盖。Cloudflare 官方支持该文件作为本地私密配置。当前默认OpenAI gpt-5-nano；裁判每局只调用一次，最大预算60秒，结构校验后计算总分与胜者。没有密钥或模型失败时显示失败，不虚构判决。

`FINISHED` 只表示发言封存；`judgement.status=PENDING` 继续等待，`SUCCEEDED` 包含真实评分，`FAILED` 只有脱敏失败码。页面不把模型判决描述为绝对客观。高分者胜；同分由裁判在同一次评分中给出唯一胜者与决胜理由，保留原始分数。观战页新增消息/判决时自动滚动，当前回合显示等待点动画；重复快照不重复滚动，断线/暂停/结束隐藏等待动画。

本地检查会创建测试房间；开启裁判且配置真实密钥时，两人四条流程会调用真实API并消耗账户额度。仅验证房间通信时启动 `pnpm exec wrangler dev --port 8787 --var MCDEBATE_PUBLIC_ORIGIN:http://localhost:8787 --var JUDGE_ENABLED:false`；真实裁判需去掉该覆盖项。公网发布前另外配置同名 Cloudflare Secret，本地密钥不会自动成为线上 Secret。

当前购物开发预览使用 http://localhost:8790（模型代理测试环境使用控制台给出的临时端口）；公网服务已升级至0.3.1。观战链接有效期与房间一致，当前30分钟。持链接者可以看公开对局；玩家token、账户Token、地址与支付信息不进入观众视图。

2026-10-14 用户报告手机关闭 VPN/Wi-Fi 后蜂窝网络访问公网 `/health` 超时。当前 `workers.dev` 地址的该条直连验收失败；公网开发侧检查不能冒充大陆无 VPN 可用性。自有域名复测或国内部署评估见 `docs/CURRENT_STATUS.md`。

本地源码0.3.2已关闭裁判默认长推理，修复真实调用偶发输出截断；50项测试与一次真实同分决胜回归（60/60，唯一胜者）通过。线上仍为0.3.1，本项修复按用户“部署最后处理”的指令留待统一发布。

本地最新0.3.3：用户已确认自动滚动/等待点正常。实时测试暴露裁判分数与条件式决胜不一致导致非法结果；现改为模型始终给备用decision，服务端计算总分并仅在同分时采用。原失败局保留，新局同一输入真实复测72/73、唯一胜者与SSE通过，52测试与构建通过。线上仍0.3.1，按用户要求到最后统一部署。
