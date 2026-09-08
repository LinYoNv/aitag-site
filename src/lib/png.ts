// PNG 元数据解析器 —— 浏览器端运行（纯 TS，不依赖 Node/第三方包）
// 解析 PNG 的 tEXt chunk，提取 NovelAI 内嵌的 Comment JSON。

import type { NovelAiMetadata, ComfyUiMetadata, PngParseResult, ArtistTag } from "./types";

// ── 解析健壮性护栏（防止恶意/畸形 PNG 或超深 JSON 打崩接口）─────────────────
/** 单个 PNG 中内嵌文本 chunk（tEXt/zTXt/iTXt）值的最长字节数，超过视为异常 */
export const MAX_TEXT_VALUE_BYTES = 4 * 1024 * 1024; // 4MB
/** ComfyUI 工作流允许的最大节点数（防超大图撑爆遍历） */
export const MAX_COMFY_NODES = 2048;
/** ComfyUI 节点文本递归解析的最大层数 */
export const MAX_COMFY_DEPTH = 100;
/** JSON 值嵌套递归清洗的最大层数 */
export const MAX_JSON_DEPTH = 100;
/** 超出 MAX_SAFE_INTEGER 的整数会被转成字符串，避免精度丢失（护栏语义） */
export const MAX_SAFE_INTEGER = 9007199254740991;

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
  // NAI v5 布局 token（画师区尾部常出现，不是画师）
  "location", "order",
  // 画质/风格/色彩/背景描述词（易被误认为画师，但实为画面修饰）
  "smooth line", "clean lineart", "flat color", "simple background",
  "blurry background", "white background", "dark background", "no background",
  "depth of field", "soft focus", "vignette", "grainy", "sharp focus",
  "rich colors", "vibrant colors", "colorful", "saturated", "desaturated",
  "muted tones", "pale aesthetic", "silver-toned", "cinematic desaturation",
  "black and white", "monochrome", "grayscale", "sepia", "pastel colors",
  "natural skin", "glowing skin", "sunlight", "backlighting", "rim light",
  "high contrast", "low contrast", "anime style", "semi-realistic",
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
    // 剥掉段首尾的重量花括号（NAI 的 `{加重}`/`{{{{ }}}}` 语法），
    // 否则 `{textless version` 这类加重描述词会带括号而漏过黑名单，也导致
    // `{{{{artist:asanagi}}}}` 的 artist: 前缀判断失效。**必须在 artist: 之前剥**。
    p = p.replace(/^\{+|\}+$/g, "").trim();
    // artist: 前缀段由主正则负责，这里跳过避免重复。**必须在权重 slice 之后**，
    // 否则 `0.6::artist:chocoan` 会被误当成普通加权名提取（Bug 2）。
    if (/^artist\s*:/i.test(p)) continue;
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

// 解析 zTXt chunk：keyword \0 压缩方法(1字节) + deflate 压缩数据。
// 需要外部注入解压器（后端 Node 传 zlib.inflateSync；浏览器端可用 DecompressionStream 的同步包装，
// 若无则跳过该 chunk——预览可能缺参数，但保存时后端权威解析会修正）。
export type ZtxtDecompressor = (compressed: Uint8Array) => string;
export type ItxtDecompressor = ZtxtDecompressor;

function parseCompressedTextChunk(
  data: Uint8Array,
  decompress: ZtxtDecompressor,
): { keyword: string; value: string } | null {
  let nul = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) {
      nul = i;
      break;
    }
  }
  if (nul < 0) return null;
  const keyword = decodeLatin1(data.slice(0, nul));
  // nul+1 是压缩方法字节（0=deflate），nul+2 起是压缩数据
  if (nul + 2 > data.length) return null;
  const method = data[nul + 1];
  if (method !== 0) return null; // 仅支持 deflate
  try {
    const value = decompress(data.slice(nul + 2));
    return { keyword, value };
  } catch {
    return null;
  }
}

