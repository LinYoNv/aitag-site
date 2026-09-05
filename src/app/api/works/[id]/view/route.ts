import { NextRequest, NextResponse } from "next/server";
import { recordView, workExists } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 浏览量：同用户同作品 10 分钟内只计一次（防刷新刷量，参照主流图库站做法）
export async function POST(_req: NextRequest, { params }: Params) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  if (!workExists(id)) {
    return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  }
  const total = recordView(user.id, id);
  return NextResponse.json({ ok: true, total_view: total });
}
