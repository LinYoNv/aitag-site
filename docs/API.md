# AI 咒语图库站 · HTTP API 文档

> 线上地址：`https://juocho.kdns.fr`
> 基于代码现状（commit `3ac6488`）整理，2026-09-14。
> 变更记录见文末「变更日志」。本文档为调用方（外部插件/脚本）权威参考。

---

## 0. 通用约定

- 所有请求/响应均为 JSON（除文件下载外），`Content-Type: application/json`。
- 时间字段为 ISO 8601 字符串（UTC）。
- 错误响应统一为 `{ "error": "<中文提示>" }` + 对应 HTTP 状态码。
- 部分接口要求登录：二选一
  - **Session**：浏览器登录后带 `Cookie: aitag_session=<token>`（httpOnly，自动携带）
  - **Bearer Token**：`Authorization: Bearer <token>`（个人资料页生成，用于外部插件/脚本）

---

## 1. 认证接口

### 1.1 登录 `POST /api/login`
公开。成功设置 session cookie。

请求：
```json
{ "username": "abc", "password": "secret123" }
```
响应：
- `200` `{ "ok": true, "user": { id, username, role, author_name, avatar, create_date } }` + `Set-Cookie`
- `401` `{ "error": "用户名或密码错误" }`
- `429` `{ "error": "操作过于频繁，请稍后再试" }`（5 次 / 5 分钟，按 IP 与用户名双维度）

### 1.2 注册 `POST /api/register`
公开。用户名 2-30 字符（字母/数字/下划线/中文），密码 **≥ 8 位**。
- 用户名查重**大小写不敏感**（`Admin` 与 `admin` 视为同名）；系统保留名（admin/root/official/管理员/官方/客服 等）拒绝注册。

请求：
```json
{ "username": "abc", "password": "secret123" }
```
响应：
- `201` `{ "ok": true, "user": {...} }`
- `400` `{ "error": "用户名已存在（大小写不同也算重复）" | "该用户名为系统保留名，请换一个" | "密码至少 8 位" | ... }`
- `429` 限流（3 次 / 小时 / IP）

### 1.3 当前用户 `GET /api/me`
需登录。
- `200` `{ "ok": true, "user": {...} }`
- `401` `{ "ok": false, "user": null }`

### 1.4 登出 `POST /api/logout`
需登录。`200` `{ "ok": true }`

### 1.5 API Token `GET/POST /api/me/token`
需登录（个人资料页生成）。
- `GET` → `200` `{ "ok": true, "hasToken": boolean }`（**不返回明文**）
- `POST` → `200` `{ "ok": true, "token": "<64位hex>" }`（明文仅此一次；重置后旧 token 立即失效）

### 1.6 修改密码 `POST /api/me/password`
需登录。请求：
```json
{ "old_password": "旧密码", "new_password": "新密码" }
```
响应：
- `200` `{ "ok": true }`
- `403` `{ "error": "旧密码不正确" }`
- `400` `{ "error": "新密码至少 8 位" | "新密码不能与旧密码相同" | ... }`

### 1.7 生图台密钥 `GET/POST/DELETE /api/me/studio`
需登录。生图消耗**用户自己的**上游额度；站点默认提供 URL（`https://api.syuan.org` / `https://nai.sta1n.cn`），用户只填自己的密钥。
- `GET` → `200` `{ "ok": true, "config": { "openai": { "configured": bool, "base_url": "..." }, "direct": { "configured": bool, "base_url": "..." } } }`（**密钥/Token 绝不回显**）
- `POST` 请求：`{ "openai": { "base_url"?, "api_key"?, "clear_api_key"? }, "direct": { "base_url"?, "token"?, "clear_token"? }, "probe_direct"? }`
  - 密钥/Token 留空 = 保持不变；`clear_api_key`/`clear_token: true` = 清除；`base_url` 留空 = 回退站点默认
  - **base_url 仅接受 `https://` 公网地址**（SSRF 防护：内网/环回/链路本地/非 https 一律忽略并回退站点默认）
  - `probe_direct: true` → 顺带测试 sta1n Token（响应体 `status:"error"` 视为无效）
  - → `200` `{ "ok": true, "config": {...}, "probe": { "ok": bool, "message": "..." } | null }`
- `DELETE /api/me/studio?target=openai_key|direct_token` → `200` `{ "ok": true, "config": {...} }`

