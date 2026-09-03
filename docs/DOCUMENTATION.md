# AI 咒语图库站 · 项目文档（DOCUMENTATION）

> 本文档描述项目**当前实际状态**（与源码一致），是功能/文件/API 的权威参考。
> 配套文档：`HANDOFF.md`（部署交接）、`ENVIRONMENT-NOTES.md`（环境备忘）、`login-register-progress.md`（登录注册线进度）。
> 最后更新：2026-09-03

---

## 1. 项目是什么

自建「AI 绘画作品 + Prompt 咒语」检索图库站：
- 面向群友的 AI 绘画作品图库，核心价值是详情页展示每张图的**完整生成参数**（prompt / 负向 / sampler / seed 等）
- 支持**多图作品**（共用标题合并，每图独立参数）
- 支持上传 PNG（浏览器端解析 NovelAI 内嵌元数据自动填表）或 JPG/WebP 手动填
- 有**登录/注册**体系：整站登录门控（未登录跳 `/login`）、开放注册、上传必须登录、删除带权限
- 有**头像**体系：可上传头像（无则默认图标）、个人资料页

**当前技术栈**：Next.js 15.5.25（App Router）+ TypeScript + Tailwind CSS v4 + SQLite（Node 内置 `node:sqlite`，零编译依赖），无外部字体/无第三方 multipart 包。

---

## 2. 运行与访问

| 项 | 值 |
|---|---|
| 生产部署（2号机 hk-2） | `/root/aitag-deploy/`（standalone，systemd 服务 `aitag-site.service` 监听 **127.0.0.1:3101** 内部端口） |
| 源码（容器 1号机） | `/root/dsh-work/site/`（git 仓库，remote=GitHub `LinYoNv/aitag-site`） |
| **HTTPS 域名**（Caddy 反代） | **`https://juocho.kdns.fr`** 和 **`https://juocho.kdns.fr:3100`**（Let's Encrypt 证书，2026-09-03 配置） |
| 旧 IP 直连 | ~~`http://154.12.28.103:3100`~~ → 3100 已被 Caddy 占用走 HTTPS；明文 `http://` 访问 3100 会 400 |
| 线上数据库 | `/root/aitag-deploy/data/aitag.db`（2号机） |
| Node 版本 | 2号机 v24.20.0；容器 v24.19.0（均内置 `node:sqlite`） |

**HTTPS 反向代理（2号机，2026-09-03）**：
- 装了 **Caddy 2.6.2**（`/usr/bin/caddy`，systemd `caddy.service`）
- Caddyfile：`/etc/caddy/Caddyfile`（备份 `/etc/caddy/Caddyfile.bak`）
  ```caddy
  {
    email admin@juocho.kdns.fr
  }
  juocho.kdns.fr {          # 443 HTTPS
    encode gzip
    reverse_proxy 127.0.0.1:3101
  }
  juocho.kdns.fr:3100 {     # 保留 :3100 HTTPS
    encode gzip
    reverse_proxy 127.0.0.1:3101
  }
  ```
- **Next 内部端口改为 3101**（原 3100 让给 Caddy）：`/etc/systemd/system/aitag-site.service` 的 `Environment=PORT=3101`（备份 `/root/aitag-site.service.bak`）
- Let's Encrypt 自动签发/续期 `CN=juocho.kdns.fr`，443 和 3100 同证
- `http://juocho.kdns.fr`(80) → 308 跳 HTTPS；3100 明文 HTTP → 400（只走 TLS）

**2号机服务管理**：
```bash
systemctl status aitag-site     # Next 站本身（内部端口 3101）
systemctl status caddy          # HTTPS 反代（3100 + 443）
systemctl restart aitag-site    # 部署新构建后重启 Next
systemctl reload caddy          # 改 Caddyfile 后重载
```
systemd unit：`/etc/systemd/system/aitag-site.service`，`WorkingDirectory=/root/aitag-deploy`，`ExecStart=/usr/local/bin/node server.js`，`Environment=PORT=3101`（内部端口），`Restart=always`。Caddy 监听 3100+443 反代到 `127.0.0.1:3101`。

