import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { insertWork } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getUserByApiToken } from "@/lib/db";
import { parsePngMetadata } from "@/lib/png";
import { extractArtistsFromPrompt } from "@/lib/png";
import type { Work } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const MAX_SIZE = 20 * 1024 * 1024; // 20MB 单张

function isImage(bytes: Buffer): { ok: boolean; ext: string } {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ok: true, ext: ".png" };
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ok: true, ext: ".jpg" };
  }
  if (bytes.length > 11 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return { ok: true, ext: ".webp" };
  }
  return { ok: false, ext: "" };
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 负面特征词：用于纠正 prompt/uc 正反颠倒
const NEG_PATTERN =
  /worst quality|low quality|score_[0-9]|bad anatomy|bad hands|deformed|jpeg artifacts|blurry|ugly|watermark|signature|extra (fingers|arms|legs|digit)/i;

// 判断某字符串是否疑似负面词 prompt（用于纠正正反颠倒）
function looksNegative(text: string): boolean {
  return NEG_PATTERN.test(text);
}

// 服务端权威解析：把前端提交的 meta 与 PNG 服务端解析结果合并
// 原则：
//  - 原始元数据永久存档到 _raw（后悔药，无论解析成败）
//  - 后端解析出的参数优先（防前端解析 bug 固化错误）
//  - 用户手动编辑过的字段（前端有值且不像错误数据）尊重前端
//  - prompt/uc 正反颠倒用负面特征词纠正
function mergeServerMeta(
  frontMeta: Record<string, unknown> | null,
  parseResult: ReturnType<typeof parsePngMetadata>,
  aiType: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    _format: frontMeta?._format ?? (aiType === "comfyui" ? "comfyui" : "nai"),
  };
  const fm = frontMeta ?? {};

  // ---- 原始元数据永久存档 ----
  const rawStore: Record<string, unknown> = {};
  const texts = (parseResult.metadata ?? {}) as Record<string, string>;
  for (const k of Object.keys(texts)) {
    if (k !== "Comment" && k !== "prompt" && k !== "workflow") continue;
    rawStore[k] = texts[k];
  }
  if (parseResult.novelai) {
    // NovelAI：存完整 Comment JSON
    const commentText = texts.Comment;
    if (commentText) {
      try {
        rawStore.comment = JSON.parse(commentText);
      } catch {
        rawStore.comment = commentText;
      }
    }
  }
  if (parseResult.comfyui) {
    rawStore.workflow = parseResult.comfyui.rawJson ?? null;
  }
  if (Object.keys(rawStore).length > 0) out._raw = rawStore;

  if (parseResult.comfyui) {
    // ---- ComfyUI：后端权威值优先，前端用户编辑兜底 ----
    const c = parseResult.comfyui;
    const frontPrompt = String(fm.prompt ?? "");
    const frontUc = String(fm.uc ?? "");
    // prompt/uc：后端权威；若后端无值则用前端；若前端值疑似负面词且后端有正面则用后端
    let prompt = c.prompt || frontPrompt;
    let uc = c.negativePrompt || frontUc;
    if (prompt && looksNegative(prompt) && c.prompt) prompt = c.prompt;
    if (uc && !looksNegative(uc) && c.negativePrompt) uc = c.negativePrompt;
    out.prompt = prompt;
    out.uc = uc;
    out.model = c.model || fm.model || null;
    out.loras = c.loras.length > 0 ? c.loras : (fm.loras ?? []);
    out.sampler = c.sampler || fm.sampler || null;
    out.scheduler = c.scheduler || fm.scheduler || null;
    out.steps = c.steps || fm.steps || null;
    out.cfg = c.cfg || fm.cfg || null;
    out.seed = c.seed || fm.seed || null;
    out.width = c.width || fm.width || null;
    out.height = c.height || fm.height || null;
    out.rawJson = c.rawJson ?? fm.rawJson ?? null;
    return out;
  }

  if (parseResult.novelai) {
    // ---- NovelAI：prompt/uc 尊重前端编辑，其余后端优先 ----
    const n = parseResult.novelai;
    const frontPrompt = String(fm.prompt ?? "");
    const frontUc = String(fm.uc ?? "");
    out.prompt = frontPrompt || n.prompt || "";
    out.uc = frontUc || n.negativePrompt || "";
    out.sampler = fm.sampler || n.sampler || null;
    out.steps = fm.steps || n.steps || null;
    out.width = fm.width || n.width || null;
    out.height = fm.height || n.height || null;
    out.scale = fm.scale ?? n.scale ?? null;
    out.seed = fm.seed || n.seed || null;
    out.noise_schedule = fm.noise_schedule ?? n.noiseSchedule ?? null;
    // CFG Rescale（NAI 的 cfg_rescale，如 1.5）——后端权威，前端编辑兜底
    out.cfg_rescale = fm.cfg_rescale ?? n.cfg_rescale ?? null;
    out.model = fm.model || n.model || null;
    // 画师：后端从权威 prompt 提取（前端可能没提/提错）
    const serverArtists = extractArtistsFromPrompt(String(out.prompt || ""));
    out.artists = serverArtists.length > 0 ? serverArtists : (fm.artists ?? null);
    return out;
  }

  // ---- 其他/手动：原样保留前端 ----
  return { ...fm };
}