### 1.8 R18G 屏蔽偏好 `GET/POST /api/me/pref`
需登录。偏好存在账号上，`GET /api/works` 与用户主页会自动应用（见 3.1）。
- `GET` → `200` `{ "ok": true, "pref": { "enabled": false, "selected": [], "custom": [] } }`
- `POST` 请求：
```json
{ "pref": { "enabled": true, "selected": ["scat", "furry"], "custom": ["my_word"] } }
```
  - `selected` 仅接受预置词表里的 tag 英文名（自动小写校验，不在词表内的丢弃）
  - `custom` 每个词 trim + 小写，≤40 字符
  - → `200` `{ "ok": true, "pref": {...} }`（返回保存后的完整偏好）

---

## 2. 上传接口（外部插件重点）

### 2.1 `POST /api/upload`
**需登录**（session 或 `Authorization: Bearer <token>`，session 优先）。作者自动 = token 绑定账号（session 时 = 登录用户名），忽略表单中的作者字段。

**请求体**：`multipart/form-data`

| 字段 | 必填 | 说明 |
|---|---|---|
| `files` | ✅ | 图片文件，**可多个**（同名重复字段）；单张 ≤ 20MB；支持 PNG/JPEG/WebP（魔数校验） |
| `ai_type` | ❌ | `nai`（默认）/ `comfyui` / `other` |
| `title` | ❌ | 作品标题，≤200 字符；缺省 = `作品 <id前6位>` |
| `caption` | ❌ | 简介，≤500 字符 |
| `share_title` | ❌ | `"1"` 且多张图时，合并为一个多图作品（共用标题，每图独立参数）；缺省 = 每张独立成作品 |
| `meta_i` | ❌ | 第 i 张（0 起）的前端解析结果 JSON；**≤1MB**；可选（PNG 会由服务端重新权威解析，此字段仅作编辑参考） |

**响应**：
- `201`（不合并，默认）`{ "ok": true, "ids": ["<id>", ...], "count": N }`
- `201`（合并，`share_title=1` 且多图）`{ "ok": true, "id": "<id>", "count": N }`
- `400` `{ "error": "失败：..." }`（未收到文件 / 文件空 / 超 20MB / 非图片 / meta_i 过大）
- `401` `{ "error": "请先登录" }`（无有效凭证）
- `429` `{ "error": "上传过于频繁，请稍后再试" }`（每用户 60 次 / 小时；每 IP 120 次 / 小时）
- `500` `{ "error": "失败：<服务器错误>" }`

**curl 示例**（插件同款）：
```bash
curl -X POST https://juocho.kdns.fr/api/upload \
  -H "Authorization: Bearer <token>" \
  -F "files=@作品A.png" \
  -F "files=@作品B.png" \
  -F "ai_type=nai" \
  -F "title=我的作品"
```
> 内容去重：相同内容的图片全站只存一份文件，多次上传复用 URL（文件名 = 内容 SHA-256）。

---

## 3. 作品接口

### 3.1 列表/搜索 `GET /api/works`
**需登录**（`401` 未登录；2026-09-08 起门控）。

Query 参数：

| 参数 | 说明 |
|---|---|
| `q` | 模糊搜索：标题/简介/作者/ID/标签/正向 prompt（`%_\` 已转义） |
| `prompt` | metadata 模糊搜索 |
| `sort` | `new`（默认）/ `old` / `bookmarks`（按收藏+浏览总榜）/ `monthly`（兼容别名=bookmarks） |
| `ai_type` | `sd` / `nai` / `nai_x` / `comfyui` / `other` |
| `block_tags` | 黑名单：正向 prompt 含任一该词（逗号分隔）的作品排除 |
| `author` | 按作者名精确过滤 |
| `page` / `page_size` | 分页；`page_size` ≤ 50（默认 24） |

> **R18G 自动过滤**：登录用户在个人资料页开启 R18G 屏蔽后，服务端自动把勾选词 + 自定义词（未选过词时用默认词）作为屏蔽条件——只匹配正向 prompt 的词边界命中。同一凭证下列表/详情结果可能因此少于全量；不想被过滤就关掉偏好。

响应：`200`
```json
{
  "items": [ { "id", "title", "caption", "create_date", "ai_type",
               "image_count", "tags": [], "author_name",
               "total_view", "total_bookmarks", "cover": "/api/images/thumb/<file>" } ],
  "page": 1, "page_size": 24, "total": 40, "total_pages": 2
}
```
`cover` 为缩略图（480px WebP）。

### 3.2 作品详情 `GET /api/works/[id]`
需登录。`200` 完整 Work：
```json
{ "id", "title", "caption", "create_date", "ai_type", "image_count",
  "tags": [], "author_name", "total_view", "total_bookmarks", "total_likes",
  "images": ["/api/images/<file>", ...],
  "metadata": { "_format": "nai"|"comfyui"|"manual",
                "prompt", "uc", "sampler", "steps", "seed", "model", "artists": [], ...,
                "per_image": [ ... ], "_raw": { ... } } }
