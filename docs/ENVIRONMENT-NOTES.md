# 环境备忘 · 网络出口 / 代理 / 工具链

> 本文件是 Hindsight 记忆之外的**明文件兜底**。事实以本文件 + 记忆双写为准。
> 最后更新：2026-09-02

## 1. 宿主机 clash 代理（关键）
- 宿主机（容器网关）运行 clash，**出口代理端口 = 7897**。
- 容器内访问路径：`http://172.21.0.1:7897`（HTTP CONNECT 代理）。
  - 注意：容器自己的 `127.0.0.1:7897` 无监听；必须走网关 IP `172.21.0.1`。
- 验证方式（curl 未安装，用 node）：
  ```js
  // CONNECT 隧道测试
  net.connect({host:"172.21.0.1",port:7897}) → 写 `CONNECT <host>:443 HTTP/1.1...`
  ```
- 已实测通过该代理可达（CONNECT → 200）：`api.github.com`、`codeload.github.com`、
  `objects.githubusercontent.com`、`registry.npmjs.org`、`nodejs.org`、`hf-mirror.com`。
- 已实测端到端：经代理 TLS GET `api.github.com` → 返回 `403 rate limit exceeded`
  （未经认证的公共出口限流，属正常，证明 HTTPS 层真实打通）。

## 2. 直连（不走代理）现状
- `registry.npmjs.org` 直连可用（node fetch 拉过 15MB tarball）。
- `hf-mirror.com` 直连可用；`huggingface.co` 直连**不可达**（走代理或 hf-mirror）。
- `git+ssh://git@github.com` 22 端口**不通**（Host key verification failed / 网络限制）。
- GitHub HTTPS 直连：未系统验证，**建议一律走 7897 代理**。

## 3. 怎么用这个代理（按需，不必全局）
```bash
# npm / pnpm / node-gyp 下载头文件等
export HTTPS_PROXY=http://172.21.0.1:7897
export HTTP_PROXY=http://172.21.0.1:7897
export NO_PROXY=localhost,127.0.0.1,172.21.0.2,172.21.0.1
# git（http/https 协议）
git config http.proxy http://172.21.0.1:7897
# node 原生 fetch 默认不读 proxy 变量；需自建 tunnel（见第 1 节）
```
⚠️ 本地 Hindsight daemon（127.0.0.1:9077）、postgres（127.0.0.1:5432）**直连都正常**，
别被代理劫持；要全局设代理必须配好 NO_PROXY。中转 LLM 配置见第 10 节（旧 aiapi.syuan.org 已弃用）。

## 4. 编译工具链（已装好，2026-09-01）
- 容器内已装：**g++/gcc 12.2.0（Debian 12）、make 4.3、python3 3.11**。
- apt 源已切清华镜像：`/etc/apt/sources.list.d/debian.sources` →
  `http://mirrors.tuna.tsinghua.edu.cn/debian`（deb.debian.org 直连 DNS 不稳定）。
- nodejs.org 直连可达（HEAD 200），node-gyp 能直下 node v24.19 头文件（缓存 `$XDG_CACHE_HOME/node-gyp/24.19.0`）。
- `curl` 仍未安装；用 `node` 的 fetch / net / tls 替代。
- **已知案例已解决**：`node-pty@1.1.0` 官方 tarball 只带 darwin/win32 预编译（无 linux-x64），
  现已在容器内从源码编译成功（`build/Release/pty.node`），node v24 加载正常。
- 编译原生模块的套路：确保 g++/make/python3 在 PATH，需要碰 GitHub 时设
  `HTTPS_PROXY=http://172.21.0.1:7897`（NO_PROXY=localhost,127.0.0.1）。

