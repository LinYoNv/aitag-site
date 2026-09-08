import { NextRequest, NextResponse } from "next/server";
import { login, safeUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const body = (await req.json()) as { username?: string; password?: string };
    const username = String(body.username ?? "");

    // 爆破防护：按 IP 与用户名双维度限流（5 次 / 5 分钟）
    if (!rateLimit(`login:ip:${ip}`, 5, 5 * 60 * 1000)) {
      return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
    }
    if (username && !rateLimit(`login:user:${username}`, 5, 5 * 60 * 1000)) {
      return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
    }

    const result = await login(username, String(body.password ?? ""));
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