```
- `401` 未登录；`404` 不存在。
- NAI 作品 `artists` 为空时，读取时用增强逻辑即时补算（无需迁移）。
- 注意：响应**不含** `user_liked`/`user_bookmarked`（点赞/收藏状态目前只在详情页 HTML 渲染时另查，无公开接口）。

### 3.3 删除作品 `DELETE /api/works/[id]`
需登录 + 权限（管理员全权；作者删自己的）。
- `200` `{ "ok": true }`（顺带清理对应图片文件——**内容去重共享文件自动跳过**——及缩略图缓存、点赞/收藏/浏览记录）
- `401`/`403`（越权）/`404` 不存在

### 3.4 点赞/收藏 `POST /api/works/[id]/action`
需登录。请求：`{ "action": "like" | "bookmark" }`
响应：`200` `{ "ok": true, "active": true|false, "count": N }`（幂等 toggle）

### 3.5 记录浏览 `POST /api/works/[id]/view`
需登录。`200` `{ "ok": true, "total_view": N }`（同用户 10 分钟窗口去重）

---

## 4. 文件接口

| 接口 | 权限 | 说明 |
|---|---|---|
| `GET /api/images/[name]` | 公开 | 作品原图；防目录穿越；MIME 按扩展名；Cache 1 天 |
| `GET /api/images/thumb/[name]` | 公开 | 缩略图（480px WebP）：首次访问 sharp 生成并缓存，之后直读 |
| `GET /api/images/preview/[name]` | 公开 | 详情页预览图（1400px WebP）：首次访问 sharp 生成并缓存，之后直读 |
| `GET /api/avatars/[name]` | 公开 | 头像图；Cache 1 天 |

---

## 4.5 生图台接口（2026-09-14 新增）

### 4.5.1 配置快照 `GET /api/studio/config`
需登录。返回**当前用户自己的**密钥状态（脱敏，绝不含完整密钥）与面板所需常量：
```json
{ "ok": true,
  "config": { "openai": { "configured": false, "base_url": "https://api.syuan.org", "api_key": "未配置", "is_default_url": true },
              "direct": { "configured": false, "base_url": "https://nai.sta1n.cn", "token": "未配置", "is_default_url": true } },
  "defaults": { "openai_base_url": "https://api.syuan.org", "direct_base_url": "https://nai.sta1n.cn" },
  "openai_models": ["nai-diffusion-5-full", ...],
  "gptimage_models": ["gpt-image-1"],
  "default_negative": "...", "openai_vibe_strength": 0.6, "openai_director_strength": 1.0,
  "openai_director_caption": "character&style" }
