import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 上传图片存储目录（运行时数据）
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const PREVIEW_DIR = path.join(UPLOAD_DIR, "preview");
// 兼容：早期上传的图在 public/images/uploads（重启后静态可用）
const LEGACY_DIR = path.join(process.cwd(), "public", "images", "uploads");
// 更早的存量作品图在 public/images/works（静态目录，未走 API）
const WORKS_DIR = path.join(process.cwd(), "public", "images", "works");

// 详情页预览图配置：1400px WebP 质量 82（比 thumb 大、比原图小 10 倍+，肉眼几乎无差）
const PREVIEW_WIDTH = 1400;
const PREVIEW_QUALITY = 82;

/**
 * 详情页预览图路由：请求 /api/images/preview/<原文件名>
 * 生成 1400px WebP 并缓存到 data/uploads/preview/。
 * 详情页网格用预览图（首屏秒开），点开灯箱才加载原图（/api/images/）。
 * 参照 aitag.win：全站 WebP 多档尺寸，避免一次拉 1-3MB 原图。
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

  // 预览图缓存路径：u_xxx.png -> preview/u_xxx.webp
  const base = path.basename(name, path.extname(name));
  const previewPath = path.join(PREVIEW_DIR, `${base}.webp`);

  // 命中缓存直接返回
  if (fs.existsSync(previewPath) && previewPath.startsWith(PREVIEW_DIR)) {
    const buf = fs.readFileSync(previewPath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // 找原图（data/uploads 优先，再 legacy uploads，再 works 存量作品）
  let filePath: string | null = null;
  for (const dir of [UPLOAD_DIR, LEGACY_DIR, WORKS_DIR]) {
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
    // 生成预览图
    const buf = await sharp(filePath)
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer();

    // 缓存到磁盘（失败不影响本次返回）
    try {
      fs.mkdirSync(PREVIEW_DIR, { recursive: true });
      fs.writeFileSync(previewPath, buf);
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
    console.error("preview generate error:", e);
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