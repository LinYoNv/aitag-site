#!/usr/bin/env node
// ============================================================
// aitag 存量元数据重算脚本
// 用法：node scripts/recalc-metadata.mjs [--dry-run]
//   --dry-run  只预览不写库
//
// 作用：用"当前解析逻辑"重算全部存量作品的 metadata：
//   - NAI：从 prompt 提取画师(artists)，纠正字段
//   - ComfyUI：从 rawJson 重算 model/sampler/steps/cfg/seed/尺寸，
//     纠正 prompt/uc 正反（负面特征词）
//   - 多图作品(per_image)：逐图重算
//   - 所有作品补齐 _raw 原始元数据存档（PNG 唯一真相源原则）
//
// 注意：本脚本的解析逻辑与 src/lib/png.ts 保持同步。
// 若升级了 png.ts 解析器，请同步更新本脚本后执行。
// ============================================================

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.AITAG_DB || path.join(__dirname, "..", "data", "aitag.db");
const dryRun = process.argv.includes("--dry-run");

// ============ 解析逻辑（与 src/lib/png.ts 同步） ============

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
// 无 artist: 前缀，需用加权段 + 黑名单过滤；`&` 是联合画师须整体保留。
function extractFromArtistSection(prompt) {
  const nl = prompt.lastIndexOf("\n");
  if (nl < 0) return [];
  const section = prompt.slice(0, nl);
  const out = [];
  const seen = new Set();
  for (const raw of section.split(",")) {
    let p = raw.trim();
    if (!p) continue;
    let weight = 1;
    const wm = p.match(/^(-?\d*\.?\d+)\s*::/);
    if (wm) {
      const w = Number.parseFloat(wm[1]);
      if (!Number.isNaN(w)) {
        if (w < 0) continue;
        weight = w;
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
    if (
      /\b(the|is|are|that|has|have|their|but|with|and|only|face|body|character|anime|style|image|drawn|finished|artwork|photo|texture|color|lively|lifelike|flesh|skin|surface|obliques|little|highly|best)\b/i.test(p)
    ) continue;
    const low = p.toLowerCase();
    if (ARTIST_SECTION_BLACKLIST.has(low)) continue;
    if (p.split(/\s+/).length > 3) continue;
    if (seen.has(low)) continue;
    seen.add(low);
    out.push({ name: p, weight, raw: raw.trim() });
  }
  return out;
}

// 从 NovelAI prompt 提取画师
export function extractArtistsFromPrompt(prompt) {
  if (!prompt) return [];
  const out = [];
  const seen = new Set();
  const re = /(?:(?:(-?\d*\.?\d+)\s*::)\s*)?(\{*)\s*artist\s*:\s*([^{},;:\n]+)\s*(\}*)(?:\s*::)?/gi;
  let m;
  while ((m = re.exec(prompt)) !== null) {
    const rawWeight = m[1];
    const openBraces = m[2] ?? "";
    const name = (m[3] ?? "").trim();
    const closeBraces = m[4] ?? "";
    if (!name || name.startsWith("'") || name.startsWith("`")) continue;
    let weight = rawWeight !== undefined && rawWeight !== "" ? Number.parseFloat(rawWeight) : 1;
    if (Number.isNaN(weight)) weight = 1;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = openBraces || closeBraces ? `${openBraces}artist:${name}${closeBraces}` : m[0].trim();
    out.push({ name, weight, raw });
  }
  // NAI v4/v5：tag 之前（\n 分隔）的画师区是加权裸名，补充提取
  for (const a of extractFromArtistSection(prompt)) {
    const key = a.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

// ComfyUI workflow 解析（支持自定义采样器/UNETLoader/引用尺寸/正反识别）
export function parseComfyUi(metadata) {
  if (!metadata) return null;
  let graph;
  try {
    const parsed = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    graph = parsed;
  } catch {
    return null;
  }
  const entries = Object.entries(graph);
  // 递归解析节点文本（与 src/lib/png.ts resolveNodeText 同步）
  const resolveNodeText = (nodeId, depth = 0) => {
    if (depth > 6) return "";
    const n = graph[nodeId];
    if (!n) return "";
    const t = n.class_type ?? "";
    const inputs = n.inputs ?? {};
    if (t.includes("JoinString") || t.includes("StringMulti")) {
      const parts = [];
      const delim = typeof inputs.delimiter === "string" ? inputs.delimiter : "";
      for (let i = 1; i <= 30; i++) {
        const v = inputs[`string_${i}`];
        if (v === undefined) break;
        if (Array.isArray(v) && typeof v[0] === "string") parts.push(resolveNodeText(v[0], depth + 1));
        else if (typeof v === "string") parts.push(v);
      }
      return parts.filter(Boolean).join(delim);
    }
    if (typeof inputs.prompt === "string") return inputs.prompt;
    if (typeof inputs.text === "string") return inputs.text;
    if (typeof inputs.text_0 === "string") return inputs.text_0;
    if (Array.isArray(inputs.text) && typeof inputs.text[0] === "string") {
      return resolveNodeText(inputs.text[0], depth + 1);
    }
    return "";
  };
  const getTextByRef = (ref) => {
    if (Array.isArray(ref) && typeof ref[0] === "string") {
      return resolveNodeText(ref[0]);
    }
    return "";
  };
  const getNumByRef = (ref) => {
    if (typeof ref === "number") return ref;
    if (typeof ref === "string") {
      const n = Number(ref);
      return Number.isNaN(n) ? 0 : n;
    }
    if (Array.isArray(ref) && typeof ref[0] === "string") {
      const n = graph[ref[0]];
      const idx = Number(ref[1] ?? 0);
      if (!n?.inputs) return 0;
      const vals = Object.values(n.inputs);
      const v = vals[idx] ?? vals[0];
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n2 = Number(v);
        return Number.isNaN(n2) ? 0 : n2;
      }
      if (Array.isArray(v)) return getNumByRef(v);
    }
    return 0;
  };
  let samplerNode;
  for (const [, n] of entries) {
    const t = n?.class_type ?? "";
    if (
      t === "KSampler" || t === "KSamplerAdvanced" ||
      t === "SamplerCustom" || t === "SamplerCustomAdvanced" ||
      t.includes("KSampler") || t.includes("SamplerCustom")
    ) {
      samplerNode = n;
      break;
    }
  }
  if (!samplerNode) {
    for (const [, n] of entries) {
      const inputs = n?.inputs ?? {};
      if (
        inputs.positive !== undefined && inputs.negative !== undefined &&
        (inputs.seed !== undefined || inputs.steps !== undefined ||
          inputs.cfg !== undefined || inputs.sampler_name !== undefined)
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
    negative = getTextByRef(samplerNode.inputs?.negative ?? samplerNode.inputs?.negative_cond);
  }
  if (!positive && !negative) {
    const texts = [];
    for (const [, n] of entries) {
      if ((n?.class_type === "CLIPTextEncode" || n?.class_type === "CLIPTextEncodeAdvanced") &&
        typeof n.inputs?.text === "string") {
        texts.push(n.inputs.text);
      }
    }
    const NEG_PATTERN =
      /worst quality|low quality|score_[0-9]|bad anatomy|bad hands|deformed|jpeg artifacts|blurry|ugly|watermark|signature|extra (fingers|arms|legs|digit)/i;
    const negTexts = texts.filter((t) => NEG_PATTERN.test(t));
    if (negTexts.length > 0 && negTexts.length < texts.length) {
      negative = negTexts[0];
      positive = texts.find((t) => t !== negative) ?? "";
    } else if (texts.length >= 2) {
      positive = texts[0];
      negative = texts[1];
    } else if (texts.length === 1) {
      positive = texts[0];
    }
  }
  const sampler = String(samplerNode?.inputs?.sampler_name ?? samplerNode?.inputs?.sampler ?? "");
  const scheduler = String(samplerNode?.inputs?.scheduler ?? "");
  const steps = getNumByRef(samplerNode?.inputs?.steps);
  const cfg = getNumByRef(samplerNode?.inputs?.cfg);
  const seed = getNumByRef(samplerNode?.inputs?.seed);
  let model = "";
  for (const [, n] of entries) {
    const t = n?.class_type ?? "";
    const inputs = n.inputs ?? {};
    if (
      (t.includes("Checkpoint") || t.includes("UNET") || t.includes("VAE")) &&
      (typeof inputs.ckpt_name === "string" || typeof inputs.unet_name === "string")
    ) {
      model = String(inputs.ckpt_name ?? inputs.unet_name ?? "");
      break;
    }
  }
  const loras = [];
  for (const [, n] of entries) {
    const t = n?.class_type ?? "";
    if (t.includes("Lora") && typeof n.inputs?.lora_name === "string") loras.push(String(n.inputs.lora_name));
  }
  let width = 0;
  let height = 0;
  for (const [, n] of entries) {
    if (n?.class_type === "EmptyLatentImage") {
      width = getNumByRef(n.inputs?.width);
      height = getNumByRef(n.inputs?.height);
      if (width && height) break;
    }
  }
  return { prompt: positive, negativePrompt: negative, model, loras, sampler, scheduler, steps, cfg, seed, width, height, rawJson: metadata };
}

// ============ 单图 metadata 重算 ============

const NEG_PATTERN =
  /worst quality|low quality|score_[0-9]|bad anatomy|bad hands|deformed|jpeg artifacts|blurry|ugly|watermark|signature|extra (fingers|arms|legs|digit)/i;
function looksNegative(text) {
  return NEG_PATTERN.test(text);
}

// 从 tEXt 原文构造 _raw 存档
function buildRawStore(texts, commentRaw, workflowRaw) {
  const raw = {};
  for (const k of Object.keys(texts)) {
    if (k === "Comment" || k === "prompt" || k === "workflow") {
      raw[k] = texts[k];
    }
  }
  if (commentRaw) {
    try { raw.comment = JSON.parse(commentRaw); } catch { raw.comment = commentRaw; }
  }
  if (workflowRaw) raw.workflow = workflowRaw;
  return Object.keys(raw).length > 0 ? raw : null;
}

function recalcComfy(m, workflow) {
  const c = parseComfyUi(workflow);
  if (!c) return m;
  const out = { ...m };
  out._format = m._format || "comfyui";
  // prompt/uc 正反纠正
  const frontPrompt = String(m.prompt ?? "");
  const frontUc = String(m.uc ?? "");
  let prompt = c.prompt || frontPrompt;
  let uc = c.negativePrompt || frontUc;
  if (prompt && looksNegative(prompt) && c.prompt) prompt = c.prompt;
  if (uc && !looksNegative(uc) && c.negativePrompt) uc = c.negativePrompt;
  out.prompt = prompt;
  out.uc = uc;
  out.model = c.model || m.model || null;
  out.sampler = c.sampler || m.sampler || null;
  out.scheduler = c.scheduler || m.scheduler || null;
  out.steps = c.steps || m.steps || null;
  out.cfg = c.cfg || m.cfg || null;
  out.seed = c.seed || m.seed || null;
  out.width = c.width || m.width || null;
  out.height = c.height || m.height || null;
  out.loras = c.loras.length > 0 ? c.loras : (m.loras ?? []);
  out.rawJson = c.rawJson ?? m.rawJson ?? null;
  // _raw 存档
  const raw = buildRawStore({ workflow: workflow }, null, workflow);
  if (raw) out._raw = { ...(m._raw ?? {}), ...raw };
  return out;
}

function normalizeNaiComment(commentText) {
  try {
    const comment = JSON.parse(commentText);
    if (!comment || typeof comment !== "object" || Array.isArray(comment)) return null;
    const number = (key) => {
      const value = Number(comment[key] ?? 0);
      return Number.isFinite(value) ? value : 0;
    };
    const modelName = String(comment.model_name ?? "");
    const modelHash = String(comment.model_hash ?? "");
    const source = String(comment.source ?? "");
    const metadata = {
      prompt: String(comment.prompt ?? ""),
      uc: String(comment.uc ?? ""),
      sampler: String(comment.sampler ?? ""),
      steps: number("steps"),
      width: number("width"),
      height: number("height"),
      scale: number("scale"),
      seed: number("seed"),
      noise_schedule: String(comment.noise_schedule ?? ""),
      model: modelName ? (modelHash ? `${modelName} ${modelHash}` : modelName) : (source || "NovelAI"),
    };
    if (comment.cfg_rescale !== undefined && comment.cfg_rescale !== null) {
      metadata.cfg_rescale = number("cfg_rescale");
    }
    return metadata;
  } catch {
    return null;
  }
}

function recalcNai(m, texts) {
  const out = { ...m };
  out._format = m._format || "nai";
  const parsed = normalizeNaiComment(texts.Comment ?? "");
  const prompt = parsed?.prompt ?? String(m.prompt ?? texts.Description ?? "");
  out.prompt = prompt;
  out.uc = parsed?.uc ?? String(m.uc ?? "");
  if (parsed) {
    out.sampler = parsed.sampler;
    out.steps = parsed.steps;
    out.width = parsed.width;
    out.height = parsed.height;
    out.scale = parsed.scale;
    out.seed = parsed.seed;
    out.noise_schedule = parsed.noise_schedule;
    out.model = parsed.model;
    if (parsed.cfg_rescale !== undefined) out.cfg_rescale = parsed.cfg_rescale;
  }
  // 画师：从权威 prompt 提取
  const artists = extractArtistsFromPrompt(prompt);
  out.artists = artists.length > 0 ? artists : (m.artists ?? null);
  // _raw 存档（Comment 原文）
  const raw = buildRawStore(texts, texts.Comment ?? null, null);
  if (raw) out._raw = { ...(m._raw ?? {}), ...raw };
  return out;
}

// ============ 主流程 ============

const db = new DatabaseSync(DB_PATH);
const rows = db.prepare("SELECT id, ai_type, metadata, images FROM works ORDER BY create_date").all();

let updated = 0;
let skipped = 0;
let failed = 0;
const changes = [];

console.log(`数据库: ${DB_PATH} | 模式: ${dryRun ? "DRY-RUN(不写库)" : "写库"}`);
console.log(`共 ${rows.length} 个作品\n`);

if (!dryRun) {
  // 备份
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${DB_PATH}.bak-recalc-${ts}`;
  fs.copyFileSync(DB_PATH, bak);
  console.log(`备份: ${bak}\n`);
  db.exec("BEGIN");
}

try {
  for (const r of rows) {
    let m;
    try {
      m = JSON.parse(r.metadata || "{}");
    } catch {
      console.log(`[SKIP] ${r.id} metadata 不可解析`);
      failed++;
      continue;
    }
    if (!m || typeof m !== "object" || Array.isArray(m)) {
      skipped++;
      continue;
    }

    // 多图作品：逐图重算
    if (Array.isArray(m.per_image)) {
      let dirty = false;
      const per = m.per_image.map((p) => {
        const fmt = p?._format ?? r.ai_type;
        let np = p;
        if (fmt === "comfyui" && p?.rawJson) {
          np = recalcComfy(p, String(p.rawJson));
        } else if (fmt === "nai" || fmt === "nai_x") {
          const c = p?.comment;
          const commentText =
            typeof c === "string" ? c
            : c && typeof c === "object" ? JSON.stringify(c)
            : "";
          np = recalcNai(p, { Comment: commentText });
        }
        if (JSON.stringify(np) !== JSON.stringify(p)) dirty = true;
        return np;
      });
      if (dirty) {
        const newMeta = { ...m, per_image: per };
        if (!dryRun) db.prepare("UPDATE works SET metadata = ? WHERE id = ?").run(JSON.stringify(newMeta), r.id);
        updated++;
        changes.push(`${r.id} (per_image ×${per.length})`);
      }
      continue;
    }

    // 单图作品
    const fmt = m._format ?? r.ai_type;
    let newMeta = null;
    if ((fmt === "comfyui") && (m.rawJson || m._raw?.workflow)) {
      const workflow = String(m.rawJson ?? m._raw?.workflow ?? "");
      newMeta = recalcComfy(m, workflow);
    } else if (fmt === "nai" || fmt === "nai_x") {
      const c = m.comment ?? m._raw?.comment;
      const commentText =
        typeof c === "string" ? c
        : c && typeof c === "object" ? JSON.stringify(c)
        : "";
      newMeta = recalcNai(m, { Comment: commentText });
    } else {
      // other/manual：不动
      skipped++;
      continue;
    }

    if (JSON.stringify(newMeta) !== JSON.stringify(m)) {
      if (!dryRun) db.prepare("UPDATE works SET metadata = ? WHERE id = ?").run(JSON.stringify(newMeta), r.id);
      updated++;
      changes.push(`${r.id} (${fmt})`);
    } else {
      skipped++;
    }
  }

  if (!dryRun) db.exec("COMMIT");
  console.log(`===== ${dryRun ? "DRY-RUN 预览" : "重算"}完成 =====`);
  console.log(`更新: ${updated} | 无变化/跳过: ${skipped} | 失败: ${failed}`);
  if (changes.length > 0) {
    console.log("\n更新的作品:");
    for (const c of changes) console.log("  " + c);
  }
} catch (e) {
  if (!dryRun) {
    db.exec("ROLLBACK");
    console.error("事务回滚！", e);
  } else {
    console.error("预览出错：", e);
  }
  process.exit(1);
}
