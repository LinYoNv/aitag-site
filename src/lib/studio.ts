// 生图台服务端 —— 上游调用与配置（server-only）
// 上游契约（对齐参考插件的实际提交）：
//  - openai 后端（api.syuan.org 等 OpenAI 兼容站）：
//    * NAI 模型按 nai_image 的 _openai_generate 提交（parameters 对象装高级参数、
//      vibe/director 参考图数组、img2img 走 /v1/images/edits）
//    * gpt-image 模型按 image_companion 的 openai 平台提交（JSON 精简体；
//      参考图走 /v1/images/edits multipart）
//  - direct 后端（nai.sta1n.cn）：GET /generate，响应为原始图片字节

import "server-only";
import { dataUriToBuffer, sniffMime } from "./ref-image";
import { getUserStudioCfg, setUserStudioCfg, type UserStudioCfg } from "./db";
import {
  NAI_SIZE_MAP,
  normalizeOpenAiSize,
  toGptImageSize,
  DIRECTOR_MODELS,
  DEFAULT_VIBE_STRENGTH,
  DEFAULT_DIRECTOR_STRENGTH,
  DEFAULT_DIRECTOR_SECONDARY_STRENGTH,
  DEFAULT_DIRECTOR_CAPTION,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_DIRECT_BASE_URL,
  STYLE_PRESETS,
} from "./studio-presets";

// ---- 用户级配置（站点只提供默认 URL；密钥由用户在个人资料设置自配，存 users.studio_cfg） ----

export interface ResolvedStudioCfg {
  openai: { base_url: string; api_key: string; configured: boolean };
  direct: { base_url: string; token: string; configured: boolean };
}

function trimUrl(v: unknown): string {
  const s = typeof v === "string" ? v.trim().replace(/\/+$/, "") : "";
  return /^https?:\/\/.+$/.test(s) ? s : "";
}

// ---- SSRF 防护：上游地址只允许 https 公网（本机测试可用 AITAG_STUDIO_ALLOW_INSECURE=1 放开 http/内网） ----
// 生图请求由服务器发出且用户可自定义 base_url，若不限制则任意登录用户都能让服务器
// 请求内网（127.0.0.1 的内部端口、169.254.169.254 元数据、内网段），并通过错误
// 文案/图片响应读回结果——线上实测已复现（http_404 指纹扫内网端口）。

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / 云元数据
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // 组播/保留
    return false;
  }
  if (h.includes(":")) {
    // IPv6 字面量
    if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
    const v4mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
    if (v4mapped) return isPrivateHost(v4mapped[1]);
    return false;
  }
  return false;
}

/** 校验上游 base_url：必须 https（测试环境可放开）且主机不是内网/环回地址 */
export function assertSafeUpstreamBase(url: string): void {
  // 测试模式（AITAG_STUDIO_ALLOW_INSECURE=1）：放开 https 与内网限制，仅供本地
  // mock 联调；生产绝不设置。
  if (process.env.AITAG_STUDIO_ALLOW_INSECURE === "1") return;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new StudioError("upstream_blocked", "上游地址格式无效");
  }
  if (u.protocol !== "https:") {
    throw new StudioError("upstream_blocked", "上游地址必须使用 https://");
  }
  if (isPrivateHost(u.hostname)) {
    throw new StudioError("upstream_blocked", "上游地址不允许指向内网/本机地址");
  }
}

/** 用户提交的 base_url 是否允许使用（不合法一律回退站点默认） */
function safeUserBaseUrl(v: unknown): string | undefined {
  const s = trimUrl(v);
  if (!s) return undefined;
  try {
    assertSafeUpstreamBase(s);
    return s;
  } catch {
    return undefined;
  }
}

