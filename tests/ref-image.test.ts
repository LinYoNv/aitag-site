import assert from "node:assert/strict";
import test from "node:test";

import { dataUriToBuffer, normalizeRefDataUri, sniffMime } from "../src/lib/ref-image";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.from([0x00, 0x01, 0x02, 0x03]),
]);
const GIF = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.from([0x01, 0x00, 0x01, 0x00])]);

test("sniffMime 按魔数识别格式", () => {
  assert.equal(sniffMime(PNG), "image/png");
  assert.equal(sniffMime(JPEG), "image/jpeg");
  assert.equal(sniffMime(WEBP), "image/webp");
  assert.equal(sniffMime(GIF), "image/gif");
});

test("normalizeRefDataUri 接受完整 data URI（原样返回）", () => {
  const uri = `data:image/png;base64,${PNG.toString("base64")}`;
  assert.equal(normalizeRefDataUri(uri), uri);
  assert.equal(normalizeRefDataUri(`data:image/jpeg;base64,AAAA`), "data:image/jpeg;base64,AAAA");
});

// 回归用例：面板旧版只发裸 base64，早期实现按 startsWith("data:") 过滤 →
// 参考图被静默丢弃、生图退化成纯文生图（表现为「没有正确使用参考图」）
test("normalizeRefDataUri 接受裸 base64 并补出 data URI", () => {
  const raw = PNG.toString("base64");
  assert.equal(raw.startsWith("data:"), false);
  assert.equal(normalizeRefDataUri(raw), `data:image/png;base64,${raw}`);
  assert.equal((normalizeRefDataUri(JPEG.toString("base64")) || "").startsWith("data:image/jpeg;base64,"), true);
  assert.equal((normalizeRefDataUri(WEBP.toString("base64")) || "").startsWith("data:image/webp;base64,"), true);
});

test("normalizeRefDataUri 拒绝空值/非图片垃圾", () => {
  assert.equal(normalizeRefDataUri(""), null);
  assert.equal(normalizeRefDataUri("   "), null);
  assert.equal(normalizeRefDataUri(null), null);
  assert.equal(normalizeRefDataUri(undefined), null);
  assert.equal(normalizeRefDataUri(12345), null);
  // 纯垃圾字符串 → base64 解出空 buffer → 丢弃
  assert.equal(normalizeRefDataUri("!!!!"), null);
});

test("dataUriToBuffer 往返一致，坏格式返回 null", () => {
  const uri = `data:image/png;base64,${PNG.toString("base64")}`;
  const parsed = dataUriToBuffer(uri);
  assert.ok(parsed);
  assert.equal(parsed.mime, "image/png");
  assert.equal(Buffer.compare(parsed.buf, PNG), 0);
  assert.equal(dataUriToBuffer(PNG.toString("base64")), null); // 裸 base64 不是 data URI
  assert.equal(dataUriToBuffer("data:image/png;base64,"), null);
});
