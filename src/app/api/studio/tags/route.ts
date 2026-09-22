// 中文提示词库接口 —— 面板标签管理的服务端数据源
// ---------------------------------------------------------------------------
// GET /api/studio/tags            → 完整分类树（结构与 tags.default.json 一致）
// GET /api/studio/tags?q=中文     → 在 danbooru 中文表里补充检索（精选库之外）
// GET /api/studio/tags?zh=a,b,c   → 批量精确查中文（「已选提示词气泡」的中文对照）
//
// 需要登录：面板本身在登录后才可见，词库也只在登录后取用（数据来源为 GPL-3.0，
// 不做匿名公开分发）。

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { lookupBooruZh, readTagLibrary, searchBooru, tagLibraryExists } from "@/lib/taglib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q") || "";
  const zhQuery = new URL(req.url).searchParams.get("zh") || "";

  // 中文对照：查不到不是错误（返回空 map，前端只显示英文）。
  // 放在「词库未同步」之前判断：对照走的是 booru 表，与精选库是否导入无关。
  if (zhQuery.trim()) {
    const names = zhQuery
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return NextResponse.json({ ok: true, zh: names.length ? lookupBooruZh(names) : {} });
  }

  // 词库尚未同步：明确告知，前端据此回退到自带基础库（不报错、不静默）
  if (!tagLibraryExists()) {
    return NextResponse.json(
      { ok: false, synced: false, error: "词库未同步", hint: "在服务器上执行 node scripts/taglib-import.mjs" },
      { status: 200 },
    );
  }

  if (q.trim()) {
    return NextResponse.json({ ok: true, synced: true, query: q, tags: searchBooru(q) });
  }

  const lib = readTagLibrary();
  if (!lib) {
    return NextResponse.json({ ok: false, synced: false, error: "词库读取失败" }, { status: 200 });
  }

  return NextResponse.json(
    { ok: true, synced: true, ...lib },
    // 词库只在重新导入时变化，给浏览器 5 分钟缓存，避免每次开面板都拉几百 KB
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
