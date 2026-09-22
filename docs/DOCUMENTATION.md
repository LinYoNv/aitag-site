# AI 咒语图库站 · 项目文档（DOCUMENTATION）

> 本文档描述项目**当前实际状态**（与源码一致），是功能/文件/API 的权威参考。
> 配套文档：`HANDOFF.md`（部署交接）、`ENVIRONMENT-NOTES.md`（环境备忘）、`login-register-progress.md`（登录注册线进度）。
> 最后更新：2026-09-18（含生图台、昵称修改）

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

> ⚠️ 本表只保留**脱敏**信息（公开仓库可见）。真实 IP、服务器路径、服务名、反代拓扑、密钥管理等运维与安全细节见本地运维文档（`DEV_NOTES.md` / 工作区 `AGENTS.md`，均不提交）。

| 项 | 值 |
|---|---|
| 生产部署（Linux 服务器） | `<部署目录>/`（Next standalone，systemd 服务只监听 **127.0.0.1** 内部端口） |
| 源码（本机） | `<本地源码目录>/`（git 仓库，remote=GitHub `LinYoNv/aitag-site`，仅提交源码，/data /public/images 不入库） |
| **HTTPS 域名 / 服务器 IP / 服务名** | 见本地运维文档（不入库） |
| 线上数据库 | `<部署目录>/data/aitag.db` |
| Node 版本 | 生产机与本机均 v24+（内置 `node:sqlite`） |

**HTTPS 反向代理**：反代 443 → Next standalone 内部端口（拓扑细节见本地运维文档）。

**服务管理**（服务器本机）：
```bash
systemctl status <服务名>      # Next 站本身（内部端口）
systemctl status <反代服务>    # HTTPS 反代
systemctl restart <服务名>     # 部署新构建后重启 Next
systemctl reload <反代服务>    # 改反代配置后重载
```

**部署流程（改代码后上线）**：
1. 本机改代码 → `npx next build`
2. `git add -A && git commit && git push origin main`
3. 服务器：`cd <源码目录> && git pull origin main && npx next build`
4. 服务器部署：`rm -rf <部署目录>/.next && cp -r .next/standalone/.next <部署目录>/.next && cp .next/standalone/server.js <部署目录>/server.js && rm -rf <部署目录>/node_modules && cp -r .next/standalone/node_modules <部署目录>/node_modules && mkdir -p <部署目录>/.next/static && cp -r .next/static/. <部署目录>/.next/static/`
5. `systemctl restart <服务名>`（反代无需动，仍反代内部端口）
⚠️ **必须拷 `.next/static`**（standalone 产物不含它）；⚠️ **不要覆盖** `<部署目录>/data/` 与 `public/images/`（用户数据）。
💡 健康检查：`curl -s -o /dev/null -w "%{http_code}" https://<站点域名>/login`（预期 200）。
⚠️ 游客开放后 `/api/works` **不再要求登录**，健康检查别拿它当「需要鉴权」的探针。

---

## 3. 功能清单

