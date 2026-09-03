# AI 咒语图库站 · 交接文档（HANDOFF）

> 给接手模型的快速交接：当前唯一权威文档是 **`DOCUMENTATION.md`**（功能/文件/API/数据模型/部署全量参考，与源码一致，2026-09-03 更新）。
> 本文档只保留「接手必读」的快速地图 + 与旧交接的差异说明。
> 交接时间：2026-09-03

---

## 0. 一句话现状

**项目已完成登录/注册/整站门控、作者/删除权限、头像下拉菜单 + 个人资料，全部部署到 2号机 hk-2（systemd `aitag-site.service`，公网 `http://154.12.28.103:3100`）并验证通过。**
功能开发已**暂停**，先补文档（本文件 + `DOCUMENTATION.md`）。下一步想做的是用户/作者详情页。

---

## 1. 必读文档

| 文档 | 内容 |
|---|---|
| **`DOCUMENTATION.md`**（本仓库根） | ✅ 功能清单 / 文件用途 / 全部 API / 数据模型 / 部署流程 / 注意事项 —— **以此为准** |
| `login-register-progress.md` | 登录/注册线进度细节（含自测小抄、admin 生成、账户信息） |
| `ENVIRONMENT-NOTES.md` | 环境备忘（容器/网络/工具链） |
| `OUTLINE*.md` | 早期产品蓝图（已过时，仅历史参考） |

---

## 2. 访问与运行

| 项 | 值 |
|---|---|
| **生产部署**（2号机 hk-2） | systemd `aitag-site.service`（Next，内部 **3101**），Caddy 反代 3100+443 |
| **公网 HTTPS** | `https://juocho.kdns.fr` 或 `https://juocho.kdns.fr:3100`（Let's Encrypt） |
| 源码 | 容器 `/root/dsh-work/site/`（git，remote=GitHub `LinYoNv/aitag-site` 分支 `main`） |
| 线上数据库 | `/root/aitag-deploy/data/aitag.db` |

**服务管理**：
```bash
systemctl status aitag-site     # Next 站（内部 3101）
systemctl status caddy          # HTTPS 反代（3100+443）
systemctl restart aitag-site    # 部署新构建后
systemctl reload caddy          # 改 Caddyfile 后
```

---

## 3. 部署流程（改代码后上线）

1. 容器内改代码 → `npx next build`
2. `git add -A && git commit && git push origin main`
3. 2号机：`cd /root/aitag-site && git pull origin main && npx next build`
4. 2号机部署：
   ```bash
   rm -rf /root/aitag-deploy/.next
   cp -r .next/standalone/.next /root/aitag-deploy/.next
   cp .next/standalone/server.js /root/aitag-deploy/server.js
   mkdir -p /root/aitag-deploy/.next/static && cp -r .next/static/. /root/aitag-deploy/.next/static/
   ```
5. `systemctl restart aitag-site`（Caddy 无需动，仍反代到 3101）
⚠️ **必须拷 `.next/static`**（standalone 不含它）；⚠️ **不要覆盖** `/root/aitag-deploy/data/` 与 `public/images/`。
💡 部署后访问 `https://juocho.kdns.fr` 验证。

---

## 4. 与旧交接的差异（重要，旧 HANDOFF 已作废）

- **旧版（2026-09-01）** 讲的是「部署到容器宿主机 1号机，NAT `110.42.14.233:38778`，无登录」。
- **当前真实情况**：
  - **真正部署目标是 2号机 hk-2**（`154.12.28.103`，systemd），不是 1号机/容器宿主。
  - 1号机 NAT `110.42.14.233:38778` 是**旧版，弃用不管**（用户拍板）。
  - 网关 `172.21.0.1:3100` 也是旧版，非目标。
- 认证、头像、权限均已上线（见 `DOCUMENTATION.md` §3-4）。

---

## 5. 账号与凭据（敏感）

- **admin**：用户名 `admin`，密码存容器 `/root/dsh-work/.admin-cred.tmp`（chmod 600，`ADMIN_PASS=<pass>`）。2号机生产库已有该 admin。
- GitHub 推送：容器 `credential.helper=store --file=/tmp/.git-cred-ok`。
- `SEARCH/TAVILY key` 已失效不可用；`web_search` 工具在容器不可用（DeepSeek API 404）——查资料用 GitHub API。

---

## 6. 待办 / 路线（留档）

1. **（下一步）用户/作者详情页**：参考 Serika.art（`/user/[username]` + `/api/users/[id]`），按 `works.author_name` 聚合（`WHERE author_name=? ORDER BY create_date DESC`）。调研详见 `login-register-progress.md` §7.5。
2. （可选）头像从下拉菜单直接上传（当前入口在 `/profile`）。
3. （可选）详情页作者名链接到作者页（配合待办 1）。
4. 中英切换、独立月榜页 = **废案**（用户拍板不做）。

---

## 7. 快捷命令

```bash
# 2号机线上测试小抄（本机 127.0.0.1:3100 或公网）：注册→登录→me→上传→登出
node -e "..."  # 详见 login-register-progress.md §8
# 容器 build 冒烟：nohup env PORT=3199 HOSTNAME=0.0.0.0 node .next/standalone/server.js &
```