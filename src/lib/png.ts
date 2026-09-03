// PNG 元数据解析器 —— 浏览器端运行（纯 TS，不依赖 Node/第三方包）
// 解析 PNG 的 tEXt chunk，提取 NovelAI 内嵌的 Comment JSON。

import type { NovelAiMetadata, ComfyUiMetadata, PngParseResult } from "./types";

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

// ComfyUI 解析：读 PNG 内嵌的 workflow JSON（tEXt "prompt" / "workflow"）
export function parseComfyUi(metadata: string | null): ComfyUiMetadata | null {
  if (!metadata) return null;
  let graph: Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    graph = parsed as Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
  } catch {
    return null;
  }

  const entries = Object.entries(graph);

  // 取引用的节点文本（["nodeId", idx] 引用形式）
  const getTextByRef = (ref: unknown): string => {
    if (Array.isArray(ref) && typeof ref[0] === "string") {
      const n = graph[ref[0]];
      if (n && typeof n.inputs?.text === "string") return n.inputs.text;
    }
    return "";
  };

  // 采样器 / 生成节点
  let samplerNode:
    | { class_type?: string; inputs?: Record<string, unknown> }
    | undefined;
  for (const [, n] of entries) {
    const t = n?.class_type ?? "";
    if (
      t === "KSampler" ||
      t === "KSamplerAdvanced" ||
      t === "SamplerCustom" ||
      t === "SamplerCustomAdvanced"
    ) {
      samplerNode = n;
      break;
    }
  }

  let positive = "";
  let negative = "";
  if (samplerNode) {
    positive = getTextByRef(samplerNode.inputs?.positive);
    negative = getTextByRef(
      samplerNode.inputs?.negative ??
        (samplerNode.inputs as Record<string, unknown> | undefined)?.negative_cond,
    );
  }
  // 兜底：取任一 CLIPTextEncode 的 text
  if (!positive) {
    for (const [, n] of entries) {
      if (n?.class_type === "CLIPTextEncode" && typeof n.inputs?.text === "string") {
        positive = n.inputs.text;
        break;
      }
    }
  }
  if (!negative) {
    for (const [, n] of entries) {
      if (
        (n?.class_type === "CLIPTextEncode" ||
          n?.class_type === "CLIPTextEncodeAdvanced") &&
        typeof n.inputs?.text === "string" &&
        n.inputs.text !== positive
      ) {
        negative = n.inputs.text;
        break;
      }
    }
  }

  const sampler = String(
    (samplerNode?.inputs as Record<string, unknown> | undefined)?.sampler_name ??
      (samplerNode?.inputs as Record<string, unknown> | undefined)?.sampler ??
      "",
  );
  const scheduler = String(
    (samplerNode?.inputs as Record<string, unknown> | undefined)?.scheduler ?? "",
  );
  const steps = Number((samplerNode?.inputs as Record<string, unknown> | undefined)?.steps ?? 0);
  const cfg = Number((samplerNode?.inputs as Record<string, unknown> | undefined)?.cfg ?? 0);
  const seed = Number((samplerNode?.inputs as Record<string, unknown> | undefined)?.seed ?? 0);

  // 底模（checkpoint / unet）
  let model = "";
  for (const [, n] of entries) {
    const t = n?.class_type ?? "";
    if (
      (t.includes("Checkpoint") || t.includes("UNET") || t.includes("VAE")) &&
      typeof (n.inputs as Record<string, unknown> | undefined)?.ckpt_name === "string"
    ) {
      model = String((n.inputs as Record<string, unknown>).ckpt_name);
      break;
    }
  }

  // LoRA（可多个）
  const loras: string[] = [];
  for (const [, n] of entries) {
    const t = n?.class_type ?? "";
    if (t.includes("Lora") && typeof (n.inputs as Record<string, unknown> | undefined)?.lora_name === "string") {
      loras.push(String((n.inputs as Record<string, unknown>).lora_name));
    }
  }

  // 尺寸（EmptyLatentImage）
  let width = 0;
  let height = 0;
  for (const [, n] of entries) {
    if (n?.class_type === "EmptyLatentImage") {
      width = Number((n.inputs as Record<string, unknown> | undefined)?.width ?? 0);
      height = Number((n.inputs as Record<string, unknown> | undefined)?.height ?? 0);
      if (width && height) break;
    }
  }

  return {
    prompt: positive,
    negativePrompt: negative,
    model,
    loras,
    sampler,
    scheduler,
    steps,
    cfg,
    seed,
    width,
    height,
    rawJson: metadata,
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

    // ComfyUI 把 workflow 存在 tEXt "prompt" / "workflow"
    if (texts.prompt || texts.workflow) {
      const comfyui = parseComfyUi(texts.prompt || texts.workflow);
      if (comfyui) {
        return {
          ok: true,
          metadata: { ...texts },
          comfyui,
          width: comfyui.width || width,
          height: comfyui.height || height,
        };
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
