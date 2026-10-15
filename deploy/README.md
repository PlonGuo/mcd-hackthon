# 阿里云单机部署

Node 22.23.3 + SQLite + Nginx，适用于当前单机 Demo。`src/runtime/node/` 提供持久化、每房间串行执行、后台裁判、超时任务和 HTTP/SSE 接入；复用同一套业务代码。Cloudflare 入口继续保留。不要启动多个 Node 进程共享数据库；运行时持有 SQLite 独占锁，第二个进程会明确失败。

## 首次安装

1. Ubuntu 24.04 安装 Node 22.23.3、Nginx、Python venv；`/opt/certbot` 安装 Certbot 5.4 以上。Node 官方二进制需按官方 SHASUMS256 校验。
2. 创建普通系统用户 `mcdebate`，准备 `/srv/mcdebate/releases` 与 `/var/lib/mcdebate`。发布文件和数据分开存放，目录属主为该用户；将公网IPv4写入 `/srv/mcdebate/public-host`，root属主、0644，供发布时HTTPS健康检查使用。
3. 将 `server.env.example` 的配置填写到服务器 `/etc/mcdebate/server.env`，权限 0600、root 属主。仅需 DeepSeek Key；无需上传本机 `.dev.vars`、OpenAI Key 或麦当劳 Token。
4. 公网 IP 申请 Let's Encrypt `shortlived` 证书，先做 `--dry-run`。Certbot 使用 `--webroot -w /var/www/acme --ip-address IP`，然后配置 `nginx.conf.template` 的 `SERVER_IP`。80 端口保留 ACME 验证，443 反向代理到本机 8870，关闭 SSE 缓冲。不记录包含观战凭证的访问 URL。
5. 安装 `mcdebate.service`，以及证书续期 service/timer；Nginx 配置必须先 `nginx -t`。本目录的 `certbot-renew.*` 安装为 `mcdebate-certbot-renew.*`，timer 已指定对应 Unit。
6. 安装 root 属主、不可由应用用户改写的 `/usr/local/bin/mcdebate-receive-release`（来自 `receive-release.sh`）。该用户只允许通过 sudo 执行固定的 `systemctl restart mcdebate.service`。
7. 独立生成 CI SSH key；公钥在 `mcdebate` 的 `authorized_keys` 用 `restrict,command="/usr/local/bin/mcdebate-receive-release"` 限制。首次通过云助手核对服务器 SSH host fingerprint，再保存 known_hosts；不能在 CI 临时扫描并无条件信任。

## GitHub 配置

仓库变量：`DEPLOY_HOST` 为服务器 IP。仓库 Secrets：`DEPLOY_SSH_KEY` 为受限部署私钥，`DEPLOY_KNOWN_HOSTS` 为已核对的服务器 host key；业务 Key 只留在服务器。

`main` 的 CI checks 通过后，同一个 workflow 的 deploy job 重建对应提交、通过受限 SSH 传输构建文件；PR 不接触部署凭据。发布锁持有期间，公网HTTPS健康检查必须返回本次完整SHA；启动失败、健康检查失败或正常终止信号均触发回退并校验旧SHA。CI从GitHub侧复核失败时，只能调用受限的 `rollback SHA` 恢复当前同一提交，不开放任意命令。首次部署没有旧版时会明确报告无法回退。已接收的SHA不覆盖；失败后修复并创建新提交再部署。SQLite 数据目录不随发布覆盖。独占部署锁避免并发切换。

手工回退已有版本时，由管理员把 `/srv/mcdebate/current` 切回上一发布目录，再重启服务并核对 `/health` 的 `release`。当前不做数据库破坏性迁移；今后修改数据格式时，必须先增加兼容与备份方案，不能只靠代码回退。

## 验收

- `pnpm test`、`pnpm run build:node`、`pnpm run build`。
- Node fixture 环境运行 `check:shopping-ui`、`check:checkout-ui`；均使用本地模拟数据，不创建真实麦当劳订单。
- 公网 `/health`、MCP 初始化与 21 工具发现、房间加入/实时观战/裁判；重启服务后房间、凭证和观战快照保留。
- 用户关闭 VPN，从移动网络和 Wi-Fi 打开公网 HTTPS；豆包、WorkBuddy 添加 `/mcp`，再确认工具发现。开发机成功访问不能代替这一步。

这是单机部署，重启会短暂断开 SSE，网页会重连；房间不会迁移到旧 Cloudflare 服务。服务器到期后 IP、房间数据和证书续期均不可继续依赖；到期前保存需要的公开演示材料。