// 把 NovelAI Comment JSON 归一化为展示用的字段。
// texts（tEXt/zTXt/iTXt 顶层字段）用于补偿 Comment 里缺失的信息：
//   - Source：确切模型 ID（作者确认），如 "NovelAI Diffusion V4.5 4BDE2A90"
function normalizeNovelAi(comment: Record<string, unknown>, texts?: Record<string, string>): NovelAiMetadata {
  const number = (value: unknown) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    prompt: String(comment.prompt ?? ""),
    negativePrompt: String(comment.uc ?? ""),
    sampler: String(comment.sampler ?? ""),
    steps: number(comment.steps),
    width: number(comment.width),
    height: number(comment.height),
    scale: number(comment.scale),
    seed: number(comment.seed),
    noiseSchedule: String(comment.noise_schedule ?? ""),
    // 模型：优先 model_name + model_hash（NAI v5 如 "NovelAI Diffusion V5 0ADF9AB7"），
    // 其次 comment.source，再其次 PNG 顶层 tEXt 的 Source（确切模型 ID，作者确认），
    // 最后 "NovelAI"。注意 comment.version 是协议版本号（数字 1），不是模型名！
    model: (() => {
      const c = comment as Record<string, unknown>;
      const name = String(c.model_name ?? "").trim();
      const hash = String(c.model_hash ?? "").trim();
      const source = String(c.source ?? "").trim();
      const textSource = String(texts?.Source ?? "").trim();
      // model_name 通常是空或 "NovelAI"；仅在非占位时才值得作为兜底
      const pick = (v: string) => (v && v !== "NovelAI" ? v : "");
      const best =
        pick(name + (name && hash ? ` ${hash}` : "")) ||
        pick(source) ||
        pick(textSource) ||
        (name ? name : "");
      return best || "NovelAI";
    })(),
    // CFG Rescale（NAI 的 CFG 重缩放比例，如 1.5）——有值才带，避免显示 0
    ...(comment.cfg_rescale !== undefined && comment.cfg_rescale !== null
      ? { cfg_rescale: number(comment.cfg_rescale) }
      : {}),
  };
}

type ComfyGraph = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ComfyUI "Save" 导出的工作流使用 nodes/links/widgets_values，PNG 内嵌的 prompt
// 则是执行图。先把前者转换成后者，后续字段提取只维护一套逻辑。
function normalizeComfyWorkflow(parsed: unknown): ComfyGraph | null {
  if (!isRecord(parsed)) return null;

  if (!Array.isArray(parsed.nodes)) {
    const graph: ComfyGraph = {};
    for (const [id, node] of Object.entries(parsed)) {
      if (!isRecord(node) || typeof node.class_type !== "string") continue;
      graph[id] = {
        class_type: node.class_type,
        inputs: isRecord(node.inputs) ? node.inputs : {},
      };
    }
    return Object.keys(graph).length > 0 ? graph : null;
  }

  const links = new Map<string, [string, number]>();
  if (Array.isArray(parsed.links)) {
    for (const link of parsed.links) {
      if (
        !Array.isArray(link) ||
        link.length < 5 ||
        (typeof link[0] !== "number" && typeof link[0] !== "string") ||
        (typeof link[1] !== "number" && typeof link[1] !== "string")
      ) {
        continue;
      }
      const outputIndex = Number(link[2]);
      links.set(String(link[0]), [String(link[1]), Number.isFinite(outputIndex) ? outputIndex : 0]);
    }
  }

  const graph: ComfyGraph = {};
  for (const rawNode of parsed.nodes) {
    if (!isRecord(rawNode) || (typeof rawNode.id !== "number" && typeof rawNode.id !== "string")) continue;
    if (typeof rawNode.type !== "string") continue;

    const inputs: Record<string, unknown> = {};
    const widgetValues = rawNode.widgets_values;
    const widgets = Array.isArray(widgetValues) ? widgetValues : [];
    const namedWidgets = isRecord(widgetValues) ? widgetValues : {};
    let widgetIndex = 0;

    if (Array.isArray(rawNode.inputs)) {
      for (const rawInput of rawNode.inputs) {
        if (!isRecord(rawInput) || typeof rawInput.name !== "string") continue;
        const linked = links.get(String(rawInput.link));
        if (linked) {
          inputs[rawInput.name] = linked;
          continue;
        }
        if (!isRecord(rawInput.widget)) continue;
        const widgetName = typeof rawInput.widget.name === "string" ? rawInput.widget.name : rawInput.name;
        const value = Array.isArray(widgetValues) ? widgets[widgetIndex] : namedWidgets[widgetName];
        widgetIndex++;
        if (value !== undefined) inputs[rawInput.name] = value;
      }
    }

    graph[String(rawNode.id)] = { class_type: rawNode.type, inputs };
  }
  const keys = Object.keys(graph);
  // 节点数护栏：超大/恶意工作流直接拒绝，防遍历撑爆接口
  if (keys.length > MAX_COMFY_NODES) return null;
  return keys.length > 0 ? graph : null;
}

