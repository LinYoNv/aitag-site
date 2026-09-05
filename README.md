# AI 咒语图库站（aitag-site）

自建「AI 绘画作品 + Prompt 咒语」检索图库站，面向群友分享 NovelAI / SD / ComfyUI 作品与完整生成参数。

**线上地址**：https://juocho.kdns.fr （Caddy HTTPS 反代，Next standalone 内部端口 3101）

## 功能

- **画廊**：栅格展示、搜索（作品ID/作者/标签/参数）、排序（最新/月榜）、分页、多图角标、悬浮预览
- **详情页**：单图放大、多图三列展示；每张图完整生成参数（prompt/负向/sampler/seed/底模/LoRA）；**画师(artist)解析**（NovelAI 新旧格式、权重、大括号保留）；Prompt/Negative/画师 三框复制按钮；**点赞(👍)/收藏(⭐)/浏览量(👁)**（浏览量 10 分钟窗口去重防刷）
- **上传**：多图合并/独立；浏览器端解析 PNG 内嵌元数据自动填表；**PNG 唯一真相源**（后端权威解析 ComfyUI 自定义节点 + NovelAI 画师，`metadata._raw` 永久归档）
- **用户体系**：登录/注册（整站门控）、头像、**用户主页**（参照 Pixiv：资料卡 + 作品/点赞/收藏/浏览统计 + 作品|收藏 Tab）、**API Token**（供外部插件接口上传鉴权）
- **管理员**：删除任意作品（金色管理员徽章）

## 技术栈

Next.js 15（App Router）· TypeScript · Tailwind CSS v4 · SQLite（Node 内置 `node:sqlite`，零编译依赖）· standalone 部署

## 本地开发

```bash
npm install
npm run dev        # http://localhost:3000
npx tsc --noEmit   # 类型检查（改代码后必跑）
npx eslint src     # lint（hk-2 构建会因 eslint error 失败，本地必须先过）
```

## 部署（hk-2 生产机）

1. 本地：`npx tsc --noEmit && npx eslint src` 通过后提交推送 GitHub
2. hk-2：`cd /root/aitag-site && git pull origin main && npx next build`
3. 拷贝产物（⚠️ standalone 不含 static，必须单独拷）：
   ```bash
   rm -rf /root/aitag-deploy/.next
   cp -r .next/standalone/.next /root/aitag-deploy/.next
   cp .next/standalone/server.js /root/aitag-deploy/server.js
   mkdir -p /root/aitag-deploy/.next/static
   cp -r .next/static/. /root/aitag-deploy/.next/static/
   systemctl restart aitag-site
   ```
   ⚠️ **不要覆盖** `/root/aitag-deploy/data/`（数据库）与 `public/images/`（用户图片）。

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

## 文档

- `docs/DOCUMENTATION.md` — 权威项目文档（功能/API/数据模型/文件用途）
- `DEPLOY.md` — 部署说明（较旧，部署以本 README 为准）
- `scripts/recalc-metadata.mjs` — 元数据重算脚本（解析器升级后对存量作品重算，`--dry-run` 预览，自动备份）

## 数据迁移注意

`getDb()` 惰性建表/加列：**部署后需触发一次真实 API 请求**（如 `curl https://juocho.kdns.fr/api/works?page=1`），否则新表/新列不会创建。
