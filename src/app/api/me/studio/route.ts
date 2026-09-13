import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import {
  describeUserStudio,
  updateUserStudio,
  checkDirectToken,
  generateNaiOpenAi,
  formatGenerateError,
  StudioError,
  DEFAULT_NAI_OPENAI_MODEL,
} from "@/lib/studio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface SaveBody {
  openai?: { base_url?: unknown; api_key?: unknown; clear_api_key?: boolean };
  direct?: { base_url?: unknown; token?: unknown; clear_token?: boolean };
  probe_direct?: boolean;
  /** 分别测试某个中转站：openai = 最小真实生图（消耗少量用户额度）；direct = 免费 getUser 探测 */
  probe?: "openai" | "direct";
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
 * probe="openai" 用保存后的配置发一次最小生图验证（约 1 点额度，不保存图片）；
 * probe="direct"/probe_direct=true 用 getUser 探测 sta1n Token（免费）。
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

  const probeDirect = body.probe === "direct" || body.probe_direct === true;
  let probe: { ok: boolean; message: string } | null = null;
  if (body.probe === "openai") {
    if (!saved.openai.configured) {
      probe = { ok: false, message: "未配置 API Key" };
    } else {
      try {
        await generateNaiOpenAi(saved.openai, {
          full_prompt: "masterpiece, best quality, 1girl, solo, simple background, test",
          size: "832x1216",
          n: 1,
          model: DEFAULT_NAI_OPENAI_MODEL,
          steps: 20,
          scale: 5,
        });
        probe = { ok: true, message: "密钥有效，测试图已生成成功" };
      } catch (e) {
        const reason = e instanceof StudioError ? e.reason : "exception";
        probe = { ok: false, message: formatGenerateError(reason) };
      }
    }
  } else if (probeDirect) {
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