/** 读取当前用户的生图配置（默认 URL + 用户自配密钥），读取侧再做一次 SSRF 校验 */
export function resolveUserStudio(userId: string): ResolvedStudioCfg {
  const cfg = getUserStudioCfg(userId) as UserStudioCfg;
  const o = cfg.openai ?? {};
  const d = cfg.direct ?? {};
  const openai = {
    base_url: safeUserBaseUrl(o.base_url) ?? DEFAULT_OPENAI_BASE_URL,
    api_key: typeof o.api_key === "string" ? o.api_key.trim() : "",
    configured: Boolean(o.api_key && String(o.api_key).trim()),
  };
  const direct = {
    base_url: safeUserBaseUrl(d.base_url) ?? DEFAULT_DIRECT_BASE_URL,
    token: typeof d.token === "string" ? d.token.trim() : "",
    configured: Boolean(d.token && String(d.token).trim()),
  };
  return { openai, direct };
}

function trimSecret(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() : undefined;
}

/**
 * 保存用户生图配置（/api/me/studio）。
 * 密钥传空字符串/缺省 = 保持不变；显式 clear 标志 = 清除；base_url 传空 = 回退站点默认。
 */
export function updateUserStudio(
  userId: string,
  patch: {
    openai?: { base_url?: unknown; api_key?: unknown; clear_api_key?: boolean };
    direct?: { base_url?: unknown; token?: unknown; clear_token?: boolean };
  },
): ResolvedStudioCfg {
  const current = getUserStudioCfg(userId) as UserStudioCfg;
  const next: UserStudioCfg = {
    openai: { ...(current.openai ?? {}) },
    direct: { ...(current.direct ?? {}) },
  };
  if (patch.openai) {
    if (patch.openai.base_url !== undefined) {
      next.openai = { ...(next.openai ?? {}), base_url: safeUserBaseUrl(patch.openai.base_url) };
    }
    if (patch.openai.clear_api_key) {
      next.openai = { ...(next.openai ?? {}), api_key: undefined };
    } else {
      const key = trimSecret(patch.openai.api_key);
      if (key) next.openai = { ...(next.openai ?? {}), api_key: key };
    }
  }
  if (patch.direct) {
    if (patch.direct.base_url !== undefined) {
      next.direct = { ...(next.direct ?? {}), base_url: safeUserBaseUrl(patch.direct.base_url) };
    }
    if (patch.direct.clear_token) {
      next.direct = { ...(next.direct ?? {}), token: undefined };
    } else {
      const token = trimSecret(patch.direct.token);
      if (token) next.direct = { ...(next.direct ?? {}), token };
    }
  }
  setUserStudioCfg(userId, next);
  return resolveUserStudio(userId);
}

/** 脱敏快照（GET 接口返回用；密钥/Token 绝不回传） */
export function describeUserStudio(userId: string) {
  const c = resolveUserStudio(userId);
  return {
    openai: {
      configured: c.openai.configured,
      base_url: c.openai.base_url,
      api_key: c.openai.configured ? "已配置" : "未配置",
      is_default_url: c.openai.base_url === DEFAULT_OPENAI_BASE_URL,
    },
    direct: {
      configured: c.direct.configured,
      base_url: c.direct.base_url,
      token: c.direct.configured ? "已配置" : "未配置",
      is_default_url: c.direct.base_url === DEFAULT_DIRECT_BASE_URL,
    },
  };
}

// ---- 提示词合并（服务端权威：画师串前缀 + NAI 标签 + 自然语言） ----

export function mergePrompt(input: {
  nai_prompt?: string;
  nl_prompt?: string;
  style?: string;
  custom_artists?: string;
}): { full_prompt: string; artists: string; base_prompt: string } {
  const parts = [input.nai_prompt ?? "", input.nl_prompt ?? ""]
    .map((s) => s.trim())
    .filter(Boolean);
  const base_prompt = parts.join(", ");
  let artists = "";
  if (input.style === "custom") {
    artists = (input.custom_artists ?? "").trim();
  } else if (input.style && input.style !== "none") {
    artists = (STYLE_PRESETS[input.style] ?? "").trim();
  }
  const full_prompt = artists ? `${artists}, ${base_prompt}` : base_prompt;
  return { full_prompt, artists, base_prompt };
}

// ---- 错误翻译（移植 nai_image _format_generate_error） ----

const TRANSIENT_MARKERS = [
  "服务繁忙",
  "请稍后重试",
  "稍后再试",
  "try again later",
  "service busy",
  "temporarily unavailable",
  "too many requests",
  "overloaded",
];
const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504]);
const RETRY_DELAYS = [2_000, 4_000, 8_000];

