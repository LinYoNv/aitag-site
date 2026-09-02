import { NextRequest, NextResponse } from "next/server";
import { login, safeUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const result = await login(String(body.username ?? ""), String(body.password ?? ""));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json({ ok: true, user: safeUser(result.user) });
  } catch (e) {
    console.error("login error:", e);
    return NextResponse.json(
      { error: "登录失败：" + (e instanceof Error ? e.message : "服务器错误") },
      { status: 500 },
    );
  }
}