**部署流程（改代码后上线）**：
1. 容器内改代码 → `npx next build`
2. `git add -A && git commit && git push origin main`
3. 2号机：`cd /root/aitag-site && git pull origin main && npx next build`
4. 2号机部署：`rm -rf /root/aitag-deploy/.next && cp -r .next/standalone/.next /root/aitag-deploy/.next && cp .next/standalone/server.js /root/aitag-deploy/server.js && mkdir -p /root/aitag-deploy/.next/static && cp -r .next/static/. /root/aitag-deploy/.next/static/`
5. `systemctl restart aitag-site`（Caddy 无需动，仍反代 3101）
⚠️ **必须拷 `.next/static`**（standalone 产物不含它）；⚠️ **不要覆盖** `/root/aitag-deploy/data/` 与 `public/images/`（用户数据）。
💡 访问入口：`https://juocho.kdns.fr` 或 `https://juocho.kdns.fr:3100`。

---

## 3. 功能清单

| 功能 | 说明 | 入口 |
|---|---|---|
| 登录 | 用户名+密码，session cookie（30 天，httpOnly+lax） | `/login` |
| 注册 | 开放注册，普通 user；用户名 2-30 字符（字母数字下划线中文），密码≥4 | `/register` |
| 整站门控 | 未登录访问任何页面 → 307 跳 `/login` | 全局 |
| 画廊 | 栅格展示 + 搜索（ID/作者/标签/参数）+ 排序（最新/月榜）+ 分页 + 悬浮预览 | `/` |
| 作品详情 | 多图 Grid 卡片，每图参数一体，JSON 视图 | `/i/[id]` |
| 上传 | 3 种方式（NAI/ComfyUI/无参数），上传时可编辑完整参数 | `/upload` |
| 删除作品 | 管理员删全部；作者删自己的；顺带删图片文件 | 详情页按钮 |
| 头像下拉菜单 | 头部最右圆形头像（可上传/默认图标），点击弹出【个人资料】【登出】；**黄色「管理员」徽标仅 admin 可见** | 头部 |
| 个人资料 | 更换头像（PNG/JPG/WebP ≤2MB）+ 用户名/角色/昵称/注册时间 | `/profile` |
| 站点配置 | `/api/config` 返回站点名、语言、上传开关 | API |

**上传 3 种方式（2026-09-03 精简）**：
1. **NAI 版本**：读 NovelAI PNG 内嵌参数（tEXt Comment），可修改。
2. **ComfyUI 版本**：自动读 PNG 内嵌 workflow JSON（tEXt `prompt`/`workflow`）；读不到可手动粘贴 workflow JSON 并「应用 JSON」解析。可编辑底模/LoRA/prompt/sampler/cfg/seed 等。
3. **自行上传无参数**：手动填 prompt/negative，ai_type=other。
> 类型只保留 NovelAI（nai）、ComfyUI（comfyui）、自定义（other）；**SD / NAI-X 选项已从 UI 移除**（底层 AiType 仍兼容 sd/nai_x）。

**权限规则**：
- `requireLogin()`（`src/lib/guard.ts`）：未登录 `redirect('/login')` —— 所有页面 + 部分 API
- `/api/works`（列表）**不要求登录**（页面层已门控，可接受）
- `/api/upload`：必须登录，作者=登录用户名（忽略表单 author_name）
- `DELETE /api/works/[id]`：admin 可删全部；否则 `author_name === username` 才可删，越权 403

---

## 4. API 接口一览

### 4.1 认证

