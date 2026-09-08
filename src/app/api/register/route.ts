import { NextRequest, NextResponse } from "next/server";
import { registerUser, safeUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // 防批量注册：每 IP 3 次 / 小时
    if (!rateLimit(`reg:ip:${clientIp(req)}`, 3, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
    }
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