export function formatGenerateError(reason: string): string {
  const httpMatch = /^http_(\d+)(?:[|:]([\s\S]*))?$/.exec(reason);
  if (httpMatch) {
    const detail = (httpMatch[2] ?? "").trim();
    return `上游接口返回 HTTP ${httpMatch[1]}${detail ? `：${detail}` : ""}`;
  }
  const map: Record<string, string> = {
    openai_not_configured: "站点未配置 OpenAI 兼容生图接口，请联系管理员在生图台后台填写。",
    direct_not_configured: "站点未配置 sta1n 直连 Token，请联系管理员在生图台后台填写。",
    timeout: "生图超时。上游可能仍在生成（可能已扣费），请稍后手动重试。",
    empty_response: "上游返回 200 但内容为空，可能是接口限流或临时异常。",
    invalid_response: "上游响应不是有效 JSON，请稍后重试或联系管理员。",
    no_reference_image: "该操作需要先上传一张源图片（参考图/待处理图）。",
    exception: "生图过程发生异常，请稍后重试。",
  };
  for (const key of Object.keys(map)) {
    if (reason.startsWith(key)) {
      const detail = reason.slice(key.length).replace(/^[:|\s]+/, "");
      return detail ? `${map[key]}（${detail}）` : map[key];
    }
  }
  return `生图失败：${reason}`;
}

// ---- 参考图预处理（sharp） ----

type RefImage = { dataUri: string; strength?: number; caption?: string };

/**
 * NAI 参考图适配（对齐 nai_image _fit_ref_image）：
 *  - img2img：必须与目标尺寸严格一致（cover 裁切），否则上游直接拒绝
 *  - vibe / director：等比缩小到最大边 1920、面积 3686400 以内（不放大）
 * 输出一律转 PNG 的 data URI。
 */
async function fitReferenceImages(
  refs: RefImage[],
  opts: { mode: "vibe" | "img2img" | "director"; width: number; height: number },
): Promise<{ uris: string[]; strengths: number[]; captions: string[] }> {
  const sharp = (await import("sharp")).default;
  const uris: string[] = [];
  const strengths: number[] = [];
  const captions: string[] = [];
  for (const ref of refs) {
    const parsed = dataUriToBuffer(ref.dataUri);
    if (!parsed) {
      console.warn("[studio] 参考图解析失败，已丢弃该张（data URI 格式异常）");
      continue;
    }
    let out = parsed.buf;
    try {
      const img = sharp(parsed.buf, { failOn: "none" });
      const meta = await img.metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (opts.mode === "img2img") {
        if (w !== opts.width || h !== opts.height) {
          out = await img
            .resize({ width: opts.width, height: opts.height, fit: "cover" })
            .png()
            .toBuffer();
        }
      } else if (w > 0 && h > 0) {
        const ratio = Math.min(
          1,
          1920 / Math.max(w, h),
          Math.sqrt(3686400 / Math.max(1, w * h)),
        );
        if (ratio < 1) {
          out = await img
            .resize({ width: Math.max(1, Math.floor(w * ratio)), height: Math.max(1, Math.floor(h * ratio)) })
            .png()
            .toBuffer();
        }
      }
    } catch {
      // 解析失败按原样提交，由上游报错
    }
    uris.push(`data:${sniffMime(out)};base64,${out.toString("base64")}`);
    strengths.push(
      Math.min(1, Math.max(0, Number(ref.strength ?? (opts.mode === "director" ? DEFAULT_DIRECTOR_STRENGTH : DEFAULT_VIBE_STRENGTH)) || 0)),
    );
    const cap = (ref.caption ?? "").trim();
    captions.push(["character", "style", "character&style"].includes(cap) ? cap : DEFAULT_DIRECTOR_CAPTION);
  }
  return { uris, strengths, captions };
}

// ---- HTTP 辅助 ----

