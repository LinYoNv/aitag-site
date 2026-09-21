import { NextRequest, NextResponse } from "next/server";
import { listWorks, getUserPref } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { blockedTagsFor } from "@/lib/r18g-tags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 画廊对游客开放（只读）：未登录不再 401，但一定套用下面的 R18G 默认屏蔽。
  const user = await currentUser();
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
  // **游客（user 为 null）用推荐默认组兜底** —— 「没有账号偏好」不等于「什么都给看」。
  const blockedPosTags = blockedTagsFor(user ? getUserPref(user.id) : null);

  // 画廊「屏蔽 tag」黑名单（搜索框旁输入，逗号分隔）：上限 20 词 ×40 字符，
  // 防止拼出海量 has_pos_tag 调用拖垮列表查询
  const blockTagsParam = sp.get("block_tags") ?? "";
  const blockTags = blockTagsParam
    .split(",")
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 20);

  const result = listWorks({
    q: q || undefined,
    prompt: prompt || undefined,
    sort,
    ai_type: aiType || undefined,
    block_tags: blockTags.length ? blockTags.join(",") : undefined,
    blocked_pos_tags: blockedPosTags,
    page: Number.isFinite(page) ? page : 1,
    page_size: Number.isFinite(page_size) ? page_size : 24,
  });

  return NextResponse.json(result);
}