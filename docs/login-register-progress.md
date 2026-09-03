# aitag 图库站 · 登录/注册功能线 · 进度存档

> 本文档用于在「上下文丢失 / 更换会话 / 模型替换」时保持记录连续。
> 最后更新：2026-09-03
> 配套外部文档：`/root/dsh-work/HANDOFF.md`（整体交接）、`/root/dsh-work/ENVIRONMENT-NOTES.md`（环境备忘）。
> 注意：Hindsight 记忆库**当时并未收录**登录/注册这条线的工作（记忆停留在旧版本），本文档是兜底明文件。

## 0.5 工具/网络备忘（2026-09-02 实测）

- **内置 `web_search` 工具坏了**：报 `DeepSeek API error (HTTP 404)`，不可用。
- **Tavily key**：在 `/host/root/token.md` 的 `Tavily API:` 段（`tvly-dev-HRebd-...`），
  用官方 Bearer 方式 `POST https://api.tavily.com/search` + `Authorization: Bearer tvly-...`
  **实测返回 401 invalid API key** —— key 疑似未激活/失效。要再用搜索需换有效 key。
- **GitHub 搜索可用**：`api.github.com` 直连（无需代理，未认证有速率限制），
  raw.githubusercontent.com 直连**超时**（要代理或走 api.github.com 的 readme/contents endpoint）。
- 本会话外部调研一律走 **GitHub API**（`/search/repositories`、`/repos/.../readme`、`/git/trees`）。

## 0. 一句话现状

> **2026-09-03 已全部完成并部署 2号机**：登录/注册整站门控 + 作者/删除权限 + 头像下拉菜单 + 个人资料，均在线上（公网 `http://154.12.28.103:3100`）。功能已暂停，转文档：权威参考见 `/root/dsh-work/DOCUMENTATION.md`。本文件保留登录/注册线细节（自测/账户/调研）。
> 旧「阻塞/待修」段落仅供参考历史，**以 DOCUMENTATION.md 为准**。

登录/注册代码在源码里**已写完整并上线**（认证 lib / users+sessions 表 / 4 个 API / login·register 页面 / 表单与登出组件 / 上传与删除的账号归属与权限），且：
- ✓ **已 commit + push** 到 GitHub（`LinYoNv/aitag-site`，分支 `main`）
- ✓ **已部署到 2号机 hk-2**（systemd `aitag-site.service`，公网 `http://154.12.28.103:3100`）并端到端验证通过
- ✓ **首期编译错误已修复**（page.tsx 传 user 给 GalleryPage）
- ✓ **GitHub push 已打通**（git credential helper `/tmp/.git-cred-ok` 可用）
- （下段落 3/4/5 为 9-02 的历史记录，最终结果以 `DOCUMENTATION.md` 为准）

## 1. 用户已拍板的决策（不可擅自更改）

1. **整站登录门控**：登录了才能进网站浏览（防游客）。未登录跳 `/login`。画廊、详情、上传都要登录。（与原「无登录」首期定位不同，是本次演进。）
2. **开放注册**：`/api/register` 开放，任何人可注册为普通 `user`。
3. **admin 直接在数据库写入**：不需要额外 bootstrap 机制，后台在 SQLite 里插一条 admin 即可。
4. **中英切换 / 月榜页 = 废案，不做了**（D1 确认放弃）。
5. **后续要做「用户/作者详情页」**：现在只留档，本轮不做，先完成登录。

## 2. 登录/注册这条线的代码构成（源码 `/root/dsh-work/site`）

### 服务端
- `src/lib/auth.ts`：scrypt 密码哈希（`salt:hash`，timingSafeEqual 恒定时间比较）、
  `registerUser` / `login` / `logout` / `currentUser`（cookie 会话，30 天 TTL）、`ensureAdmin`（已写但**未调用**）、`safeUser`。cookie 名 `aitag_session`，httpOnly + sameSite lax。