async function readResponseImages(text: string): Promise<Buffer[]> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new StudioError("invalid_response", "上游响应不是有效 JSON");
  }
  const items = (data as { data?: unknown })?.data;
  if (!Array.isArray(items) || items.length === 0) {
    throw new StudioError("empty_response", "上游未返回图片数据");
  }
  const images: Buffer[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { b64_json?: string; url?: string };
    const b64 = (rec.b64_json ?? "").trim();
    if (b64) {
      images.push(Buffer.from(b64, "base64"));
      continue;
    }
    const url = (rec.url ?? "").trim();
    if (url && /^https?:\/\//i.test(url)) {
      // 上游返回的下载地址也做 SSRF 校验（防恶意上游借我们服务器探内网）
      try {
        assertSafeUpstreamBase(url);
      } catch {
        continue;
      }
      const dl = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (dl.ok) images.push(Buffer.from(await dl.arrayBuffer()));
    }
  }
  if (!images.length) throw new StudioError("empty_response", "上游未返回可用的图片数据");
  return images;
}

export class StudioError extends Error {
  reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.reason = reason;
  }
}

async function postJsonWithRetry(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  maxRetries: number,
): Promise<Buffer[]> {
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]));
    }
    let status = 0;
    let text = "";
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = resp.status;
      text = await resp.text();
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        // 超时不重试：上游可能仍在生成并扣费
        throw new StudioError("timeout", "生图请求超时");
      }
      throw new StudioError("exception", `请求异常：${e instanceof Error ? e.message : String(e)}`);
    }
    lastStatus = status;
    lastText = text;
    if (status < 400) return readResponseImages(text);
    const retryable =
      RETRYABLE_STATUS.has(status) ||
      TRANSIENT_MARKERS.some((m) => text.toLowerCase().includes(m.toLowerCase()));
    if (!retryable || attempt === maxRetries) break;
  }
  // 提取上游 error.message
  let errMsg = "";
  try {
    const parsed = JSON.parse(lastText) as { error?: { message?: string } | string };
    if (parsed && typeof parsed === "object" && parsed.error) {
      errMsg =
        typeof parsed.error === "string"
          ? parsed.error
          : String(parsed.error.message ?? "").trim();
    }
  } catch {
    /* 非 JSON 错误体 */
  }
  throw new StudioError(
    `http_${lastStatus}${errMsg ? `|${errMsg.slice(0, 200)}` : ""}`,
    errMsg || `上游返回 HTTP ${lastStatus}`,
  );
}

// ---- OpenAI 兼容后端：NAI 模型（nai_image 契约） ----

export interface NaiOpenAiInput {
  full_prompt: string;
  negative?: string;
  size: string; // WxH
  n: number;
  model?: string;
  steps?: number;
  scale?: number;
  sampler?: string;
  noise_schedule?: string;
  seed?: number; // -1 = 随机（不发送）
  reference_mode?: "vibe" | "img2img" | "director";
  reference_images?: RefImage[];
  strength?: number;
  noise?: number;
  director_action?: string;
  characters?: Array<{ prompt: string; x: number; y: number }>;
}

const DIRECTOR_ACTIONS = new Set(["bg-removal", "lineart", "sketch", "colorize", "emotion", "declutter"]);

/** 上游请求超时 / 重试(站点级常量,不对用户开放) */
const UPSTREAM_TIMEOUT_MS = 180_000;
const OPENAI_MAX_RETRIES = 2;
export const DEFAULT_NAI_OPENAI_MODEL = "nai-diffusion-4-5-full";
export const DEFAULT_NAI_DIRECT_MODEL = "nai-diffusion-4-5-full";
export const DEFAULT_GPTIMAGE_MODEL = "gpt-image-1";

