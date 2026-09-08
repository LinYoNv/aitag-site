# AI 咒语图库站 · 项目文档（DOCUMENTATION）

> 本文档描述项目**当前实际状态**（与源码一致），是功能/文件/API 的权威参考。
> 配套文档：`HANDOFF.md`（部署交接）、`ENVIRONMENT-NOTES.md`（环境备忘）、`login-register-progress.md`（登录注册线进度）。
> 最后更新：2026-09-08

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

> ⚠️ 本表只保留**脱敏**信息（公开仓库可见）。真实 IP、服务器路径、systemd 单元、Caddyfile 等运维细节见服务器本地文档 `DEV_NOTES.md`（不提交）。管理员凭据见服务器本地的 `.admin-cred.tmp`。

| 项 | 值 |
|---|---|
| 生产部署（Linux 服务器） | `<部署目录>/`（Next standalone，systemd 服务监听 **127.0.0.1** 内部端口） |
| 源码（本机） | `<本地源码目录>/`（git 仓库，remote=GitHub `LinYoNv/aitag-site`，仅提交源码，/data /public/images 不入库） |
| **HTTPS 域名**（Caddy 反代 + Cloudflare 灰云） | **`https://juocho.kdns.fr`** |
| 线上数据库 | `<部署目录>/data/aitag.db` |
| Node 版本 | 生产机与本机均 v24+（内置 `node:sqlite`） |

**HTTPS 反向代理**：Caddy 反代 443 → Next standalone 内部端口；Cloudflare 灰云解析域名到源站。Let's Encrypt 自动签发/续期证书。

**服务管理**（服务器本机）：
```bash
systemctl status aitag-site     # Next 站本身（内部端口）
systemctl status caddy          # HTTPS 反代（443）
systemctl restart aitag-site    # 部署新构建后重启 Next
systemctl reload caddy          # 改 Caddyfile 后重载
```

**部署流程（改代码后上线）**：
1. 本机改代码 → `npx next build`
2. `git add -A && git commit && git push origin main`
3. 服务器：`cd <源码目录> && git pull origin main && npx next build`
4. 服务器部署：`rm -rf <部署目录>/.next && cp -r .next/standalone/.next <部署目录>/.next && cp .next/standalone/server.js <部署目录>/server.js && rm -rf <部署目录>/node_modules && cp -r .next/standalone/node_modules <部署目录>/node_modules && mkdir -p <部署目录>/.next/static && cp -r .next/static/. <部署目录>/.next/static/`
5. `systemctl restart aitag-site`（Caddy 无需动，仍反代内部端口）
⚠️ **必须拷 `.next/static`**（standalone 产物不含它）；⚠️ **不要覆盖** `<部署目录>/data/` 与 `public/images/`（用户数据）。
💡 访问入口：`https://juocho.kdns.fr`。
💡 健康检查：`curl -s -o /dev/null -w "%{http_code}" https://juocho.kdns.fr/login`（预期 200；**接口均需登录**，不要用 `/api/*` 做健康检查）。

---

## 3. 功能清单

