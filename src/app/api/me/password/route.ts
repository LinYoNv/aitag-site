import { NextResponse } from "next/server";
import { currentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { updatePassword } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST：修改密码（需提供旧密码校验）
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: { old_password?: string; new_password?: string };
  try {
    body = (await req.json()) as { old_password?: string; new_password?: string };
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const oldPw = body.old_password ?? "";
  const newPw = body.new_password ?? "";

  if (!oldPw || !newPw) {
    return NextResponse.json({ error: "请填写旧密码和新密码" }, { status: 400 });
  }
  if (!verifyPassword(oldPw, user.password_hash)) {
    return NextResponse.json({ error: "旧密码不正确" }, { status: 403 });
  }
  if (newPw.length < 8) {
    return NextResponse.json({ error: "新密码至少 8 位" }, { status: 400 });
  }
  if (newPw === oldPw) {
    return NextResponse.json({ error: "新密码不能与旧密码相同" }, { status: 400 });
  }

  updatePassword(user.id, hashPassword(newPw));
  return NextResponse.json({ ok: true });
}