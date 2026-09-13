import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { describeStudioConfig, saveStudioConfig, checkDirectToken } from "@/lib/studio";
import {
  NAI_OPENAI_MODELS,
  GPTIMAGE_MODELS,
  DEFAULT_NEGATIVE,
  DEFAULT_VIBE_STRENGTH,
  DEFAULT_DIRECTOR_STRENGTH,
  DEFAULT_DIRECTOR_CAPTION,
} from "@/lib/studio-presets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET：生图台配置快照（脱敏，绝不含完整密钥） */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const config = describeStudioConfig();
  return NextResponse.json({
    ok: true,
    config,
    viewer_is_admin: user.role === "admin",
    openai_models: NAI_OPENAI_MODELS,
    gptimage_models: GPTIMAGE_MODELS,
    default_negative: DEFAULT_NEGATIVE,
    openai_vibe_strength: DEFAULT_VIBE_STRENGTH,
    openai_director_strength: DEFAULT_DIRECTOR_STRENGTH,
    openai_director_caption: DEFAULT_DIRECTOR_CAPTION,
  });
}

/** POST：保存配置（仅管理员）；body 里带 probe_direct=true 时顺带校验直连 Token */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "无权限：仅管理员可修改生图台配置" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const openai = body.openai as Record<string, unknown> | undefined;
  const direct = body.direct as Record<string, unknown> | undefined;
  const saved = saveStudioConfig({
    openai: openai
      ? {
          base_url: String(openai.base_url ?? ""),
          api_key: String(openai.api_key ?? ""),
          default_model: String(openai.default_model ?? ""),
          timeout_seconds: Number(openai.timeout_seconds ?? 180),
          max_retries: Number(openai.max_retries ?? 2),
        }
      : undefined,
    direct: direct
      ? {
          base_url: String(direct.base_url ?? ""),
          token: String(direct.token ?? ""),
          default_model: String(direct.default_model ?? ""),
          timeout_seconds: Number(direct.timeout_seconds ?? 180),
        }
      : undefined,
  });

  let probe: { ok: boolean; message: string } | null = null;
  if (body.probe_direct === true) {
    probe = await checkDirectToken(saved.direct);
  }

  return NextResponse.json({
    ok: true,
    config: describeStudioConfig(),
    probe,
  });
}
