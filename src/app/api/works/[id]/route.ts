import { NextRequest, NextResponse } from "next/server";
import { getWorkById, deleteWorkById } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

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

  // 同时删除对应图片文件（尽力而为，失败不影响）
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const img of work.images) {
      // /api/images/xxx → data/uploads/xxx；/images/uploads/xxx → public/images/uploads/xxx
      let filePath: string | null = null;
      if (img.startsWith("/api/images/")) {
        filePath = path.join(process.cwd(), "data", "uploads", path.basename(img));
      } else if (img.startsWith("/images/uploads/")) {
        filePath = path.join(process.cwd(), "public", "images", "uploads", path.basename(img));
      }
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (e) {
    console.error("删除图片文件失败:", e);
  }

  return NextResponse.json({ ok: true });
}
