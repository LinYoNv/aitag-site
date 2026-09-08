import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getUserPref, setUserPref } from "@/lib/db";
import type { R18GPref } from "@/lib/r18g-tags";
import { R18G_GROUPS } from "@/lib/r18g-tags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET：读取当前用户 R18G 屏蔽偏好
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, pref: getUserPref(user.id) });
}

// POST：保存 R18G 屏蔽偏好（enabled / selected / custom）
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: { pref?: Partial<R18GPref> };
  try {
    body = (await req.json()) as { pref?: Partial<R18GPref> };
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (!body.pref || typeof body.pref !== "object") {
    return NextResponse.json({ error: "缺少 pref" }, { status: 400 });
  }
  const old = getUserPref(user.id);
  const incoming = body.pref;

  // 校验 selected：只接受词表里真实存在的 tag 英文名（防脏数据写库）
  const validEn = new Set<string>(
    R18G_GROUPS.flatMap((g) => g.tags.map((t) => t.en.toLowerCase())),
  );
  const selected = Array.isArray(incoming.selected)
    ? [...new Set(incoming.selected.map((s) => String(s).toLowerCase()))].filter(
        (s) => validEn.has(s),
      )
    : old.selected;

  const custom = Array.isArray(incoming.custom)
    ? [
        ...new Set(
          incoming.custom
            .map((s) => String(s).trim().toLowerCase())
            .filter((s) => s.length > 0 && s.length <= 40),
        ),
      ]
    : old.custom;

  const next: R18GPref = {
    enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : old.enabled,
    selected,
    custom,
  };
  setUserPref(user.id, next);
  return NextResponse.json({ ok: true, pref: next });
}