function comfyRef(v: unknown, graph: ComfyGraph): v is [string, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && Number.isInteger(v[1]) && v[1] >= 0 && Boolean(graph[v[0]]);
}

function collectOrder(graph: ComfyGraph, root: string): string[] {
  const order: string[] = [];
  const active = new Set<string>();
  const state = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (depth > MAX_COMFY_DEPTH || state.has(id) || active.has(id) || !graph[id]) return;
    active.add(id);
    for (const value of Object.values(graph[id].inputs ?? {})) {
      if (comfyRef(value, graph)) visit(value[0], depth + 1);
    }
    active.delete(id);
    state.add(id);
    order.push(id);
  };
  visit(root, 0);
  return order;
}

function selectOutputs(graph: ComfyGraph, outputNodeId?: string): { roots: string[]; saves: string[]; order: string[]; selectedRoot: string | null } {
  const outputTypes = new Set(["SaveImage", "SaveAnimatedWEBP", "SaveAnimatedPNG", "SaveImageWebsocket", "PreviewImage"]);
  const roots = Object.entries(graph).filter(([, n]) => outputTypes.has(n.class_type ?? "")).map(([id]) => id);
  const saves = roots.filter((id) => graph[id].class_type !== "PreviewImage");
  let selectedRoot: string | null = null;
  if (outputNodeId && roots.includes(outputNodeId)) selectedRoot = outputNodeId;
  else if (saves.length === 1) selectedRoot = saves[0];
  else if (saves.length === 0 && roots.length === 1) selectedRoot = roots[0];
  const order = selectedRoot ? collectOrder(graph, selectedRoot) : [];
  return { roots, saves, order, selectedRoot };
}

