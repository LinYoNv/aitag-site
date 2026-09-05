// SQLite 数据访问层 —— 服务端专用（Node 24 内置 node:sqlite）
// 注意：此模块只能被服务端代码 import（API routes / seed 脚本）。

import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { Work, WorkListItem, PagedWorks } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "aitag.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(DB_PATH);
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
  d.prepare(
    "INSERT INTO view_logs (user_id, work_id, create_date) VALUES (?, ?, ?)",
  ).run(userId, workId, new Date().toISOString());
  d.prepare("UPDATE works SET total_view = total_view + 1 WHERE id = ?").run(workId);
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
    return { active: false, count: Number(row?.c ?? 0) };
  }
  d.prepare(
    "INSERT INTO user_actions (user_id, work_id, action, create_date) VALUES (?, ?, ?, ?)",
  ).run(userId, workId, action, new Date().toISOString());
  d.prepare(`UPDATE works SET ${col} = ${col} + 1 WHERE id = ?`).run(workId);
  const row = d.prepare(`SELECT ${col} AS c FROM works WHERE id = ?`).get(workId) as
    | { c: number }
    | undefined;
  return { active: true, count: Number(row?.c ?? 0) };
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
  page?: number;
  page_size?: number;
}): PagedWorks {
  const d = getDb();
  const page = Math.max(1, opts.page ?? 1);
  const page_size = Math.min(50, Math.max(1, opts.page_size ?? 24));

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (opts.q) {
    where.push(
      "(title LIKE ? OR caption LIKE ? OR author_name LIKE ? OR id LIKE ? OR tags LIKE ?)",
    );
    const like = `%${opts.q}%`;
    params.push(like, like, like, like, like);
  }
  if (opts.prompt) {
    where.push("(metadata LIKE ?)");
    params.push(`%${opts.prompt}%`);
  }
  // 类型筛选：只接受明确的 ai_type 值
  if (opts.ai_type && ["sd", "nai", "nai_x", "comfyui", "other"].includes(opts.ai_type)) {
    where.push("ai_type = ?");
    params.push(opts.ai_type);
  }
  // 作者过滤（用户主页）：author_name 精确匹配用户名
  if (opts.author) {
    where.push("author_name = ?");
    params.push(opts.author);
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

  const items: WorkListItem[] = rows.map((r) => {
    const w = rowToWork(r);
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
      cover: w.images[0] ?? "",
    };
  });

  return {
    items,
    page,
    page_size,
    total,
    total_pages: Math.ceil(total / page_size),
  };
}

// 用户主页统计：作品数 / 获赞总数 / 被收藏总数 / 总浏览
export function getUserStats(
  authorName: string,
): { work_count: number; total_likes: number; total_bookmarks: number; total_views: number } {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT
         COUNT(*) AS work_count,
         COALESCE(SUM(total_likes), 0) AS total_likes,
         COALESCE(SUM(total_bookmarks), 0) AS total_bookmarks,
         COALESCE(SUM(total_view), 0) AS total_views
       FROM works WHERE author_name = ?`,
    )
    .get(authorName) as
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
): PagedWorks {
  const d = getDb();
  const page2 = Math.max(1, page);
  const size = Math.min(50, Math.max(1, page_size));
  const total =
    (
      d
        .prepare(
          `SELECT COUNT(*) AS c FROM user_actions
           JOIN works ON works.id = user_actions.work_id
           WHERE user_actions.user_id = ? AND user_actions.action = 'bookmark'`,
        )
        .get(userId) as { c: number }
    ).c ?? 0;
  const rows = d
    .prepare(
      `SELECT works.* FROM user_actions
       JOIN works ON works.id = user_actions.work_id
       WHERE user_actions.user_id = ? AND user_actions.action = 'bookmark'
       ORDER BY user_actions.create_date DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, size, (page2 - 1) * size) as Record<string, unknown>[];
  const items: WorkListItem[] = rows.map((r) => {
    const w = rowToWork(r);
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
      cover: w.images[0] ?? "",
    };
  });
  return {
    items,
    page: page2,
    page_size: size,
    total,
    total_pages: Math.ceil(total / size),
  };
}

export function getMonthlyRank(limit = 20): WorkListItem[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT * FROM works ORDER BY total_bookmarks DESC, total_view DESC, create_date DESC LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => {
    const w = rowToWork(r);
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
      cover: w.images[0] ?? "",
    };
  });
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
  d.prepare(
    `INSERT OR IGNORE INTO users (id, username, password_hash, role, author_name, avatar, create_date)
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

export function getUserByUsername(username: string): UserRow | null {
  const d = getDb();
  const row = d.prepare("SELECT * FROM users WHERE username = ?").get(username) as
    | Record<string, unknown>
    | undefined;
  return row ? (row as unknown as UserRow) : null;
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

export function workExists(id: string): boolean {
  const d = getDb();
  return !!d.prepare("SELECT 1 FROM works WHERE id = ?").get(id);
}
