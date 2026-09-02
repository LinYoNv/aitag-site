# AI 咒语图库站 · 部署说明

> 站点已完成首期开发并部署到宿主机。本文档说明如何访问、管理、迁移。

## 1. 访问地址

- **宿主机本机访问**：`http://localhost:3100`
- 服务监听 `0.0.0.0:3100`（宿主机网络栈）

## 2. 部署位置（宿主机）

```
/host/root/aitag-site/          # 部署根目录（standalone 产物）
├── server.js                   # Next.js standalone 服务器
├── start.sh                    # 启动脚本（PORT 默认 3100）
├── data/aitag.db               # SQLite 数据（作品表）
├── public/images/works/        # 种子导入的真实图（10 张）
└── public/images/uploads/      # 群友上传的图片（运行时生成）
```

## 3. 启动 / 停止 / 重启

```bash
# 启动（宿主机，生产模式）
cd /root/aitag-site && PORT=3100 HOSTNAME=0.0.0.0 node server.js

# 或使用脚本
./start.sh

# 停止：kill 对应 node 进程
pkill -f "node server.js"
```

## 4. 架构与数据流

```
群友上传（浏览器前端解析 PNG 元数据，失败报"失败"）
        │  POST /api/upload（图片 + 已解析参数，后端不解析 PNG）
        ▼
public/images/uploads/ ← 图片落盘
data/aitag.db ← 作品入库
        │
        ▼
首页画廊/搜索 ← GET /api/works
详情页 ← GET /api/works/[id]（图片 + 完整参数 JSON/格式化视图）
```

## 5. 关键接口

| 接口 | 说明 |
|---|---|
| `GET /api/config` | 站点配置 |
| `GET /api/works?q=&sort=&page=&page_size=` | 列表/搜索 |
| `GET /api/works/[id]` | 作品详情 |
| `POST /api/upload` | 上传（multipart：file + title + author_name + ai_type + prompt + metadata JSON） |

## 6. 开发环境

```bash
cd /root/dsh-work/site        # 开发目录（源码）
npm run dev                   # 开发模式
node scripts/seed.mjs 10      # 重新导入真实图（从 AstrBot 目录）
```

## 7. 迁移到正式服务器

1. 打包 `/host/root/aitag-site/` 整个目录（含 data/ 和 public/）。
2. 目标服务器装 Node ≥ 22.13（node:sqlite 内置）。
3. `PORT=xxxx HOSTNAME=0.0.0.0 node server.js` 启动。
4. （可选）Nginx 反代域名，图片换 CDN 时改前缀配置。

## 8. 已实现功能

- ✅ 首页：画廊栅格（6→4→2 列）、类型徽章、图数角标、搜索、排序、分页
- ✅ 详情页 `/i/[id]`：真实路由、图片展示、prompt/参数（JSON 原文 / 指令视图）
- ✅ 上传页 `/upload`：拖拽/选择图片，**浏览器端解析 PNG 元数据自动填参数**，失败提示"失败"
- ✅ 无登录（首期试用），作者占位符「群友」
- ✅ 10 张真实 NovelAI 图测试数据（参数与图片一一对应）
- ✅ SQLite（node:sqlite 内置，零编译依赖）
- ⏳ 中英切换（设计保留，未接入）

## 9. 已知事项

- 宿主机 Node v22.23.2 的 `node:sqlite` 会打印 ExperimentalWarning（不影响运行）。
- 上传限制：单图 ≤ 20MB，仅 PNG/JPEG。
- 首期无审核/登录，群友可直接上传（按约定）。
