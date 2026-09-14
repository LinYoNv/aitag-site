// 参考图 data URI 工具（纯函数，无 server-only 依赖，便于单测）

/** 从字节魔数推断图片 mime（识别不出按 png） */
export function sniffMime(buf: Buffer): string {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (buf.length > 4 && buf.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  return "image/png";
}

/** data URI → Buffer（格式不对返回 null） */
export function dataUriToBuffer(dataUri: string): { buf: Buffer; mime: string } | null {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUri.trim());
  if (!m) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
  if (!buf.length) return null;
  return { buf, mime: m[1].toLowerCase() };
}

/**
 * 参考图入参归一化：面板历史上只发**裸 base64**（不带 `data:` 前缀），
 * 而早期实现按 `startsWith("data:")` 过滤 → 参考图被静默丢弃、生图退化成纯文生图
 * （表现为「没有正确使用参考图」，且服务端不留任何日志）。
 * 这里两种形式都收：裸 base64 按魔数补 mime 还原成 data URI。
 */
export function normalizeRefDataUri(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^data:[^;,]+;base64,/i.test(s)) return s;
  try {
    const buf = Buffer.from(s, "base64");
    if (!buf.length) return null;
    return `data:${sniffMime(buf)};base64,${s}`;
  } catch {
    return null;
  }
}
