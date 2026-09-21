// SQLite 数据访问层 —— 服务端专用（Node 24 内置 node:sqlite）
// 注意：此模块只能被服务端代码 import（API routes / seed 脚本）。

import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { Work, WorkListItem, PagedWorks } from "./types";
import { toThumbUrl } from "./format";
import type { R18GPref } from "./r18g-tags";
import { STUDIO_HISTORY_LIMIT as STUDIO_HISTORY_LIMIT_PRESET } from "./studio-presets";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "aitag.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(DB_PATH);

    // 注册「正向提示词含词」匹配函数（R18G 屏蔽用）：
    // 只匹配结构化正向 prompt（metadata.prompt / metadata.per_image[*].prompt），
    // 不匹配负向 uc（负向出现 = 作者已排除），不匹配 rawJson/_raw.workflow（节点 JSON 噪音）。
    // 词边界（\b）+ 大小写不敏感：scat 不会误中 subsurface_scattering、pee 不会误中 peep。
    db.function("has_pos_tag", { deterministic: true }, (meta: unknown, tag: unknown) => {
      if (typeof meta !== "string" || !meta || typeof tag !== "string" || !tag) return 0;
      try {
        const m = JSON.parse(meta) as Record<string, unknown>;
        const prompts: string[] = [];
        if (typeof m.prompt === "string") prompts.push(m.prompt);
        if (Array.isArray(m.per_image)) {
          for (const p of m.per_image) {
            if (p && typeof p.prompt === "string") prompts.push(p.prompt);
          }
        }
        const haystack = prompts.join(" \u0001 ").toLowerCase();
        const needle = tag.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|[^a-z0-9_])${needle}($|[^a-z0-9_])`).test(haystack) ? 1 : 0;
      } catch {
        return 0;
      }
    });
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS works (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        caption TEXT DEFAULT '',
        create_date TEXT NOT NULL,
        ai_type TEXT NOT NULL DEFAULT 'nai',
        image_count INTEGER NOT NULL DEFAULT 1,
        tags TEXT NOT NULL DEFAULT '[]',
        author_name TEXT NOT NULL DEFAULT '群友',
        total_view INTEGER NOT NULL DEFAULT 0,
        total_bookmarks INTEGER NOT NULL DEFAULT 0,
        images TEXT NOT NULL DEFAULT '[]',
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_works_create_date ON works(create_date DESC);
      CREATE INDEX IF NOT EXISTS idx_works_ai_type ON works(ai_type);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',   -- 'admin' | 'user'
        author_name TEXT NOT NULL DEFAULT '',
        avatar TEXT NOT NULL DEFAULT '',      -- 头像 URL（空 = 默认图标）
        create_date TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        create_date TEXT NOT NULL,
        expire_date TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      -- 用户对作品的点赞/收藏记录（action: 'like' | 'bookmark'）
      CREATE TABLE IF NOT EXISTS user_actions (
        user_id TEXT NOT NULL,
        work_id TEXT NOT NULL,
        action TEXT NOT NULL,
        create_date TEXT NOT NULL,
        PRIMARY KEY (user_id, work_id, action)
      );
      CREATE INDEX IF NOT EXISTS idx_user_actions_work ON user_actions(work_id);

      -- 浏览量记录（同用户同作品在时间窗口内去重，防刷新刷量）
      CREATE TABLE IF NOT EXISTS view_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        work_id TEXT NOT NULL,
        create_date TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_view_logs_user_work ON view_logs(user_id, work_id, create_date);

      -- 生图台历史（每个用户保留最近 N 张，见 STUDIO_HISTORY_LIMIT）
      -- 图片文件落在 data/uploads/hist/（原图）与 data/uploads/hist/thumb/（缩略图），
      -- 库里只存文件名，不存 base64 —— 否则一张图几百 KB 的字符串会把库撑爆、每次读列表都要全量解析。
      CREATE TABLE IF NOT EXISTS studio_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        file TEXT NOT NULL,          -- 原图文件名（data/uploads/hist/ 下）
        thumb TEXT NOT NULL,         -- 缩略图文件名（data/uploads/hist/thumb/ 下，WebP）
        ext TEXT NOT NULL DEFAULT 'png',
        backend TEXT NOT NULL DEFAULT '',   -- 'direct' | 'openai'
        model TEXT NOT NULL DEFAULT '',
        size TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT '',    -- 正向提示词（截断存储）
        negative TEXT NOT NULL DEFAULT '',
        meta TEXT,                          -- 生成参数 JSON（与「传到图库」同口径）
        create_date TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_studio_history_user ON studio_history(user_id, create_date DESC);
    `);
    // 兼容已存在的 works 表（旧库没有 total_likes 列）
    const wcols = db
      .prepare(`PRAGMA table_info(works)`)
      .all() as Array<{ name: string }>;
    if (!wcols.some((c) => c.name === "total_likes")) {
      db.exec(`ALTER TABLE works ADD COLUMN total_likes INTEGER NOT NULL DEFAULT 0`);
    }
    // 兼容已存在的 users 表（旧库没有 avatar 列）
    const cols = db
      .prepare(`PRAGMA table_info(users)`)
      .all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "avatar")) {
      db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''`);
    }
    // 兼容已存在的 users 表（旧库没有 api_token_hash 列）
    if (!cols.some((c) => c.name === "api_token_hash")) {
      db.exec(`ALTER TABLE users ADD COLUMN api_token_hash TEXT NOT NULL DEFAULT ''`);
    }
    // 兼容已存在的 users 表（旧库没有 r18g_pref 列：R18G 屏蔽偏好 JSON）
    if (!cols.some((c) => c.name === "r18g_pref")) {
      db.exec(`ALTER TABLE users ADD COLUMN r18g_pref TEXT NOT NULL DEFAULT '{}'`);
    }
    // 兼容已存在的 users 表（旧库没有 studio_cfg 列：生图台个人密钥 JSON）
    if (!cols.some((c) => c.name === "studio_cfg")) {
      db.exec(`ALTER TABLE users ADD COLUMN studio_cfg TEXT NOT NULL DEFAULT ''`);
    }
    // 用户名唯一性兜底：TEXT UNIQUE 默认区分大小写（"Admin" 能和 "admin" 共存 = 冒充风险）
    // 用 lower(username) 唯一索引把大小写不同的同名也挡住（中文无大小写，不受影响）
    try {
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(lower(username))`,
      );
    } catch (e) {
      // 存量库若已存在大小写不同的同名用户，索引建不上：告警但不阻断启动
      console.error("[db] 用户名大小写唯一索引创建失败（存量同名冲突）:", e);
    }
  }
  return db;
}

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function rowToWork(row: Record<string, unknown>): Work {
  return {
    id: String(row.id),
    title: String(row.title),
    caption: String(row.caption ?? ""),
    create_date: String(row.create_date),
    ai_type: (row.ai_type as Work["ai_type"]) ?? "nai",
    image_count: Number(row.image_count ?? 1),
    tags: parseJson<string[]>(row.tags as string | null, []),
    author_name: String(row.author_name ?? "群友"),
    total_view: Number(row.total_view ?? 0),
    total_bookmarks: Number(row.total_bookmarks ?? 0),
    total_likes: Number(row.total_likes ?? 0),
    images: parseJson<string[]>(row.images as string | null, []),
    metadata: parseJson<Record<string, unknown> | null>(
      row.metadata as string | null,
      null,
    ),
  };
}

