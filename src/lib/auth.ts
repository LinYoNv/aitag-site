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
  getUserById,
  getUserByUsername,
  isNameTaken,
  isNameTakenByOthers,
  updateAuthorName,
  type UserRow,
} from "./db";
import { RESERVED_USERNAMES, validateNickname } from "./names";

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
  if (RESERVED_USERNAMES.has(name.toLowerCase()))
    return { ok: false, error: "该用户名为系统保留名，请换一个" };
  // 反馈前端已有的快捷注册不再可用：密码下限提到 8 位（仅新注册，存量用户不受影响）
  if (!password || password.length < 8) return { ok: false, error: "密码至少 8 位" };
  // 大小写不敏感查重：Admin / admin 视为同名（getUserByUsername 内部 NOCASE）
  // ⚠️ 必须连 author_name 一起查：昵称可改之后，仅查用户名会漏掉
  //    「A 昵称已改成 X」→「B 注册用户名 X」的撞名，两人作品会互相认领。
  if (isNameTaken(name)) return { ok: false, error: "用户名已存在（大小写不同也算重复）" };

  const id = crypto.randomBytes(8).toString("hex");
  try {
    createUser({ id, username: name, password_hash: hashPassword(password), role });
  } catch (e) {
    // 并发注册同名：UNIQUE 约束/唯一索引冲突 → 友好错误（不再静默吞掉/非空断言崩溃）
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      return { ok: false, error: "用户名已存在（大小写不同也算重复）" };
    }
    throw e;
  }
  const user = getUserByUsername(name);
  if (!user) return { ok: false, error: "注册失败，请重试" };
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

/**
 * 修改昵称（昵称 = 作品作者名，展示在用户主页 / 详情页 / 画廊卡片）。
 *
 * 校验顺序：格式（长度/字符集/保留名）→ 与自己的当前名相同则直接成功（幂等）
 * → 事务内查重 + 同步历史作品作者名（见 db.updateAuthorName）。
 * 查重是硬要求：作品归属靠 author_name 字符串匹配，允许重名等于允许认领他人作品。
 *
 * ⚠️ 真正的重名兜底在 `updateAuthorName` 的**事务内**：`users.author_name` 没有唯一索引
 * （只有 username 有 lower(username) 唯一索引），所以这里先查一次只是为了让常见情况
 * 少开一次事务，**不能**当成唯一防线。
 */
export function renameUser(
  userId: string,
  rawNickname: unknown,
): { ok: true; user: UserRow } | { ok: false; error: string } {
  const me = getUserById(userId);
  if (!me) return { ok: false, error: "用户不存在" };
  // 管理员放行保留名：否则 admin 账号（昵称默认就是保留名）改走一次就再也改不回来
  const checked = validateNickname(rawNickname, { allowReserved: me.role === "admin" });
  if (!checked.ok) return checked;
  if (checked.name === (me.author_name || me.username)) {
    return { ok: true, user: me }; // 没变化：不写库、不级联
  }
  if (isNameTakenByOthers(checked.name, userId)) {
    return { ok: false, error: "该昵称已被占用（他人的用户名或昵称与之重复）" };
  }
  const res = updateAuthorName(userId, checked.name);
  if (!res.ok) return { ok: false, error: res.error };
  const user = getUserById(userId);
  if (!user) return { ok: false, error: "修改失败，请重试" };
  return { ok: true, user };
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
    secure: true, // 全站 HTTPS（Caddy 反代），浏览器只看最终页面协议
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
