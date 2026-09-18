// 名称规则（用户名 / 昵称）—— 纯函数，无 server-only 依赖，便于单测。
//
// 背景：本站的作品归属靠字符串 `works.author_name` 与 `users.author_name`（昵称）对齐。
// 昵称一旦允许修改，就必须保证「全站不重名」，否则会出现
// ① 改名后抢占他人作品、② 冒充管理员、③ 存量无名作品（作者名 = 默认「群友」）被认领。
// 因此这里的保留名黑名单比注册用户名更严一档。

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 30;

/** 只允许字母 / 数字 / 下划线 / 中文 —— 与注册用户名同口径 */
export const NAME_CHARSET = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/;

/** 注册用户名禁用：用户名默认会作为作品作者名展示，禁止冒充管理员/官方 */
export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "official",
  "moderator",
  "mod",
  "staff",
  "support",
  "aitag",
  "管理员",
  "官方",
  "系统",
  "客服",
  "站长",
]);

/** 昵称额外禁用：存量/种子作品的通用作者名，占用会「认领」到别人的作品上 */
export const RESERVED_NICKNAMES_EXTRA = [
  "群友",
  "匿名",
  "游客",
  "guest",
  "anonymous",
];

const RESERVED_NICKNAMES = new Set([
  ...RESERVED_USERNAMES,
  ...RESERVED_NICKNAMES_EXTRA.map((n) => n.toLowerCase()),
]);

/**
 * 校验昵称（= 作品作者名）。
 * 不查重（需要 DB），重名由调用方用 db.isNameTakenByOthers 判断。
 *
 * @param opts.allowReserved 管理员可放行保留名。保留名黑名单的目的是**防冒充**，
 *   而管理员本身就是被冒充的对象；且管理员账号的默认昵称本就落在黑名单里
 *   （`ensureAdmin` 写的是「管理员」，admin 账号自身叫 admin），
 *   不放行的话它们**改走一次就再也改不回来**。
 */
export function validateNickname(
  raw: unknown,
  opts?: { allowReserved?: boolean },
): { ok: true; name: string } | { ok: false; error: string } {
  const name = String(raw ?? "").trim();
  if (!name) return { ok: false, error: "昵称不能为空" };
  // 按码点计数（中文与 ASCII 都算 1 个字符）
  const len = Array.from(name).length;
  if (len < NICKNAME_MIN) return { ok: false, error: `昵称至少 ${NICKNAME_MIN} 个字符` };
  if (len > NICKNAME_MAX) return { ok: false, error: `昵称最长 ${NICKNAME_MAX} 个字符` };
  if (!NAME_CHARSET.test(name)) {
    return { ok: false, error: "昵称只能包含字母、数字、下划线、中文" };
  }
  if (!opts?.allowReserved && RESERVED_NICKNAMES.has(name.toLowerCase())) {
    return { ok: false, error: "该昵称为系统保留名，请换一个" };
  }
  return { ok: true, name };
}

/**
 * 作品归属判定：作品作者名是否属于该用户。
 * 昵称或登录名任一命中即算本人 —— 改过昵称的账号，历史作品的 author_name
 * 可能是旧昵称或注册名，删除权限不能因此丢失。
 */
export function isOwnAuthorName(
  authorName: string,
  user: { username: string; author_name?: string },
): boolean {
  const a = authorName.trim().toLowerCase();
  if (!a) return false;
  if (a === user.username.trim().toLowerCase()) return true;
  return Boolean(user.author_name) && a === String(user.author_name).trim().toLowerCase();
}
