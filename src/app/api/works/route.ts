import { NextRequest, NextResponse } from "next/server";
import { listWorks } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 与整站门控一致：列表接口也要求登录（防未登录拉全量作品元数据）
  if (!(await currentUser())) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const prompt = sp.get("prompt") ?? undefined;
  const sortRaw = sp.get("sort");
  const sort = ["new", "old", "monthly", "bookmarks"].includes(sortRaw ?? "")
    ? (sortRaw as "new" | "old" | "monthly" | "bookmarks")
    : "new";
  const aiType = sp.get("ai_type") ?? undefined;
  const blockTags = sp.get("block_tags") ?? undefined;
  const page = Number(sp.get("page") ?? "1");
  const page_size = Number(sp.get("page_size") ?? "24");

  const result = listWorks({
    q: q || undefined,
    prompt: prompt || undefined,
    sort,
    ai_type: aiType || undefined,
    block_tags: blockTags || undefined,
    page: Number.isFinite(page) ? page : 1,
    page_size: Number.isFinite(page_size) ? page_size : 24,
  });

  return NextResponse.json(result);
}
