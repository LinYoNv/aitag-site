import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { currentUser } from "@/lib/auth";
import { updateAvatar } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AVATAR_DIR = path.join(process.cwd(), "data", "avatars");
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

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

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("avatar");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请选择头像图片" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json({ error: "头像图片为空" }, { status: 400 });
    }
    if (bytes.length > MAX_SIZE) {
      return NextResponse.json({ error: "头像不能超过 2MB" }, { status: 400 });
    }
    const { ok, ext } = isImage(bytes);
    if (!ok) {
      return NextResponse.json({ error: "头像仅支持 PNG/JPEG/WebP" }, { status: 400 });
    }

    fs.mkdirSync(AVATAR_DIR, { recursive: true });
    const filename = `a_${user.id}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, filename), bytes);

    const url = `/api/avatars/${filename}`;
    updateAvatar(user.id, url);

    return NextResponse.json({ ok: true, avatar: url });
  } catch (e) {
    console.error("avatar upload error:", e);
    return NextResponse.json(
      { error: "上传失败：" + (e instanceof Error ? e.message : "服务器错误") },
      { status: 500 },
    );
  }
}