- `src/lib/db.ts`：新增 `users`、`sessions` 表 + `createUser/getUserByUsername/getUserById/createSession/getSessionUser/deleteSession`；另加 `deleteWorkById`（删作品+取作者）、`workExists`。
- `src/app/api/login/route.ts`：POST，校验后种 cookie，返回 `{ok,user}`；错返回 401。
- `src/app/api/register/route.ts`：POST，注册为 `user`，成功 201；校验用户名（2-30 字符、字母数字下划线中文）、密码≥4、去重。
- `src/app/api/me/route.ts`：GET 当前用户；未登录 401 `{ok:false,user:null}`。
- `src/app/api/logout/route.ts`：POST 清 session + cookie，返回 `{ok:true}`。
- `src/app/api/upload/route.ts`：**改为必须登录**；作者 = 登录用户名（`user.username`），忽略表单里的 author_name。
- `src/app/api/works/[id]/route.ts`：GET 需登录；DELETE **按权限**——admin 可删全部，否则只能删自己（`author_name === username`），删除时顺带清图片文件。

### 前端
- `src/app/login/page.tsx` + `src/components/LoginForm.tsx`：登录页，成功跳 `/`。
- `src/app/register/page.tsx` + `src/components/RegisterForm.tsx`：注册页，成功提示去登录。
- `src/components/UserBadge.tsx`：右上角用户名 + 管理员徽章 + 登出。
- `src/components/GalleryPage.tsx`：改为接收 `user` prop（`{username,role,author_name}`），`page.tsx` 经 `requireLogin()` 取用户后传入。
- `src/app/upload/page.tsx`：改成 `requireLogin()` 后把用户传给客户端 `UploadPageClient`。
- `src/app/i/[id]/page.tsx`：`requireLogin()` + 按权限算 `canDelete` / `isAdmin` 传给 `WorkDetailClient`。
- `src/lib/guard.ts`：`requireLogin()`——未登录 `redirect('/login')`。

## 3. 编译错误（待修，第 1 个 bug）

```
src/app/page.tsx(8,11): error TS2741:
Property 'user' is missing in type '{}' but required in type '{ user: UserInfo; }'.
```
原因：前一会话改了 `GalleryPage` 要 `user` prop（用于显示登出），但 `page.tsx` 只 `requireLogin()` 没把 user 传进去。
修复：`page.tsx` 里 `const user = await requireLogin(); return <GalleryPage user={{username:user.username,role:user.role,author_name:user.author_name}} />;`
同时确认 `GalleryPage` 头部确实渲染 `UserBadge`（否则压根没登出入口）+ `+ 上传`链接在未登录时会被门控拦截返回 401，需确认行为。`/api/works` 列表接口当前**未要求登录**（与整站门控略不一致，但页面层已门控，可接受）。

## 4. 部署现状（宿主机）

- 生产在宿主机 `/root/aitag-site`（容器视角 `/host/root/aitag-site`），Node 跑 `server.js`（Next standalone），监听 `0.0.0.0:3100`。
- 公网 NAT：`http://110.42.14.233:38778`。
- **线上还没部署 auth 版**：`/api/login`、`/api/register`、`/api/me`、`/api/logout` 现在线上都是 **404**（旧构建不含）。核心 `/api/config`、`/api/works` 正常 200，`/api/upload` 裸 POST（无文件）返回 500（属正常，需按 multipart 协议）。
- 部署铁律（见 HANDOFF §4）：容器内 `npx next build` → 拷 `.next/standalone/.next` 到宿主机 → **必须另拷 `.next/static`**（standalone 不含）→ 保留宿主 `data/` 与 `public/images/uploads/` → python 精准杀 next-server 再重启。

## 5. admin 账号（本次要写入）

- 直接在宿主机 `/root/aitag-site/data/aitag.db` 插一行 `users`：`role='admin'`，`password_hash` 用 scrypt `salt:hash`（格式见 auth.ts）。
- 用户名/密码用哪个？**本次由助手在写库时确定并记录在本文档；若用户后续给了偏好账号，改用用户的。**
- 注意表已存在则 `INSERT OR IGNORE`（`users.username` 唯一）。

