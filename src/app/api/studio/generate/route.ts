import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import {
  getStudioConfig,
  generateNaiOpenAi,
  generateGptImage,
  generateDirect,
  mergePrompt,
  formatGenerateError,
  StudioError,
  studioImageExtension,
} from "@/lib/studio";
import { isGptImageModel, NAI_SIZE_MAP } from "@/lib/studio-presets";

/** WxH → NAI 分档名（直连接口用）；已是分档名原样返回 */
function reverseNaiSize(size: string): string {
  const s = (size ?? "").trim();
  if (!s) return "竖图";
  if (!s.includes("x")) return s;
  for (const [tier, wh] of Object.entries(NAI_SIZE_MAP)) {
    if (wh === s) return tier;
  }
  return "竖图";
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 生图请求耗时长（10-180s），显式声明最大执行时间
export const maxDuration = 300;

interface GenerateBody {
  call_format?: "direct" | "openai";
  nai_prompt?: string;
  nl_prompt?: string;
  style?: string;
  custom_artists?: string;
  negative?: string;
  size?: string;
  sampler?: string;
  steps?: number;
  scale?: number;
  cfg?: number;
  noise_schedule?: string;
  model?: string;
  n?: number;
  seed?: number;
  // OpenAI 兼容（NAI）参考图
  reference_mode?: string;
  reference_image_b64_list?: string[];
  reference_strengths?: number[];
  director_captions?: string[];
  strength?: number;
  noise?: number;
  director_action?: string;
  characters?: Array<{ prompt?: string; x?: number; y?: number }>;
  // gpt-image
  quality?: string;
  background?: string;
  output_format?: string;
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  // 限流：每用户 20 次/小时 + 每 IP 40 次/小时（生图消耗上游额度）
  if (
    !rateLimit(`stu:user:${user.id}`, 20, 60 * 60 * 1000) ||
    !rateLimit(`stu:ip:${clientIp(req)}`, 40, 60 * 60 * 1000)
  ) {
    return NextResponse.json(
      { error: "生图过于频繁（每小时 20 次），请稍后再试" },
      { status: 429 },
    );
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const backend = body.call_format === "direct" ? "direct" : "openai";
  const naiPrompt = String(body.nai_prompt ?? "").trim();
  const nlPrompt = String(body.nl_prompt ?? "").trim();
  const directorAction = String(body.director_action ?? "").trim();
  const refList = Array.isArray(body.reference_image_b64_list)
    ? body.reference_image_b64_list.filter((s) => typeof s === "string" && s.startsWith("data:"))
    : [];

  if (backend === "openai") {
    if (!naiPrompt && !nlPrompt && !directorAction) {
      return NextResponse.json({ error: "请至少填写一个提示词框（NAI 风格或自然语言）" }, { status: 400 });
    }
    if (directorAction && refList.length === 0) {
      return NextResponse.json({ error: "图片处理动作需要先上传一张源图片" }, { status: 400 });
    }
  } else if (!naiPrompt && !nlPrompt) {
    return NextResponse.json({ error: "请至少填写一个提示词框（NAI 风格或自然语言）" }, { status: 400 });
  }

  const cfg = getStudioConfig();
  const model = String(body.model ?? "").trim();
  const isGpt = backend === "openai" && isGptImageModel(model);
  const n = Math.min(6, Math.max(1, Math.round(Number(body.n) || 1)));

  // 参考图（openai 后端）
  const strengths = Array.isArray(body.reference_strengths) ? body.reference_strengths : [];
  const captions = Array.isArray(body.director_captions) ? body.director_captions : [];
  const reference_images = refList.slice(0, 8).map((data_uri, i) => ({
    dataUri: data_uri,
    strength: Number(strengths[i]),
    caption: String(captions[i] ?? ""),
  }));

  const started = Date.now();
  try {
    let images: Buffer[];
    const actualSize = String(body.size ?? "");
    let fullPrompt = "";

    if (backend === "direct") {
      // sta1n 直连：NAI 分档尺寸原样透传，画师串独立 artist 参数
      const merged = mergePrompt({
        nai_prompt: naiPrompt,
        nl_prompt: nlPrompt,
        style: body.style,
        custom_artists: body.custom_artists,
      });
      fullPrompt = merged.full_prompt;
      if (!merged.full_prompt) {
        return NextResponse.json({ error: "提示词为空" }, { status: 400 });
      }
      images = await generateDirect(cfg.direct, {
        full_prompt: fullPrompt,
        artists: merged.artists,
        negative: body.negative,
        // 直连接口吃 NAI 分档名（竖图/2K竖图/...）；客户端若传了 WxH（OpenAI
        // 风格），反查映射表还原为分档名
        size: reverseNaiSize(actualSize),
        model: model || cfg.direct.default_model,
        steps: Number(body.steps),
        scale: Number(body.scale),
        cfg: Number(body.cfg),
        sampler: body.sampler,
        noise_schedule: body.noise_schedule,
      });
    } else if (isGpt) {
      // gpt-image：官方 Images API 参数面（quality/background/output_format）
      const merged = mergePrompt({
        nai_prompt: naiPrompt,
        nl_prompt: nlPrompt,
        style: "none", // gpt-image 不用 NAI 画师串预设
      });
      fullPrompt = merged.full_prompt;
      if (!fullPrompt && refList.length === 0) {
        return NextResponse.json({ error: "提示词为空" }, { status: 400 });
      }
      images = await generateGptImage(cfg.openai, {
        full_prompt: fullPrompt,
        size: actualSize,
        n,
        model: model || "gpt-image-1",
        quality: body.quality,
        background: body.background,
        output_format: body.output_format,
        reference_images,
      });
    } else {
      // NAI via OpenAI 兼容：服务端权威合并画师串
      const merged = mergePrompt({
        nai_prompt: naiPrompt,
        nl_prompt: nlPrompt,
        style: body.style,
        custom_artists: body.custom_artists,
      });
      fullPrompt = merged.full_prompt;
      if (!fullPrompt) {
        return NextResponse.json({ error: "提示词为空" }, { status: 400 });
      }
      images = await generateNaiOpenAi(cfg.openai, {
        full_prompt: fullPrompt,
        negative: body.negative,
        size: actualSize,
        n,
        model: model || cfg.openai.default_model,
        steps: Number(body.steps),
        scale: Number(body.scale),
        sampler: body.sampler,
        noise_schedule: body.noise_schedule,
        seed: Number(body.seed),
        reference_mode:
          body.reference_mode === "img2img" || body.reference_mode === "director"
            ? body.reference_mode
            : "vibe",
        reference_images,
        strength: Number(body.strength),
        noise: Number(body.noise),
        director_action: directorAction || undefined,
        characters: Array.isArray(body.characters)
          ? body.characters
              .map((c) => ({
                prompt: String(c?.prompt ?? "").trim(),
                x: Number(c?.x),
                y: Number(c?.y),
              }))
              .filter((c) => c.prompt)
          : undefined,
      });
    }

    const data = images.map((buf) => ({
      b64_json: buf.toString("base64"),
      ext: studioImageExtension(buf),
    }));
    return NextResponse.json({
      ok: true,
      data,
      merge_info: {
        nai_prompt: naiPrompt,
        nl_prompt: nlPrompt,
        artists: body.style === "custom" ? body.custom_artists || "" : undefined,
        full_prompt: fullPrompt,
      },
      meta: {
        backend,
        kind: isGpt ? "gptimage" : "nai",
        model: model || (backend === "direct" ? cfg.direct.default_model : cfg.openai.default_model),
        size: actualSize,
        n: data.length,
        elapsed_ms: Date.now() - started,
        user: user.username,
      },
    });
  } catch (e) {
    if (e instanceof StudioError) {
      return NextResponse.json(
        { error: formatGenerateError(e.reason), reason: e.reason },
        { status: e.reason === "timeout" ? 504 : 502 },
      );
    }
    console.error("studio generate error:", e);
    return NextResponse.json({ error: "生图失败：服务器内部错误" }, { status: 500 });
  }
}
