// 生图台「生图历史」接口
// ---------------------------------------------------------------------------
// GET    /api/studio/history            → 当前用户的生图历史（新→旧，默认最多 20 条）
// DELETE /api/studio/history            → 清空当前用户的历史（含磁盘图片）
// DELETE /api/studio/history?id=<id>    → 删除单条
//
// 鉴权与隔壁 /api/studio/* 一致：**必须登录**，且一律按 currentUser().id 过滤，
// 绝不接受客户端传入 userId（否则等于公开别人的提示词）。

import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth";
import { STUDIO_HISTORY_LIMIT, clearStudioHistory, deleteStudioHistory } from "@/lib/db";
import { getStudioHistory, removeHistoryFiles } from "@/lib/studio-history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const items = getStudioHistory(user.id, STUDIO_HISTORY_LIMIT);
  // limit 一并下发：口径唯一定义在 studio-presets.ts，
  // 面板是静态 JS（import 不了 TS），只能由接口把常量带给它，避免两边各写一份魔数。
  // （面板按 limit 全量展示 —— 没有"折叠/展开"这回事了）
  return NextResponse.json({
    ok: true,
    items,
    limit: STUDIO_HISTORY_LIMIT,
  });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id");

  if (id) {
    const row = deleteStudioHistory(user.id, id);
    if (!row) {
      // 不存在或不属于本人：都返回 404（不区分，避免探测别人的 id 是否存在）
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }
    removeHistoryFiles([row]);
    console.log(`[studio] 生图历史：user=${user.username} 删除单条 id=${row.id}`);
    return NextResponse.json({ ok: true, deleted: 1 });
  }

  const rows = clearStudioHistory(user.id);
  removeHistoryFiles(rows);
  console.log(`[studio] 生图历史：user=${user.username} 清空 ${rows.length} 条`);
  return NextResponse.json({ ok: true, deleted: rows.length });
}
