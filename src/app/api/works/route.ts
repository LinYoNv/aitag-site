import { NextRequest, NextResponse } from "next/server";
import { listWorks, getUserPref } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { expandHiddenTags, defaultHiddenTags } from "@/lib/r18g-tags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 与整站门控一致：列表接口也要求登录（防未登录拉全量作品元数据）
  const user = await currentUser();
  if (!user) {
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
  const page = Number(sp.get("page") ?? "1");
  const page_size = Number(sp.get("page_size") ?? "24");

  // 账号偏好：开启 R18G 屏蔽时，把勾选的 tag + 自定义词展开成屏蔽词（只匹配正向 prompt）。
  // 从未选过任何词时用推荐默认（粪便 + 纯兽人），保证开关一开就有用。
  const pref = getUserPref(user.id);
  let blockedPosTags: string[] = [];
  if (pref.enabled) {
    const hasSelection = pref.selected.length > 0 || pref.custom.length > 0;
    blockedPosTags = hasSelection
      ? expandHiddenTags(pref.selected, pref.custom)
      : defaultHiddenTags();
  }

  const result = listWorks({
    q: q || undefined,
    prompt: prompt || undefined,
    sort,
    ai_type: aiType || undefined,
    blocked_pos_tags: blockedPosTags,
    page: Number.isFinite(page) ? page : 1,
    page_size: Number.isFinite(page_size) ? page_size : 24,
  });

  return NextResponse.json(result);
}