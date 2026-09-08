# AI 咒语图库站（aitag-site）

自建「AI 绘画作品 + Prompt 咒语」检索图库站，面向群友分享 NovelAI / SD / ComfyUI 作品与完整生成参数。

**线上地址**：https://juocho.kdns.fr （Cloudflare 灰云 → Linux 服务器，Caddy HTTPS 反代，Next standalone 内部端口）

## 功能

### 画廊
- 栅格展示（1:1 方形卡，响应式 6→4→2 列）、**缩略图**（480px WebP 懒加载，`/api/images/thumb/`）
- 搜索：作品 ID/标题/作者/标签/**正向 prompt 参数**（`q` 与 `prompt` 两路）
- **屏蔽 tag**：正向 prompt 含屏蔽词的图排除（黑名单，`block_tags`）
- 排序：最新 / 最旧 / 月榜（按收藏+浏览）；分页、多图角标、悬浮预览

### 详情页
- 单图放大 / 多图三列展示；每张图完整生成参数（prompt/负向/sampler/seed/底模/LoRA/CFG/CFG Rescale）
- **画师(artist)解析**：NovelAI 新旧格式、数值权重、花括号强调、**NAI v4/v5 加权画师串**（`0.9::misaka_12003-gou & dino, rurudo ::`）、风格词黑名单过滤
- **uc 纯画师列表 → 排除画师**：自动识别并以「排除画师 Excluded Artists」呈现
- Prompt / Negative / 画师 三框复制按钮
- 互动：点赞(👍) / 收藏(⭐) / 浏览量(👁)（浏览量 10 分钟窗口去重防刷）

### 上传
- 多图合并（共用标题，每图独立参数）或独立作品
- 浏览器端解析 PNG 内嵌元数据自动填表（NAI Comment / ComfyUI workflow JSON）
- **PNG 唯一真相源**：后端权威解析覆盖前端（防解析 bug 固化错误），`metadata._raw` 永久归档原始参数
- **内容去重（A3）**：上传按文件内容 SHA-256 计算文件名，相同图片只存一份文件（磁盘零重复）

### 解析健壮性（A1）
- 文本 chunk 值上限 4MB、ComfyUI 图节点上限 2048、递归深度上限 100——恶意/畸形 PNG 不会打崩接口

### ComfyUI 反向追溯（A2）
- 从输出保存节点（SaveImage 等）**反向 DFS 活跃子图**，只采真正参与生成的参数；孤立/无关分支不污染；无输出根时退化全图扫描；`parseComfyUi` 支持指定保存分支

### 用户体系
- 登录/注册（整站门控）、头像、**用户主页**（参照 Pixiv：资料卡 + 作品/点赞/收藏/浏览统计 + 作品|收藏 Tab）、**API Token**（供外部插件接口上传鉴权）
- 管理员：删除任意作品（金色管理员徽章）

## 技术栈

Next.js 15（App Router）· TypeScript · Tailwind CSS v4 · SQLite（Node 内置 `node:sqlite`，零编译依赖）· standalone 部署

## 本地开发

```bash
npm install
npm run dev        # http://localhost:3000
npx tsc --noEmit   # 类型检查（改代码后必跑）
npx eslint src     # lint（构建会因 eslint error 失败，本地必须先过）
```

## 部署（Linux 生产机）

1. 本地：`npx tsc --noEmit && npx eslint src` 通过后提交推送 GitHub
2. 服务器：`cd <源码目录> && git pull origin main && npx next build`
3. 拷贝产物（⚠️ standalone 不含 static，必须单独拷；**node_modules 需整目录拷贝**，增量拷贝会破坏 sharp 等原生模块）：
   ```bash
   rm -rf <部署目录>/.next
   cp -r .next/standalone/.next <部署目录>/.next
   cp .next/standalone/server.js <部署目录>/server.js
   rm -rf <部署目录>/node_modules
   cp -r .next/standalone/node_modules <部署目录>/node_modules
   mkdir -p <部署目录>/.next/static
   cp -r .next/static/. <部署目录>/.next/static/
   systemctl restart aitag-site
   ```
   ⚠️ **不要覆盖** `<部署目录>/data/`（数据库）与图片存储。
4. 验证：`systemctl is-active aitag-site && curl -s -o /dev/null -w "%{http_code}" https://juocho.kdns.fr/login`
   （登录页 200 即正常；接口均需登录，健康检查不要打 `/api/*`）

## API Token（外部插件上传）

每个账号可在「个人资料设置」页生成/重新生成 API Token（明文只显示一次，库里只存 SHA-256 哈希）。

插件上传作品（作者自动 = token 绑定账号）：

```bash
curl -X POST https://juocho.kdns.fr/api/upload \
  -H "Authorization: Bearer <你的token>" \
  -F "files=@作品.png"
```

- 请求体与网页上传一致：`multipart/form-data`，`files`（可多个）、`title`/`caption`（可选）
- 成功返回 `201 {ok:true, ids:[...], count:N}`；token 无效返回 `401`
- 网页在线上传走 session，无需 token，互不影响

## 元数据重算

解析器升级后对存量作品重算（自动备份）：

```bash
AITAG_DB=<部署目录>/data/aitag.db node recalc-metadata.mjs
# --dry-run 预览
```

## 文档

- `docs/DOCUMENTATION.md` — 权威项目文档（功能/API/数据模型/文件用途，与源码同步，已脱敏）
- `docs/API.md` — HTTP API 文档（外部插件/脚本调用方参考；含上传、作品、认证、限流、变更日志）
- `REF_IMAGE_STUDIO.md` — 参考项目（AstrBot Image Studio 插件）改进清单（A/B/C 分级，本地未提交）

## 数据迁移注意

`getDb()` 惰性建表/加列：**部署后需触发一次真实 API 请求**（如 `curl https://juocho.kdns.fr/api/works?page=1`），否则新表/新列不会创建。