| 功能 | 说明 | 入口 |
|---|---|---|
| 登录 | 用户名+密码，session cookie（30 天，httpOnly+lax） | `/login` |
| 注册 | 开放注册，普通 user；用户名 2-30 字符（字母数字下划线中文），密码≥8；**用户名查重与登录均大小写不敏感**（Admin/admin 同名），且禁用系统保留名（admin/root/官方/客服 等，防冒充——用户名默认作为作品作者名展示） | `/register` |
| 门控 | **游客可只读浏览**画廊 `/`、作品详情 `/i/[id]`、用户主页 `/u/[handle]`；生图台 `/studio`、上传 `/upload`、个人资料 `/profile` **未登录 307 跳 `/login`** | 全局 |
| 画廊 | 栅格展示 + 搜索（ID/作者/标签/参数/正向prompt）+ **屏蔽 tag（黑名单）** + 排序（最新/最旧/最多收藏）+ 分页 + 悬浮预览 + **缩略图**（480px WebP 懒加载） | `/` |
| 作品详情 | 多图 Grid 卡片（**1400px WebP 预览图**），每图参数一体（指令/JSON 切换 + Prompt/Negative/画师复制 + **图片下载按钮**），**灯箱放大**（←→/按钮/触屏滑动切换 + 右侧参数面板） | `/i/[id]` |
| 互动 | 点赞(👍)/收藏(⭐)/浏览量(👁)；浏览量 10 分钟窗口去重（同用户同作品不重复计数） | 详情页 |
| 上传 | 3 种方式（NAI/ComfyUI/无参数），上传时可编辑完整参数；**PNG 唯一真相源**（后端权威解析）+ **内容去重**（SHA-256，相同图只存一份文件） | `/upload` |
| 删除作品 | 管理员删全部；作者删自己的；顺带删图片文件 | 详情页按钮 |
| 头像下拉菜单 | 头部最右圆形头像（可上传/默认图标），点击弹出【我的主页】【个人资料设置】【登出】；**黄色「管理员」徽标仅 admin 可见** | 头部 |
| 个人资料 | 更换头像（PNG/JPG/WebP ≤2MB）+ 用户名/角色/昵称/注册时间 + **修改昵称** + **修改密码** + API Token 管理 + **生图台密钥**（OpenAI 兼容 Key / sta1n Token，站点只默认提供 URL） + **R18G 屏蔽偏好** | `/profile` |
| 修改昵称 | 昵称 = 作品作者名（详情页/画廊卡片/用户主页显示的值）；登录用户名不变、无需重新登录；改名同事务同步本人**全部作品**的作者名；2-30 字符（字母数字下划线中文），不可与他人用户名或昵称重复，保留名与泛用作者名（群友/匿名/游客/guest）禁用；限流 5 次/小时 | `/profile` |
| 用户主页 | 参照 Pixiv：头像/昵称/管理员徽章/注册时间资料卡 + 统计行（作品/点赞/收藏/浏览）+ **作品\|收藏 Tab 滑块**；`/u/[handle]` 的 handle 支持**用户名或昵称**（详情页作者链接用的是昵称） | `/u/[handle]` |
| API Token | 账号绑定凭证，供外部插件走接口上传鉴权；明文只显示一次，库里存 SHA-256 哈希；可重新生成（旧的立即失效） | `/profile` |
| R18G 屏蔽 | 用户级内容屏蔽：分组中英对照勾选（粪便/排尿/兽人/血腥/吞噬）+ 自定义词，只匹配**正向 prompt 词边界**；画廊与用户主页列表均生效 | `/profile` |
| 生图台 | 在线生图：NAI 直连（nai.sta1n.cn GET）+ OpenAI 兼容（syuan `/v1/images/*`，NAI 全系 + gpt-image）；**密钥用户自配**（个人资料设置，站点只提供默认 URL）；参考图（vibe/精准/img2img）、director-tools、多角色坐标、风格画师串预设、结果下载/传图库；UI 移植自 nai_image test-panel | `/studio` |
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
- `requireLogin()`（`src/lib/guard.ts`）：未登录 `redirect('/login')` —— **写操作页面**（studio/upload/profile）
- `optionalUser()`：游客可读页面用它（画廊/详情/主页），未登录返回 `null` 而**不跳转**
- 游客没有账号偏好，R18G 一律走 `blockedTagsFor(null)` → **推荐默认屏蔽组**（不能因为没偏好就全放行）
- `/api/works`（列表）**不要求登录**（页面层已门控，可接受）
- `/api/upload`：**session 或 API Token 二选一**，作者=账号（取账号**昵称**，未设昵称时回退登录用户名；忽略表单 author_name）
- `DELETE /api/works/[id]`：admin 可删全部；否则作品作者名命中本人**昵称或登录用户名**才可删（`isOwnAuthorName`，改名后不丢权限），越权 403

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
| POST | `/api/me/password` | 登录 | JSON `{old_password, new_password}` | 200 `{ok:true}`；403 旧密码错误；400 新密码<8 位或与旧密码相同 |
| POST | `/api/me/nickname` | 登录 | JSON `{nickname}`（2-30 字符，字母/数字/下划线/中文） | 200 `{ok,user}`（昵称即作品作者名，同事务同步本人全部作品作者名）；400 格式/保留名/重名；429 限流 5 次/小时 |
| GET | `/api/me/pref` | 登录 | — | 200 `{ok,pref:{enabled,selected,custom}}`（R18G 屏蔽偏好） |
| POST | `/api/me/pref` | 登录 | JSON `{pref}`；selected 仅接受词表 tag 英文名，custom 每词 ≤40 字符 | 200 `{ok,pref}`（返回保存后的完整偏好） |
| GET | `/api/studio/config` | 登录 | — | 200 当前用户密钥状态（脱敏）+ 默认 URL + 模型列表；**绝不含完整密钥** |
| GET | `/api/me/studio` | 登录 | — | 200 `{ok,config:{openai:{configured,base_url},direct:{...}}}`（个人生图密钥状态） |
| POST | `/api/me/studio` | 登录 | JSON `{openai:{base_url?,api_key?,clear_api_key?},direct:{base_url?,token?,clear_token?},probe_direct?}`；密钥留空=不变，clear=清除，URL 留空=回退默认 | 200 `{ok,config,probe?}` |
| DELETE | `/api/me/studio?target=openai_key\|direct_token` | 登录 | — | 200 `{ok,config}`（清除对应密钥） |
| POST | `/api/studio/generate` | 登录 | JSON `{call_format:"direct"\|"openai", nai_prompt, nl_prompt?, style?, custom_artists?, negative?, size, model?, n?, steps?, scale?, cfg?, sampler?, noise_schedule?, seed?, reference_mode?, reference_image_b64_list?, reference_strengths?, director_action?, characters?, quality?, background?, output_format?}` | 200 `{ok,data:[{b64_json,ext}],merge_info,meta}`（不限次数，消耗用户自有额度）；502/504 |

`user` 序列化（`safeUser`）字段：`id, username, role("admin"|"user"), author_name, avatar, create_date`（**不含密码哈希**）。

### 4.2 作品

