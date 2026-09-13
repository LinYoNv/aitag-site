import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { describeUserStudio } from "@/lib/studio";
import {
  NAI_OPENAI_MODELS,
  GPTIMAGE_MODELS,
  DEFAULT_NEGATIVE,
  DEFAULT_VIBE_STRENGTH,
  DEFAULT_DIRECTOR_STRENGTH,
  DEFAULT_DIRECTOR_CAPTION,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_DIRECT_BASE_URL,
} from "@/lib/studio-presets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET：生图台配置快照（当前用户自己的密钥状态，脱敏，绝不含完整密钥） */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    config: describeUserStudio(user.id),
    defaults: {
      openai_base_url: DEFAULT_OPENAI_BASE_URL,
      direct_base_url: DEFAULT_DIRECT_BASE_URL,
    },
    openai_models: NAI_OPENAI_MODELS,
    gptimage_models: GPTIMAGE_MODELS,
    default_negative: DEFAULT_NEGATIVE,
    openai_vibe_strength: DEFAULT_VIBE_STRENGTH,
    openai_director_strength: DEFAULT_DIRECTOR_STRENGTH,
    openai_director_caption: DEFAULT_DIRECTOR_CAPTION,
  });
}
