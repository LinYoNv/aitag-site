# aitag.win 前端结构复刻蓝图

> 目标：套用其结构自建一个相似图库站。仅梳理结构与布局模式，不搬运数据/代码文本。

## 0. 技术栈判断

- **无框架**：纯静态 HTML + 原生 JS（无 Vue/React 构建痕迹，`index.html` 末尾按序引入 7 个 `<script>`）。
- 单页应用（SPA）：所有内容由 `app.js` 通过 `fetch` 渲染进 `#gallery`，HTML 本身是空骨架。
- 后端同源接口，路径 `/api/*`（`API_BASE = window.location.origin`）。
- 图片 CDN 独立域名：`asset_base_url`（现场为 `ai-img.10118899.xyz`）。
- 部署在 Cloudflare（含 challenge / beacon 埋点），与你复刻无关。

---

## 1. 设计系统（CSS 变量，`styles.css :root`）

| 变量 | 值 | 用途 |
|---|---|---|
| `--bg` | `#0b0d10` | 页面深色底 |
| `--card` | `#151922` | 卡片底 |
| `--text` | `#e6edf3` | 主文字 |
| `--muted` | `#aeb6c2` | 次要文字 |
| `--accent` | `#4c9fff` | 强调/主按钮蓝色 |
| `--badge` | `#ff7a45` | 图数量角标橙色 |

字体：`Inter + system-ui`。全局 `box-sizing: border-box`。

**类型配色（`.type-pill` / `.chip`，左上角徽章）：**

| AI 类型 | 枚举值 | 色 |
|---|---|---|
| Stable Diffusion | `sd` | `#ff8a00` 橙 |
| NovelAI | `nai` | `#0077ff` 蓝 |
| NAI-X | `nai_x`/`naix`/`nai x` → 类名 `nai-x` | `#3751ff` 深蓝 |
| ComfyUI | `comfyui` | `#8a2be2` 紫 |
| 其他/默认 | — | `#3b3f51` 灰 |

---

## 2. 布局栅格（核心可复用）

```css
.gallery-grid {
  display: grid;
  grid-auto-flow: row dense;   /* dense 填补瀑布空缺，卡片统一 1:1 方形 */
  grid-template-columns: repeat(6, 1fr);
  gap: 20px;
  padding: 8px 24px 16px;
}
```

响应式断点（降列）：

| 视口 | 画廊列数 | 详情图列数 |
|---|---|---|
| >1200px | 6 | 3 |
| 800–1200px | 4 | 2 |
| ≤800px | 2 | 1（≤800 起 header 转纵向） |
| ≤640px | 2（不降 1，minmax(0,1fr)） | 1 |

- 卡片固定方形：`img { aspect-ratio: 1/1; object-fit: cover; }`
- 每个月榜后插一条全宽广告位：`.gallery-insert { grid-column: 1 / -1; }`

---

## 3. 页面区块清单（DOM 从上到下）

```
body
├── header.site-header (sticky, 毛玻璃 backdrop-filter)
│   ├── h1 > a.logo-link > img (favicon, 100×100 → 移动端 50×50)
│   ├── .search-row
│   │   ├── input#q          (作品ID/作者ID/名/caption/tags/日期/类型/模型)
│   │   ├── input#prompt     (NAI & SD metadata prompt 检索)
│   │   ├── select#sortMode  (new / monthly)
│   │   ├── select#timeRange (all time)
│   │   └── button#searchBtn
│   └── .blocklist-row
│       ├── input#blacklist  (屏蔽关键词)
│       └── button#saveBlacklistBtn
├── main
│   ├── section#hero-intro  (站点标题 + 简介 + 公告条 + 语言切换)
│   ├── div#searchStatus     (搜索中转圈 / 通知)
│   ├── section#gallery.gallery-grid   ← 卡片容器（动态）
│   ├── div#noResult         (无结果)
│   ├── div#pagination       (分页)
│   ├── div#loading          (加载中)
│   ├── .load-more-row > button#loadMoreBtn  (无限滚动兜底)
│   ├── button#fcChip.float-ctrl  (右下角悬浮：设置齿轮 + 页码气泡)
│   ├── div#fcPanel          (浮动设置面板：跳页/语言/各开关)
│   ├── div#hoverPreview     (跟随鼠标的悬浮预览)
│   ├── div#detailView       (全屏详情视图)
│   └── div#announceOverlay  (首次访问公告弹窗)
└── 7 个 <script>（ui_i18n / tag_translations / nai / nai_x /
    ai_metadata_ruleset / ai_metadata_view / sensitive_filter / app）
```

---

## 4. 卡片 DOM 结构（逐元素，直接照搬层级）

