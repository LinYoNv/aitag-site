# AI 咒语图库站 · HTTP API 文档

> 线上地址：`https://juocho.kdns.fr`
> 基于代码现状（commit `51ee583`）整理，2026-09-08。
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

请求：
```json
{ "username": "abc", "password": "secret123" }
```
响应：
- `201` `{ "ok": true, "user": {...} }`
- `400` `{ "error": "用户名已存在" | "密码至少 8 位" | ... }`
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
  "user_liked": false, "user_bookmarked": false,
  "images": ["/api/images/<file>", ...],
  "metadata": { "_format": "nai"|"comfyui"|"manual",
                "prompt", "uc", "sampler", "steps", "seed", "model", "artists": [], ...,
                "per_image": [ ... ], "_raw": { ... } } }
```
- `401` 未登录；`404` 不存在。
- NAI 作品 `artists` 为空时，读取时用增强逻辑即时补算（无需迁移）。

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
| `GET /api/images/thumb/[name]` | 公开 | 缩略图：首次访问 sharp 生成 480px WebP 缓存，之后直读 |
| `GET /api/avatars/[name]` | 公开 | 头像图；Cache 1 天 |

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
| 2026-09-08 | 上传接口：加入限流（60 次/时/用户、120 次/时/IP）与 `meta_i` ≤1MB 限制 | 正常频次无感；超限返回 429 |
| 2026-09-08 | `GET /api/works` 需登录（未登录 401） | **外部未带凭证的列表抓取会失败**；调用方需加 `Authorization: Bearer <token>` 或 session |
| 2026-09-08 | 注册密码下限 4 → 8 位 | 新注册用户需 ≥8 位密码；存量用户不受影响 |
| 2026-09-06 | 上传文件名改为内容 SHA-256（内容去重）；相同图片重复上传复用同一文件 | 响应结构不变，仅存储层变化 |