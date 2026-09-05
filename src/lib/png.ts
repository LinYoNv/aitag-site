// PNG 元数据解析器 —— 浏览器端运行（纯 TS，不依赖 Node/第三方包）
// 解析 PNG 的 tEXt chunk，提取 NovelAI 内嵌的 Comment JSON。

import type { NovelAiMetadata, ComfyUiMetadata, PngParseResult, ArtistTag } from "./types";

// 从 NovelAI prompt 文本中提取画师（artist）列表
// 支持三种格式：
//   数值权重：`1.4::artist:nueegochi ::` 或 `-2::artist:collaboration::`
//   花括号强调：`{{{{artist:asanagi}}}}`（花括号层数=权重，保留 raw 原文）
//   纯前缀：`artist:ningen_mame`（仅可靠的 artist: 前缀项）
// 返回 [{ name, weight, raw }]，保持出现顺序，负向权重也保留。
export function extractArtistsFromPrompt(prompt: string): ArtistTag[] {
  if (!prompt) return [];
  const out: ArtistTag[] = [];
  const seen = new Set<string>();
  // 三种前缀：可选数值权重 N.ND:: / 可选左花括号 {n} / 无前缀；
  // artist: 大小写不敏感；名字贪婪匹配，遇 { } , ; : 或换行即停
  const re = /(?:(?:(-?\d*\.?\d+)\s*::)\s*)?(\{*)\s*artist\s*:\s*([^{},;:\n]+)\s*(\}*)(?:\s*::)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const rawWeight = m[1];
    const openBraces = m[2] ?? "";
    const name = (m[3] ?? "").trim();
    const closeBraces = m[4] ?? "";
    // 过滤伪 artist：质量词引导（artist: '20::best quality）等非画师名
    if (!name || name.startsWith("'") || name.startsWith("`")) continue;
    let weight = rawWeight !== undefined && rawWeight !== "" ? Number.parseFloat(rawWeight) : 1;
    if (Number.isNaN(weight)) weight = 1;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // 保留原始权重表达：花括号原文优先（忠实还原 `{{{{artist:x}}}}`）
    const raw =
      openBraces || closeBraces
        ? `${openBraces}artist:${name}${closeBraces}`
        : m[0].trim();
    out.push({ name, weight, raw });
  }
  return out;
}

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

  // 取数字：直接数值，或跟随 ["nodeId", idx] 引用解析目标节点输入
  const getNumByRef = (ref: unknown): number => {
    if (typeof ref === "number") return ref;
    if (typeof ref === "string") {
      const n = Number(ref);
      return Number.isNaN(n) ? 0 : n;
    }
    if (Array.isArray(ref) && typeof ref[0] === "string") {
      const n = graph[ref[0]];
      const idx = Number(ref[1] ?? 0);
      if (!n?.inputs) return 0;
      // 目标节点输入：取对应下标或第一个数值/文本
      const vals = Object.values(n.inputs);
      const v = vals[idx] ?? vals[0];
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n2 = Number(v);
        return Number.isNaN(n2) ? 0 : n2;
      }
      // 再深一层（可能继续引用）
      if (Array.isArray(v)) return getNumByRef(v);
    }
    return 0;
  };

  // 采样器节点：标准名或 class_type 含 KSampler/Sampler 的自定义节点
  let samplerNode:
    | { class_type?: string; inputs?: Record<string, unknown> }
    | undefined;
  for (const [, n] of entries) {
    const t = n?.class_type ?? "";
    if (
      t === "KSampler" ||
      t === "KSamplerAdvanced" ||
      t === "SamplerCustom" ||
      t === "SamplerCustomAdvanced" ||
      t.includes("KSampler") ||
      t.includes("SamplerCustom")
    ) {
      samplerNode = n;
      break;
    }
  }
  // 兜底：有 seed/steps/cfg/sampler_name 且引用了 positive/negative 的节点
  if (!samplerNode) {
    for (const [, n] of entries) {
      const inputs = (n?.inputs ?? {}) as Record<string, unknown>;
      if (
        inputs.positive !== undefined &&
        inputs.negative !== undefined &&
        (inputs.seed !== undefined ||
          inputs.steps !== undefined ||
          inputs.cfg !== undefined ||
          inputs.sampler_name !== undefined)
      ) {
        samplerNode = n;
        break;
      }
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
  // 兜底：取任一 CLIPTextEncode 的 text，按负面特征词区分正反
  if (!positive && !negative) {
    const texts: string[] = [];
    for (const [, n] of entries) {
      if (
        (n?.class_type === "CLIPTextEncode" ||
          n?.class_type === "CLIPTextEncodeAdvanced") &&
        typeof n.inputs?.text === "string"
      ) {
        texts.push(n.inputs.text);
      }
    }
    // 负面特征词命中较多的归 negative
    const NEG_PATTERN =
      /worst quality|low quality|score_[0-9]|bad anatomy|bad hands|deformed|jpeg artifacts|blurry|ugly|watermark|signature|extra (fingers|arms|legs|digit)/i;
    const negTexts = texts.filter((t) => NEG_PATTERN.test(t));
    if (negTexts.length > 0 && negTexts.length < texts.length) {
      negative = negTexts[0];
      positive = texts.find((t) => t !== negative) ?? "";
    } else if (texts.length >= 2) {
      // 无法用特征判断：第一个当 positive，第二个当 negative
      positive = texts[0];
      negative = texts[1];
    } else if (texts.length === 1) {
      positive = texts[0];
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
  const steps = getNumByRef(
    (samplerNode?.inputs as Record<string, unknown> | undefined)?.steps,
  );
  const cfg = getNumByRef(
    (samplerNode?.inputs as Record<string, unknown> | undefined)?.cfg,
  );
  const seed = getNumByRef(
    (samplerNode?.inputs as Record<string, unknown> | undefined)?.seed,
  );

  // 底模（checkpoint / unet / vae），兼容 unet_name 与 ckpt_name
  let model = "";
  for (const [, n] of entries) {
    const t = n?.class_type ?? "";
    const inputs = (n.inputs ?? {}) as Record<string, unknown>;
    if (
      (t.includes("Checkpoint") || t.includes("UNET") || t.includes("VAE")) &&
      (typeof inputs.ckpt_name === "string" || typeof inputs.unet_name === "string")
    ) {
      model = String(inputs.ckpt_name ?? inputs.unet_name ?? "");
      break;
    }
  }

  // LoRA（可多个，含 LoraLoaderModelOnly）
  const loras: string[] = [];
  for (const [, n] of entries) {
    const t = n?.class_type ?? "";
    if (t.includes("Lora") && typeof (n.inputs as Record<string, unknown> | undefined)?.lora_name === "string") {
      loras.push(String((n.inputs as Record<string, unknown>).lora_name));
    }
  }

  // 尺寸（EmptyLatentImage，支持引用解析）
  let width = 0;
  let height = 0;
  for (const [, n] of entries) {
    if (n?.class_type === "EmptyLatentImage") {
      width = getNumByRef((n.inputs as Record<string, unknown> | undefined)?.width);
      height = getNumByRef((n.inputs as Record<string, unknown> | undefined)?.height);
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