| 方法 | 路径 | 权限 | 参数/请求体 | 返回 |
|---|---|---|---|---|
| POST | `/api/login` | 公开 | JSON `{username, password}` | 200 `{ok,user}` + Set-Cookie `aitag_session`；401 `{error}` |
| POST | `/api/register` | 公开 | JSON `{username, password}` | 201 `{ok,user}`；400 `{error}`（校验/重名） |
| GET | `/api/me` | 登录 | — | 200 `{ok,user}`；401 `{ok:false,user:null}` |
| POST | `/api/logout` | 登录 | — | 200 `{ok:true}`（清 session+cookie） |
| POST | `/api/me/avatar` | 登录 | multipart `avatar` 文件（PNG/JPG/WebP ≤2MB） | 200 `{ok,avatar:"/api/avatars/..."}`；400/401/500 |

`user` 序列化（`safeUser`）字段：`id, username, role("admin"|"user"), author_name, avatar, create_date`（**不含密码哈希**）。

### 4.2 作品

| 方法 | 路径 | 权限 | 参数 | 返回 |
|---|---|---|---|---|
| GET | `/api/works` | 公开 | `q`（标题/简介/作者/ID/标签模糊）、`prompt`（metadata 模糊）、`sort`（new\|monthly）、`page`、`page_size`(≤50) | `{items,page,page_size,total,total_pages}`；item 含 `cover=images[0]` |
| GET | `/api/works/[id]` | 登录 | — | 200 Work；401 未登录；404 不存在 |
| DELETE | `/api/works/[id]` | 登录+权限 | — | 200 `{ok}`；401/403/404/500；删除时清对应图片文件 |
| GET | `/api/config` | 公开 | — | `{site_name,image_prefix,languages,default_language,upload_enabled}` |

**Work 字段**：`id, title, caption, create_date, ai_type(sd|nai|nai_x|comfyui|other), image_count, tags[], author_name, total_view, total_bookmarks, images[], metadata`

### 4.3 文件服务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/images/[name]` | 上传作品图：先查 `data/uploads/`，回退 `public/images/uploads/`（legacy）；防目录穿越；MIME 按扩展名；Cache 1 天 |
| GET | `/api/avatars/[name]` | 头像图：`data/avatars/`；防目录穿越；Cache 1 天 |

### 4.4 页面路由

| 路径 | 类型 | 说明 |
|---|---|---|
| `/` | 动态 | 画廊（requireLogin → GalleryPage） |
| `/login` `/register` | 动态 | 已登录访问则 redirect `/` |
| `/upload` | 动态 | 上传页（requireLogin） |
| `/i/[id]` | 动态 | 详情页（requireLogin + canDelete/isAdmin） |
| `/profile` | 动态 | 个人资料（requireLogin） |

---

## 5. 数据模型（SQLite，`data/aitag.db`）

### works
| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | 时间戳/随机 hex |
| title / caption | TEXT | 标题 / 简介 |
| create_date | TEXT | ISO 日期 |
| ai_type | TEXT | sd/nai/nai_x/comfyui/other |
| image_count | INTEGER | 图数 |
| tags | TEXT(JSON) | 标签数组 |
| author_name | TEXT | 作者（默认「群友」；上传=登录用户名） |
| total_view / total_bookmarks | INTEGER | 浏览/收藏数 |
| images | TEXT(JSON) | 图片 URL 数组（`/api/images/...` 或 `/images/works/...`） |
| metadata | TEXT(JSON) | 生成参数 |

索引：`idx_works_create_date`、`idx_works_ai_type`。

**metadata 结构（多图 + 类型：2026-09-03）**：
- 多图（共用标题上传）：metadata 为 `{ per_image: [ {…}, … ] }`，每张图各自参数对象。
- 每张图的参数对象带 `_format` 标记（`nai` | `comfyui` | `manual`）：
  - `nai`（NovelAI）：`prompt, uc, sampler, steps, width, height, scale, seed, …`
  - `comfyui`：`prompt, uc, model(底模), loras[], sampler, scheduler, steps, cfg, seed, width, height, rawJson`
  - `manual`：`prompt, uc`
