// PNG 元数据解析器 —— 浏览器端运行（纯 TS，不依赖 Node/第三方包）
// 解析 PNG 的 tEXt chunk，提取 NovelAI 内嵌的 Comment JSON。

import type { NovelAiMetadata, ComfyUiMetadata, PngParseResult, ArtistTag } from "./types";

// 从 NovelAI prompt 文本中提取画师（artist）列表
// 支持三种格式：
//   数值权重：`1.4::artist:nueegochi ::` 或 `-2::artist:collaboration::`
//   花括号强调：`{{{{artist:asanagi}}}}`（花括号层数=权重，保留 raw 原文）
//   纯前缀：`artist:ningen_mame`（仅可靠的 artist: 前缀项）
//   NAI v4/v5 加权画师段：`0.9::misaka_12003-gou & dino, rurudo ::`（tag 之前以 \n 分隔的画师区）
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
  // NAI v4/v5：tag 之前（\n 分隔）的画师区是加权裸名（无 artist: 前缀），补充提取
  for (const a of extractFromArtistSection(prompt)) {
    const key = a.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

// 画师区里的质量/描述词黑名单（排除被误认为画师的词）
const ARTIST_SECTION_BLACKLIST = new Set([
  "year 2025", "year 2024", "realistic", "4k", "8k", "photorealistic",
  "photo", "medium", "photo(medium)", "best quality", "masterpiece",
  "very aesthetic", "highly detailed", "absurdres", "no text",
  "textless version", "finished", "artwork", "detailed", "lively color",
  "lively", "color", "graphic texture", "texture", "skin surface",
  "lifelike flesh", "lifelike", "flesh", "obliques", "intricate",
  "green", "beautiful", "style", "ultra detailed", "sharp focus",
  "official art", "hyperdetailed", "cinematic lighting", "soft lighting",
]);

// NAI v4/v5 画师区提取：prompt 中 tag（最后一个 \n 之后的部分）之前的画师串。
// 画师串形如 `0.9::misaka_12003-gou & dino, rurudo ::, year 2025, ...`，
// 无 artist: 前缀，需用加权段 + 黑名单过滤。
function extractFromArtistSection(prompt: string): ArtistTag[] {
  const nl = prompt.lastIndexOf("\n");
  if (nl < 0) return []; // 无 \n 分隔（经典单行 prompt）不猜测画师
  const section = prompt.slice(0, nl);
  const out: ArtistTag[] = [];
  const seen = new Set<string>();
  // 只按逗号分隔（`&` 是 NAI 联合画师，如 `misaka_12003-gou & dino`，必须作为一个画师保留）
  for (const raw of section.split(",")) {
    let p = raw.trim();
    if (!p) continue;
    let weight = 1;
    const wm = p.match(/^(-?\d*\.?\d+)\s*::/);
    if (wm) {
      const w = Number.parseFloat(wm[1]);
      if (!Number.isNaN(w)) {
        if (w < 0) continue; // 负权重段跳过（如 -2::green ::）
        weight = w; // 保留原始权重（0.9:: → 0.9）
      }
      p = p.slice(wm[0].length).trim();
    }
    p = p.replace(/::\s*$/, "").trim();
    if (p.length < 2 || p.length > 40) continue;
    if (/^\d+$/.test(p)) continue;
    // 句子/描述性片段（含常见英文功能词或长句）跳过
    if (
      /\b(the|is|are|that|has|have|their|but|with|and|only|face|body|character|anime|style|image|drawn|finished|artwork|photo|texture|color|lively|lifelike|flesh|skin|surface|obliques|little|highly|best)\b/i.test(p)
    ) continue;
    const low = p.toLowerCase();
    if (ARTIST_SECTION_BLACKLIST.has(low)) continue;
    if (p.split(/\s+/).length > 3) continue; // 超过 3 个词不像画师名
    if (seen.has(low)) continue;
    seen.add(low);
    out.push({ name: p, weight, raw: raw.trim() });
  }
  return out;
}

// 判断文本是否纯画师列表（artist: 前缀 或 N::名字:: 加权名）。
// 用于 uc：当 Negative Prompt 实际是一串画师名（排除画师）时，展示端按「排除画师」呈现。
// 允许 `&`（NAI 联合画师）与中文画师名（\u4e00-\u9fff）。
export function isArtistList(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return false;
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  for (const part of parts) {
    const p2 = part.replace(/^-?\d*\.?\d+\s*::\s*/i, "").trim(); // 去权重前缀
    const nameChars = "[\\w.\\-\\(\\)& \\u4e00-\\u9fff]";
    if (new RegExp(`^artist\\s*:\\s*${nameChars}+:*\\s*$`, "i").test(p2)) continue; // artist:xxx / artist:xxx::
    if (new RegExp(`^${nameChars}+::\\s*$`).test(p2)) continue; // 加权名带结尾 ::
    return false;
  }
  return true;
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
    // CFG Rescale（NAI 的 CFG 重缩放比例，如 1.5）——有值才带，避免显示 0
    ...(comment.cfg_rescale !== undefined && comment.cfg_rescale !== null
      ? { cfg_rescale: Number(comment.cfg_rescale) }
      : {}),
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

  // 递归解析节点文本：支持 Anima 自定义节点组合
  //  - CLIPTextEncode.text 引用 JoinStringMulti / CR Prompt Text 等
  //  - JoinStringMulti：拼接所有 string_N
  //  - CR Prompt Text：读 prompt 字段
  //  - ShowText|pysssss：读 text_0 字段
  const resolveNodeText = (nodeId: string, depth = 0): string => {
    if (depth > 6) return "";
    const n = graph[nodeId];
    if (!n) return "";
    const t = n.class_type ?? "";
    const inputs = (n.inputs ?? {}) as Record<string, unknown>;
    // JoinStringMulti：拼接所有 string_N
    if (t.includes("JoinString") || t.includes("StringMulti")) {
      const parts: string[] = [];
      const delim = typeof inputs.delimiter === "string" ? inputs.delimiter : "";
      for (let i = 1; i <= 30; i++) {
        const v = inputs[`string_${i}`];
        if (v === undefined) break;
        if (Array.isArray(v) && typeof v[0] === "string") parts.push(resolveNodeText(v[0], depth + 1));
        else if (typeof v === "string") parts.push(v);
      }
      return parts.filter(Boolean).join(delim);
    }
    // CR Prompt Text：读 prompt 字段
    if (typeof inputs.prompt === "string") return inputs.prompt;
    // 普通文本节点：text / text_0
    if (typeof inputs.text === "string") return inputs.text;
    if (typeof inputs.text_0 === "string") return inputs.text_0;
    // text 是引用
    if (Array.isArray(inputs.text) && typeof inputs.text[0] === "string") {
      return resolveNodeText(inputs.text[0], depth + 1);
    }
    return "";
  };

  // 取引用的节点文本（["nodeId", idx] 引用形式，递归解析）
  const getTextByRef = (ref: unknown): string => {
    if (Array.isArray(ref) && typeof ref[0] === "string") {
      return resolveNodeText(ref[0]);
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