| 功能 | 说明 | 入口 |
|---|---|---|
| 登录 | 用户名+密码，session cookie（30 天，httpOnly+lax） | `/login` |
| 注册 | 开放注册，普通 user；用户名 2-30 字符（字母数字下划线中文），密码≥4 | `/register` |
| 整站门控 | 未登录访问任何页面 → 307 跳 `/login` | 全局 |
| 画廊 | 栅格展示 + 搜索（ID/作者/标签/参数/正向prompt）+ **屏蔽 tag（黑名单）** + 排序（最新/最旧/月榜）+ 分页 + 悬浮预览 + **缩略图**（480px WebP 懒加载） | `/` |
| 作品详情 | 多图 Grid 卡片，每图参数一体，JSON 视图 | `/i/[id]` |
| 互动 | 点赞(👍)/收藏(⭐)/浏览量(👁)；浏览量 10 分钟窗口去重（同用户同作品不重复计数） | 详情页 |
| 上传 | 3 种方式（NAI/ComfyUI/无参数），上传时可编辑完整参数；**PNG 唯一真相源**（后端权威解析）+ **内容去重**（SHA-256，相同图只存一份文件） | `/upload` |
| 删除作品 | 管理员删全部；作者删自己的；顺带删图片文件 | 详情页按钮 |
| 头像下拉菜单 | 头部最右圆形头像（可上传/默认图标），点击弹出【我的主页】【个人资料设置】【登出】；**黄色「管理员」徽标仅 admin 可见** | 头部 |
| 个人资料 | 更换头像（PNG/JPG/WebP ≤2MB）+ 用户名/角色/昵称/注册时间 + **API Token 管理** | `/profile` |
| 用户主页 | 参照 Pixiv：头像/用户名/管理员徽章/注册时间资料卡 + 统计行（作品/点赞/收藏/浏览）+ **作品\|收藏 Tab 滑块** | `/u/[username]` |
| API Token | 账号绑定凭证，供外部插件走接口上传鉴权；明文只显示一次，库里存 SHA-256 哈希；可重新生成（旧的立即失效） | `/profile` |
| 站点配置 | `/api/config` 返回站点名、语言、上传开关 | API |
| 画师解析 | NovelAI 新旧格式、数值权重、花括号强调、**NAI v4/v5 加权画师串**、风格词黑名单过滤；uc 纯画师列表自动按「排除画师」呈现 | 详情页 |
| 解析健壮性 (A1) | 文本 chunk 上限 4MB / ComfyUI 节点上限 2048 / 递归深度上限 100——畸形 PNG 不崩接口 | `src/lib/png.ts` |
| ComfyUI 反向追溯 (A2) | 从保存节点反向 DFS 活跃子图采参，孤立分支不污染；无输出根退化全图扫描 | `src/lib/png.ts` |

**上传 3 种方式（2026-09-03 精简）**：
1. **NAI 版本**：读 NovelAI PNG 内嵌参数（tEXt Comment），可修改。
2. **ComfyUI 版本**：自动读 PNG 内嵌 workflow JSON（tEXt `prompt`/`workflow`）；读不到可手动粘贴 workflow JSON 并「应用 JSON」解析。可编辑底模/LoRA/prompt/sampler/cfg/seed 等。
3. **自行上传无参数**：手动填 prompt/negative，ai_type=other。
> 类型只保留 NovelAI（nai）、ComfyUI（comfyui）、自定义（other）；**SD / NAI-X 选项已从 UI 移除**（底层 AiType 仍兼容 sd/nai_x）。

**权限规则**：
- `requireLogin()`（`src/lib/guard.ts`）：未登录 `redirect('/login')` —— 所有页面 + 部分 API
- `/api/works`（列表）**不要求登录**（页面层已门控，可接受）
- `/api/upload`：**session 或 API Token 二选一**，作者=账号（session=登录用户名；token=绑定账号，忽略表单 author_name）
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
| GET | `/api/me/token` | 登录 | — | 200 `{ok,hasToken:boolean}`（**不返回明文**） |
| POST | `/api/me/token` | 登录 | — | 200 `{ok,token}`（生成/重置，明文仅此一次；旧 token 立即失效） |

`user` 序列化（`safeUser`）字段：`id, username, role("admin"|"user"), author_name, avatar, create_date`（**不含密码哈希**）。

### 4.2 作品

