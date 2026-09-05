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

function recalcNai(m, texts) {
  const out = { ...m };
  out._format = m._format || "nai";
  const prompt = String(m.prompt ?? texts.Comment ?? texts.Description ?? "");
  out.prompt = prompt;
  out.uc = String(m.uc ?? "");
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
          np = recalcNai(p, { Comment: String(p?.comment ?? "") });
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
      const commentRaw = typeof m.comment === "string" ? m.comment
        : m.comment && typeof m.comment === "object" ? JSON.stringify(m.comment)
        : m._raw?.comment && typeof m._raw.comment === "string" ? m._raw.comment : "";
      newMeta = recalcNai(m, { Comment: commentRaw || String(m.prompt ?? "") });
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