/** Work → WorkListItem（列表卡片用缩略图，详情页仍用原图 /api/images/） */
function toListItem(w: Work): WorkListItem {
  return {
    id: w.id,
    title: w.title,
    caption: w.caption,
    create_date: w.create_date,
    ai_type: w.ai_type,
    image_count: w.image_count,
    tags: w.tags,
    author_name: w.author_name,
    total_view: w.total_view,
    total_bookmarks: w.total_bookmarks,
    cover: w.images[0] ? toThumbUrl(w.images[0]) : "",
  };
}

export function insertWork(work: Work): void {
  const d = getDb();
  d.prepare(
    `INSERT OR REPLACE INTO works
     (id, title, caption, create_date, ai_type, image_count, tags, author_name, total_view, total_bookmarks, total_likes, images, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    work.id,
    work.title,
    work.caption,
    work.create_date,
    work.ai_type,
    work.image_count,
    JSON.stringify(work.tags),
    work.author_name,
    work.total_view,
    work.total_bookmarks,
    work.total_likes ?? 0,
    JSON.stringify(work.images),
    work.metadata ? JSON.stringify(work.metadata) : null,
  );
}

// 浏览量 +1（时间窗口去重：同用户同作品在 windowMs 内只计一次，防刷新刷量）
// 返回最新值。窗口内重复访问返回 null 表示未计入。
export function recordView(userId: string, workId: string, windowMs = 10 * 60 * 1000): number | null {
  const d = getDb();
  const since = new Date(Date.now() - windowMs).toISOString();
  const recent = d
    .prepare("SELECT 1 FROM view_logs WHERE user_id = ? AND work_id = ? AND create_date > ? LIMIT 1")
    .get(userId, workId, since);
  if (recent) {
    // 窗口内已看过：不计，返回当前值
    const row = d.prepare("SELECT total_view FROM works WHERE id = ?").get(workId) as
      | { total_view: number }
      | undefined;
    return Number(row?.total_view ?? 0);
  }
  // 插日志 + 更新计数放同一事务，防部分失败导致计数与日志永久不一致
  d.exec("BEGIN IMMEDIATE");
  try {
    d.prepare(
      "INSERT INTO view_logs (user_id, work_id, create_date) VALUES (?, ?, ?)",
    ).run(userId, workId, new Date().toISOString());
    d.prepare("UPDATE works SET total_view = total_view + 1 WHERE id = ?").run(workId);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  // F14a：低频顺手清理 7 天前的浏览日志（去重只看窗口内记录，删旧日志不影响正确性）
  if (Math.random() < 0.01) {
    try {
      d.prepare(`DELETE FROM view_logs WHERE create_date < ?`)
        .run(new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
    } catch { /* 清理失败不影响主流程 */ }
  }
  const row = d.prepare("SELECT total_view FROM works WHERE id = ?").get(workId) as
    | { total_view: number }
    | undefined;
  return Number(row?.total_view ?? 0);
}

// 切换点赞/收藏（幂等 toggle）：
// 已存在 → 取消并 -1；不存在 → 添加并 +1。返回 { active, count }
export function toggleAction(
  userId: string,
  workId: string,
  action: "like" | "bookmark",
): { active: boolean; count: number } {
  const d = getDb();
  const col = action === "like" ? "total_likes" : "total_bookmarks";
  // 记录表写入与计数更新放同一事务，防部分失败导致两者永久不一致
  d.exec("BEGIN IMMEDIATE");
  try {
    const existing = d
      .prepare("SELECT 1 FROM user_actions WHERE user_id = ? AND work_id = ? AND action = ?")
      .get(userId, workId, action);
    if (existing) {
      d.prepare("DELETE FROM user_actions WHERE user_id = ? AND work_id = ? AND action = ?").run(
        userId, workId, action,
      );
      d.prepare(`UPDATE works SET ${col} = MAX(0, ${col} - 1) WHERE id = ?`).run(workId);
      const row = d.prepare(`SELECT ${col} AS c FROM works WHERE id = ?`).get(workId) as
        | { c: number }
        | undefined;
      d.exec("COMMIT");
      return { active: false, count: Number(row?.c ?? 0) };
    }
    d.prepare(
      "INSERT INTO user_actions (user_id, work_id, action, create_date) VALUES (?, ?, ?, ?)",
    ).run(userId, workId, action, new Date().toISOString());
    d.prepare(`UPDATE works SET ${col} = ${col} + 1 WHERE id = ?`).run(workId);
    const row = d.prepare(`SELECT ${col} AS c FROM works WHERE id = ?`).get(workId) as
      | { c: number }
      | undefined;
    d.exec("COMMIT");
    return { active: true, count: Number(row?.c ?? 0) };
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

// 查询某用户对某个作品的点赞/收藏状态
export function getUserActionState(
  userId: string,
  workId: string,
): { liked: boolean; bookmarked: boolean } {
  const d = getDb();
  const rows = d
    .prepare("SELECT action FROM user_actions WHERE user_id = ? AND work_id = ?")
    .all(userId, workId) as Array<{ action: string }>;
  return {
    liked: rows.some((r) => r.action === "like"),
    bookmarked: rows.some((r) => r.action === "bookmark"),
  };
}

export function getWorkById(id: string): Work | null {
  const d = getDb();
  const row = d.prepare("SELECT * FROM works WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToWork(row) : null;
}

// 列表 + 搜索
export function listWorks(opts: {
  q?: string;
  prompt?: string;
  sort?: "new" | "old" | "monthly" | "bookmarks";
  ai_type?: string;
  time_range?: string;
  author?: string;
  /** 作者名候选（用户主页用）：昵称 + 用户名都要能命中，兼容改名前后的作品 */
  author_in?: string[];
  /** 屏蔽 tag：正向 prompt 含任一该词的图排除（逗号分隔多个，兼容旧用法） */
  block_tags?: string;
  /** 屏蔽 tag（数组形式）：各词都按「正向 prompt 词边界命中」独立排除，全部满足才保留 */
  blocked_pos_tags?: string[];
  page?: number;
  page_size?: number;
}): PagedWorks {
  const d = getDb();
  const page = Math.max(1, opts.page ?? 1);
  const page_size = Math.min(50, Math.max(1, opts.page_size ?? 24));

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (opts.q) {
    // 全部字段统一转义 LIKE 通配符（% _ \），并逐表达式带 ESCAPE ——
    // 否则搜 "100%" 之类的词会在未转义通道全表匹配
    const escQ = opts.q.replace(/[\\%_]/g, (c) => "\\" + c);
    where.push(
      "(title LIKE ? ESCAPE '\\' OR caption LIKE ? ESCAPE '\\' OR author_name LIKE ? ESCAPE '\\' " +
        "OR id LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' OR metadata LIKE ? ESCAPE '\\')",
    );
    const like = `%${escQ}%`;
    // 正向 prompt（"prompt": 键，含 per_image/_raw 存档）也参与搜索，与屏蔽 tag 同口径
    params.push(like, like, like, like, like, `%"prompt":%${escQ}%`);
  }
  if (opts.prompt) {
    where.push("(metadata LIKE ?)");
    params.push(`%${opts.prompt}%`);
  }
  // 屏蔽 tag：只匹配正向 prompt（词边界）——用 has_pos_tag 函数，每个词独立排除。
  // 语义：作品的正向 prompt（顶层 + per_image 逐图）只要含任一屏蔽词即被整部排除。
  // 负向 uc 从不匹配（负向出现 = 作者已排除，图中不含）。
  const blockedTags: string[] = [];
  if (opts.block_tags) {
    for (const t of opts.block_tags.split(",")) {
      const v = t.trim().toLowerCase();
      if (v) blockedTags.push(v);
    }
  }
  if (opts.blocked_pos_tags) {
    for (const t of opts.blocked_pos_tags) {
      const v = t.trim().toLowerCase();
      if (v) blockedTags.push(v);
    }
  }
  for (const tag of blockedTags) {
    where.push(`has_pos_tag(metadata, ?) = 0`);
    params.push(tag);
  }
  // 类型筛选：只接受明确的 ai_type 值
  if (opts.ai_type && ["sd", "nai", "nai_x", "comfyui", "other"].includes(opts.ai_type)) {
    where.push("ai_type = ?");
    params.push(opts.ai_type);
  }
  // 作者过滤（用户主页）：author_name 精确匹配昵称/用户名
  // author_in 用于「昵称 ≠ 用户名」的账号（含历史遗留行），多个别名取并集
  const authorNames: string[] = [];
  if (opts.author) authorNames.push(opts.author);
  for (const a of opts.author_in ?? []) {
    const v = a.trim();
    if (v && !authorNames.includes(v)) authorNames.push(v);
  }
  if (authorNames.length === 1) {
    where.push("author_name = ?");
    params.push(authorNames[0]);
  } else if (authorNames.length > 1) {
    where.push(`author_name IN (${authorNames.map(() => "?").join(", ")})`);
    params.push(...authorNames);
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const s = opts.sort ?? "new";
  const orderSql =
    s === "old"
      ? "ORDER BY create_date ASC"
      : s === "monthly" || s === "bookmarks"
        ? "ORDER BY total_bookmarks DESC, total_view DESC, create_date DESC"
        : "ORDER BY create_date DESC";

  const total =
    (
      d
        .prepare(`SELECT COUNT(*) AS c FROM works ${whereSql}`)
        .get(...params) as { c: number }
    ).c ?? 0;

  const rows = d
    .prepare(
      `SELECT * FROM works ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    )
    .all(...params, page_size, (page - 1) * page_size) as Record<
    string,
    unknown
  >[];

  const items: WorkListItem[] = rows.map((r) => toListItem(rowToWork(r)));

  return {
    items,
    page,
    page_size,
    total,
    total_pages: Math.ceil(total / page_size),
  };
}