| 方法 | 路径 | 权限 | 参数 | 返回 |
|---|---|---|---|---|
| GET | `/api/works` | 公开 | `q`（标题/简介/作者/ID/标签/**正向prompt**模糊）、`prompt`（metadata 模糊）、`block_tags`（黑名单，正向 prompt 含词排除，逗号分隔）、`sort`（new\|old\|monthly\|bookmarks）、`page`、`page_size`(≤50) | `{items,page,page_size,total,total_pages}`；item 含 `cover=images[0]` 缩略图 |
| GET | `/api/works/[id]` | 登录 | — | 200 Work（含 `user_liked`/`user_bookmarked` 当前用户状态）；401 未登录；404 不存在 |
| POST | `/api/works/[id]/view` | 登录 | — | 200 `{ok,views}`（10 分钟窗口去重，窗口内不 +1） |
| POST | `/api/works/[id]/action` | 登录 | JSON `{action:"like"\|"bookmark"}` | 200 `{ok,active,count}`（幂等 toggle） |
| DELETE | `/api/works/[id]` | 登录+权限 | — | 200 `{ok}`；401/403/404/500；删除时清对应图片文件 |
| POST | `/api/upload` | 登录或 API Token | multipart `files`（可多个 PNG/JPG/WebP ≤20MB/张）+ `title`/`caption`/`meta_i`（前端解析结果 JSON） | 201 `{ok:true, ids:[], count}`；**内容去重**：同 SHA-256 的图只落盘一份文件，URL 复用 |
| GET | `/api/config` | 公开 | — | `{site_name,image_prefix,languages,default_language,upload_enabled}` |

**Work 字段**：`id, title, caption, create_date, ai_type(sd|nai|nai_x|comfyui|other), image_count, tags[], author_name, total_view, total_bookmarks, total_likes, images[], metadata`（详情响应另含 `user_liked`/`user_bookmarked`）。

**API Token 上传**（外部插件，2026-09-05）：
- 复用 `POST /api/upload`，请求头 `Authorization: Bearer <token>`（无 session 时按 token 认用户；带 session 时 session 优先）
- 请求体与网页一致：`multipart/form-data`，`files`（可多个 PNG/JPG/WebP）、`title`/`caption` 可选
- 作者 = token 绑定账号；成功 `201 {ok:true, ids:[...], count:N}`；token 无效 `401 {error:"请先登录"}`
- 示例：
  ```bash
  curl -X POST https://juocho.kdns.fr/api/upload \
    -H "Authorization: Bearer <token>" \
    -F "files=@作品.png"
  ```

### 4.3 文件服务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/images/[name]` | 上传作品图：先查 `data/uploads/`，回退 `public/images/uploads/`（legacy）；防目录穿越；MIME 按扩展名；Cache 1 天 |
| GET | `/api/images/thumb/[name]` | 缩略图：首次访问用 sharp 生成 480px WebP 缓存到 `data/uploads/thumb/`，之后直读缓存（画廊列表用） |
| GET | `/api/avatars/[name]` | 头像图：`data/avatars/`；防目录穿越；Cache 1 天 |

### 4.4 页面路由

| 路径 | 类型 | 说明 |
|---|---|---|
| `/` | 动态 | 画廊（requireLogin → GalleryPage） |
| `/login` `/register` | 动态 | 已登录访问则 redirect `/` |
| `/upload` | 动态 | 上传页（requireLogin） |
| `/i/[id]` | 动态 | 详情页（requireLogin + canDelete/isAdmin） |
| `/profile` | 动态 | 个人资料（requireLogin）：换头像 + 信息 + API Token |
| `/u/[username]` | 动态 | 用户主页（requireLogin，参照 Pixiv）：资料卡 + 统计 + 作品\|收藏 Tab |

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
| author_name | TEXT | 作者（上传=账号用户名/昵称） |
| total_view / total_bookmarks / total_likes | INTEGER | 浏览/收藏/点赞数 |
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
| api_token_hash | TEXT | API Token 的 SHA-256 哈希（**不存明文**；空=未生成） |

### user_actions（点赞/收藏记录）
| 字段 | 说明 |
|---|---|
| user_id / work_id | 联合主键 (user_id, work_id, action) |
| action | `like` \| `bookmark` |
| create_date | ISO |

`toggleAction()` 幂等：已存在→删除并计数 -1；不存在→插入并 +1。`getUserActionState()` 返回当前用户对作品的 `{liked, bookmarked}`。

### view_logs（浏览量去重）
| 字段 | 说明 |
|---|---|
| id | INTEGER PK AUTOINCREMENT |
| user_id / work_id | 浏览者与作品 |
| create_date | ISO |

`recordView()`：同用户同作品 **10 分钟窗口内** 不重复 +1（防刷新刷量）。

### sessions
| 字段 | 说明 |
|---|---|
| token | TEXT PK（32 字节 hex） |
| user_id | TEXT |
| create_date / expire_date | ISO；TTL 30 天 |

索引：`idx_sessions_user`。登录/注册/登出均走 sessions 表；cookie 名 `aitag_session`。

---

## 6. 文件用途（源码 `<本地源码目录>`）

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
| `u/[username]/page.tsx` | 用户主页：requireLogin + getUserByUsername（**decodeURIComponent 解码中文用户名**）→ `<UserPageClient>`（资料卡+统计+作品/收藏） |

### API 路由（`src/app/api/`）
| 文件 | 用途 |
|---|---|
| `login/route.ts` `register/route.ts` `me/route.ts` `logout/route.ts` | 认证 4 件套（见 §4.1） |
| `me/avatar/route.ts` | 上传头像（multipart，校验类型/大小，存 `data/avatars/`，更新 users.avatar） |
| `me/token/route.ts` | API Token：GET 查 `{hasToken}`（不返回明文）/ POST 生成重置 `{token}`（明文一次） |
| `avatars/[name]/route.ts` | 服务头像文件 |
| `works/route.ts` | 作品列表+搜索+分页（支持 author 过滤） |
| `works/[id]/route.ts` | 详情 GET / 删除 DELETE（权限） |
| `works/[id]/view/route.ts` | 记录浏览（10 分钟去重） |
| `works/[id]/action/route.ts` | 点赞/收藏 toggle（幂等） |
| `upload/route.ts` | 上传作品（多图、合并/独立、作者=账号；**session 或 Bearer token 鉴权**）；PNG 解析结果与前端 meta 服务端权威合并 + **内容去重**（SHA-256 hash 文件名，同 hash 只落盘一次并复用 URL） |
| `images/[name]/route.ts` | 服务上传图（data/uploads + legacy public/images/uploads 回退）；防目录穿越；MIME 按扩展名；Cache 1 天 |
| `images/thumb/[name]/route.ts` | 缩略图：sharp 生成 480px WebP 缓存到 `data/uploads/thumb/`，之后直读缓存 |
| `config/route.ts` | 站点配置 |

### 库（`src/lib/`）
| 文件 | 用途 |
|---|---|
| `db.ts` | SQLite 数据层：works CRUD/搜索/分页（listWorks 支持 q/prompt/ai_type/author/sort）、users/sessions 增删查、**点赞/收藏 toggle、浏览量去重、API Token 生成/校验/查询**、getDb() 自动建表 + 兼容旧表 ALTER |
| `auth.ts` | 认证：scrypt 哈希/校验、registerUser、login/logout/currentUser（cookie 会话）、ensureAdmin（未调用）、safeUser |
| `guard.ts` | `requireLogin()` 页面级登录保护 |
| `types.ts` | 共享类型：Work/WorkListItem/PagedWorks/PerImageMeta/PngParseResult + `getPerImageMetas()` |
| `format.ts` | ai_type 标签、日期格式化 |
| `png.ts` | PNG tEXt chunk 解析：NovelAI Comment JSON + **画师(artist)提取**（artist: 前缀/花括号/权重 + **NAI v4/v5 加权画师串**，`isArtistList` 判定纯画师列表）+ **ComfyUI workflow 解析**（resolveNodeText 递归、JoinStringMulti/CR Prompt Text/ShowText 等自定义节点、unet_name 底模）+ **A1 解析护栏**（MAX_TEXT_VALUE_BYTES=4MB / MAX_COMFY_NODES=2048 / MAX_COMFY_DEPTH=100 / MAX_JSON_DEPTH，畸形 PNG 拒绝/截断不崩）+ **A2 ComfyUI 反向追溯**（selectOutputs 从 SaveImage/PreviewImage 输出根 → collectOrder 反向 DFS 活跃子图（查环/剪枝/后序）→ 只采参与生成的节点参数；孤立分支不污染；无输出根时退化全图扫描）+ **NAI 模型 Source 兜底**（确切模型 ID 优先 comment.model_name+hash → comment.source → 顶层 tEXt `Source` 字段 → `NovelAI` 占位） |

### 组件（`src/components/`）
| 文件 | 用途 |
|---|---|
| `GalleryPage.tsx` | 画廊页（client）：搜索/排序/分页/栅格 + 头部（含 UserBadge） |
| `GalleryCard.tsx` | 画廊卡片 |
| `WorkDetailClient.tsx` | 详情页（client）：多图 Grid + 每图参数 + 点赞/收藏/浏览 + 删除按钮 + 作者名跳转用户主页 |
| `CardMetaView.tsx` `MetadataView.tsx` | 参数展示视图（卡片式 / JSON） |
| `CopyButton.tsx` | 复制按钮（Prompt/Negative/画师 三框共用） |
| `UploadPageClient.tsx` | 上传页（client）：拖拽/多图/PNG 解析/共用标题 |
| `LoginForm.tsx` `RegisterForm.tsx` | 登录/注册表单（client） |
| `UserBadge.tsx` | **头像下拉菜单**：圆形头像（有图显示/无则 SVG 人形默认）、管理员金色徽标（仅 admin）、点击弹出【我的主页】【个人资料设置】【登出】、点外部关闭、`ml-auto` 贴最右 |
| `ProfileClient.tsx` | 个人资料页（client）：换头像 + 信息展示 + **API Token 生成/复制/重新生成** |
| `UserPageClient.tsx` | 用户主页（client）：资料卡 + 统计行 + 作品\|收藏 Tab 滑块（GalleryCard 网格） |

### 脚本（`scripts/`）
| 文件 | 用途 |
|---|---|
| `create-admin.mjs` | 创建 admin（幂等）：`node scripts/create-admin.mjs <用户名> <密码>`；支持 `DATABASE_PATH` 指向其他库（如 hk3 生产库） |
| `seed.mjs` | 种子数据导入：从 AstrBot 图片目录挑 N 张 NovelAI PNG，解析元数据 → 拷到 `public/images/works/` → 写 SQLite |

---

## 7. 关键实现细节 / 注意事项

1. **密码安全**：scrypt（`salt:hash`），`crypto.timingSafeEqual` 恒定时间比较；`safeUser` 永不外泄哈希。
2. **会话**：cookie `aitag_session`，httpOnly + sameSite lax + path `/`，30 天 TTL；登出删 session 行。
3. **整站门控**：每个页面 `requireLogin()`；未登录 307 → `/login`（`redirect`）。
4. **上传图片路径**：新上传存 `data/uploads/`（运行时数据，避免 Next 静态缓存）；`/api/images/[name]` 服务之，并回退旧路径 `public/images/uploads/`。种子图在 `public/images/works/`（静态）。**A3 内容去重**：文件名 = 图片内容 SHA-256 + 原扩展名（如 `<64位hash>.png`），同 hash 已存在则跳过写盘复用 URL——相同图片全站只存一份文件；旧图（`u_*.png` 随机名）不受影响。
5. **删除作品**：按 `author_name === username` 判定作者；admin 全权；删除时尽力删除对应图片文件。
6. **头像**：`data/avatars/`；上传后 `users.avatar` 存 `/api/avatars/<file>`；前端无头像时渲染内置 SVG 人形（`DefaultAvatar`，深色底+人形剪影，无需外网）。
7. **兼容旧库**：`getDb()` 建表后用 `PRAGMA table_info(users)` 检查，缺列则 `ALTER TABLE ADD COLUMN`（老库平滑升级：avatar → api_token_hash）。**惰性迁移：部署后需触发一次真实 API 请求**（如 `GET /api/works?page=1`）否则新表/新列不生效。
8. **API Token 安全**：库里只存 SHA-256 哈希（`hashApiToken`），明文仅生成时返回一次；`getUserByApiToken` 用哈希反查用户；重置即覆盖哈希（旧 token 立即失效）。上传接口 session 优先、token 兜底。
9. **中文用户名路由**：Next 对中文路径参数（`/u/空雨` → `%E7%A9%BA%E9%9B%A8`）**不自动解码**，页面里须手动 `decodeURIComponent`（已解码的中文调用会原样返回，幂等安全）。
10. **.gitignore**：`/public/images/`、`/data/`、`/.next/`、`/node_modules/` 均忽略——**只提交源码**，图片与数据库不提交，迁移时单独处理。
11. **月榜**：`/api/works?sort=monthly` 按 `total_bookmarks DESC, total_view DESC` 排序（页面下拉里有「月榜」选项）。
12. **画师解析（NAI v4/v5）**：`extractArtistsFromPrompt` 除 `artist:` 前缀 / 花括号 / 权重格式外，还支持 **NAI v4/v5 加权画师段**（`0.9::misaka_12003-gou & dino, rurudo ::`，即 tag 之前以 `\n` 分隔的画师区；负权重段、质量词黑名单、长句过滤防误报）。纯 tag 单行 prompt 不猜测画师。
13. **uc 纯画师列表 → 排除画师**：NAI 部分生成把「排除画师」写进 Negative Prompt（uc），详情页用 `isArtistList()` 识别后按 **「排除画师 Excluded Artists」** 呈现（数据不丢，只是正确归类），不再显示为 Negative Prompt。
14. **存量作品画师补算**：`GET /api/works/[id]` 读取时若 NAI 作品 `artists` 为空，用增强逻辑从 `metadata.prompt`（兜底 `_raw.comment.prompt`）即时补算——旧作品无需跑迁移脚本即可显示画师。
15. **已知废弃**：中英切换、独立月榜页 = 废案（用户拍板不做）。
16. **A1 解析护栏（2026-09-06）**：`src/lib/png.ts` 顶部导出 `MAX_TEXT_VALUE_BYTES=4*1024*1024`、`MAX_COMFY_NODES=2048`、`MAX_COMFY_DEPTH=100`、`MAX_JSON_DEPTH=100`。tEXt 值超 4MB 拒绝、workflow 节点数超限返回 null、递归深度超限截断——恶意/畸形 PNG 不再打崩接口或爆内存。
17. **A2 ComfyUI 反向追溯（2026-09-06）**：`normalizeComfyWorkflow` 之后新增 `comfyRef`/`collectOrder`（active 集查环 + visited 剪枝 + 后序）/`selectOutputs`（SAVE_TYPES：SaveImage/SaveAnimatedWEBP/SaveAnimatedPNG/SaveImageWebsocket + PreviewImage；saves 排除 PreviewImage；优先级：显式 outputNodeId > 唯一保存节点 > 唯一预览节点 > null）。`parseComfyUi` 只采输出根反向可达的活跃子图节点参数；无输出根退化全图扫描（兼容老数据不回归）。实测多分支/孤立 CLIPTextEncode-KSampler 分支的 ComfyUI 图，参数与生产库存储值一致。
18. **NAI 模型 Source 兜底（2026-09-07，commit d0f00ab）**：确切模型 ID（如 `NovelAI Diffusion V4.5 4BDE2A90`）不在 Comment JSON 里，而在 PNG 顶层 tEXt `Source` 字段。`normalizeNovelAi` 优先级：`model_name+model_hash` > `comment.source` > **texts.Source**（trim、跳过 `NovelAI` 占位）> `NovelAI`。修复前 V4.5/V5 作品模型只显示 "NovelAI"。
19. **A3 上传内容去重（2026-09-08，commit a0b832e 保留部分）**：`upload/route.ts` 用 `crypto.createHash("sha256")` 算图片内容哈希，文件名=`<sha256><ext>`；`fs.existsSync` 命中则复用 URL 跳过写盘。**B2 复现/导出已按用户决定移除**（2026-09-08，commit a1fa07a），收藏/用户主页保留。

---

## 8. 账号与环境

> ⚠️ 本节只保留**脱敏**信息。管理员密码、生产机登录方式、Git 推送凭据、数据库实际路径等运维细节见服务器本地 `DEV_NOTES.md`（不提交）。

- **admin**：用户名 `admin`，role=admin（生产库已有该账号；密码存服务器本地凭据文件，chmod 600，不提交仓库）。
- **生产 DB**：`<部署目录>/data/aitag.db`（40 条作品，21 个用户；含 users/sessions/user_actions/view_logs 表）。域名 `juocho.kdns.fr` 走 Cloudflare 灰云解析。
- **GitHub**：`https://github.com/LinYoNv/aitag-site`，分支 `main`；推送用本地代理 + 一次性凭据 helper（详见 DEV_NOTES.md）。
- **API 测试小抄**：注册→登录→me→上传→登出，见 `login-register-progress.md` §自测。

---

## 9. 待办 / 路线（留档）

1. ~~（后续）用户/作者详情页~~ → **已完成 2026-09-05**：`/u/[username]` 参照 Pixiv 布局（资料卡+统计+作品|收藏 Tab），入口在 UserBadge「我的主页」与详情页作者名链接。
2. （可选）头像从下拉菜单直接上传（目前入口在 `/profile`）。
3. （可选）作品详情页作者名链接到作者页 → **已完成**（`WorkDetailClient` 作者名 → `/u/[username]`）。