// ComfyUI 解析：读 PNG 内嵌的 workflow JSON（tEXt "prompt" / "workflow"）
export function parseComfyUi(metadata: string | null, outputNodeId?: string): ComfyUiMetadata | null {
  if (!metadata) return null;
  let graph: ComfyGraph | null;
  try {
    // ComfyUI 偶发把 NaN / Infinity 写进 JSON（如 "is_changed": NaN），先清洗再解析
    const src = metadata.replace(/:\s*(NaN|-?Infinity)\b/g, ": null");
    const parsed = JSON.parse(src) as unknown;
    graph = normalizeComfyWorkflow(parsed);
  } catch {
    return null;
  }
  if (!graph) return null;

  const selected = selectOutputs(graph, outputNodeId);
  // 无输出根（如纯 PreviewImage 采样或无 Save 节点的工作流）：不设活跃子图，
  // 退化为全图扫描，保持原有的"能从图内任一采样器提取参数"能力，避免回归。
  const entries: Array<[string, { class_type?: string; inputs?: Record<string, unknown> }]> =
    selected.order.length > 0
      ? selected.order.map((id) => [id, graph[id]] as const)
      : (Object.entries(graph) as Array<[string, { class_type?: string; inputs?: Record<string, unknown> }]>);

  // ── 角色传播式文本提取 ─────────────────────────────────────────────
  // 不依赖具体节点名/字段名：从采样器 positive / negative 端口沿引用链反向
  // 遍历，返回整条链路在给定角色下的文本。字段名点名角色时（如
  // negative_prompt）以字段名为准；与当前链路角色相反的字段属另一条链路，
  // 跳过避免污染。字段名叫什么、节点叫什么都能覆盖。
  const POS_FIELD_RE = /^(positive|pos|positive_prompt|positive_cond|pos_prompt|positive_[a-z0-9]+)$/i;
  const NEG_FIELD_RE = /^(negative|neg|uc|uncond|negative_prompt|negative_cond|neg_prompt|negative_[a-z0-9]+)$/i;
  const TEXT_FIELD_RE =
    /^(text(?:_[a-z0-9]+)?|prompt(?:_[a-z0-9]+)?|positive(?:_[a-z0-9]+)?|negative(?:_[a-z0-9]+)?|wildcard(?:_[a-z0-9]+)?|string(?:_[0-9]+)?|conditioning(?:_[0-9]+)?|uc|uncond)$/i;
  // 结构性输入（数据流连线而非提示词文本），反向追溯时忽略
  const SKIP_REF_RE =
    /^(clip|model|vae|unet|samples?|images?|latent|latent_image|mask|denoise|seed|noise_seed|noise|steps|cfg|eta|start_at_step|end_at_step|add_noise|return_with_leftover_noise|sampler_name|scheduler|sam_model_opt|bbox_detector|segm_detector_opt|filename|filename_prefix|anything|guide|delimiter|clean_whitespace|aesthetic_score|scale|timestep_keyframe|keyframe|reference)$/i;

  const isRef = (v: unknown): v is [string, number] =>
    Array.isArray(v) && typeof v[0] === "string" && Boolean(graph[v[0]]);

  // 返回 nodeId 子树在当前角色下的文本（拼接类按 delimiter 拼接，通用节点
  // 本地文本字段 + 子引用按 ", " 合并），空则返回 ""
  const resolveNodeText = (nodeId: string, role: "positive" | "negative", depth = 0): string => {
    if (depth > MAX_COMFY_DEPTH) return "";
    const n = graph[nodeId];
    if (!n) return "";
    const t = n.class_type ?? "";
    // 调试/预览/展示类节点不参与文本收集（如 easy showAnything）
    if (/showanything|debug|preview|saveimage|reroute|note\b|previewany|showtext/i.test(t)) return "";
    const inputs = (n.inputs ?? {}) as Record<string, unknown>;

    // 拼接类节点：JoinStringMulti 按 string_N、Concatenate 按 text_a..z 拼接
    if (t.includes("JoinString") || t.includes("StringMulti")) {
      const parts: string[] = [];
      const delim = typeof inputs.delimiter === "string" ? inputs.delimiter : "";
      for (let i = 1; i <= 30; i++) {
        const v = inputs[`string_${i}`];
        if (v === undefined) break;
        if (typeof v === "string") parts.push(v);
        else if (isRef(v)) parts.push(resolveNodeText(v[0], role, depth + 1));
      }
      return parts.filter(Boolean).join(delim);
    }
    if (t.includes("Concatenate")) {
      const parts: string[] = [];
      const delim = typeof inputs.delimiter === "string" ? inputs.delimiter : "";
      for (const [k, v] of Object.entries(inputs)) {
        if (!/^text(?:_[a-z0-9]+)?$/i.test(k)) continue;
        if (typeof v === "string") parts.push(v);
        else if (isRef(v)) parts.push(resolveNodeText(v[0], role, depth + 1));
      }
      return parts.filter(Boolean).join(delim);
    }

    // 通用节点：本节点文本字段（角色匹配）+ 子引用文本
    const local: string[] = [];
    for (const [k, v] of Object.entries(inputs)) {
      if (typeof v !== "string" || !v.trim()) continue;
      if (!TEXT_FIELD_RE.test(k)) continue;
      const r = NEG_FIELD_RE.test(k) ? "negative" : POS_FIELD_RE.test(k) ? "positive" : role;
      if (r !== role) continue;
      local.push(v.trim());
    }
    for (const [k, v] of Object.entries(inputs)) {
      if (SKIP_REF_RE.test(k)) continue;
      if (!isRef(v)) continue;
      const childRole = NEG_FIELD_RE.test(k) ? "negative" : POS_FIELD_RE.test(k) ? "positive" : role;
      if (childRole !== role) continue;
      const text = resolveNodeText(v[0], childRole, depth + 1);
      if (text) local.push(text);
    }
    return local.join(", ");
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
    const inputs = (samplerNode.inputs ?? {}) as Record<string, unknown>;
    // 角色传播：沿 positive / negative 端口反向追溯（字段名点名角色优先）
    const pos = Array.isArray(inputs.positive)
      ? resolveNodeText(inputs.positive[0], "positive")
      : typeof inputs.positive === "string"
        ? inputs.positive
        : "";
    const negVal = (inputs as Record<string, unknown>).negative_cond;
    const neg =
      inputs.negative !== undefined
        ? Array.isArray(inputs.negative)
          ? resolveNodeText(inputs.negative[0], "negative")
          : typeof inputs.negative === "string"
            ? inputs.negative
            : ""
        : Array.isArray(negVal)
          ? resolveNodeText(negVal[0], "negative")
          : typeof negVal === "string"
            ? negVal
            : "";
    if (pos) positive = pos;
    if (neg) negative = neg;
  }
  // 兜底：无采样器引用时，从全图收集 CLIPTextEncode 文本并按负面特征词区分正反
  if (!positive && !negative) {
    const pool: string[] = [];
    for (const [, n] of entries) {
      const inputs = (n.inputs ?? {}) as Record<string, unknown>;
      if (!(n?.class_type === "CLIPTextEncode" || n?.class_type === "CLIPTextEncodeAdvanced")) continue;
      const text =
        typeof inputs.text === "string"
          ? inputs.text
          : isRef(inputs.text)
            ? resolveNodeText(inputs.text[0], "positive")
            : "";
      if (text) pool.push(text);
    }
    const NEG_PATTERN =
      /worst quality|low quality|score_[0-9]|bad anatomy|bad hands|deformed|jpeg artifacts|blurry|ugly|watermark|signature|extra (fingers|arms|legs|digit)/i;
    const negTexts = pool.filter((t) => NEG_PATTERN.test(t));
    if (negTexts.length > 0) {
      negative = negTexts[0];
      positive = pool.find((t) => !NEG_PATTERN.test(t)) ?? "";
    } else if (pool.length >= 2) {
      positive = pool[0];
      negative = pool[1];
    } else if (pool.length === 1) {
      positive = pool[0];
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
export function parsePngMetadata(
  buf: ArrayBuffer,
  decompress?: ZtxtDecompressor,
  decompressItxt?: ItxtDecompressor,
): PngParseResult {
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
    // 写入护栏：拒绝超长文本，避免超大 Comment/workflow 撑爆后续解析
    const setText = (key: string, value: string): void => {
      if (value.length > MAX_TEXT_VALUE_BYTES) return;
      texts[key] = value;
    };
    for (const c of chunks) {
      if (c.type === "tEXt") {
        const { keyword, value } = parseTextChunk(c.data);
        setText(keyword, value);
      } else if (c.type === "zTXt" && decompress) {
        // zTXt（压缩文本，NAI v5 常用）：需要注入解压器（后端 zlib.inflateSync）
        const parsed = parseCompressedTextChunk(c.data, decompress);
        if (parsed) setText(parsed.keyword, parsed.value);
      } else if (c.type === "iTXt") {
        const nul = c.data.indexOf(0);
        if (nul < 0 || nul + 2 >= c.data.length) continue;
        const keyword = decodeLatin1(c.data.slice(0, nul));
        const flag = c.data[nul + 1];
        const method = c.data[nul + 2];
        let p = nul + 3;
        const langEnd = c.data.indexOf(0, p); if (langEnd < 0) continue; p = langEnd + 1;
        const translatedEnd = c.data.indexOf(0, p); if (translatedEnd < 0) continue; p = translatedEnd + 1;
        try {
          const raw = c.data.slice(p);
          const value = flag === 1 && method === 0
            ? (decompressItxt ? decompressItxt(raw) : "")
            : flag === 0 ? new TextDecoder().decode(raw) : "";
          if (value) texts[keyword] = value;
        } catch { /* ignore malformed text */ }
      }
    }

    // ComfyUI 把 workflow 存在 tEXt "prompt" / "workflow"
    if (texts.prompt || texts.workflow) {
      const comfyui = parseComfyUi(texts.prompt) ?? parseComfyUi(texts.workflow);
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
        const comment = JSON.parse(texts.Comment) as unknown;
        if (!isRecord(comment)) throw new Error("Comment 不是对象");
        const novelai = normalizeNovelAi(comment, texts);
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