// 用户主页统计：作品数 / 获赞总数 / 被收藏总数 / 总浏览
// 接受多个作者名别名（昵称 + 用户名），兼容改名前后上传的作品
export function getUserStats(
  authors: string | string[],
): { work_count: number; total_likes: number; total_bookmarks: number; total_views: number } {
  const d = getDb();
  const names = (Array.isArray(authors) ? authors : [authors])
    .map((a) => a.trim())
    .filter((a, i, arr) => a && arr.indexOf(a) === i);
  const empty = { work_count: 0, total_likes: 0, total_bookmarks: 0, total_views: 0 };
  if (names.length === 0) return empty;
  const row = d
    .prepare(
      `SELECT
         COUNT(*) AS work_count,
         COALESCE(SUM(total_likes), 0) AS total_likes,
         COALESCE(SUM(total_bookmarks), 0) AS total_bookmarks,
         COALESCE(SUM(total_view), 0) AS total_views
       FROM works WHERE author_name IN (${names.map(() => "?").join(", ")})`,
    )
    .get(...names) as
    | { work_count: number; total_likes: number; total_bookmarks: number; total_views: number }
    | undefined;
  return {
    work_count: Number(row?.work_count ?? 0),
    total_likes: Number(row?.total_likes ?? 0),
    total_bookmarks: Number(row?.total_bookmarks ?? 0),
    total_views: Number(row?.total_views ?? 0),
  };
}

