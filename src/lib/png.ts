// PNG 元数据解析器 —— 浏览器端运行（纯 TS，不依赖 Node/第三方包）
// 解析 PNG 的 tEXt chunk，提取 NovelAI 内嵌的 Comment JSON。

import type { NovelAiMetadata, PngParseResult } from "./types";

// 从 Uint8Array 解码 latin1 字符串
function decodeLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

// 从 ArrayBuffer 解析 PNG chunk（返回 [type, data] 列表）
function parseChunks(buf: ArrayBuffer): Array<{ type: string; data: Uint8Array }> {
  const bytes = new Uint8Array(buf);
  // PNG 签名校验
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== sig[i]) {
      throw new Error("不是有效的 PNG 文件");
    }
  }

  const view = new DataView(buf);
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos); // 大端长度
    const type = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7],
    );
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > bytes.length) break; // 数据越界，停止
    chunks.push({ type, data: bytes.slice(dataStart, dataEnd) });
    pos = dataEnd + 4; // 跳过 CRC
  }
  return chunks;
}

// 解析 tEXt chunk：keyword \0 value
function parseTextChunk(data: Uint8Array): { keyword: string; value: string } {
  let nul = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) {
      nul = i;
      break;
    }
  }
  const keyword = decodeLatin1(data.slice(0, nul === -1 ? data.length : nul));
  const value = decodeLatin1(data.slice(nul === -1 ? data.length : nul + 1));
  return { keyword, value };
}

// 把 NovelAI Comment JSON 归一化为展示用的字段
function normalizeNovelAi(comment: Record<string, unknown>): NovelAiMetadata {
  return {
    prompt: String(comment.prompt ?? ""),
    negativePrompt: String(comment.uc ?? ""),
    sampler: String(comment.sampler ?? ""),
    steps: Number(comment.steps ?? 0),
    width: Number(comment.width ?? 0),
    height: Number(comment.height ?? 0),
    scale: Number(comment.scale ?? 0),
    seed: Number(comment.seed ?? 0),
    noiseSchedule: String(comment.noise_schedule ?? ""),
    model: String(
      (comment as Record<string, unknown>).source ??
        (comment as Record<string, unknown>).version ??
        "NovelAI",
    ),
  };
}

// 主入口：解析 PNG 文件，返回元数据
export function parsePngMetadata(buf: ArrayBuffer): PngParseResult {
  try {
    const chunks = parseChunks(buf);

    // 从 IHDR 读尺寸
    let width = 0;
    let height = 0;
    for (const c of chunks) {
      if (c.type === "IHDR" && c.data.length >= 8) {
        width = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength).getUint32(0);
        height = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength).getUint32(4);
        break;
      }
    }

    const texts: Record<string, string> = {};
    for (const c of chunks) {
      if (c.type === "tEXt") {
        const { keyword, value } = parseTextChunk(c.data);
        texts[keyword] = value;
      }
    }

    // NovelAI 把参数放在 Comment
    if (texts.Comment) {
      try {
        const comment = JSON.parse(texts.Comment) as Record<string, unknown>;
        const novelai = normalizeNovelAi(comment);
        return {
          ok: true,
          metadata: { ...texts, comment },
          novelai,
          width,
          height,
        };
      } catch {
        // Comment 不是合法 JSON，降级为纯文本
        return {
          ok: true,
          metadata: { ...texts },
          novelai: {
            prompt: texts.Comment ?? "",
            negativePrompt: "",
            sampler: texts.Software ?? "",
            steps: 0,
            width,
            height,
            scale: 0,
            seed: 0,
            noiseSchedule: "",
            model: texts.Source ?? texts.Software ?? "Unknown",
          },
          width,
          height,
        };
      }
    }

    // 没有 Comment：仍算解析成功但无 NovelAI 参数
    if (texts.Description || texts.Title) {
      return {
        ok: true,
        metadata: { ...texts },
        novelai: {
          prompt: texts.Description ?? "",
          negativePrompt: "",
          sampler: texts.Software ?? "",
          steps: 0,
          width,
          height,
          scale: 0,
          seed: 0,
          noiseSchedule: "",
          model: texts.Source ?? texts.Software ?? "Unknown",
        },
        width,
        height,
      };
    }

    // 完全没有任何元数据
    return {
      ok: false,
      error: "失败：图片中没有可识别的参数信息",
      width,
      height,
    };
  } catch (e) {
    return {
      ok: false,
      error: "失败：" + (e instanceof Error ? e.message : "解析出错"),
    };
  }
}