```html
<div class="card">
  <img loading="lazy" decoding="async" alt="..."        <!- 1:1 封面 -->
  <a class="card-link"></a>                              <!- absolute inset:0, 整卡点击 -->
  <div class="badge">N</div>                             <!- 右上角：image_count 图数 -->
  <div class="card-metrics">                             <!- 仅月榜模式出现 -->
    <span class="cm-view">1.2kV</span>                   <!- total_view -->
    <span class="cm-bookmark">340B</span>                <!- total_bookmarks -->
  </div>
  <div class="type-pill sd|nai|nai-x|comfyui">SD</div>   <!- 左上角类型徽章 -->
  <div class="meta">                                     <!- 左下角信息层 -->
    <div class="meta-title"><a class="meta-link">标题</a></div>
    <div class="meta-author"><a class="meta-author-link">作者名</a></div>
    <div class="meta-caption">简介（PC 70 字 / 移动 10 字，3 行截断）</div>
    <div class="meta-date"><a class="meta-link">日期</a></div>
  </div>
</div>
```

叠加层级（z-index）：`.card-link=1`，`.badge/.card-metrics/.meta/.type-pill=2`，遍历用 `position:absolute` 定位。

---

## 5. 数据契约（作品对象字段）

列表接口 `/api/ai_works_search` 返回的作品对象用到的字段：

| 字段 | 含义 |
|---|---|
| `id` | 作品 ID（Pixiv work id） |
| `title` | 标题 |
| `caption` | 简介 |
| `create_date` | 创建日期 |
| `AI_type` | 类型：`sd` / `nai` / `nai_x` / `comfyui`（也兼容 `ai_type`/`image_type` 小写键） |
| `image_count` | 图片数（角标） |
| `total_view` / `total_bookmarks` | 月榜专用（浏览/收藏） |
| `tags` | 标签（用于黑名单过滤 & 作者名检索拼接） |
| `author_id` / 作者名 | 经 `getAuthorInfo()` 提取（作者名用作搜索意图） |

**图片 URL 拼接规则**（`buildImageUrl`）：

```
{asset_base_url}/{image_type}/{author_id}/{file_name}.webp
例：https://ai-img.10118899.xyz/ComfyUI/77268706/149148566_p0.webp
```

`asset_base_url` 来自 `/api/config`。

---

## 6. API 端点清单（同源 `/api/*`）

| 方法/路径 | 用途 |
|---|---|
| `GET /api/config` | 配置（`asset_base_url`、敏感搜索 token、策略版本等） |
| `GET /api/ai_works_search` | 常规作品搜索/列表 |
| `GET /api/sensitive_works_search` | R-18 敏感作品搜索 |
| `GET /api/rank/monthly/real` | 当月实时月榜 |
| `GET /api/rank/monthly/fixed` | 历史固定月榜 |
| `GET /api/rank/monthly` | 月榜（period=current/YYYY-MM/older） |
| `GET /api/sensitive_rank/monthly/*` | 敏感月榜对应套 |
| `GET /api/work/{id}` | 详情（含 images、元数据、prompt） |
| `GET/POST /api/sensitive_access_session` | 敏感内容访问会话 |
| `GET /api/sensitive_work_access_codes` | 敏感作品访问码 |
| `POST /api/migrate/blacklist` | 黑名单迁移 |

**搜索/列表请求参数**（`/api/ai_works_search`）：

```
page, page_size, sort(new|monthly), time_range(all|...),
q(关键词), prompt(metadata 检索),
sensitive_policy, show_r18(0|1)
```

---

## 7. 前端 JS 模块划分

| 文件 | 职责 |
|---|---|
| `app.js` (222KB) | 主逻辑：状态管理、搜索、列表渲染、详情、悬浮预览、分页、false-config、R-18 过滤 |
| `ai_metadata_view.js` | 详情页 AI 元数据（json/指令 两种视图）渲染 |
| `ai_metadata_ruleset.js` | 元数据格式规则集 |
| `nai.js` / `nai_x.js` | NovelAI / NAI-X 元数据字段解析 |
| `sensitive_filter.js` | 敏感内容过滤（权限/合规层） |
| `tag_translations.js` | tag 翻译映射 |
| `ui_i18n.js` | UI 多语言（zh/zh_tw/en/ja/ko） |
| `styles.css` | 主布局 + 组件样式（461 行） |
| `ai_metadata.css` | 元数据视图专属样式 |

---

## 8. 复刻建议（自建时的裁减顺序）

1. **只做骨架**：`header(search) + hero + gallery-grid + meta`，深色配色 + 6→4→2 列栅格。核心价值全在 `.gallery-grid` + `.card` + `.meta`。
2. **数据自备**：`/api/ai_works_search` 换成你自己的图库数据源；图片 URL 规则可改为你自己的存储路径。
3. **可砍模块**：R-18 合规层（`sensitive_filter` + `/api/sensitive_*`）、Cloudflare 埋点、公告弹窗、naix 检测 —— 这些是它的业务特性，非结构必需。
4. **保留精髓**：`grid-auto-flow: dense` 方形卡 + 左上类型徽章 + 左下信息层 + 悬浮预览，这是该站视觉识别度的来源。

素材已全部落地 `/root/dsh-work/aitag/`（`index.html` / `styles.css` / `ai_metadata.css` / 8 个 JS）。