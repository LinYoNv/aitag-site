import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { insertWork } from "@/lib/db";
import type { Work } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "images", "uploads");
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

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const title = String(form.get("title") ?? "").slice(0, 200);
    const caption = String(form.get("caption") ?? "").slice(0, 500);
    const aiType = String(form.get("ai_type") ?? "nai");
    const authorName = String(form.get("author_name") ?? "群友").slice(0, 50);
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

    // 逐张处理：校验 + 存盘
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

      const meta = parseMeta(String(form.get(`meta_${i}`) ?? ""));
      saved.push({ url: `/images/uploads/${filename}`, meta });
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