export async function generateNaiOpenAi(cfg: ResolvedStudioCfg["openai"], input: NaiOpenAiInput): Promise<Buffer[]> {
  if (!cfg.base_url || !cfg.api_key) throw new StudioError("openai_not_configured");

  const size = normalizeOpenAiSize(NAI_SIZE_MAP[input.size] ?? input.size);
  const [targetW, targetH] = size.split("x").map((v) => parseInt(v, 10));

  const isDirector = Boolean(input.director_action && DIRECTOR_ACTIONS.has(input.director_action));
  let model = isDirector ? "director-tools" : input.model || DEFAULT_NAI_OPENAI_MODEL;

  // 参考图（≤8 张）
  let refs = (input.reference_images ?? []).slice(0, 8);
  const refMode = (input.reference_mode ?? "vibe") as "vibe" | "img2img" | "director";
  if ((isDirector || refMode === "director") && refs.length === 0 && !isDirector) {
    refs = []; // 无兜底图：按文档契约回退纯文生图
  }
  const isEdit = refs.length > 0 && refMode === "img2img" && !isDirector;
  if (isEdit) refs = refs.slice(0, 1);

  let refData: { uris: string[]; strengths: number[]; captions: string[] } = { uris: [], strengths: [], captions: [] };
  if (refs.length > 0) {
    refData = await fitReferenceImages(refs, { mode: isEdit ? "img2img" : refMode, width: targetW, height: targetH });
  }

  // 高级参数（范围收敛对齐 nai_image：steps 1-50、scale 0-10）
  const steps = Math.min(50, Math.max(1, Math.round(Number(input.steps) || 28)));
  const scale = Math.min(10, Math.max(0, Number(input.scale) || 5));
  const parameters: Record<string, unknown> = { steps, scale };
  if (input.sampler) parameters.sampler = String(input.sampler).trim();
  if (input.noise_schedule) parameters.noise_schedule = String(input.noise_schedule).trim();
  const seed = Number.isFinite(input.seed) ? Math.trunc(Number(input.seed)) : -1;
  if (seed >= 0) parameters.seed = seed;
  const negative = (input.negative ?? "").trim();
  if (negative) parameters.negative_prompt = negative;

  const payload: Record<string, unknown> = {
    prompt: input.full_prompt,
    size,
    n: Math.min(6, Math.max(1, Math.round(Number(input.n) || 1))),
    model,
  };

  if (isDirector) {
    const imageUri = refData.uris[0];
    if (!imageUri) throw new StudioError("no_reference_image", "图片处理动作需要上传一张源图片");
    payload.action = input.director_action;
    payload.parameters = { image: imageUri, width: targetW, height: targetH };
  } else if (isEdit) {
    payload.action = "img2img";
    payload.image = refData.uris[0];
    const strength = Number(input.strength);
    if (Number.isFinite(strength)) parameters.strength = Math.min(1, Math.max(0, strength));
    const noise = Number(input.noise);
    if (Number.isFinite(noise)) parameters.noise = Math.min(1, Math.max(0, noise));
    payload.parameters = parameters;
  } else if (refData.uris.length > 0 && refMode === "director") {
    // 精准参考仅支持 NAI 4.5 / 5 系列，其余自动回退（实测其他模型 400）
    if (!DIRECTOR_MODELS.has((model ?? "").toLowerCase())) {
      model = "nai-diffusion-4-5-full";
    }
    payload.model = model;
    payload.action = "generate";
    parameters.director_reference_images = refData.uris;
    parameters.director_reference_strength_values = refData.strengths;
    parameters.director_reference_secondary_strength_values =
      refData.uris.map(() => DEFAULT_DIRECTOR_SECONDARY_STRENGTH);
    parameters.director_reference_information_extracted = refData.uris.map(() => 1.0);
    parameters.director_reference_descriptions = refData.captions.map((cap) => ({
      caption: { base_caption: cap, char_captions: [] },
      legacy_uc: false,
    }));
    payload.parameters = parameters;
  } else if (refData.uris.length > 0) {
    payload.action = "generate";
    parameters.reference_image_multiple = refData.uris;
    parameters.reference_strength_multiple = refData.strengths;
    parameters.reference_information_extracted_multiple = refData.uris.map(() => 0.7);
    payload.parameters = parameters;
  } else {
    payload.action = "generate";
    payload.parameters = parameters;
  }

  // 多角色坐标（§7，仅 generations）
  const chars = (input.characters ?? [])
    .map((c) => ({
      prompt: String(c.prompt ?? "").trim(),
      x: Math.min(1, Math.max(0, Number(c.x) || 0)),
      y: Math.min(1, Math.max(0, Number(c.y) || 0)),
    }))
    .filter((c) => c.prompt)
    .slice(0, 6);
  if (chars.length && !isEdit && !isDirector) {
    parameters.use_coords = true;
    parameters.characterPrompts = chars.map((c) => ({ prompt: c.prompt, center: { x: c.x, y: c.y } }));
    parameters.v4_prompt = {
      caption: {
        base_caption: input.full_prompt,
        char_captions: chars.map((c) => ({ char_caption: c.prompt, centers: [{ x: c.x, y: c.y }] })),
      },
      use_coords: true,
      use_order: true,
    };
  }

  assertSafeUpstreamBase(cfg.base_url);
  const base = cfg.base_url.replace(/\/+$/, "");
  let endpoint: string;
  if (/\/images\/(generations|edits)$/.test(base)) {
    endpoint = base.replace(/\/images\/(?:generations|edits)$/, "/images/generations");
  } else if (/\/v1\/?$/.test(base) || base.includes("/v1/")) {
    endpoint = `${base.replace(/\/v1\/?$/, "")}/v1/images/generations`;
  } else {
    endpoint = `${base}/v1/images/generations`;
  }

  return postJsonWithRetry(
    endpoint,
    payload,
    { "Content-Type": "application/json", Authorization: `Bearer ${cfg.api_key}` },
    UPSTREAM_TIMEOUT_MS,
    OPENAI_MAX_RETRIES,
  );
}

