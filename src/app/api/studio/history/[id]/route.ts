// 生图历史图片 —— GET /api/studio/history/<id>[?thumb=1]
//
// 为什么走 API 而不是静态目录：历史图存在 data/uploads/hist/（不在 public 下），
// 与图库上传图同口径（避开 Next 静态缓存，也避免运行时数据混进构建产物）。
//
// 鉴权：必须登录，且**只有记录所有者本人**能取图（按 currentUser().id 校验归属）。
// 这是本路由与 /api/images/<name>（公开画廊图）最大的区别 —— 历史里可能有未公开的试验图。

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import { currentUser } from "@/lib/auth";
import { getStudioHistory as getDbStudioHistory } from "@/lib/db";
import { resolveHistoryFile } from "@/lib/studio-history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
    return NextResponse.json({ error: "参数非法" }, { status: 400 });
  }

  const row = getDbStudioHistory(user.id, id);
  if (!row) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }

  const wantThumb = new URL(req.url).searchParams.get("thumb") === "1";
  // 缩略图缺失（如 sharp 不可用时退化成原图路径、或文件被清理）→ 回退原图，保证可用
  const filePath =
    (wantThumb ? resolveHistoryFile(row, "thumb") : null) ?? resolveHistoryFile(row, "orig");

  if (!filePath) {
    console.warn(`[studio] 生图历史：文件缺失 id=${id} user=${user.username}（库里仍有记录）`);
    return NextResponse.json({ error: "图片文件缺失" }, { status: 404 });
  }

  try {
    const stat = fs.statSync(filePath);
    // ETag 用 (mtime,size)：内容不变 → 304（省流量）；文件被删/换 → 立刻失效。
    const etag = `W/"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;

    // ⚠️ 这里**不能**用 max-age 长缓存：实测删除记录后，浏览器的磁盘缓存仍会在
    // 有效期内直接回 200，把已删的图继续显示出来（服务端明明已 404）。
    // 历史是「可删的私密内容」，删除必须立刻生效 → 用 no-cache + ETag 强制每次校验。
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, no-cache" },
      });
    }

    const buf = fs.readFileSync(filePath);
    const mime = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, no-cache",
        ETag: etag,
      },
    });
  } catch (e) {
    console.error("studio history image serve error:", e);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}