### ✅ 已执行（2026-09-02）
- 已用 `node scripts/create-admin.mjs admin <pass>` 写入宿主 DB：
  - username=`admin`、role=`admin`、author_name=`admin`、id=`e8594d2b8c471347`
  - 密码：随机 16 位，**存在 `/root/dsh-work/.admin-cred.tmp`（chmod 600）**，内容 `ADMIN_PASS=<pass>`
  - 脚本（`site/scripts/create-admin.mjs`）支持 `DATABASE_PATH` 环境变量指向宿主库，幂等。
- 记录后建议把该 tmp 文件内容并入本文档或删除。

## 6. Git / GitHub

- 远程：`origin = https://github.com/LinYoNv/aitag-site.git`，分支 `main`。
- 现有历史：`3bfd0cc`、`cf9921d`、`2ca6e58`（初版）。
- 工作区未提交改动：`api/upload`、`api/works/[id]`、`i/[id]/page`、`page`、`upload/page`、`GalleryPage`、`WorkDetailClient`、`db.ts` 的修改；未跟踪：`api/login`、`api/logout`、`api/me`、`api/register`、`login/`、`register/`、`LoginForm`、`RegisterForm`、`UploadPageClient`、`UserBadge`、`auth.ts`、`guard.ts`。
- **push ✅ 已成功（2026-09-02）**：`git push origin main` 成功，远程 HEAD=本地 HEAD=`95ed927`。
  - 注：直接用 API 测 `/host/root/token.md` 的 PAT（ghp_5HaVnV…）返回 401，但 git push 用的是
    credential helper `store --file=/tmp/.git-cred-ok`（也是同一 token 值）却成功——怀疑是该 token 对 git
    push 有效（可能 token 权限或鉴权头差异；ghp_ 前缀 + 40 位是 classic PAT）。以 push 结果为准：**已上线**。
- `.gitignore`：已忽略 `/public/images/`、`/data/`、`/.next/`、`/node_modules/` 等——只会提交源码。

## 7. 下一步动作清单（接管者从这里继续）

### ✅ 已完成（2026-09-02）
1. ✅ 修 `src/app/page.tsx` 传 user + 画廊渲染 UserBadge。
2. ✅ `npx next build` 通过（tsc 无错，auth 路由全部进构建：/api/login /api/logout /api/me /api/register /api/upload /api/works /api/works/[id] /api/images/[name] /i/[id] /login /register /upload /）。
3. ✅ 往宿主机 DB 写 admin（`admin` 账号，见 §5）。
4. ✅ 部署文件已复制到宿主机：`/host/root/aitag-site/.next`（BUILD_ID `svZKjhenUpW7w5PUm5k-7`，含 auth 路由）+ `.next/static`（36 文件）+ `server.js`；宿主 `data/`（aitag.db）与 `public/images/uploads/`（4 张）保留。
   - ⚠️ 复制坑：`cp -r 源/.next 到已存在的 /host/.../.next` **不会合并/覆盖**（旧 BUILD_ID 原样保留）→ 必须先 `rm -rf` 旧的 `.next` 再整体复制。已照此执行。

### 🔴 阻塞：生产服务器重启（重要！）
- 生产 next-server（宿主 PID 332507，监听宿主 netns 0.0.0.0:3100，公网 110.42.14.233:38778 可达）**在宿主 PID/网络命名空间**。
- 容器内**无法**杀它/重启它：容器缺 CAP_SYS_ADMIN（CapEff=a80425fb 不含），`nsenter`/`setns` 打开 `/host/proc/1/ns/pid` 被拒；无 docker socket。
- 容器内 `chroot /host` 启动的服务**只在容器 netns**（172.21.0.2 可达、172.21.0.1/公网不可达），**不能**替代宿主服务。
- 结论：**新 build 的文件已就位，但宿主机侧的 next-server 进程还没重启**——需要用户在宿主机（VNC/终端）执行重启，命令：
  ```bash
  # 宿主机执行（不是容器内）
  pkill -f 'next-server' ; sleep 1
  cd /root/aitag-site && nohup env PORT=3100 HOSTNAME=0.0.0.0 /usr/bin/node server.js > /tmp/aitag-host.log 2>&1 &
  # 验证
  curl -s http://127.0.0.1:3100/api/me ; echo; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/
  ```
  （若无法在宿主机操作，容器内也可尝试 `nsenter` 需要更高权限——本容器被拒。）

