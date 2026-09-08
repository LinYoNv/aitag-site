import { NextRequest, NextResponse } from "next/server";
import {
  getWorkById,
  deleteWorkById,
  countOtherImageReferences,
  deleteWorkSideRecords,
} from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { extractArtistsFromPrompt } from "@/lib/png";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 存量 NAI 作品补算画师：早期上传的作品 artists 可能为空
//（旧解析只认 artist: 前缀，NAI v4/v5 加权画师串提不到），读取时用增强逻辑补上。
function backfillArtists(work: { metadata: unknown }): void {
  const meta = work.metadata as Record<string, unknown> | null;
  if (!meta || meta._format !== "nai") return;
  const artists = meta.artists;
  if (Array.isArray(artists) && artists.length > 0) return;
  const prompt = String(meta.prompt ?? "");
  let derived = extractArtistsFromPrompt(prompt);
  if (derived.length === 0) {
    const raw = meta._raw as Record<string, unknown> | null;
    const comment = raw?.comment as Record<string, unknown> | null;
    if (comment && typeof comment.prompt === "string") {
      derived = extractArtistsFromPrompt(comment.prompt);
    }
  }
  if (derived.length > 0) meta.artists = derived;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const work = getWorkById(id);
  if (!work) {
    return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  }
  backfillArtists(work);
  return NextResponse.json(work);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const work = getWorkById(id);
  if (!work) {
    return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  }

  // 权限：管理员可删全部；作者只能删自己的（author_name === username）
  const isOwner = work.author_name === user.username;
  if (user.role !== "admin" && !isOwner) {
    return NextResponse.json(
      { error: "无权限：只能删除自己上传的作品" },
      { status: 403 },
    );
  }

  const result = deleteWorkById(id);
  if (!result.deleted) {
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }

  // 同时删除对应图片文件（尽力而为，失败不影响）。
  // 注意：A3 内容去重后文件名是 SHA-256 内容哈希，相同图片全站只存一份文件；
  // 删除前必须确认没有其他作品引用同一文件，否则会误删共享图片导致他人作品 404。
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const img of work.images) {
      const name = path.basename(img);
      // 内容去重：仍被其他作品引用的文件不删
      if (countOtherImageReferences(name, id) > 0) continue;

      // /api/images/xxx → data/uploads/xxx；/images/uploads/xxx → public/images/uploads/xxx
      if (img.startsWith("/api/images/")) {
        const filePath = path.join(process.cwd(), "data", "uploads", name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        // 顺带清理缩略图缓存（thumb/<去扩展名>.webp，若存在）
        const base = path.basename(name, path.extname(name));
        const thumb = path.join(process.cwd(), "data", "uploads", "thumb", `${base}.webp`);
        if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
      } else if (img.startsWith("/images/uploads/")) {
        const filePath = path.join(process.cwd(), "public", "images", "uploads", name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
  } catch (e) {
    console.error("删除图片文件失败:", e);
  }

  // 清理互动记录（点赞/收藏/浏览），避免孤儿数据
  try {
    deleteWorkSideRecords(id);
  } catch (e) {
    console.error("清理互动记录失败:", e);
  }

  return NextResponse.json({ ok: true });
}