- 读取用 `getPerImageMetas()`（`src/lib/types.ts`）兼容 `per_image` 与平铺两种结构。
- 老数据无 `_format`，按是否有 prompt/uc 视作 `nai`。

### users
| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | hex |
| username | TEXT UNIQUE | 登录名 |
| password_hash | TEXT | scrypt `salt:hash`（64 字节 hex，恒定时间比较） |
| role | TEXT | `admin` \| `user` |
| author_name | TEXT | 昵称 |
| avatar | TEXT | 头像 URL（`/api/avatars/...`，空=默认图标） |
| create_date | TEXT | ISO |

### sessions
| 字段 | 说明 |
|---|---|
| token | TEXT PK（32 字节 hex） |
| user_id | TEXT |
| create_date / expire_date | ISO；TTL 30 天 |

索引：`idx_sessions_user`。登录/注册/登出均走 sessions 表；cookie 名 `aitag_session`。

---

## 6. 文件用途（源码 `/root/dsh-work/site`）

### 入口与页面（`src/app/`）
| 文件 | 用途 |
|---|---|
| `layout.tsx` | 根布局（html/body，全局 CSS） |
| `globals.css` | 全局样式（Tailwind + CSS 变量 + type-pill 等） |
| `page.tsx` | 首页：requireLogin → `<GalleryPage user={...}>` |
| `login/page.tsx` `register/page.tsx` | 登录/注册页（已登录 redirect `/`） |
| `upload/page.tsx` | 上传页：requireLogin → `<UploadPageClient user={...}>` |
| `i/[id]/page.tsx` | 详情页：requireLogin + 算 canDelete/isAdmin → `<WorkDetailClient>` |
| `profile/page.tsx` | 个人资料：requireLogin → `<ProfileClient>` |

### API 路由（`src/app/api/`）
| 文件 | 用途 |
|---|---|
| `login/route.ts` `register/route.ts` `me/route.ts` `logout/route.ts` | 认证 4 件套（见 §4.1） |
| `me/avatar/route.ts` | 上传头像（multipart，校验类型/大小，存 `data/avatars/`，更新 users.avatar） |
| `avatars/[name]/route.ts` | 服务头像文件 |
| `works/route.ts` | 作品列表+搜索+分页 |
| `works/[id]/route.ts` | 详情 GET / 删除 DELETE（权限） |
| `upload/route.ts` | 上传作品（多图、合并/独立、作者=登录用户） |
| `images/[name]/route.ts` | 服务上传图（data/uploads + legacy public/images/uploads 回退） |
| `config/route.ts` | 站点配置 |

### 库（`src/lib/`）
| 文件 | 用途 |
|---|---|
| `db.ts` | SQLite 数据层：works CRUD/搜索/分页、users/sessions 增删查、getDb() 自动建表 + 兼容旧表 ALTER |
| `auth.ts` | 认证：scrypt 哈希/校验、registerUser、login/logout/currentUser（cookie 会话）、ensureAdmin（未调用）、safeUser |
| `guard.ts` | `requireLogin()` 页面级登录保护 |
| `types.ts` | 共享类型：Work/WorkListItem/PagedWorks/PerImageMeta/PngParseResult + `getPerImageMetas()` |
| `format.ts` | ai_type 标签、日期格式化 |
| `png.ts` | **浏览器端** PNG tEXt chunk 解析（NovelAI Comment JSON） |