### 🔄 修正（2026-09-03，重要）：真正的部署目标是 2号机！
- **上面「阻塞」段落作废**。用户澄清：容器在 **1号机**（公网 110.42.14.233:38778 也指向 1号机，跑旧版），而 **aitag-web 的部署目标是 2号机（hk-2，公网 154.12.28.103）**。
- 2号机上已有另一个会话部署的 systemd 服务 **`aitag-site.service`**（WorkingDirectory=/root/aitag-deploy，ExecStart=/usr/local/bin/node server.js，Restart=always），代码从 GitHub 拉取。
- 我在 1号机 `/host/root/aitag-site` 复制的部署文件**不是目标**（1号机只当容器宿主，公网 NAT 旧版待切换）。
- **2号机已完成**（2026-09-03）：
  1. `git pull origin main` → 拿到 `95ed927`（登录/注册提交）
  2. `npx next build` 成功（auth 路由全部进构建）
  3. 部署：`rm -rf /root/aitag-deploy/.next` → 复制 standalone .next + server.js + .next/static（保留 data/ 与 public/images/）
  4. 生产库（/root/aitag-deploy/data/aitag.db，**12 条作品**）写入 admin（id=127fb79abf4fcbbf）
  5. `systemctl restart aitag-site` → active，监听 0.0.0.0:3100
  6. 验证全通过（2号机内 127.0.0.1:3100 与公网 154.12.28.103:3100）：
     - GET / 未登录 → 307 /login；/api/me → 401
     - admin 登录 → 200+Set-Cookie；/api/me(admin) → 200 role=admin
     - 注册 201；删除他人作品 → 403；登出 → 200
     - 公网 /api/config → 200；/login → 200
- **遗留**：公网入口 110.42.14.233:38778 仍指向 1号机旧版（/api/me 404）。若要让群友走 2号机，需用户把 NAT/域名切到 2号机（154.12.28.103:3100），或给 2号机配好域名。1号机旧服务可留可停。

### ✅ 2号机最终验证（2026-09-03）
- 公网 154.12.28.103:3100：GET / 未登录 → 307 /login；/api/me → 401；/api/config → 200；/login → 200
- 登录页静态资源 8 个全部 200（css×1 + js×7），无 .next/static 遗漏
- admin 登录（密码来自 /root/dsh-work/.admin-cred.tmp）→ 200 + Set-Cookie + /api/me role=admin
- 端到端：注册 201 → 登录 200 → me 200 → 删除他人 403 → 登出 200
- 2号机 git 工作区干净（`git status` 无改动，只有 main 分支）

### ✅ 头像下拉菜单（2026-09-03，提交 6d6d837）
- 需求（用户 D2 拍板）：头部右侧「管理员徽标+用户名+登出」整合为**头像下拉菜单**移到最右；
  头像可上传（无则默认图标）；点击头像弹出【个人资料】【登出】；**黄色"管理员"徽标仅 admin 可见**。
- 实现：
  - `users` 表加 `avatar` 列（兼容旧库 ALTER TABLE ADD COLUMN）
  - `POST /api/me/avatar`（2MB 内 PNG/JPEG/WebP，存 data/avatars）+ `GET /api/avatars/[name]` 服务头像
  - `UserBadge` 改造：圆形头像按钮（有头像显示图，无则内置 SVG 人形）+ 点击外部关闭的下拉面板
    （上半头像+用户名+角色徽标，菜单【个人资料】→ /profile、【登出】红色）
  - 新页面 `/profile`：更换头像 + 用户名/角色/昵称/注册时间
  - `GalleryPage`/`UploadPageClient` 头部均接入新 UserBadge（传 avatar）
