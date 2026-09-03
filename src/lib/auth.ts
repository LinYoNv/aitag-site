// 认证工具 —— 服务端专用
// 密码哈希用 Node 内置 scrypt（无第三方依赖）

import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  createSession,
  createUser,
  deleteSession,
  getSessionUser,
  getUserByUsername,
  type UserRow,
} from "./db";

export const SESSION_COOKIE = "aitag_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

/** scrypt 哈希密码：格式 salt:hash */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 64).toString("hex");
  // 恒定时间比较
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(calc, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 注册新用户（返回错误信息或 null） */
export function registerUser(
  username: string,
  password: string,
  role: "admin" | "user" = "user",
): { ok: true; user: UserRow } | { ok: false; error: string } {
  const name = username.trim();
  if (!name || name.length < 2) return { ok: false, error: "用户名至少 2 个字符" };
  if (name.length > 30) return { ok: false, error: "用户名最长 30 字符" };
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(name))
    return { ok: false, error: "用户名只能包含字母、数字、下划线、中文" };
  if (!password || password.length < 4) return { ok: false, error: "密码至少 4 位" };
  if (getUserByUsername(name)) return { ok: false, error: "用户名已存在" };

  const id = crypto.randomBytes(8).toString("hex");
  createUser({ id, username: name, password_hash: hashPassword(password), role });
  const user = getUserByUsername(name)!;
  return { ok: true, user };
}

/** 创建 admin（幂等：已存在则跳过） */
export function ensureAdmin(username: string, password: string): void {
  if (!getUserByUsername(username)) {
    createUser({
      id: crypto.randomBytes(8).toString("hex"),
      username,
      password_hash: hashPassword(password),
      role: "admin",
      author_name: "管理员",
    });
  }
}

/** 登录：校验 + 建 session，返回 token */
export async function login(
  username: string,
  password: string,
): Promise<{ ok: true; user: UserRow } | { ok: false; error: string }> {
  const user = getUserByUsername(username.trim());
  if (!user) return { ok: false, error: "用户名或密码错误" };
  if (!verifyPassword(password, user.password_hash))
    return { ok: false, error: "用户名或密码错误" };
  const token = crypto.randomBytes(32).toString("hex");
  createSession(token, user.id, SESSION_TTL_MS);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return { ok: true, user };
}

/** 从 cookie 取当前用户 */
export async function currentUser(): Promise<UserRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(token);
}

/** 登出：清 session + cookie */
export async function logout(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  (await cookies()).delete(SESSION_COOKIE);
}

/** 把用户序列化为安全对象（不含密码哈希） */
export function safeUser(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    author_name: user.author_name,
    avatar: user.avatar,
    create_date: user.create_date,
  };
}
