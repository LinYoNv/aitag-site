import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { describeUserStudio, updateUserStudio, checkDirectToken } from "@/lib/studio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SaveBody {
  openai?: { base_url?: unknown; api_key?: unknown; clear_api_key?: boolean };
  direct?: { base_url?: unknown; token?: unknown; clear_token?: boolean };
  probe_direct?: boolean;
}

/** GET：当前用户的生图密钥配置状态（脱敏，密钥/Token 绝不回传） */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, config: describeUserStudio(user.id) });
}

/**
 * POST：保存当前用户自己的生图密钥（base_url 留空 = 回退站点默认 URL；
 * api_key/token 留空 = 保持不变；clear_api_key/clear_token = 清除）。
 * probe_direct=true 时顺带用保存后的配置测试 sta1n Token。
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const saved = updateUserStudio(user.id, {
    openai: body.openai
      ? {
          base_url: body.openai.base_url,
          api_key: body.openai.api_key,
          clear_api_key: body.openai.clear_api_key === true,
        }
      : undefined,
    direct: body.direct
      ? {
          base_url: body.direct.base_url,
          token: body.direct.token,
          clear_token: body.direct.clear_token === true,
        }
      : undefined,
  });

  let probe: { ok: boolean; message: string } | null = null;
  if (body.probe_direct === true) {
    probe = await checkDirectToken(saved.direct);
  }

  return NextResponse.json({
    ok: true,
    config: describeUserStudio(user.id),
    probe,
  });
}

/** DELETE：清除某一项密钥（?target=openai_key|direct_token） */
export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const target = req.nextUrl.searchParams.get("target");
  if (target !== "openai_key" && target !== "direct_token") {
    return NextResponse.json({ error: "target 必须是 openai_key 或 direct_token" }, { status: 400 });
  }
  updateUserStudio(user.id, {
    openai: target === "openai_key" ? { clear_api_key: true } : undefined,
    direct: target === "direct_token" ? { clear_token: true } : undefined,
  });
  return NextResponse.json({ ok: true, config: describeUserStudio(user.id) });
}
