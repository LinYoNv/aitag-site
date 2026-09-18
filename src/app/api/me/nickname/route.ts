import { NextRequest, NextResponse } from "next/server";
import { currentUser, renameUser, safeUser } from "@/lib/auth";
import { validateNickname } from "@/lib/names";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST：修改昵称（昵称 = 作品作者名）
// 昵称与「用户名」解耦：用户名是登录名，改昵称不动登录名，也不用重新登录。
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: { nickname?: string };
  try {
    body = (await req.json()) as { nickname?: string };
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  // 先校验格式（含保留名，按角色）：不合法的输入直接报错，不占用改名配额
  // （否则用户手误几次就会被限流锁一小时；试探「昵称是否被占」必须用合法昵称，照样计数）
  // 管理员放行保留名 —— 否则 admin 账号（昵称默认就是保留名）改走一次就再也改不回来。
  // 这里只是提前挡一道，**权威校验仍在 renameUser**（避免两处口径漂移）。
  const checked = validateNickname(body.nickname, { allowReserved: user.role === "admin" });
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  // 改名是低频操作，限流只为防「试探占用」：5 次 / 小时 / 用户
  if (!rateLimit(`nick:user:${user.id}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "改名过于频繁，请稍后再试" }, { status: 429 });
  }

  const result = renameUser(user.id, checked.name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, user: safeUser(result.user) });
}