// 用户收藏过的作品（user_actions 里 bookmark 的记录，关联 works）
export function listBookmarkedWorks(
  userId: string,
  page = 1,
  page_size = 24,
  blockedPosTags: string[] = [],
): PagedWorks {
  const d = getDb();
  const page2 = Math.max(1, page);
  const size = Math.min(50, Math.max(1, page_size));
  const blocked = blockedPosTags.filter((t) => t.trim());
  const extraWhere = blocked.map(() => `has_pos_tag(works.metadata, ?) = 0`).join(" AND ");
  const total =
    (
      d
        .prepare(
          `SELECT COUNT(*) AS c FROM user_actions
           JOIN works ON works.id = user_actions.work_id
           WHERE user_actions.user_id = ? AND user_actions.action = 'bookmark'
           ${extraWhere ? "AND " + extraWhere : ""}`,
        )
        .get(userId, ...blocked) as { c: number }
    ).c ?? 0;
  const rows = d
    .prepare(
      `SELECT works.* FROM user_actions
       JOIN works ON works.id = user_actions.work_id
       WHERE user_actions.user_id = ? AND user_actions.action = 'bookmark'
       ${extraWhere ? "AND " + extraWhere : ""}
       ORDER BY user_actions.create_date DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, ...blocked, size, (page2 - 1) * size) as Record<string, unknown>[];
  const items: WorkListItem[] = rows.map((r) => toListItem(rowToWork(r)));
  return {
    items,
    page: page2,
    page_size: size,
    total,
    total_pages: Math.ceil(total / size),
  };
}

// ===== 用户 & 会话 =====

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: "admin" | "user";
  author_name: string;
  avatar: string;
  create_date: string;
  /** API token 的 SHA-256 哈希（不存明文） */
  api_token_hash?: string;
}

export function createUser(user: {
  id: string;
  username: string;
  password_hash: string;
  role?: "admin" | "user";
  author_name?: string;
  avatar?: string;
}): void {
  const d = getDb();
  // 不用 OR IGNORE：让 UNIQUE 约束冲突抛出，由调用方（registerUser）捕获转成友好错误，
  // 避免并发注册同名时静默吞掉、随后非空断言崩溃
  d.prepare(
    `INSERT INTO users (id, username, password_hash, role, author_name, avatar, create_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    user.id,
    user.username,
    user.password_hash,
    user.role ?? "user",
    user.author_name || user.username,
    user.avatar ?? "",
    new Date().toISOString(),
  );
}

export function updateAvatar(userId: string, avatarUrl: string): void {
  const d = getDb();
  d.prepare(`UPDATE users SET avatar = ? WHERE id = ?`).run(avatarUrl, userId);
}

export function updatePassword(userId: string, passwordHash: string): void {
  const d = getDb();
  d.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);
}