// 鉴权：优先 session（网页在线），无 session 时尝试 Authorization: Bearer <token>（外部插件）
async function authUser(req: NextRequest) {
  const sessionUser = await currentUser();
  if (sessionUser) return sessionUser;
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m) {
    const tokenUser = getUserByApiToken(m[1].trim());
    if (tokenUser) return tokenUser;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // 必须登录（session 或 API token）才能上传，作者绑定账号
    const user = await authUser(req);
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const form = await req.formData();

    const title = String(form.get("title") ?? "").slice(0, 200);
    const caption = String(form.get("caption") ?? "").slice(0, 500);
    const aiType = String(form.get("ai_type") ?? "nai");
    const authorName = user.username; // 作者 = 登录用户名
    const shareTitle = String(form.get("share_title") ?? "") === "1";

    // 收集所有文件
    const fileEntries = form.getAll("files").filter(
      (f): f is File => f instanceof File,
    );
    if (fileEntries.length === 0) {
      // 兼容单文件字段名
      const single = form.get("file");
      if (single && single instanceof File) {
        fileEntries.push(single);
      }
    }
    if (fileEntries.length === 0) {
      return NextResponse.json({ error: "失败：未收到图片文件" }, { status: 400 });
    }

    // 逐张处理：校验 + 存盘 + 服务端权威解析
    const saved: Array<{ url: string; meta: Record<string, unknown> | null }> = [];
    for (let i = 0; i < fileEntries.length; i++) {
      const f = fileEntries[i];
      const bytes = Buffer.from(await f.arrayBuffer());
      if (bytes.length === 0) {
        return NextResponse.json({ error: `失败：第 ${i + 1} 张图片为空` }, { status: 400 });
      }
      if (bytes.length > MAX_SIZE) {
        return NextResponse.json({ error: `失败：第 ${i + 1} 张图片超过 20MB` }, { status: 400 });
      }
      const { ok, ext } = isImage(bytes);
      if (!ok) {
        return NextResponse.json({ error: `失败：第 ${i + 1} 张仅支持 PNG/JPEG/WebP` }, { status: 400 });
      }

      const id = crypto.randomBytes(8).toString("hex");
      const filename = `u_${id}${ext}`;
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), bytes);

      // 前端提交的解析结果（可能是旧/错误逻辑，仅作编辑参考）
      const frontMeta = parseMeta(String(form.get(`meta_${i}`) ?? ""));
      // 服务端权威解析（PNG 是唯一真相源）：解析成败都存档 _raw，并合并/纠正
      let meta: Record<string, unknown> | null = frontMeta;
      if (ext === ".png") {
        try {
          // Buffer -> ArrayBuffer（parsePngMetadata 需要 ArrayBuffer）
          const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          const parsed = parsePngMetadata(ab);
          const perFormat = frontMeta?._format ?? aiType;
          meta = mergeServerMeta(frontMeta, parsed, String(perFormat));
        } catch (e) {
          console.error(`服务端解析失败 ${filename}:`, e);
        }
      }
      saved.push({ url: `/api/images/${filename}`, meta });
    }

    const ai_type = (["sd", "nai", "nai_x", "comfyui", "other"].includes(aiType)
      ? aiType
      : "nai") as Work["ai_type"];

    if (shareTitle && saved.length > 1) {
      // 合并：一个作品，多张图，每张图各自参数
      const id = crypto.randomBytes(8).toString("hex");
      const work: Work = {
        id,
        title: title || `作品 ${id.slice(0, 6)}`,
        caption,
        create_date: new Date().toISOString(),
        ai_type,
        image_count: saved.length,
        tags: [],
        author_name: authorName,
        total_view: 0,
        total_bookmarks: 0,
        images: saved.map((s) => s.url),
        metadata: {
          per_image: saved.map((s) => s.meta ?? { prompt: null, uc: null }),
        },
      };
      insertWork(work);
      return NextResponse.json({ ok: true, id: work.id, count: saved.length }, { status: 201 });
    }

    // 不合并：每张图独立作品
    const created: string[] = [];
    for (const s of saved) {
      const id = crypto.randomBytes(8).toString("hex");
      const work: Work = {
        id,
        title: title || `作品 ${id.slice(0, 6)}`,
        caption,
        create_date: new Date().toISOString(),
        ai_type,
        image_count: 1,
        tags: [],
        author_name: authorName,
        total_view: 0,
        total_bookmarks: 0,
        images: [s.url],
        metadata: s.meta ?? { prompt: null, uc: null },
      };
      insertWork(work);
      created.push(work.id);
    }
    return NextResponse.json(
      { ok: true, ids: created, count: created.length },
      { status: 201 },
    );
  } catch (e) {
    console.error("upload error:", e);
    return NextResponse.json(
      { error: "失败：" + (e instanceof Error ? e.message : "服务器错误") },
      { status: 500 },
    );
  }
}
