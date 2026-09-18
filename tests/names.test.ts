import assert from "node:assert/strict";
import test from "node:test";

import { isOwnAuthorName, validateNickname, RESERVED_USERNAMES } from "../src/lib/names";

test("合法昵称：中文 / 英文 / 数字 / 下划线通过并 trim", () => {
  for (const raw of ["空雨", "sora_ame", "user2026", "混合Name_01", "  空雨  "]) {
    const r = validateNickname(raw);
    assert.equal(r.ok, true, `${raw} 应通过校验`);
    if (r.ok) assert.equal(r.name, raw.trim());
  }
});

test("昵称长度：1 字符过短、31 字符过长都拒绝（按码点计数）", () => {
  assert.equal(validateNickname("a").ok, false);
  assert.equal(validateNickname("雨").ok, false);
  assert.equal(validateNickname("a".repeat(30)).ok, true);
  const tooLong = validateNickname("a".repeat(31));
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) assert.match(tooLong.error, /最长 30/);
});

test("昵称字符集：空格 / 标点 / emoji / 换行 / 全角符号一律拒绝", () => {
  for (const raw of [
    "a b",
    "a<b>",
    "a'b",
    'a"b',
    "a;drop table users",
    "a-b",
    "a.b",
    "a／b",
    "😀😀",
    "a\nb",
    "\u0000ab",
  ]) {
    assert.equal(validateNickname(raw).ok, false, `${JSON.stringify(raw)} 应被拒绝`);
  }
});

test("昵称空值：空串 / 纯空白 / undefined / null 拒绝", () => {
  for (const raw of ["", "   ", "\u3000", undefined, null]) {
    assert.equal(validateNickname(raw).ok, false);
  }
});

test("保留名：冒充管理员的英文与中文名大小写不敏感地拒绝", () => {
  for (const raw of ["admin", "Admin", "ADMIN", "root", "administrator", "官方", "管理员", "客服"]) {
    assert.equal(validateNickname(raw).ok, false, `${raw} 是保留名，应被拒绝`);
  }
});

test("保留名：泛用作者名（群友 / 匿名 / 游客 / guest）拒绝 —— 防认领存量无名作品", () => {
  for (const raw of ["群友", "匿名", "游客", "Guest", "anonymous"]) {
    assert.equal(validateNickname(raw).ok, false, `${raw} 应被拒绝`);
  }
});

test("归属判定：昵称或注册名任一命中都算本人", () => {
  const user = { username: "sora_ame", author_name: "空雨" };
  assert.equal(isOwnAuthorName("空雨", user), true);
  assert.equal(isOwnAuthorName("sora_ame", user), true); // 改名前的历史作品
  assert.equal(isOwnAuthorName(" 空雨 ", user), true);
  assert.equal(isOwnAuthorName("其他", user), false);
  assert.equal(isOwnAuthorName("", user), false);
});

test("归属判定：没设昵称的账号只认注册名，且不因大小写差异误判", () => {
  const user = { username: "Sora", author_name: "" };
  assert.equal(isOwnAuthorName("sora", user), true);
  assert.equal(isOwnAuthorName("Sora", user), true);
  assert.equal(isOwnAuthorName("空雨", user), false);
});

// ---- 重名口径（回归测试：注册必须连昵称一起挡）----
// 背景：昵称可改之后，若注册只查 username，会出现
//   「A 把昵称改成 X」→「B 注册用户名 X」→ 两个账号 author_name 都是 X
//   → 作品互相认领、/u/X 指向谁取决于查询顺序。
test("保留名口径：昵称黑名单在用户名黑名单基础上更严", () => {
  // 用户名允许但昵称禁止的泛用作者名
  for (const n of ["群友", "匿名", "游客", "guest", "anonymous"]) {
    assert.equal(RESERVED_USERNAMES.has(n.toLowerCase()), false, `${n} 不应在用户名黑名单里`);
    assert.equal(validateNickname(n).ok, false, `${n} 必须被昵称校验拒绝`);
  }
  // 两边都禁的
  for (const n of ["admin", "管理员", "官方", "站长"]) {
    assert.equal(RESERVED_USERNAMES.has(n.toLowerCase()), true, `${n} 应在用户名黑名单里`);
    assert.equal(validateNickname(n).ok, false, `${n} 必须被昵称校验拒绝`);
  }
});

test("昵称校验是纯函数：不查重（重名交给 DB 层）", () => {
  // 同一名字重复校验都应通过 —— 是否被占用由 db.isNameTaken* 判断
  const a = validateNickname("空雨");
  const b = validateNickname("空雨");
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
});
