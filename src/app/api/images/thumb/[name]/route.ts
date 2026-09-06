import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 上传图片存储目录（运行时数据）
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const THUMB_DIR = path.join(UPLOAD_DIR, "thumb");
// 兼容：早期上传的图在 public/images/uploads（重启后静态可用）
const LEGACY_DIR = path.join(process.cwd(), "public", "images", "uploads");

// 缩略图配置：画廊卡片展示宽度 480px，WebP 质量 80
const THUMB_WIDTH = 480;
const THUMB_QUALITY = 80;

/**
 * 缩略图路由：请求 /api/images/thumb/<原文件名>
 * 首次访问用 sharp 生成 480px WebP 缩略图并缓存到 data/uploads/thumb/，
 * 之后直接读缓存。画廊（列表页）用缩略图，详情页仍用原图（/api/images/）。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  // 防目录穿越：只允许文件名（不含路径分隔符）
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // 缩略图缓存路径：u_xxx.png -> thumb/u_xxx.webp
  const base = path.basename(name, path.extname(name));
  const thumbPath = path.join(THUMB_DIR, `${base}.webp`);

  // 命中缓存直接返回
  if (fs.existsSync(thumbPath) && thumbPath.startsWith(THUMB_DIR)) {
    const buf = fs.readFileSync(thumbPath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // 找原图（data/uploads 优先，回退 legacy）
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
    // 生成缩略图
    const buf = await sharp(filePath)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();

    // 缓存到磁盘（失败不影响本次返回）
    try {
      fs.mkdirSync(THUMB_DIR, { recursive: true });
      fs.writeFileSync(thumbPath, buf);
    } catch {
      // 忽略缓存写失败（内存中仍可返回）
    }

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("thumbnail generate error:", e);
    // 生成失败时回退原图（保证可用性）
    try {
      const orig = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      return new NextResponse(new Uint8Array(orig), {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return new NextResponse("Server Error", { status: 500 });
    }
  }
}