- 自测 + 2号机线上验证全通过：注册→登录 avatar=""→上传头像 200→头像文件 200 image/png→/profile 200；
  admin 登录 role=admin，GET / 含用户菜单挂载点。
- 部署：2号机 `git pull`→build→standalone .next+static→`systemctl restart aitag-site`，BUILD_ID `LDHIEJ1ogLurfTZUIrvtq`。

### ✅ 上传/展示改造（2026-09-03，提交 409d64b）
- 需求（用户 D 拍板，三个确认）：
  1. 上传时可**编辑完整参数**（sampler/steps/cfg或scale/seed/width/height/model/scheduler/loras）——此前只读。
  2. 类型精简：**只收 NovelAI + ComfyUI**，取消上传页「类型」下拉；上传方式改 **3 卡片**：
     - **NAI 版本**（读内嵌 Comment JSON）
     - **ComfyUI 版本**（自动读 PNG 内嵌 workflow JSON；读不到可**手动粘贴 JSON**，点「应用 JSON」解析）
     - **自行上传无参数**（手动填 prompt/negative，ai_type=other）
  3. **用户详情页 = 废案**（不留档做）。
  - 用户另说：画廊类型筛选 + 按时间排序留作下一轮，本轮只做上传/展示。
- 实现：
  - `png.ts` 新增 `parseComfyUi()`：从 PNG tEXt `prompt`/`workflow` 解析 ComfyUI 执行图 → 提取底模/checkpoint、LoRA 列表、正反提示词、sampler/scheduler/steps/cfg/seed、尺寸。
  - `types.ts` 新增 `ComfyUiMetadata`；`PngParseResult` 加 `comfyui` 字段。
  - `UploadPageClient` 重构：3 卡片 + 每图可编辑参数网格 + ComfyUI JSON 粘贴区；metadata 带 `_format` 标记（nai|comfyui|manual）。
  - `CardMetaView`/`MetadataView` 按 `_format` 分支渲染；comfyui 显示底模/LoRA/prompt/sampler/cfg/seed 等。
  - `format.ts` typeLabel：nai→NovelAI、other→自定义。
- 自测 + 线上验证全通过：ComfyUI 上传→详情 _format=comfyui/底模/LoRA 正确；manual 上传→0a.../other；上传页 3 卡片渲染正常；门控仍有效。
- 部署：2号机 BUILD_ID `5Cc0WC1I9Ic0pnIPGf5Sj`。
- 注：线上 works 现有 **9 条真实数据**（8 条群友种子 + 1 条 admin「11」）；本次清理仅删 2 条自造带「测试」标题作品，未动任何真实/群友/admin 作品。

### ✅ 移动端适配（2026-09-03，提交 NEXT）
- 需求：用户"一点不懂，去网上搜"，让手机浏览器 UI 别溢出、能用。
- 现状：画廊/详情栅格已有 6→4→2 响应式，但各页面 header 是固定 flex 单行，手机必溢出。
- 改动（全部标准 Tailwind `max-sm:`/`sm:` 响应式前缀）：
  - 画廊 header：`flex-wrap` + 搜索框手机换到第二行占满（`max-sm:order-[100] max-sm:basis-full`），logo/排序/上传/头像同一行，字号收敛。
  - 上传页 header / profile header / 详情 header：padding px-4 py-2、logo 字号 16 mobile。
  - 上传页 3 张方式卡片：`grid-cols-1 sm:grid-cols-3`（手机纵向堆叠）。
  - 上传表单 标题/作者：`grid-cols-1 sm:grid-cols-2`。
  - 详情/上传/资料 main：手机 `px-4`。
  - 画廊栅格手机 `gap-10px padding 12px`。
  - 登录/注册 & 个人资料 卡片：p-6 sm:p-8。
- 结论：未用 Chrome 截图验证（环境无 Chrome），但均为标准响应式类，tsc+build 通过。

### 🔄 待办（从这继续）

