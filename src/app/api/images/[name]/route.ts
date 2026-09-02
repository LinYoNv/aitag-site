import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 上传图片存储目录（运行时数据，不在 public，避免 Next 静态缓存问题）
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
// 兼容：早期上传的图在 public/images/uploads（重启后静态可用）
const LEGACY_DIR = path.join(process.cwd(), "public", "images", "uploads");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  // 防目录穿越：只允许文件名（不含路径分隔符）
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // 先找 data/uploads，再回退 legacy public/images/uploads
  let filePath: string | null = null;
  for (const dir of [UPLOAD_DIR, LEGACY_DIR]) {
    const candidate = path.join(dir, name);
    if (candidate.startsWith(dir) && fs.existsSync(candidate)) {
      filePath = candidate;
      break;
    }
  }

  if (!filePath) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const ext = path.extname(name).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const buf = fs.readFileSync(filePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("image serve error:", e);
    return new NextResponse("Server Error", { status: 500 });
  }
}
