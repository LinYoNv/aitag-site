import { NextRequest, NextResponse } from "next/server";
import { toggleAction, workExists } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  if (!workExists(id)) {
    return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (action !== "like" && action !== "bookmark") {
    return NextResponse.json({ error: "参数错误：action 必须是 like 或 bookmark" }, { status: 400 });
  }
  const result = toggleAction(user.id, id, action);
  return NextResponse.json({ ok: true, ...result });
}