### 组件（`src/components/`）
| 文件 | 用途 |
|---|---|
| `GalleryPage.tsx` | 画廊页（client）：搜索/排序/分页/栅格 + 头部（含 UserBadge） |
| `GalleryCard.tsx` | 画廊卡片 |
| `WorkDetailClient.tsx` | 详情页（client）：多图 Grid + 每图参数 + 删除按钮 |
| `CardMetaView.tsx` `MetadataView.tsx` | 参数展示视图（卡片式 / JSON） |
| `UploadPageClient.tsx` | 上传页（client）：拖拽/多图/PNG 解析/共用标题 |
| `LoginForm.tsx` `RegisterForm.tsx` | 登录/注册表单（client） |
| `UserBadge.tsx` | **头像下拉菜单**：圆形头像（有图显示/无则 SVG 人形默认）、管理员金色徽标（仅 admin）、点击弹出【个人资料】【登出】、点外部关闭、`ml-auto` 贴最右 |
| `ProfileClient.tsx` | 个人资料页（client）：换头像 + 信息展示 |

### 脚本（`scripts/`）
| 文件 | 用途 |
|---|---|
| `create-admin.mjs` | 创建 admin（幂等）：`node scripts/create-admin.mjs <用户名> <密码>`；支持 `DATABASE_PATH` 指向其他库（如 2号机生产库） |
| `seed.mjs` | 种子数据导入：从 AstrBot 图片目录挑 N 张 NovelAI PNG，解析元数据 → 拷到 `public/images/works/` → 写 SQLite |

---

## 7. 关键实现细节 / 注意事项

1. **密码安全**：scrypt（`salt:hash`），`crypto.timingSafeEqual` 恒定时间比较；`safeUser` 永不外泄哈希。
2. **会话**：cookie `aitag_session`，httpOnly + sameSite lax + path `/`，30 天 TTL；登出删 session 行。
3. **整站门控**：每个页面 `requireLogin()`；未登录 307 → `/login`（`redirect`）。
4. **上传图片路径**：新上传存 `data/uploads/`（运行时数据，避免 Next 静态缓存）；`/api/images/[name]` 服务之，并回退旧路径 `public/images/uploads/`。种子图在 `public/images/works/`（静态）。
5. **删除作品**：按 `author_name === username` 判定作者；admin 全权；删除时尽力删除对应图片文件。
6. **头像**：`data/avatars/`；上传后 `users.avatar` 存 `/api/avatars/<file>`；前端无头像时渲染内置 SVG 人形（`DefaultAvatar`，深色底+人形剪影，无需外网）。
7. **兼容旧库**：`getDb()` 建表后用 `PRAGMA table_info(users)` 检查，缺 `avatar` 列则 `ALTER TABLE ADD COLUMN`（老库平滑升级）。
8. **.gitignore**：`/public/images/`、`/data/`、`/.next/`、`/node_modules/` 均忽略——**只提交源码**，图片与数据库不提交，迁移时单独处理。
9. **月榜**：`/api/works?sort=monthly` 按 `total_bookmarks DESC, total_view DESC` 排序（页面下拉里有「月榜」选项）。
10. **已知废弃**：中英切换、独立月榜页 = 废案（用户拍板不做）。

---

## 8. 账号与环境

- **admin**：用户名 `admin`，密码存容器 `/root/dsh-work/.admin-cred.tmp`（chmod 600，内容 `ADMIN_PASS=<pass>`）；2号机生产库已有该账号（role=admin）。
- **2号机 DB**：`/root/aitag-deploy/data/aitag.db`（13 条作品，含群友上传）。
- **GitHub**：`https://github.com/LinYoNv/aitag-site`，分支 `main`；凭据走 `credential.helper=store --file=/tmp/.git-cred-ok`（容器内）。
- **API 测试小抄**（2号机本机）：注册→登录→me→上传→登出，见 `login-register-progress.md` §自测。

---

## 9. 待办 / 路线（留档）

1. （后续）用户/作者详情页：参考 Serika.art（`/user/[username]` + `/api/users/[id]`），用 `works.author_name` 按作者聚合作品（`WHERE author_name=? ORDER BY create_date DESC`）。调研详见 `login-register-progress.md` §7.5。
2. （可选）头像从下拉菜单直接上传（目前入口在 `/profile`）。
3. （可选）作品详情页作者名链接到作者页（配合待办 1）。