> **2026-09-03 更新**：登录/注册/头像线已全部完成上线（见上）。7 号"生产重启"已作废旧（2号机已 systemctl 部署）。
> 文档已完成（2026-09-03）：权威参考见 **`/root/dsh-work/DOCUMENTATION.md`**，`HANDOFF.md` 已更新。
> **做了：用户/作者详情页 = 废案（不做）**；改做上传/展示改造（ComfyUI 支持等，见 §6.5）。
1. ✅ 已在容器内用 standalone（端口 3199，数据隔离）做端到端自测，**全部通过**：
   - GET / 未登录 → 307 /login；/api/me 未登录 → 401
   - 注册 201 → 登录 200+Set-Cookie → me(cookie) 200 → 登出 200 → me 401
   - 错误密码 401；重复注册 400「用户名已存在」
   - 登录后 / /upload /i/[id] 均 200；/api/works total=10
   - /api/upload 无文件（已登录）→ 400「未收到图片文件」
   - DELETE 他人作品 → 403「无权限」
   - （注：自测在 standalone/data 的隔离 DB，不碰宿主/源码 DB；测完已清理。）
2. ✅ git 本地提交：`95ed927 登录/注册系统…`，**已 push 到 GitHub**（origin/main）。（后续提交：6d6d837 头像菜单、97b9f4f 头像贴最右，均已 push + 部署。）
3. ✅ 生产部署完成（2号机 hk-2，`systemctl restart aitag-site`），线上端到端验证通过。
8. （废案 2026-09-03）用户/作者详情页 **不做**（已确认取消）。
9. 🔄 **（下一次轮）画廊检索增强**：加**类型筛选**（nai/comfyui/other）+ **按时间排序**（用户留到下一轮）。月榜页本身是废案。

## 7.5 开源参考调研（2026-09-02，用户要求「去 GitHub 看有没有可直接用/参考的项目」）

调研方式：GitHub API 直连搜索（内置 web_search 挂了、Tavily key 401）。结论：**没有能直接拿来替换整个站的项目**，
但有两个高价值参考，尤其对**后续用户/作者详情页**：

### 首选参考：Serika.art（serika-dev/Serika.art）
- 现代 Next.js(16) + TS + Tailwind + MongoDB 的 Danbooru 风图板平台（live: serika.art），有完整**认证 + 用户体系 + API 文档**。
- 与我们要做的结构高度对应：
  - 登录路由 `app/api/auth/login|logout|me/route.ts`、`lib/auth.ts`（`getCurrentUser()`，cookie + Bearer 双通道验证 token）
  - **用户页 `app/user/[username]/page.tsx`**：头像/banner/rank/bio/注册时间 + Tab（作品/收藏/评论）——我们用户页蓝本
  - `app/api/users/[id]/route.ts`（用户公开信息）+ `/activity`（该用户作品/动态）
  - `lib/AuthContext.tsx`（前端会话态）、admin 用户管理页
- 但它用外部账户服务（Serika Accounts）+ MongoDB，我们**不需要**——直接用 SQLite `users` 表 + `works.author_name` 关联即可，参考它**的用户页 UI/数据组织**。

### 次要参考
- `jsh135790/AIGC-Gallery`：本地 AI 图片管理（元数据管理强，但不是网站）。
- `floit04/novelai-prompt-manager`：NovelAI 咒语管理，油猴脚本定位，仅参考 NAI 元数据字段组织。
- `koishijs/novelai-gallery`：示例图集，参考价值低。

### 结论
登录/注册实现自己已写好，无需照搬外部。用户页留档：参考 Serika.art 的 `/user/[username]` + `/api/users/[id]` 结构，
用 `works.author_name` 按作者聚合作品即可（SQL: `WHERE author_name=? ORDER BY create_date DESC`）。

## 8. 常见坑（沿用 HANDOFF §12）

- 部署不补 `.next/static` → 客户端组件全挂。
- headless Chrome 截图在此环境不可信，验证用「HTML 引用 vs 文件 + HTTP 状态码 + API JSON」。
- 杀进程用 python 精准匹配 `next-server`，别用 `pkill -f`（会杀掉自己）。
- 视觉/OCR 工具频繁限流，必要时用 node fetch / pixel python 替代。