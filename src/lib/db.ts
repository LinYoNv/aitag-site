// SQLite 数据访问层 —— 服务端专用（Node 24 内置 node:sqlite）
// 注意：此模块只能被服务端代码 import（API routes / seed 脚本）。

import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
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
        create_date TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        create_date TEXT NOT NULL,
        expire_date TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    `);
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
     (id, title, caption, create_date, ai_type, image_count, tags, author_name, total_view, total_bookmarks, images, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    JSON.stringify(work.images),
    work.metadata ? JSON.stringify(work.metadata) : null,
  );
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
  sort?: "new" | "monthly";
  time_range?: string;
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

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const orderSql =
    opts.sort === "monthly"
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
  create_date: string;
}

export function createUser(user: {
  id: string;
  username: string;
  password_hash: string;
  role?: "admin" | "user";
  author_name?: string;
}): void {
  const d = getDb();
  d.prepare(
    `INSERT OR IGNORE INTO users (id, username, password_hash, role, author_name, create_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    user.id,
    user.username,
    user.password_hash,
    user.role ?? "user",
    user.author_name || user.username,
    new Date().toISOString(),
  );
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