```
用户自配密钥走 `GET/POST/DELETE /api/me/studio`（见 §1.7）；密钥明文存 `users.studio_cfg`，服务端调上游使用。

### 4.5.2 生成 `POST /api/studio/generate`
需登录。**限流：20 次/小时/用户 + 40 次/小时/IP**（生图消耗上游额度）。请求体（与生图台面板同构）：

| 字段 | 说明 |
|---|---|
| `call_format` | `direct`（sta1n GET）/ `openai`（OpenAI 兼容 `/v1/images/*`） |
| `nai_prompt` / `nl_prompt` | NAI 标签 / 自然语言（不转译，服务端合并） |
| `style` / `custom_artists` | 画师串预设 key（vertical/comicDoujin/r18/lolita25d/anime/galgame/custom）；服务端合并进 prompt（direct 链路走独立 `artist` 参数） |
| `size` | direct：NAI 分档名（竖图…4K横图）；openai NAI：`WxH`（64 倍数/边≤1920/面积≤3686400，4K 自动降 2K）；gpt-image：自动映射到官方枚举/auto |
| `negative` | 负面词（direct / openai NAI 有效；gpt-image 忽略） |
| `model` / `n` | 模型；张数 1-6 |
| `steps`(1-50) / `scale`(0-10) / `sampler` / `noise_schedule` / `seed`(≥0 才发) | NAI 高级参数；**direct 链路额外支持 `cfg`**（CFG Rescale），openai NAI 不发送 cfg |
| `reference_mode` / `reference_image_b64_list` / `reference_strengths` / `director_captions` | OpenAI NAI 参考图（≤8 张 data URI）：vibe / img2img / director |
| `strength` / `noise` | img2img 重绘强度 / 附加噪声（0-1） |
| `director_action` | director-tools 图片处理（bg-removal/lineart/sketch/colorize/emotion/declutter，需源图） |
| `characters` | 多角色坐标 `[{prompt,x,y}]`（≤6，仅 NAI） |
| `quality` / `background` / `output_format` | **gpt-image 专属**：low/medium/high/auto、transparent/opaque/auto、png/jpeg/webp |

响应：
- `200` `{ "ok": true, "data": [{ "b64_json": "...", "ext": "png" }], "merge_info": { "nai_prompt", "nl_prompt", "artists", "full_prompt" }, "meta": { "backend", "kind": "nai"|"gptimage", "model", "size", "n", "elapsed_ms", "user" } }`
- `400` 参数缺失（如 director-tools 无源图）或**用户未配置对应后端密钥**（reason 为 `key_not_configured`，文案引导到个人资料设置）；`413` 请求体过大（参考图总量 >96MB / 单张 data URI >11MB 被忽略）；`429` 限流；`502` 上游错误（`error` 已翻译，含 `upstream_blocked` = 上游地址未通过 SSRF 校验）；`504` 超时（上游可能仍在生成，不自动重试）。prompt/negative 服务端截断（8000/4000 字符）

---

## 5. 其他

- `GET /api/config`（公开）：`{ "site_name", "image_prefix", "languages", "default_language", "upload_enabled" }`

---

## 6. 常用错误码速查

| 状态码 | 含义 |
|---|---|
| 400 | 请求体/参数不合法（具体见 `error` 文案） |
| 401 | 未登录 / token 无效 |
| 403 | 越权（删除他人作品） |
| 404 | 作品不存在 / 文件不存在 |
| 429 | 触发速率限制（登录/注册/上传/头像各自独立窗口） |
| 500 | 服务器内部错误 |

---

## 7. 变更日志

| 日期 | 变更 | 影响 |
|---|---|---|
| 2026-09-14 | 生图台安全加固：base_url 强制 https 公网（SSRF 防护）；studio_cfg 落盘 AES-256-GCM 加密；prompt/参考图/请求体上限；`/api/works?block_tags` 恢复生效（≤20 词）；R18G 自定义词 ≤50 | 合法使用无感；内网上游地址被拒 |
| 2026-09-14 | 注册：用户名唯一性改大小写不敏感（unique 索引重建）+ 系统保留名黑名单 | 与既有用户仅大小写不同的用户名无法再注册；登录不区分大小写 |
| 2026-09-14 | 生图台密钥改为**用户自配**：新增 `/api/me/studio`（GET/POST/DELETE）；`/api/studio/config` 改为当前用户状态快照（移除管理员 POST）；生成时按用户密钥调用上游 | 未配置密钥的用户生图返回 400 引导配置；消耗各自的额度 |
| 2026-09-14 | 新增生图台接口：`GET/POST /api/studio/config`、`POST /api/studio/generate`（NAI 直连 + OpenAI 兼容 NAI 全系 + gpt-image） | 面板调用；限流 20 次/时/用户、40 次/时/IP |
| 2026-09-14 | 文档修正：`GET /api/works/[id]` 响应不含 `user_liked`/`user_bookmarked`（此前示例多写了这两个字段，代码从未返回） | 仅文档修正，代码无变化 |
| 2026-09-09 | 新增 `POST /api/me/password`（修改密码）与 `GET/POST /api/me/pref`（R18G 屏蔽偏好） | 外部脚本可自助改密/管理偏好 |
| 2026-09-09 | `GET /api/works`：登录用户开启 R18G 屏蔽时，服务端自动按其偏好过滤结果 | 同一凭证下列表结果可能少于全量 |
| 2026-09-08 | 新增 `GET /api/images/preview/[name]`（1400px WebP 预览档，详情页用） | 不影响既有调用 |
| 2026-09-08 | 上传接口：加入限流（60 次/时/用户、120 次/时/IP）与 `meta_i` ≤1MB 限制 | 正常频次无感；超限返回 429 |
| 2026-09-08 | `GET /api/works` 需登录（未登录 401） | **外部未带凭证的列表抓取会失败**；调用方需加 `Authorization: Bearer <token>` 或 session |
| 2026-09-08 | 注册密码下限 4 → 8 位 | 新注册用户需 ≥8 位密码；存量用户不受影响 |
| 2026-09-06 | 上传文件名改为内容 SHA-256（内容去重）；相同图片重复上传复用同一文件 | 响应结构不变，仅存储层变化 |