## 5. 相关服务 / 端口
| 服务 | 地址 | 说明 |
|---|---|---|
| DSH Web GUI | 127.0.0.1:3081 | 本会话界面 |
| Hindsight 本地 daemon | 127.0.0.1:9077 | 记忆后端，boot 钩子自启 |
| postgres (pg0) | 127.0.0.1:5432 | 记忆数据落盘 /home/node/.pg0 |
| clash 代理 | 172.21.0.1:7897 | 宿主机，出网用 |

## 6. 持久化启动
- `/home/node/.hindsight/start-hindsight.sh {start|stop|status}`：幂等拉起 postgres + daemon。
- 开机钩子：`/usr/local/bin/docker-entrypoint.mjs` 里 `startHindsightDaemon()`（detached+unref，非致命）。
- 进程均为 root 起，daemon/postgres 以 `node`(uid 1000) 运行。

## 7. @linxin666/dsh-web-all 安装现状（2026-09-01）
- ✅ 已装 + 已登记：profile `/home/node/.dsh/profiles/web`，node-pty 1.1.0 / ssh2 / cpu-features 源码编译成功，
  node v24 加载正常；bundles 已含 `@linxin666/dsh-web-all`（下次 web 进程重启后生效）。
- ⚠️ 遗留：cloudflared@0.7.3 的 postinstall 未真正下到二进制（bin/ 空，`bin install` 经代理仍卡 ~60s）。
  仅影响"远程 web-ui 隧道"运行时功能，核心功能不受影响。
- 安装链路：`pnpm add -w <pkg>`（构建批准在 pnpm-workspace.yaml 的 `allowBuilds:` 块）→
  `node <dsh>/lib/bin.js plugin add <pkg> --profile web`（登记 bundles + 同步清单）。

## 8. dsh-vision-router（2026-09-02，从 git 装）
- 来源：`git clone --depth 1 https://github.com/ysr666/dsh-vision-router.git /home/node/dsh-vision-router`（走代理）。
- 登记：`dsh plugin add file:/home/node/dsh-vision-router --profile web`（deps + bundles 都进）。
- 纯 web 客户端 bundle，无原生模块。cordis entry id = `vision-router`。
- 注意：之前那次 `dsh plugin add dsh-web-all` 的 pnpm 整理（Packages:-13）把它从 deps/bundles 里清掉了，这次补回。

## 9. pnpm minimumReleaseAge 供应链策略（易踩坑）
- 该 profile 的 pnpm v11 对"发布时间 < cutoff 的包"直接拒绝（ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION）。
- @linxin666/dsh-web-all@0.3.12 家族 2026-09-02 才发布，所以**任何 pnpm 操作都会撞墙**。
- 绕过：加 flag `--config.minimumReleaseAge=0`（dshmarket 内部 RELEASE_AGE_OVERRIDE 就是它）。
  例：`dsh plugin add --config.minimumReleaseAge=0 <target> --profile web`。

## 10. LLM 中转站切换（2026-09-02）
- 旧中转 `aiapi.syuan.org/v1`（deepseek-v4-flash-0731）已死：一次调用卡 242s、再返回 HTML 错误页，
  导致 daemon worker 卡死 ~77 分钟。
- 新中转（用户指定，记录在**宿主机** `/host/root/token.md`）：
  - base_url = `https://mxzzz.xyz/v1`（OpenAI 兼容 chat/completions）
  - model = `gpt-5.6-sol`；key 在 token.md（`key1:` 行）
- 已写入 `/home/node/.hindsight/profiles/coding-agent.env`（chmod 600）。
  验证：/models 含 gpt-5.6-sol、/chat/completions 实测 OK、consolidation 35-60s/批跑完。
- token.md 里另有 GitHub PAT（`github:tokrn:ghp_...`）备用（后续 git 认证可用）。
- ⚠️ uv 权限坑：`/home/node/.dsh` 曾变 `0700 root` → daemon 起不来（`env: .../uv: Permission denied`）。
  已 `chmod o+x /home/node/.dsh`；启动脚本 `prepare_paths` 现会自动确保 .dsh 链路可穿越。