| 方法 | 路径 | 权限 | 参数 | 返回 |
|---|---|---|---|---|
| GET | `/api/works` | 登录（2026-09-08 起） | `q`（标题/简介/作者/ID/标签/**正向prompt**模糊）、`prompt`（metadata 模糊）、`block_tags`（黑名单，正向 prompt 含词排除，逗号分隔）、`sort`（new\|old\|monthly\|bookmarks）、`page`、`page_size`(≤50)；登录用户开启 R18G 屏蔽时服务端自动按偏好过滤 | `{items,page,page_size,total,total_pages}`；item 含 `cover=images[0]` 缩略图 |
| GET | `/api/works/[id]` | 登录 | — | 200 Work（不含点赞/收藏状态——页面层另查 user_actions）；401 未登录；404 不存在 |
| POST | `/api/works/[id]/view` | 登录 | — | 200 `{ok,views}`（10 分钟窗口去重，窗口内不 +1） |
| POST | `/api/works/[id]/action` | 登录 | JSON `{action:"like"\|"bookmark"}` | 200 `{ok,active,count}`（幂等 toggle） |
| DELETE | `/api/works/[id]` | 登录+权限 | — | 200 `{ok}`；401/403/404/500；删除时清对应图片文件 |
| POST | `/api/upload` | 登录或 API Token | multipart `files`（可多个 PNG/JPG/WebP ≤20MB/张）+ `title`/`caption`/`share_title`/`meta_i`（前端解析结果 JSON，≤1MB/张） | 201 `{ok:true, ids:[], count}`（`share_title=1` 合并多图时为 `{ok:true, id, count}`）；**内容去重**：同 SHA-256 的图只落盘一份文件，URL 复用 |
| GET | `/api/config` | 公开 | — | `{site_name,image_prefix,languages,default_language,upload_enabled}` |

**Work 字段**：`id, title, caption, create_date, ai_type(sd|nai|nai_x|comfyui|other), image_count, tags[], author_name, total_view, total_bookmarks, total_likes, images[], metadata`（API 详情响应不含点赞/收藏状态——页面渲染时另查）。

**API Token 上传**（外部插件，2026-09-05）：
- 复用 `POST /api/upload`，请求头 `Authorization: Bearer <token>`（无 session 时按 token 认用户；带 session 时 session 优先）
- 请求体与网页一致：`multipart/form-data`，`files`（可多个 PNG/JPG/WebP）、`title`/`caption` 可选
- 作者 = token 绑定账号；成功 `201 {ok:true, ids:[...], count:N}`；token 无效 `401 {error:"请先登录"}`
- 示例：
  ```bash
  curl -X POST https://<站点域名>/api/upload \
    -H "Authorization: Bearer <token>" \
    -F "files=@作品.png"
  ```

### 4.3 文件服务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/images/[name]` | 上传作品图：先查 `data/uploads/`，回退 `public/images/uploads/`（legacy）；防目录穿越；MIME 按扩展名；Cache 1 天 |
| GET | `/api/images/thumb/[name]` | 缩略图：首次访问用 sharp 生成 480px WebP 缓存到 `data/uploads/thumb/`，之后直读缓存（画廊列表用） |
| GET | `/api/images/preview/[name]` | 详情页预览图：首次访问用 sharp 生成 1400px WebP 缓存到 `data/uploads/preview/`，之后直读缓存（详情页网格用，灯箱才加载原图） |
| GET | `/api/avatars/[name]` | 头像图：`data/avatars/`；防目录穿越；Cache 1 天 |

### 4.4 页面路由

| 路径 | 类型 | 说明 |
|---|---|---|
| `/` | 动态 | 画廊（**游客可看**；GalleryPage 的 `user` 为 null 时走游客态） |
| `/login` `/register` | 动态 | 已登录访问则 redirect `/` |
| `/upload` | 动态 | 上传页（requireLogin） |
| `/i/[id]` | 动态 | 详情页（**游客可看**；游客 canDelete=false、点赞收藏引导登录） |
| `/profile` | 动态 | 个人资料（requireLogin）：换头像 + 信息 + **修改昵称** + 修改密码 + API Token + **生图台密钥** + R18G 屏蔽偏好 |
| `/u/[handle]` | 动态 | 用户主页（**游客可看**，参照 Pixiv）：资料卡 + 统计 + 作品\|收藏 Tab；handle 支持**用户名或昵称**（`getUserByHandle`） |
| `/studio` | 动态 | 生图台入口（requireLogin）：全屏内嵌 `public/studio/index.html` 面板（独立静态页，API 层走 `/api/studio/*`） |

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
| author_name | TEXT | 作者名 = 上传时账号**昵称**（未设昵称回退登录用户名）；账号改昵称时**级联更新** |
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
| author_name | TEXT | 昵称（= 作品作者名；`/profile` 可修改，改名与 works.author_name 同步在同一事务内） |
| avatar | TEXT | 头像 URL（`/api/avatars/...`，空=默认图标） |
| create_date | TEXT | ISO |
| api_token_hash | TEXT | API Token 的 SHA-256 哈希（**不存明文**；空=未生成） |
| studio_cfg | TEXT(JSON) | 生图台个人密钥配置（服务端加密存储；任何接口都不回显，详见本地运维文档） |
| r18g_pref | TEXT(JSON) | R18G 屏蔽偏好 `{enabled, selected[], custom[]}`（`getUserPref` 容错解析，损坏/缺字段回退默认） |

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

### studio_history（生图台历史）
| 字段 | 说明 |
|---|---|
| id | TEXT PK（`crypto.randomBytes(8).toString('hex')`，16 位小写 hex） |
| user_id | TEXT（**归属校验唯一依据**，接口一律按 `currentUser().id` 过滤） |
| file / thumb | 原图与缩略图**文件名**（分别落 `data/uploads/hist/` 与 `data/uploads/hist/thumb/`） |
| ext / backend / model / size | 图片扩展名与生成参数快照 |
| prompt / negative | 提示词（截断存储：正向 8000 / 反向 4000 字符） |
| meta | TEXT(JSON)（`{backend, kind, elapsed_ms}`） |
| create_date | ISO |

索引：`idx_studio_history_user(user_id, create_date DESC)`。

**设计取舍**：图片**落盘、库里只存文件名**。把 base64 直接存进 SQLite 实现最短，
但一张 2K 图几百 KB → 20 张就是十几 MB 的库，且每次列历史都要把 JSON 全量搬一遍。

**保留上限 20 条**（`STUDIO_HISTORY_LIMIT`，口径在 `src/lib/studio-presets.ts`）：
`POST /api/studio/generate` 成功后自动入库，超出后从旧到新裁剪，
**库记录与磁盘文件一起删** —— 只裁库会留下永远无人引用的孤儿图片，磁盘只涨不落。

> 表**懒创建**：建表语句在 `getDb()` 里，但只有**首次真正访问数据库**时才执行。
> 因此线上刚部署完（匿名请求全被 401 挡在鉴权层、根本没碰库）时表可能尚不存在，
> 第一次带登录态调用会自动建好 —— 这不是故障。

---

## 6. 文件用途（源码 `<本地源码目录>`）

### 入口与页面（`src/app/`）
| 文件 | 用途 |
|---|---|
| `layout.tsx` | 根布局（html/body，全局 CSS） |
| `globals.css` | 全局样式（Tailwind + CSS 变量 + type-pill 等） |
| `page.tsx` | 首页：`optionalUser()` → `<GalleryPage user={... \| null}>`（null = 游客） |
| `login/page.tsx` `register/page.tsx` | 登录/注册页（已登录 redirect `/`） |
| `upload/page.tsx` | 上传页：requireLogin → `<UploadPageClient user={...}>` |
| `i/[id]/page.tsx` | 详情页：`optionalUser()` + 算 canDelete/isAdmin/isGuest → `<WorkDetailClient>` |
| `profile/page.tsx` | 个人资料：requireLogin → `<ProfileClient>` |
| `u/[username]/page.tsx` | 用户主页：requireLogin + `getUserByHandle`（**decodeURIComponent 解码中文句柄**，按用户名或昵称解析）→ `<UserPageClient>`（资料卡+统计+作品/收藏；作品与统计按「昵称 + 用户名」两个别名取并集） |

### API 路由（`src/app/api/`）
| 文件 | 用途 |
|---|---|
| `login/route.ts` `register/route.ts` `me/route.ts` `logout/route.ts` | 认证 4 件套（见 §4.1） |
| `me/avatar/route.ts` | 上传头像（multipart，校验类型/大小，存 `data/avatars/`，更新 users.avatar） |
| `me/token/route.ts` | API Token：GET 查 `{hasToken}`（不返回明文）/ POST 生成重置 `{token}`（明文一次） |
| `me/password/route.ts` | 修改密码（校验旧密码，新密码 ≥8 位且不同于旧密码） |
| `me/nickname/route.ts` | 修改昵称（昵称=作品作者名；校验格式/保留名/重名，同事务级联本人作品；限流 5 次/小时） |
| `me/pref/route.ts` | R18G 屏蔽偏好：GET 读 / POST 存（selected 按词表校验、custom ≤40 字符） |
| `me/studio/route.ts` | 生图台个人密钥：GET 状态（脱敏）/ POST 保存（密钥留空=不变，clear=清除，URL 留空=默认；`probe_direct` 测直连 Token）/ DELETE 清除 |
| `avatars/[name]/route.ts` | 服务头像文件 |
| `works/route.ts` | 作品列表+搜索+分页（支持 author 过滤；**需登录**；自动应用浏览者 R18G 屏蔽偏好） |
| `works/[id]/route.ts` | 详情 GET（含画师补算）/ 删除 DELETE（权限） |
| `works/[id]/view/route.ts` | 记录浏览（10 分钟去重） |
| `works/[id]/action/route.ts` | 点赞/收藏 toggle（幂等） |
| `upload/route.ts` | 上传作品（多图、合并/独立、作者=账号；**session 或 Bearer token 鉴权**）；PNG 解析结果与前端 meta 服务端权威合并 + **内容去重**（SHA-256 hash 文件名，同 hash 只落盘一次并复用 URL） |
| `images/[name]/route.ts` | 服务上传图（data/uploads + legacy public/images/uploads 回退）；防目录穿越；MIME 按扩展名；Cache 1 天 |
| `images/thumb/[name]/route.ts` | 缩略图：sharp 生成 480px WebP 缓存到 `data/uploads/thumb/`，之后直读缓存 |
| `images/preview/[name]/route.ts` | 详情页预览图：sharp 生成 1400px WebP 缓存到 `data/uploads/preview/`，之后直读缓存 |
| `config/route.ts` | 站点配置 |

### 库（`src/lib/`）
| 文件 | 用途 |
|---|---|
| `db.ts` | SQLite 数据层：works CRUD/搜索/分页（listWorks 支持 q/prompt/ai_type/author/author_in/sort）、users/sessions 增删查（**getUserByHandle 按用户名或昵称解析、isNameTakenByOthers 重名判定、updateAuthorName 改昵称并级联作品作者名**）、**点赞/收藏 toggle、浏览量去重、API Token 生成/校验/查询**、getDb() 自动建表 + 兼容旧表 ALTER |
| `auth.ts` | 认证：scrypt 哈希/校验、registerUser、**renameUser（昵称校验 + 重名判定 + 级联改名）**、login/logout/currentUser（cookie 会话）、ensureAdmin（未调用）、safeUser |
| `names.ts` | 名称规则（纯函数，可单测）：用户名/昵称长度与字符集、系统保留名（含泛用作者名 群友/匿名/游客）、`validateNickname`、`isOwnAuthorName`（作品归属判定：昵称或用户名命中即本人） |
| `guard.ts` | `requireLogin()` 页面级登录保护 |
| `types.ts` | 共享类型：Work/WorkListItem/PagedWorks/PerImageMeta/PngParseResult + `getPerImageMetas()` |
| `format.ts` | ai_type 标签、日期格式化 |
| `png.ts` | PNG tEXt chunk 解析：NovelAI Comment JSON + **画师(artist)提取**（artist: 前缀/花括号/权重 + **NAI v4/v5 加权画师串**，`isArtistList` 判定纯画师列表）+ **ComfyUI workflow 解析**（resolveNodeText 递归、JoinStringMulti/CR Prompt Text/ShowText 等自定义节点、unet_name 底模）+ **A1 解析护栏**（MAX_TEXT_VALUE_BYTES=4MB / MAX_COMFY_NODES=2048 / MAX_COMFY_DEPTH=100 / MAX_JSON_DEPTH，畸形 PNG 拒绝/截断不崩）+ **A2 ComfyUI 反向追溯**（selectOutputs 从 SaveImage/PreviewImage 输出根 → collectOrder 反向 DFS 活跃子图（查环/剪枝/后序）→ 只采参与生成的节点参数；孤立分支不污染；无输出根时退化全图扫描）+ **NAI 模型 Source 兜底**（确切模型 ID 优先 comment.model_name+hash → comment.source → 顶层 tEXt `Source` 字段 → `NovelAI` 占位）+ **角色传播式文本提取（2026-09-08）**（`resolveNodeText` 从采样器 positive/negative 端口沿引用链反向取词：字段名点名角色优先、相反角色跳过防污染、JoinStringMulti/Concatenate 按 delimiter 拼接，不再依赖节点名白名单） |
| `param-view.ts` | 参数展示字段顺序（NAI_ORDER / COMFY_ORDER）+ 画师列表转可复制文本 |
| `r18g-tags.ts` | R18G 屏蔽词表（5 组中英对照 + 自定义组）、默认屏蔽词、偏好展开 |
| `ratelimit.ts` | 进程内滑动窗口限流器（登录/注册/上传/头像/生图各自独立窗口）+ clientIp（x-forwarded-for 首段） |
| `studio-presets.ts` | 生图台共享预设：模型/尺寸/采样器/画师串风格/默认负面词、NAI 尺寸契约归一化、**生图历史口径**（保留 20 条 = 面板展示 20 条 / 缩略图 480px WebP / 提示词截断上限 / 文件名与 id 安全校验 `isSafeHistoryFilename` `isHistoryId`）（前后端通用，无 server-only，故可被 `npm test` 覆盖） |
| `studio.ts` | 生图台上游调用（server-only）：用户级配置（`users.studio_cfg` 读写 + 默认 URL 常量）、NAI OpenAI 兼容提交（vibe/director/img2img/director-tools/多角色，参考图 sharp 预处理）、gpt-image 提交（JSON/multipart）、sta1n 直连 GET、重试与错误翻译 |
| `studio-history.ts` | 生图历史落盘与裁剪（server-only）：`saveStudioHistory()` 把生成结果写 `data/uploads/hist/`（原图 + 480px WebP 缩略图）并入库、超出 20 条库记录与文件一起删；`resolveHistoryFile()` 解析路径（防目录穿越）；**sharp 不可用时退化为「缩略图=原图」仍记录历史**（不静默丢弃） |

### 组件（`src/components/`）
| 文件 | 用途 |
|---|---|
| `GalleryPage.tsx` | 画廊页（client）：搜索/排序/分页/栅格 + 头部（含 UserBadge） |
| `GalleryCard.tsx` | 画廊卡片 |
| `WorkDetailClient.tsx` | 详情页（client）：多图 Grid（预览图）+ 每图参数 + 点赞/收藏/浏览 + 删除按钮 + 作者名跳转用户主页 + **灯箱打开** |
| `CardMetaView.tsx` `MetadataView.tsx` | 参数展示视图（指令/JSON 切换、Prompt/Negative/画师复制框、**图片下载按钮** / JSON） |
| `Lightbox.tsx` | 详情页灯箱：←→/按钮/触屏滑动切换（滑动过渡动画 + 500ms 防误触）、Esc/点遮罩/点图关闭、多图 dots 指示、右侧参数面板随图切换 |
| `CopyButton.tsx` | 复制按钮（Prompt/Negative/画师 三框共用） |
| `UploadPageClient.tsx` | 上传页（client）：拖拽/多图/PNG 解析/共用标题 |
| `LoginForm.tsx` `RegisterForm.tsx` | 登录/注册表单（client） |
| `UserBadge.tsx` | **头像下拉菜单**：圆形头像（有图显示/无则 SVG 人形默认）、管理员金色徽标（仅 admin）、点击弹出【我的主页】【个人资料设置】【登出】、点外部关闭、`ml-auto` 贴最右；菜单内显示**昵称**（`displayName`，未传回退用户名），昵称≠用户名时补 `@用户名` |
| `ProfileClient.tsx` | 个人资料页（client）：换头像 + 信息展示（**昵称就地编辑：行内输入 + 保存/取消 + 字数与规则提示 + 已占用/保留名报错原样回显**） + **修改密码** + API Token 生成/复制/重新生成 + **生图台密钥配置**（双后端地址/密钥、保存/测试直连/清除） + **R18G 屏蔽偏好开关/弹窗** |
| `UserPageClient.tsx` | 用户主页（client）：资料卡 + 统计行 + 作品\|收藏 Tab 滑块（GalleryCard 网格） |
| `R18gPickerModal.tsx` | R18G 屏蔽词勾选弹窗：分组中英对照 + 搜索过滤 + 自定义词输入 + 搜索预览（保存走 `/api/me/pref`） |

### 脚本（`scripts/`）
| 文件 | 用途 |
|---|---|
| `create-admin.mjs` | 创建 admin（幂等）：`node scripts/create-admin.mjs <用户名> <密码>`；支持 `DATABASE_PATH` 指向其他库（如生产库） |
| `seed.mjs` | 种子数据导入：从 AstrBot 图片目录挑 N 张 NovelAI PNG，解析元数据 → 拷到 `public/images/works/` → 写 SQLite |
| `recalc-metadata.mjs` | 解析器升级后对存量作品重算 metadata（自动备份；`AITAG_DB` 指定库，`--dry-run` 预览） |
| `test-parser.mjs` | ComfyUI 解析器冒烟测试：临时编译 `src/lib/png.ts` 后跑样例 workflow 断言 |
| `warmup-images.mjs` | 图片缓存预热：扫描 DB 全部作品，预生成 thumb/preview 缓存（部署后跑一次；`--only-list` 只列 URL） |
| `taglib-import.mjs` | 中文词库同步：把 WeiLin 词库（GPL-3.0）转成 `data/taglib.db` 供 `/api/studio/tags` 读取；`--download` 拉源库、`--emit-json` 另存 JSON。**产物不进 git**（`data/` 已忽略），部署脚本会单独拷到线上 |
| `deploy-hk3.sh` | 生产部署：拉代码 → build → 同步 standalone/public/**词库 DB** → 重启 → 健康检查 |

### 测试（`tests/`）
| 文件 | 用途 |
|---|---|
| `png.test.ts` | PNG 解析器单元测试（画师提取/ComfyUI 解析/畸形输入护栏）；`npm test` 运行（node:test + tsx） |
| `names.test.ts` | 名称规则单元测试（昵称长度/字符集/空值、保留名与泛用作者名、归属判定 isOwnAuthorName）；`npm test` 运行 |

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
11. **排序**：API 支持 `sort=new|old|monthly|bookmarks`（`monthly` 与 `bookmarks` 同序：`total_bookmarks DESC, total_view DESC, create_date DESC`）；页面下拉为「最新 / 最早 / 最多收藏」（「月榜」仅保留为 API 兼容别名）。
12. **画师解析（NAI v4/v5）**：`extractArtistsFromPrompt` 除 `artist:` 前缀 / 花括号 / 权重格式外，还支持 **NAI v4/v5 加权画师段**（`0.9::misaka_12003-gou & dino, rurudo ::`，即 tag 之前以 `\n` 分隔的画师区；负权重段、质量词黑名单、长句过滤防误报）。纯 tag 单行 prompt 不猜测画师。
13. **uc 纯画师列表 → 排除画师**：NAI 部分生成把「排除画师」写进 Negative Prompt（uc），详情页用 `isArtistList()` 识别后按 **「排除画师 Excluded Artists」** 呈现（数据不丢，只是正确归类），不再显示为 Negative Prompt。
14. **存量作品画师补算**：`GET /api/works/[id]` 读取时若 NAI 作品 `artists` 为空，用增强逻辑从 `metadata.prompt`（兜底 `_raw.comment.prompt`）即时补算——旧作品无需跑迁移脚本即可显示画师。
15. **已知废弃**：中英切换、独立月榜页 = 废案（用户拍板不做）。
16. **A1 解析护栏（2026-09-06）**：`src/lib/png.ts` 顶部导出 `MAX_TEXT_VALUE_BYTES=4*1024*1024`、`MAX_COMFY_NODES=2048`、`MAX_COMFY_DEPTH=100`、`MAX_JSON_DEPTH=100`。tEXt 值超 4MB 拒绝、workflow 节点数超限返回 null、递归深度超限截断——恶意/畸形 PNG 不再打崩接口或爆内存。
17. **A2 ComfyUI 反向追溯（2026-09-06）**：`normalizeComfyWorkflow` 之后新增 `comfyRef`/`collectOrder`（active 集查环 + visited 剪枝 + 后序）/`selectOutputs`（SAVE_TYPES：SaveImage/SaveAnimatedWEBP/SaveAnimatedPNG/SaveImageWebsocket + PreviewImage；saves 排除 PreviewImage；优先级：显式 outputNodeId > 唯一保存节点 > 唯一预览节点 > null）。`parseComfyUi` 只采输出根反向可达的活跃子图节点参数；无输出根退化全图扫描（兼容老数据不回归）。实测多分支/孤立 CLIPTextEncode-KSampler 分支的 ComfyUI 图，参数与生产库存储值一致。
18. **NAI 模型 Source 兜底（2026-09-07，commit d0f00ab）**：确切模型 ID（如 `NovelAI Diffusion V4.5 4BDE2A90`）不在 Comment JSON 里，而在 PNG 顶层 tEXt `Source` 字段。`normalizeNovelAi` 优先级：`model_name+model_hash` > `comment.source` > **texts.Source**（trim、跳过 `NovelAI` 占位）> `NovelAI`。修复前 V4.5/V5 作品模型只显示 "NovelAI"。
19. **A3 上传内容去重（2026-09-08，commit a0b832e 保留部分）**：`upload/route.ts` 用 `crypto.createHash("sha256")` 算图片内容哈希，文件名=`<sha256><ext>`；`fs.existsSync` 命中则复用 URL 跳过写盘。**B2 复现/导出已按用户决定移除**（2026-09-08，commit a1fa07a），收藏/用户主页保留。
20. **多档图片加速（2026-09-08，commit f6c5ae6）**：画廊卡片用 `/api/images/thumb/`（480px WebP q80），详情页网格用 `/api/images/preview/`（1400px WebP q82），灯箱才加载原图；缓存分别落 `data/uploads/thumb|preview/`，sharp 生成失败时回退原图保证可用。
21. **详情页灯箱（2026-09-08，commits a1cac9a/221af92）**：`Lightbox.tsx` 点图放大——键盘 ←→ / 左右按钮 / 触屏滑动切换（滑动过渡动画 + 切换后 500ms 内点击不关闭）、Esc / 遮罩 / 点图关闭、多图 dots 指示；右侧参数面板随当前图切换。
22. **修改密码 + R18G 屏蔽（2026-09-09，commit 3ac6488）**：`POST /api/me/password` 校验旧密码（scrypt + 恒定时间比较），新密码 ≥8 位且不同于旧密码。R18G 偏好存 `users.r18g_pref`（`{enabled, selected, custom}`）；`/api/works` 与用户主页按**浏览者**偏好过滤：开启且未选词时用默认词（粪便 + 纯兽人组），否则用勾选词 + 自定义词。过滤靠 `getDb()` 注册的 SQLite 自定义函数 `has_pos_tag`——只匹配结构化正向 prompt（顶层 + per_image），词边界 + 大小写不敏感；负向 uc 与 rawJson/_raw.workflow 从不匹配。
23. **ComfyUI 角色传播式提示词提取（2026-09-08，commit 233b6a5）**：`parseComfyUi` 不再依赖节点名白名单，从采样器 positive/negative 端口沿引用链反向遍历取文本（字段名点名角色优先，与当前链路相反角色的字段跳过防污染，JoinStringMulti/Concatenate 按 delimiter 拼接）；节点叫什么名字都能覆盖。
24. **详情页图片下载按钮（2026-09-09，commit 3f71e76）**：`CardMetaView` 每图参数区提供下载按钮（fetch → blob → `aitag-image-N.<ext>` 下载；失败降级为新窗口打开原图）。
25. **用户名唯一性大小写不敏感（2026-09-14，commit 50f4105）**：users 表加 `lower(username)` 唯一索引，`getUserByUsername` 查重与登录均不区分大小写；注册拒绝系统保留名（admin/administrator/root/system/official/moderator/mod/staff/support/aitag/管理员/官方/系统/客服/站长）——用户名默认作为作品作者名展示，防冒充管理员/官方。
27. **生图台安全加固（2026-09-14，渗透测试后）**：上游地址强制 https 公网、个人密钥落盘加密（密钥派生不一致 bug 已修复并自动迁移存量行）、请求体/提示词/词表多档上限、`/api/works?block_tags` 恢复生效。实现细节与密钥管理**只存本地运维文档，不入库**。
28. **分端测试（2026-09-14）**：个人资料页两个密钥框各自带「测试」按钮——OpenAI 端先保存再发一次最小真实生图（约 1 点用户自有额度），直连端免费 getUser 探测；每框独立成功/失败消息，只配一端的用户不受另一端干扰。生图台 OpenAI 模式隐藏 CFG Rescale（该端点不提交，仅直连 `cfg` 参数）。
26. **生图台（2026-09-14）**：`/studio`（requireLogin）全屏内嵌 `public/studio/` 静态面板（index.html + app.css + app.js，UI 移植自 nai_image test-panel 并保持其 ENDFIELD 视觉）。后端 `src/lib/studio.ts` 双上游：
    - **direct**（nai.sta1n.cn）：`GET /generate?tag&token&model&artist&size&steps&scale&cfg&sampler&negative&nocache=1&noise_schedule`，响应=图片字节；画师串走独立 `artist` 参数；**cfg 仅此链路发送**。
    - **openai**（api.syuan.org 等）：NAI 模型按 nai_image 契约——`/v1/images/generations` 顶层 `prompt/size/n/model/action` + `parameters{steps,scale,sampler,noise_schedule,seed,negative_prompt,reference_image_multiple,reference_strength_multiple,director_reference_*,use_coords,characterPrompts,v4_prompt}`，img2img 走 `/v1/images/edits`；尺寸契约 64 倍数/最大边 1920/面积 3686400（4K 档降级 2K）；参考图 ≤8 张，img2img 用 sharp 精确 cover 到目标尺寸、vibe/director 等比缩限；重试 408/429/502/503/504 + "稍后重试"类文案（2/4/8s 退避），超时不重试。gpt-image 模型（`gpt-image-*`）自动切换官方参数面：`quality/background/output_format`，参考图走 `/v1/images/edits` multipart `image[]`，NAI 参数自动忽略。
    - **密钥用户自配（2026-09-14 起）**：站点只提供默认 URL（`https://api.syuan.org` / `https://nai.sta1n.cn`，可在个人资料设置覆盖），每个用户在「个人资料设置 → 生图台密钥」填自己的 OpenAI Key / sta1n Token，生图消耗各自的额度。密钥服务端加密存 `users.studio_cfg`（`/api/me/studio` 与 `/api/studio/config` 一律不回显，GET 只给 `已配置/未配置` 状态；加密与密钥管理见本地运维文档）。未配置时生图返回 400 并引导去个人资料设置；`POST /api/me/studio` 支持 `probe_direct` 测试 sta1n Token（`POST /api/api/getUser`，响应体 `status:"error"` 视为无效）。
    - **结果入库**：结果卡「传到图库」走 `POST /api/upload`（b64→File + `meta_0` 带完整 prompt/参数，gpt-image 用 ai_type=other）。
    - **生图历史（2026-09-21，2026-09-22 改版）**：`POST /api/studio/generate` 成功后，结果卡下方的「05 HIST」卡片展示服务端保留的**全部 20 张**缩略图（**每行 4 张**，窄屏 3 张），`studio_history` 表 + `data/uploads/hist/`，图片落盘、库里只存文件名。详见数据模型一节与文档 §4.5.4。实测量到的坑：①结果卡原是 `position:sticky`，**sticky 会浮在后续同级兄弟之上** → 与历史卡重叠，已去掉（注释留档）；②历史图原用 `max-age=3600`，**删除后浏览器仍从磁盘缓存回显已删的图**（服务端已 404）→ 改 `no-cache` + ETag。
    - **勾选 → 带图去上传（2026-09-22）**：每张缩略图右上角有勾选框（常显，触摸设备也能点），勾选后底部「⇧ 上传」变信号黄；点击跳 `/upload?from=studio&ids=<id,id,…>`。面板在 iframe 里，所以跳转目标是 **`window.top`**（否则上传页会被塞进 iframe，看着像"跳转失败"）。上传页按 id 走鉴权接口取**原图**（`?thumb=1` 是缩略图，不能用），组成 `File` 后走与"手动选图"**完全相同**的 `handleFiles` 路径。两个必须守的点：①取图失败/登录过期要**点名报错**（静默少几张 = 用户以为记录丢了）；②PNG 里没有 NAI `Comment` 时用**生图记录里的提示词兜底**（否则"有图没词"，等于白带）——兜底只填空字段，绝不覆盖已解析出来的值。勾选集合在记录被删/清空后**必须剪枝**，否则按钮会显示一个永远传不出去的张数。

29. **中文提示词库（2026-09-14）**：面板「提示词组 / TAG LIBRARY」的数据源分两层——服务端词库优先，浏览器本地覆盖层（localStorage）叠加个人增删。
    - **服务端**：`GET /api/studio/tags`（需登录）读 `data/taglib.db`，返回结构与 `public/studio/tags.default.json` 完全一致的分类树（当前 11 分类 / 132 分组 / 4086 标签），另提供 `?q=` 在 danbooru 中文表（2.2 万条带翻译）里补充检索，中英文都可搜；`?zh=a,b,c` 批量**精确**查中文，供面板「已选提示词气泡」显示对照。
    - **已选词中文对照（2026-09-22）**：气泡里每个词后面跟一条淡色中文（`1girl 1女孩`）。两级来源：先查当前词库（精选库自带 `zh`，**精选库优先**——`solo` 显示「单人」而不是 booru 的「单独人物」），查不到再问 `?zh=`（booru 精确匹配）。**查不到就不显示**，绝不机翻；用户写的是任意文本（`{1.4::artist:foo::}`、`(long_hair:1.2)`），所以查之前要归一化：先剥权重/画师语法，再按「空格版 / 下划线版」两个候选键查（词库里 `multiple_girls` 与 `multiple girls` 两种写法都存在）。中文表变化用 `zhVersion` 进渲染签名，否则异步查回来的对照永远不显示。
    - **产物来源**：`scripts/taglib-import.mjs` 从 WeiLin-Comfyui-Tools-panel 的中文词库（`userdatas_zh_CN.db`）同步。上游为 **GPL-3.0**，因此：**派生数据一律放 `data/`（已 gitignore），绝不进公开仓库**；面板底部署名出处。
    - **健壮性要点**：① 源库 `tag_subgroups` 存在 `name` 为 NULL 的脏行（会撞目标表 `NOT NULL`，曾让整个导入以 `SQLITE_CONSTRAINT_NOTNULL(1299)` 失败）——无名字且无标签的空组跳过、有标签的用占位名保留，两者都打印出来；② danbooru 表 14 万行里只有 2.2 万行带中文，只导有翻译的（产物从 ~9MB 降到 1.5MB）；③ **词库未同步不报错**：接口返回 `ok:false, synced:false`，面板回退到自带起始库并提示，功能不中断。
    - **部署**：`data/taglib.db` 不在 git 里，`scripts/deploy-hk3.sh` 会**单独原子拷**到线上 `data/`（只碰这一个文件，绝不覆盖同目录的 `aitag.db` / `studio.secret`），并在健康检查里校验。
30. **精准参考（director）只支持 4.5 系（2026-09-14，实测）**：上游中转对 `director_reference_*` 的请求，**5 系模型会报 500**（`novelai adaptor: precise reference is only supported by NAI 4.5 models`），与官方文档「4.5/5 全系」不符。`DIRECTOR_MODELS` 白名单因此**只放行 4.5 系**，其余模型一律回退 `nai-diffusion-4-5-full` 并打日志（回退必须留痕，否则线上排查只能靠猜）。面板提示文案已同步更正。
31. **参考模式与逐图强度（2026-09-14）**：`vibe`（氛围转移，默认强度 0.6，`information_extracted` 0.7）只迁移氛围/风格，**不保证人物一致性**；`director`（精准参考，默认强度 1.0、`base_caption` `character&style`）才保人物/服装。面板切换模式时会按新模式默认值刷新逐图强度，但**用户手改过的值保留**（判据：值仍等于上次自动套用值 `autoStrength` 即视为未定制）。生图请求日志已补 `参考图字节` / `强度[]` / `描述[]`，便于与 AstrBot 的 `ref_bytes` 口径对照。
32. **昵称修改（2026-09-18）**：昵称就是 `users.author_name`，也是作品展示的作者名（`works.author_name`）。作品归属没有 user_id 外键，全靠作者名**字符串匹配**，所以改名功能必须配三件事，缺一个都会出事：
    - **重名硬校验**：`isNameTakenByOthers` 查「他人用户名或昵称」（`COLLATE NOCASE`）——允许重名等于允许认领他人作品；保留名黑名单比注册更严（额外禁 `群友` / `匿名` / `游客` / `guest`，这些是存量无名作品的默认作者名）。
    - **同事务级联**：`updateAuthorName` 在 `BEGIN IMMEDIATE` 里改 `users.author_name` 并 `UPDATE works SET author_name = ? WHERE author_name IN (旧昵称, 用户名)`，顺带收敛历史上「作品作者名 = 登录名」的行（admin 等改过昵称的账号以前就对不上）。
    - **旧路径全部改判据**：上传写作者名改用「账号昵称」；删除权限与详情页 `canDelete` 用 `isOwnAuthorName`；`/u/[handle]` 用 `getUserByHandle`（先用户名后昵称），否则改名后详情页的作者链接 `/u/<昵称>` 会 404、本人主页会空白、连自己的作品都删不掉。
    - 用户主页的作品与统计按「昵称 + 用户名」两个别名取并集（`listWorks.author_in` / `getUserStats(string[])`），兼容任何改名时点的历史数据。
    - 改名本身限流 5 次/小时/用户（**校验在限流之前**：格式非法的请求直接报错、不计配额，避免手误被锁）；昵称与当前值相同视为成功且不写库（幂等）。
    - **做过的实测**：注册两个用户 → 上传作品 → 改名（作者名同步、主页与统计正常、删除权限仍在）→ 用第二个用户抢注同一昵称被 400 拒绝 → 保留名 `群友` 被拒。
    - 🔴 **合并审阅时补掉的三个坑**（原实现有，已修）：
      1. **`users.author_name` 没有唯一索引**（只有 `username` 有 `lower(username)` 唯一索引），所以 `updateAuthorName` 里那段 `catch(e){ if(/UNIQUE/) }` 是**死代码**，数据库根本不兜底。原实现「先查后写」在并发改名时会双双通过检查 → 两人重名 → 作品互相认领（TOCTOU）。现已把查重**移进 `BEGIN IMMEDIATE` 事务内**（拿到写锁后再查，天然串行化），`updateAuthorName` 返回 `{ok:false}` 表示被挡下。
      2. **注册只查了 `username`，没查 `author_name`**：昵称可改之后会出现「A 把昵称改成 X」→「B 注册用户名 X」→ 两个账号 `author_name` 都是 X。已新增 `db.isNameTaken`（用户名 **或** 昵称双向查重）并用于 `registerUser`。
      3. **保留名把管理员自己也锁死了**：`ensureAdmin` 写的昵称是「管理员」、admin 账号本身叫 `admin`，两者都在保留名黑名单里 —— 管理员**改走一次就再也改不回来**（实测撞到）。现给 `validateNickname` 加 `{allowReserved}`，仅 `role === "admin"` 放行；路由与 `renameUser` 两处同口径（权威校验在 `renameUser`）。
    - ⚠️ `/u/[handle]` 解析**优先昵称、再用户名**：作者链接用的就是昵称，改过名的账号必须优先命中本人（双向查重后两者已不会分属不同人）。
    - **入口位置**：`「更换头像」右侧的「修改昵称」按钮**（展开输入框），信息表里的「昵称」行也保留了一个「修改」入口，两处共用同一套状态。

---

## 8. 账号与环境

> ⚠️ 本节只保留**脱敏**信息。管理员密码、生产机登录方式、Git 推送凭据、数据库实际路径等运维细节见服务器本地 `DEV_NOTES.md`（不提交）。

- **admin**：用户名 `admin`，role=admin（生产库已有该账号；密码存服务器本地凭据文件，chmod 600，不提交仓库）。
- **生产 DB**：`<部署目录>/data/aitag.db`（40 条作品，21 个用户；含 users/sessions/user_actions/view_logs 表）。
- **GitHub**：`https://github.com/LinYoNv/aitag-site`，分支 `main`；推送用本地代理 + 一次性凭据 helper（详见 DEV_NOTES.md）。
- **API 测试小抄**：注册→登录→me→上传→登出，见 `login-register-progress.md` §自测。

---

## 9. 待办 / 路线（留档）

> 📌 **活跃待办已移到根目录 [`TODO.md`](../TODO.md)** —— 情绪指定的改动与已知暂缓问题都记在那里，接手前先看它。
> 本节只留历史路线存档。

1. ~~（后续）用户/作者详情页~~ → **已完成 2026-09-05**：`/u/[username]` 参照 Pixiv 布局（资料卡+统计+作品|收藏 Tab），入口在 UserBadge「我的主页」与详情页作者名链接。
2. （可选）头像从下拉菜单直接上传（目前入口在 `/profile`）。
3. （可选）作品详情页作者名链接到作者页 → **已完成**（`WorkDetailClient` 作者名 → `/u/[username]`）。
