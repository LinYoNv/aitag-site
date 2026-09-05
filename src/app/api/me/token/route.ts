import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { generateApiToken, hasApiToken } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET：查询是否已启用 token（不返回明文——明文只在生成时展示一次）
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, hasToken: hasApiToken(user.id) });
}

// POST：生成/重置 token，返回明文（仅此一次，旧 token 立即失效）
export async function POST() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const token = generateApiToken(user.id);
  return NextResponse.json({ ok: true, token });
}