// ---- OpenAI 兼容后端：gpt-image 系列（image_companion 契约 + 官方参数面） ----

export interface GptImageInput {
  full_prompt: string;
  size: string; // WxH 或 auto
  n: number;
  model?: string;
  quality?: string; // low | medium | high | auto
  background?: string; // transparent | opaque | auto
  output_format?: string; // png | jpeg | webp
  reference_images?: RefImage[]; // 走 /v1/images/edits multipart
}

export async function generateGptImage(cfg: ResolvedStudioCfg["openai"], input: GptImageInput): Promise<Buffer[]> {
  if (!cfg.base_url || !cfg.api_key) throw new StudioError("openai_not_configured");
  const model = input.model || DEFAULT_GPTIMAGE_MODEL;
  const n = Math.min(4, Math.max(1, Math.round(Number(input.n) || 1)));
  const size = toGptImageSize(input.size);
  const quality = ["low", "medium", "high", "auto"].includes(input.quality ?? "") ? input.quality : undefined;
  const background = ["transparent", "opaque", "auto"].includes(input.background ?? "") ? input.background : undefined;
  const outputFormat = ["png", "jpeg", "webp"].includes(input.output_format ?? "") ? input.output_format : undefined;

  assertSafeUpstreamBase(cfg.base_url);
  const base = cfg.base_url.replace(/\/+$/, "");
  const buildEndpoint = (target: "generations" | "edits"): string => {
    if (/\/images\/(generations|edits)$/.test(base)) {
      return base.replace(/\/images\/(?:generations|edits)$/, `/images/${target}`);
    }
    if (/\/v1\/?$/.test(base) || base.includes("/v1/")) {
      return `${base.replace(/\/v1\/?$/, "")}/v1/images/${target}`;
    }
    return `${base}/v1/images/${target}`;
  };

  const refs = (input.reference_images ?? []).slice(0, 8);
  if (refs.length > 0) {
    // 官方 /v1/images/edits 是 multipart；gpt-image-1 支持多张 image[]
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", input.full_prompt);
    form.append("n", String(n));
    form.append("size", size);
    if (quality) form.append("quality", quality);
    if (background) form.append("background", background);
    if (outputFormat) form.append("output_format", outputFormat);
    for (const ref of refs) {
      const parsed = dataUriToBuffer(ref.dataUri);
      if (!parsed) {
        console.warn("[studio] gpt-image 参考图解析失败，已丢弃该张（data URI 格式异常）");
        continue;
      }
      const mime = sniffMime(parsed.buf);
      const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "png";
      form.append("image[]", new Blob([new Uint8Array(parsed.buf)], { type: mime }), `reference_${Date.now()}_${form.get("image[]") ? refs.indexOf(ref) + 1 : 1}.${ext}`);
    }
    const resp = await fetch(buildEndpoint("edits"), {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.api_key}` },
      body: form,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await resp.text();
    if (resp.status >= 400) {
      throw new StudioError(`http_${resp.status}`, await extractErrorMessage(text, resp.status));
    }
    return readResponseImages(text);
  }

  const payload: Record<string, unknown> = { model, prompt: input.full_prompt, n, size };
  if (quality) payload.quality = quality;
  if (background) payload.background = background;
  if (outputFormat) payload.output_format = outputFormat;

  return postJsonWithRetry(
    buildEndpoint("generations"),
    payload,
    { "Content-Type": "application/json", Authorization: `Bearer ${cfg.api_key}` },
    UPSTREAM_TIMEOUT_MS,
    OPENAI_MAX_RETRIES,
  );
}

async function extractErrorMessage(text: string, status: number): Promise<string> {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (parsed?.error) {
      return typeof parsed.error === "string"
        ? parsed.error
        : String(parsed.error.message ?? `上游返回 HTTP ${status}`);
    }
  } catch {
    /* ignore */
  }
  return `上游返回 HTTP ${status}`;
}

// ---- sta1n 直连后端（GET /generate） ----

export interface DirectInput {
  full_prompt: string;
  artists: string;
  negative?: string;
  size: string; // NAI 分档名（竖图/2K竖图/...）
  model?: string;
  steps?: number;
  scale?: number;
  cfg?: number;
  sampler?: string;
  noise_schedule?: string;
}

export async function generateDirect(cfg: ResolvedStudioCfg["direct"], input: DirectInput): Promise<Buffer[]> {
  if (!cfg.token) throw new StudioError("direct_not_configured");
  assertSafeUpstreamBase(cfg.base_url);
  const base = cfg.base_url.replace(/\/+$/, "");
  const url =
    `${base}/generate` +
    `?tag=${encodeURIComponent(input.full_prompt)}` +
    `&token=${encodeURIComponent(cfg.token)}` +
    `&model=${encodeURIComponent(input.model || DEFAULT_NAI_DIRECT_MODEL)}` +
    `&artist=${encodeURIComponent(input.artists ?? "")}` +
    `&size=${encodeURIComponent(input.size || "竖图")}` +
    `&steps=${Math.round(Number(input.steps) || 24)}` +
    `&scale=${Number(input.scale) || 6}` +
    `&cfg=${Number(input.cfg ?? 7)}` +
    `&sampler=${encodeURIComponent(input.sampler || "k_dpmpp_2m_sde")}` +
    `&negative=${encodeURIComponent(input.negative ?? "")}` +
    `&nocache=1` +
    `&noise_schedule=${encodeURIComponent(input.noise_schedule || "karras")}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (resp.status !== 200) {
      throw new StudioError(`http_${resp.status}|${resp.statusText || "直连接口错误"}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) throw new StudioError("empty_response");
    return [buf];
  } catch (e) {
    if (e instanceof StudioError) throw e;
    if (e instanceof Error && e.name === "TimeoutError") throw new StudioError("timeout");
    throw new StudioError("exception", e instanceof Error ? e.message : String(e));
  }
}

// ---- 直连 Token 校验（个人资料设置「测试」用，POST /api/api/getUser） ----

export async function checkDirectToken(
  cfg: ResolvedStudioCfg["direct"],
): Promise<{ ok: boolean; message: string }> {
  if (!cfg.token) return { ok: false, message: "未配置 Token" };
  try {
    assertSafeUpstreamBase(cfg.base_url);
    const base = cfg.base_url.replace(/\/+$/, "");
    const resp = await fetch(`${base}/api/api/getUser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: cfg.token }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await resp.text();
    if (resp.status !== 200) return { ok: false, message: `HTTP ${resp.status}` };
    // sta1n 对无效 Token 也返回 HTTP 200，但响应体 status=error（如 "user not found"）
    try {
      const parsed = JSON.parse(text) as { status?: string; message?: string };
      if (parsed && parsed.status === "error") {
        return { ok: false, message: parsed.message || "Token 无效" };
      }
    } catch {
      /* 非 JSON 响应按 200 处理 */
    }
    return { ok: true, message: text.slice(0, 120) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 生成图片文件名（下载/入库用） */
export function studioImageExtension(buf: Buffer): string {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF") return "webp";
  return "png";
}

