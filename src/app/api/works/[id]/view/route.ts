import { NextRequest, NextResponse } from "next/server";
import { incrementView, workExists } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!workExists(id)) {
    return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  }
  const total = incrementView(id);
  return NextResponse.json({ ok: true, total_view: total });
}
