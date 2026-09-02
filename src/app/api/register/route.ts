import { NextRequest, NextResponse } from "next/server";
import { registerUser, safeUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
    }

    const result = registerUser(username, password, "user");
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, user: safeUser(result.user) }, { status: 201 });
  } catch (e) {
    console.error("register error:", e);
    return NextResponse.json(
      { error: "注册失败：" + (e instanceof Error ? e.message : "服务器错误") },
      { status: 500 },
    );
  }
}
