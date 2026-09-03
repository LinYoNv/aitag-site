import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AVATAR_DIR = path.join(process.cwd(), "data", "avatars");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const filePath = path.join(AVATAR_DIR, name);
  if (!filePath.startsWith(AVATAR_DIR) || !fs.existsSync(filePath)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const ext = path.extname(name).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const buf = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
