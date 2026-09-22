// 生图历史：纯逻辑判据（不碰 DB / 磁盘 / server-only，任何环境都能跑）
//
// 为什么不测 db.ts / studio-history.ts 本身：它们带 `server-only` 标记，
// `npm test` 无法 import（这正是本仓库现有测试都不碰 db 的原因）。
// 所以凡是**安全关键**的口径都抽到了 studio-presets.ts（纯模块）里，
// 由这里守住；落盘/裁剪等集成行为由 /tmp 下的真环境脚本验证。
import assert from "node:assert/strict";
import test from "node:test";

import {
  STUDIO_HISTORY_LIMIT,
  STUDIO_HISTORY_NEGATIVE_MAX,
  STUDIO_HISTORY_PROMPT_MAX,
  STUDIO_HISTORY_THUMB_WIDTH,
  isHistoryId,
  isSafeHistoryFilename,
} from "../src/lib/studio-presets";

test("历史保留 20 条，且这 20 条**全部**在面板上展示（产品口径，2026-09-22 改）", () => {
  assert.equal(STUDIO_HISTORY_LIMIT, 20);
});

test("缩略图规格与图库画廊同口径（480px WebP）", () => {
  assert.equal(STUDIO_HISTORY_THUMB_WIDTH, 480);
});

test("提示词截断上限：正向 8000 / 反向 4000", () => {
  assert.equal(STUDIO_HISTORY_PROMPT_MAX, 8000);
  assert.equal(STUDIO_HISTORY_NEGATIVE_MAX, 4000);
  // 截断不能改动正常内容
  const long = "A".repeat(20000);
  assert.equal(long.slice(0, STUDIO_HISTORY_PROMPT_MAX).length, 8000);
  assert.equal(long.slice(0, STUDIO_HISTORY_NEGATIVE_MAX).length, 4000);
  assert.equal("short prompt".slice(0, STUDIO_HISTORY_PROMPT_MAX), "short prompt");
});

// ---- 安全判据：文件名来自数据库字段，被污染就是任意文件读取 ----

test("历史文件名安全校验：拒绝目录穿越与路径分隔符", () => {
  for (const ok of ["a1b2c3d4e5f60718.png", "a1b2c3d4e5f60718.webp", "x.jpg", "y.jpeg"]) {
    assert.equal(isSafeHistoryFilename(ok), true, `${ok} 应被接受`);
  }
  for (const bad of [
    "",
    "../aitag.db",
    "..\\aitag.db",
    "/etc/passwd",
    "sub/dir.png",
    "sub\\dir.png",
    "....//x.png",
    "a/../../b.png",
    ".hidden.png",
    "..",
  ]) {
    assert.equal(isSafeHistoryFilename(bad), false, `${JSON.stringify(bad)} 必须被拒绝`);
  }
  // 非字符串输入（库里字段被写坏时）不能抛异常，要判为不安全
  for (const bad of [null, undefined, 0, 123, {}, []]) {
    assert.equal(isSafeHistoryFilename(bad), false, `${JSON.stringify(bad)} 必须被拒绝`);
  }
});

test("历史 id 口径：16 位小写 hex（crypto.randomBytes(8).toString('hex')）", () => {
  assert.equal(isHistoryId("a1b2c3d4e5f60718"), true);
  assert.equal(isHistoryId("A1B2C3D4E5F60718"), false, "大写不在 hex 输出口径内");
  assert.equal(isHistoryId("a1b2c3d4e5f6071"), false, "15 位过短");
  assert.equal(isHistoryId("a1b2c3d4e5f607180"), false, "17 位过长");
  assert.equal(isHistoryId("a1b2c3d4e5f6071z"), false, "非 hex 字符");
  assert.equal(isHistoryId("../../etc/passwd"), false, "穿越串必须拒绝");
  assert.equal(isHistoryId(null), false);
  assert.equal(isHistoryId(123), false);
});