/**
 * 改昵称（昵称 = 作品作者名）：users.author_name 与本人作品的 author_name 同一事务内同步。
 *
 * 为什么必须级联：作品归属靠字符串 `works.author_name`，用户主页/统计/删除权限都按它匹配。
 * 只改 users 不改 works 的话，改名后「我的主页」会变成空的。级联时同时收敛
 * `author_name = username` 的历史行（早期上传写的是登录名，admin 等改过昵称的账号因此对不上）。
 *
 * ⚠️ 重名校验必须放在**同一个事务里**（BEGIN IMMEDIATE 之后）：
 * `author_name` 列**没有唯一索引**（只有 `username` 有 `lower(username)` 唯一索引），
 * 所以数据库不会替我们挡住重名 —— 先查后写会在并发改名时漏过去（TOCTOU），
 * 而重名会让两个人的作品互相「认领」。放事务内 + BEGIN IMMEDIATE 拿写锁即可串行化。
 *
 * @returns `{ ok:false }` 表示重名被挡下；`{ ok:true }` 才真正写入。
 */
export function updateAuthorName(
  userId: string,
  newName: string,
): { ok: true; works: number } | { ok: false; error: string } {
  const d = getDb();
  d.exec("BEGIN IMMEDIATE");
  try {
    const row = d
      .prepare("SELECT username, author_name FROM users WHERE id = ?")
      .get(userId) as { username: string; author_name: string } | undefined;
    if (!row) throw new Error("用户不存在");

    // 事务内复查重名（拿的是写锁，此刻不会再有人插进来）
    const taken = d
      .prepare(
        `SELECT 1 FROM users
         WHERE id != ? AND (username = ? COLLATE NOCASE OR author_name = ? COLLATE NOCASE)
         LIMIT 1`,
      )
      .get(userId, newName, newName);
    if (taken) {
      d.exec("ROLLBACK");
      return { ok: false, error: "该昵称已被占用（他人的用户名或昵称与之重复）" };
    }

    const oldName = row.author_name || row.username;
    d.prepare("UPDATE users SET author_name = ? WHERE id = ?").run(newName, userId);
    const res = d
      .prepare("UPDATE works SET author_name = ? WHERE author_name = ? OR author_name = ?")
      .run(newName, oldName, row.username);
    d.exec("COMMIT");
    return { ok: true, works: Number(res.changes) };
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** 昵称/用户名是否已被**他人**占用（大小写不敏感），改名前必查 */
export function isNameTakenByOthers(name: string, userId: string): boolean {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT 1 FROM users
       WHERE id != ? AND (username = ? COLLATE NOCASE OR author_name = ? COLLATE NOCASE)
       LIMIT 1`,
    )
    .get(userId, name, name);
  return Boolean(row);
}

/**
 * 名称是否已被任何账号占用（用户名 **或** 昵称，大小写不敏感）。
 *
 * 注册专用：注册时用户名即昵称，所以必须**两个方向都挡**，否则会出现
 * 「A 把昵称改成 X」→「B 注册用户名 X」→ 两个人的 author_name 都是 X，
 * 作品互相认领、`/u/X` 指向谁全看查询顺序。改名方向由 isNameTakenByOthers 负责。
 */
export function isNameTaken(name: string): boolean {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT 1 FROM users
       WHERE username = ? COLLATE NOCASE OR author_name = ? COLLATE NOCASE
       LIMIT 1`,
    )
    .get(name, name);
  return Boolean(row);
}

// ---- 用户偏好：R18G 内容屏蔽（总开关 + 勾选词 + 自定义词） ----

function defaultPref(): R18GPref {
  return { enabled: false, selected: [], custom: [] };
}

/** 解析偏好 JSON（容错：损坏/缺字段都回退默认） */
export function getUserPref(userId: string): R18GPref {
  const d = getDb();
  const row = d.prepare("SELECT r18g_pref FROM users WHERE id = ?").get(userId) as
    | { r18g_pref?: string }
    | undefined;
  const raw = row?.r18g_pref;
  if (!raw) return defaultPref();
  try {
    const p = JSON.parse(raw) as Partial<R18GPref>;
    return {
      enabled: p.enabled === true,
      selected: Array.isArray(p.selected)
        ? p.selected.filter((s): s is string => typeof s === "string")
        : [],
      custom: Array.isArray(p.custom)
        ? p.custom.filter((s): s is string => typeof s === "string")
        : [],
    };
  } catch {
    return defaultPref();
  }
}

export function setUserPref(userId: string, pref: R18GPref): void {
  const d = getDb();
  d.prepare(`UPDATE users SET r18g_pref = ? WHERE id = ?`).run(
    JSON.stringify(pref),
    userId,
  );
}

// ---- 用户生图台密钥（OpenAI 兼容 key + sta1n 直连 token，个人自配） ----

// 落盘加密（AES-256-GCM）：防止数据库文件单独泄漏（备份误传/目录暴露）时明文密钥被拖走。
// 密钥来源：环境变量 AITAG_STUDIO_SECRET（≥32 字符，推荐生产用）优先，
// 否则首次自动生成 data/studio.secret（0600，/data/ 已 gitignore）。
// 密文格式 "enc:v1:<iv>:<tag>:<data>"（均 base64）；旧明文兼容读取，下次保存自动转密文。
let studioSecretCache: Buffer | null | undefined;

/**
 * 返回密钥材料 = 密钥字符串本身的字节（env 值或文件里的 64 hex 字符串）。
 * AES 密钥统一 = sha256(材料) —— 两个来源分支必须同一派生方式（2026-09-14 修复：
 * 原先文件分支直接用 hex 解码字节当 key、env 分支用 sha256，互相读不开）。
 * env 与文件内容相同（env=文件的 64 hex 字符串）时两者等价可互换。
 * 来源优先级：AITAG_STUDIO_SECRET env（≥32 字符）> data/studio.secret（64 hex）
 */
function getStudioSecret(): Buffer | null {
  if (studioSecretCache !== undefined) return studioSecretCache;
  const env = process.env.AITAG_STUDIO_SECRET;
  if (env && env.length >= 32) {
    studioSecretCache = Buffer.from(env, "utf8");
    return studioSecretCache;
  }
  const secretPath = path.join(DATA_DIR, "studio.secret");
  try {
    const raw = fs.readFileSync(secretPath, "utf8").trim();
    if (/^[0-9a-f]{64}$/.test(raw)) {
      studioSecretCache = Buffer.from(raw, "utf8");
      return studioSecretCache;
    }
  } catch {
    // 首次：文件不存在
  }
  const generated = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(secretPath, generated + "\n", { mode: 0o600 });
  studioSecretCache = Buffer.from(generated, "utf8");
  return studioSecretCache;
}

/** AES-256-GCM 密钥 = sha256(密钥材料)，加解密唯一入口 */
function getStudioAesKey(): Buffer | null {
  const material = getStudioSecret();
  if (!material) return null;
  return crypto.createHash("sha256").update(material).digest();
}

function encryptStudioCfg(plain: string): string {
  const key = getStudioAesKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function decryptStudioCfg(stored: string): string {
  if (!stored.startsWith("enc:v1:")) return stored;
  try {
    const [ivB64, tagB64, dataB64] = stored.slice("enc:v1:".length).split(":");
    const key = getStudioAesKey();
    if (!key) return "";
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // 密钥不匹配/密文损坏 → 视作未配置（用户重新保存即可）
    return "";
  }
}

export interface UserStudioCfg {
  openai?: { base_url?: string; api_key?: string };
  direct?: { base_url?: string; token?: string };
}

export function getUserStudioCfg(userId: string): UserStudioCfg {
  const d = getDb();
  const row = d.prepare("SELECT studio_cfg FROM users WHERE id = ?").get(userId) as
    | { studio_cfg?: string }
    | undefined;
  if (!row?.studio_cfg) return {};
  try {
    const parsed = JSON.parse(decryptStudioCfg(row.studio_cfg)) as UserStudioCfg;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function setUserStudioCfg(userId: string, cfg: UserStudioCfg): void {
  const d = getDb();
  d.prepare(`UPDATE users SET studio_cfg = ? WHERE id = ?`).run(
    encryptStudioCfg(JSON.stringify(cfg)),
    userId,
  );
}

// ---- API Token（供外部插件上传鉴权，账号绑定） ----

// 生成一个新的 API token（明文返回给用户，库里只存哈希）
export function generateApiToken(userId: string): string {
  const d = getDb();
  const token = crypto.randomBytes(32).toString("hex"); // 64 位十六进制
  const hash = hashApiToken(token);
  d.prepare(`UPDATE users SET api_token_hash = ? WHERE id = ?`).run(hash, userId);
  return token;
}

// 校验 token：匹配返回用户，否则 null
export function getUserByApiToken(token: string): UserRow | null {
  if (!token) return null;
  const d = getDb();
  const hash = hashApiToken(token);
  const row = d.prepare("SELECT * FROM users WHERE api_token_hash = ?").get(hash) as
    | Record<string, unknown>
    | undefined;
  return row ? (row as unknown as UserRow) : null;
}

// 查询某用户是否已生成过 token
export function hasApiToken(userId: string): boolean {
  const d = getDb();
  const row = d.prepare("SELECT api_token_hash FROM users WHERE id = ?").get(userId) as
    | { api_token_hash?: string }
    | undefined;
  return Boolean(row?.api_token_hash);
}

function hashApiToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** 按用户名查用户（大小写不敏感："Admin" 与 "admin" 视为同一人，防冒充/防重名） */
export function getUserByUsername(username: string): UserRow | null {
  const d = getDb();
  const row = d
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(username.trim()) as Record<string, unknown> | undefined;
  return row ? (row as unknown as UserRow) : null;
}

/**
 * 按「句柄」查用户：先按用户名，再按昵称（都大小写不敏感）。
 * 用于 /u/[handle] 路由 —— 改了昵称之后，历史作品的作者链接 `/u/<昵称>` 仍要能打开。
 */
export function getUserByHandle(handle: string): UserRow | null {
  const h = handle.trim();
  if (!h) return null;
  const d = getDb();
  // 先昵称、再用户名：/u/ 的链接是从「作品作者名」点进来的，而作者名展示的就是昵称。
  // 改过昵称的账号，其历史作品的链接指向新昵称，必须优先命中本人。
  // （注册与改名都做了双向查重，正常不会出现两者分属不同人的情况。）
  const byAuthor = d
    .prepare("SELECT * FROM users WHERE author_name = ? COLLATE NOCASE")
    .get(h) as Record<string, unknown> | undefined;
  if (byAuthor) return byAuthor as unknown as UserRow;
  const byUsername = d
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(h) as Record<string, unknown> | undefined;
  return byUsername ? (byUsername as unknown as UserRow) : null;
}

export function getUserById(id: string): UserRow | null {
  const d = getDb();
  const row = d.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? (row as unknown as UserRow) : null;
}

export function createSession(token: string, userId: string, ttlMs: number): void {
  const d = getDb();
  const now = Date.now();
  // 顺手清理过期 session（防止无限累积；低频 DELETE，量小无碍）
  d.prepare(`DELETE FROM sessions WHERE expire_date <= ?`).run(new Date(now).toISOString());
  d.prepare(
    `INSERT INTO sessions (token, user_id, create_date, expire_date) VALUES (?, ?, ?, ?)`,
  ).run(token, userId, new Date(now).toISOString(), new Date(now + ttlMs).toISOString());
}

export function getSessionUser(token: string): UserRow | null {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expire_date > ?`,
    )
    .get(token, new Date().toISOString()) as Record<string, unknown> | undefined;
  return row ? (row as unknown as UserRow) : null;
}

export function deleteSession(token: string): void {
  const d = getDb();
  d.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function deleteWorkById(id: string): { deleted: boolean; authorName: string } {
  const d = getDb();
  const work = d.prepare("SELECT author_name FROM works WHERE id = ?").get(id) as
    | { author_name: string }
    | undefined;
  if (!work) return { deleted: false, authorName: "" };
  const res = d.prepare("DELETE FROM works WHERE id = ?").run(id);
  return { deleted: Number(res.changes) > 0, authorName: work.author_name };
}

/** 统计除 excludeWorkId 外，还有多少作品引用了某图片文件名（内容去重共享判断） */
export function countOtherImageReferences(filename: string, excludeWorkId: string): number {
  const d = getDb();
  // 文件名是 hex hash + 扩展名，无 LIKE 通配符，无需转义
  const row = d
    .prepare(`SELECT COUNT(*) AS c FROM works WHERE id != ? AND images LIKE ?`)
    .get(excludeWorkId, `%${filename}%`) as { c: number };
  return row.c;
}

/** 删除作品时清理其互动记录（user_actions / view_logs） */
export function deleteWorkSideRecords(workId: string): void {
  const d = getDb();
  d.prepare(`DELETE FROM user_actions WHERE work_id = ?`).run(workId);
  d.prepare(`DELETE FROM view_logs WHERE work_id = ?`).run(workId);
}

export function workExists(id: string): boolean {
  const d = getDb();
  return !!d.prepare("SELECT 1 FROM works WHERE id = ?").get(id);
}

// ============================================================================
// 生图台历史
// ============================================================================

/** 每个用户保留的生图记录条数（口径定义在 studio-presets，前端也读同一个常量） */
export const STUDIO_HISTORY_LIMIT = STUDIO_HISTORY_LIMIT_PRESET;

export interface StudioHistoryRow {
  id: string;
  user_id: string;
  file: string;
  thumb: string;
  ext: string;
  backend: string;
  model: string;
  size: string;
  prompt: string;
  negative: string;
  meta: string | null;
  create_date: string;
}

function rowToStudioHistory(row: Record<string, unknown>): StudioHistoryRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    file: String(row.file),
    thumb: String(row.thumb),
    ext: String(row.ext ?? "png"),
    backend: String(row.backend ?? ""),
    model: String(row.model ?? ""),
    size: String(row.size ?? ""),
    prompt: String(row.prompt ?? ""),
    negative: String(row.negative ?? ""),
    meta: (row.meta as string | null) ?? null,
    create_date: String(row.create_date),
  };
}

/** 新增一条生图历史 */
export function insertStudioHistory(entry: Omit<StudioHistoryRow, "create_date"> & { create_date?: string }): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO studio_history (id, user_id, file, thumb, ext, backend, model, size, prompt, negative, meta, create_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.user_id,
    entry.file,
    entry.thumb,
    entry.ext,
    entry.backend,
    entry.model,
    entry.size,
    entry.prompt,
    entry.negative,
    entry.meta,
    entry.create_date ?? new Date().toISOString(),
  );
}

/** 列出某用户的生图历史（新→旧） */
export function listStudioHistory(userId: string, limit = STUDIO_HISTORY_LIMIT): StudioHistoryRow[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT * FROM studio_history WHERE user_id = ?
       ORDER BY create_date DESC, rowid DESC LIMIT ?`,
    )
    .all(userId, Math.max(1, Math.min(200, Math.floor(limit)))) as Array<Record<string, unknown>>;
  return rows.map(rowToStudioHistory);
}

/** 取单条（带归属校验：非本人返回 null，避免越权读别人提示词） */
export function getStudioHistory(userId: string, id: string): StudioHistoryRow | null {
  const d = getDb();
  const row = d
    .prepare(`SELECT * FROM studio_history WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Record<string, unknown> | undefined;
  return row ? rowToStudioHistory(row) : null;
}

/**
 * 裁剪到 keep 条：删掉多余的库记录，并**返回被删的行**。
 * 文件删除由调用方负责（本层不碰磁盘），返回行是为了让调用方能清掉对应图片，
 * 否则库裁了、盘上图片会无限堆积。
 */
export function pruneStudioHistory(userId: string, keep = STUDIO_HISTORY_LIMIT): StudioHistoryRow[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT * FROM studio_history WHERE user_id = ?
       ORDER BY create_date DESC, rowid DESC LIMIT -1 OFFSET ?`,
    )
    .all(userId, Math.max(0, keep)) as Array<Record<string, unknown>>;
  if (!rows.length) return [];
  const victims = rows.map(rowToStudioHistory);
  const del = d.prepare(`DELETE FROM studio_history WHERE id = ?`);
  for (const v of victims) del.run(v.id);
  return victims;
}

/** 删除单条（返回被删的行，供调用方清理文件；不属本人则返回 null） */
export function deleteStudioHistory(userId: string, id: string): StudioHistoryRow | null {
  const row = getStudioHistory(userId, id);
  if (!row) return null;
  getDb().prepare(`DELETE FROM studio_history WHERE id = ?`).run(id);
  return row;
}

/** 全量删除某用户的历史（返回被删的行，供清理文件） */
export function clearStudioHistory(userId: string): StudioHistoryRow[] {
  const rows = listStudioHistory(userId, 200);
  if (!rows.length) return [];
  getDb().prepare(`DELETE FROM studio_history WHERE user_id = ?`).run(userId);
  return rows;
}
