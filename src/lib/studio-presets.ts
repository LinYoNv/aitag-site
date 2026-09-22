// 生图台共享预设（前后端通用，无 server-only 依赖）
// 参数契约对齐两个参考插件的实际提交：
//  - nai_image OpenAI 兼容模式 → api.syuan.org /v1/images/*（NAI 参数面）
//  - nai_image 直连模式        → nai.sta1n.cn /generate（GET）
//  - image_companion openai 平台 → gpt-image-1 等通用图片模型

// ---- 默认上游（站点只提供地址，密钥由用户在个人资料设置里自配） ----

/** OpenAI 兼容中转站（syuan）默认地址 */
export const DEFAULT_OPENAI_BASE_URL = "https://api.syuan.org";
/** NAI 直连（sta1n）默认地址 */
export const DEFAULT_DIRECT_BASE_URL = "https://nai.sta1n.cn";

// ---- 模型列表 ----

/** OpenAI 兼容端点（syuan）上的 NovelAI 模型（接口文档 §9） */
export const NAI_OPENAI_MODELS = [
  "nai-diffusion-5-full",
  "nai-diffusion-5-curated",
  "nai-diffusion-4-5-full",
  "nai-diffusion-4-5-curated",
  "nai-diffusion-4-full",
  "nai-diffusion-4-curated-preview",
  "nai-diffusion-3",
  "nai-diffusion-furry-3",
];

/** sta1n 直连 /generate 支持的模型 */
export const NAI_DIRECT_MODELS = [
  { value: "nai-diffusion-4-5-full", label: "V4.5 完整版 [4.5_FULL]" },
  { value: "nai-diffusion-5-full", label: "V5 完整版 [5.0_FULL]" },
];

/** OpenAI 兼容端点上的通用图片模型（gpt-image 系列，参数面与 NAI 完全不同） */
export const GPTIMAGE_MODELS = ["gpt-image-1"];

export function isGptImageModel(model: string): boolean {
  return /^gpt-image/i.test(model.trim());
}

// ---- 尺寸 ----

/** NAI 尺寸分档 → OpenAI 兼容像素尺寸（4K 上游不支持，降级 2K 上限） */
export const NAI_SIZE_MAP: Record<string, string> = {
  方图: "1024x1024",
  竖图: "832x1216",
  横图: "1216x832",
  "2K方图": "1472x1472",
  "2K竖图": "1088x1920",
  "2K横图": "1920x1088",
  "4K方图": "1472x1472",
  "4K竖图": "1088x1920",
  "4K横图": "1920x1088",
};

/** OpenAI 兼容（NAI）尺寸档：像素尺寸 + 消耗标注 */
export const NAI_OPENAI_SIZE_OPTIONS = [
  { value: "832x1216", tier: "竖图", baseCost: 1 },
  { value: "1216x832", tier: "横图", baseCost: 1 },
  { value: "1024x1024", tier: "方图", baseCost: 1 },
  { value: "1088x1920", tier: "2K竖图", baseCost: 15 },
  { value: "1920x1088", tier: "2K横图", baseCost: 15 },
  { value: "1472x1472", tier: "2K方图", baseCost: 15 },
];

/** sta1n 直连尺寸档（GET /generate 的 size 参数原样透传） */
export const NAI_DIRECT_SIZE_OPTIONS = [
  { value: "竖图", baseCost: 1 },
  { value: "横图", baseCost: 1 },
  { value: "方图", baseCost: 1 },
  { value: "2K竖图", baseCost: 15 },
  { value: "2K横图", baseCost: 15 },
  { value: "2K方图", baseCost: 15 },
  { value: "4K竖图", baseCost: 25 },
  { value: "4K横图", baseCost: 25 },
  { value: "4K方图", baseCost: 25 },
];

/** gpt-image-1 官方尺寸枚举（§12.1 之外的 WxH 会被官方/中转拒绝） */
export const GPTIMAGE_SIZE_OPTIONS = [
  { value: "1024x1024", label: "1024x1024（方图）" },
  { value: "1536x1024", label: "1536x1024（横图）" },
  { value: "1024x1536", label: "1024x1536（竖图）" },
  { value: "auto", label: "auto（模型自定）" },
];

/** NAI 分档/WxH → gpt-image 最近合法尺寸 */
export function toGptImageSize(size: string): string {
  const s = size.trim().toLowerCase();
  if (["1024x1024", "1536x1024", "1024x1536", "auto"].includes(s)) return s;
  const m = s.match(/^(\d+)x(\d+)$/);
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w === h) return "1024x1024";
    return w > h ? "1536x1024" : "1024x1536";
  }
  return "1024x1024";
}

/** OpenAI 兼容 NAI 尺寸契约：宽高 64 倍数、最大边 1920、面积 3686400 */
export const OPENAI_MAX_SIDE = 1920;
export const OPENAI_MAX_AREA = 3686400;

export function normalizeOpenAiSize(size: string): string {
  const m = /^\s*(\d{1,5})\s*[x×]\s*(\d{1,5})\s*$/.exec(String(size));
  if (!m) return "1024x1024";
  let width = Math.max(64, (parseInt(m[1], 10) + 32) >> 6 << 6);
  let height = Math.max(64, (parseInt(m[2], 10) + 32) >> 6 << 6);
  while (
    (Math.max(width, height) > OPENAI_MAX_SIDE ||
      width * height > OPENAI_MAX_AREA) &&
    Math.min(width, height) > 64
  ) {
    if (width >= height) width -= 64;
    else height -= 64;
  }
  return `${width}x${height}`;
}

// ---- 采样参数 ----

export const SAMPLERS = [
  { value: "k_dpmpp_2m_sde", label: "DPM++ 2M SDE" },
  { value: "k_dpmpp_2m", label: "DPM++ 2M" },
  { value: "k_dpmpp_sde", label: "DPM++ SDE" },
  { value: "k_dpmpp_2s_ancestral", label: "DPM++ 2S Ancestral" },
  { value: "k_euler_ancestral", label: "Euler Ancestral" },
  { value: "k_euler", label: "Euler" },
  { value: "ddim", label: "DDIM (仅 NAI 3)" },
];

export const NOISE_SCHEDULES = ["karras", "native", "exponential", "polyexponential"];

/** director-tools 图片处理动作（接口文档 §8） */
export const DIRECTOR_ACTIONS: Array<{ value: string; label: string }> = [
  { value: "bg-removal", label: "去除背景" },
  { value: "lineart", label: "提取线稿" },
  { value: "sketch", label: "生成草图" },
  { value: "colorize", label: "线稿上色" },
  { value: "emotion", label: "调整人物表情" },
  { value: "declutter", label: "清理画面元素" },
];

/** 精准参考 base_caption 枚举（§8.4） */
export const DIRECTOR_CAPTIONS = ["character&style", "character", "style"];

/** 参考图单次请求上限（§5.2） */
export const MAX_REFERENCE_IMAGES = 8;

/** 支持精准参考（director）的 NAI 模型。
 *  注意：官方文档写的是 4.5/5 全系，但**上游中转实测只认 4.5 系列** ——
 *  请求 5 系会返回 500「novelai adaptor: precise reference is only supported by NAI 4.5 models」。
 *  所以这里不放行 5 系，非本表的模型一律回退 4-5-full（见 generateNaiOpenAi）。 */
export const DIRECTOR_MODELS = new Set([
  "nai-diffusion-4-5-full",
  "nai-diffusion-4-5-curated",
  "nai45",
  "nai45-curated",
]);

// ---- 风格预设（画师串，移植自 nai_image DEFAULT_ARTISTS） ----

export const STYLE_PRESETS: Record<string, string> = {
  vertical:
    "[[[artist:dishwasher1910]]], {{yd_(orange_maru)}}, [artist:ciloranko], [artist:sho_(sho_lwlw)], [ningen mame], year 2024,",
  comicDoujin:
    "(masterpiece:1.3), (best quality:1.2), (highres), (absurdres),\n" +
    "(extremely detailed illustration:1.2), (anime style:1.1),\n\n" +
    "(artist:feipin zhanshi:1.0), (artist:nlebo-hentai:0.9), (artist:sos adult:0.85),\n" +
    "(artist:hews:0.4),\n\n" +
    "(detailed skin texture:1.15), (glossy skin:1.1),\n" +
    "(thick lineart:1.1), (high contrast:1.15),\n" +
    "(vivid colors:1.1), (detailed shading:1.15),\n" +
    "(warm color palette:1.05),\n" +
    "(cute face:1.1), (detailed eyes:1.15), (detailed face:1.1),",
  r18: "0.9::misaka_12003-gou ::, dino_(dinoartforame), wanke, liduke, year 2025, realistic, 4k, -2::green ::, textless version, The image is highly intricate finished drawn. Only the character's face is in anime style, but their body is in realistic style. 1.35::A highly finished photo-style artwork that has lively color, graphic texture, realistic skin surface, and lifelike flesh with little obliques::. 1.63::photorealistic::, 1.63::photo(medium)::, \n20::best quality, absurdres, very aesthetic, detailed, masterpiece::,, very aesthetic, masterpiece, no text,",
  lolita25d: "0.9::misaka_12003-gou & dino, rurudo,  mignon,wanke & liduk::, year 2025, realistic, 4k, -2::green ::, textless version, The image is highly intricate finished drawn. Only the character's face is in anime style, but their body is in realistic style. 1.35::A highly finished photo-style artwork that has lively color, graphic texture, realistic skin surface, and lifelike flesh with little obliques::. 1.63::photorealistic::, 1.63::photo(medium)::, \n20::best quality, absurdres, very aesthetic, detailed, masterpiece::,, very aesthetic, masterpiece, no text,",
  anime: "1.4::asanagi::,{{{{{artist:asanagi}}}}},1.2::xiaoluo_xl::,1.3::Artist: misaka_12003-gou::,1.2::Artist:shexyo::,0.7::Artist:b.sa_(bbbs)::,1::Artist:qiandaiyiyu::,1.05::artist:natedecock::,1.05::artist:kunaboto::,0.75::artist:kandata_nijou::,1.05::artist:zer0.zer0 ::,1.05::artist:jasony::,0.75::misaka_12003-gou ::, dino_(dinoartforame), wanke, liduke, year 2025, realistic, 4k, -2::green ::, {textless version, The image is highly intricate finished drawn,write realistically,true to life}, 1.35::A highly finished photo-style artwork that has lively color, graphic texture, realistic skin surface, and lifelike flesh with little obliques::, 1.63::photorealistic::,3::age slider::,1.63::photo(medium)::, 2::best quality, absurdres, very aesthetic, detailed, masterpiece::,-4::Muscle definition, abs::",
  galgame:
    "artist:ningen_mame,, noyu_(noyu23386566),, toosaka asagi,, location,\\n20::best quality, absurdres, very aesthetic, detailed, masterpiece::,:,, very aesthetic, masterpiece, no text,",
};

export const STYLE_LABELS: Record<string, string> = {
  vertical: "韩漫小清新风 (Vertical Crisp)",
  comicDoujin: "漫画同人风 (Comic / Doujin)",
  r18: "2.5D唯美风 (Aesthetic 2.5D)",
  lolita25d: "2.5D唯美风（萝）",
  anime: "本子里番风 (Anime Focus)",
  galgame: "GalGame风 (Novel CG)",
  custom: "自定义画师配置 [CUSTOM]",
};

/** 默认负面词（移植自 nai_image DEFAULT_NEGATIVE） */
export const DEFAULT_NEGATIVE =
  "{{bad anatomy}},{bad feet},bad hands,{{{bad proportions}}},{blurry},cloned face,cropped," +
  "{{{deformed}}},{{{disfigured}}},error,{{{extra arms}}},{extra digit},{{{extra legs}}},extra limbs," +
  "{{extra limbs}},{fewer digits},{{{fused fingers}}},gross proportions,ink eyes,ink hair," +
  "jpeg artifacts,{{{{long neck}}}},low quality,{malformed limbs},{{missing arms}},{missing fingers}," +
  "{{missing legs}},{{{more than 2 nipples}}},mutated hands,{{{mutation}}},normal quality,owres," +
  "{{poorly drawn face}},{{poorly drawn hands}},reen eyes,signature,text,{{too many fingers}}," +
  "{{{ugly}}},username,uta,watermark,worst quality,{{{more than 2 legs}}}," +
  "awkward hand sign,weird hand gesture,contorted hand,unnatural finger pose,deformed hand gesture," +
  "{shaka},{hang loose},{{rock on}},{shaka sign}";

/** 参考图默认权重（vibe 0.6 / 精准参考 1.0，接口文档 §5/§8 推荐值） */
export const DEFAULT_VIBE_STRENGTH = 0.6;
export const DEFAULT_DIRECTOR_STRENGTH = 1.0;
export const DEFAULT_DIRECTOR_SECONDARY_STRENGTH = 0.5;
export const DEFAULT_DIRECTOR_CAPTION = "character&style";

// ---- 生图历史（面板「生图历史」卡片 + /api/studio/history）----

/**
 * 每个用户保留的生图记录条数（超出后按时间从旧到新裁剪，图片文件一起删）。
 *
 * ⚠️ 这个数同时就是**面板展示口径**：接口按它取、面板全量渲染（每行 4 张）。
 * 2026-09-22 之前面板只显示 4 张、其余折叠在「展开全部」后面（曾有 STUDIO_HISTORY_PREVIEW=4），
 * 情绪要求"保留 20 张就展示 20 张"，折叠态已删除 —— 别再把它加回来。
 */
export const STUDIO_HISTORY_LIMIT = 20;

/** 历史图缩略图规格（与图库画廊同规格：480px WebP） */
export const STUDIO_HISTORY_THUMB_WIDTH = 480;
export const STUDIO_HISTORY_THUMB_QUALITY = 80;

/** 历史记录里提示词的存储上限（历史只是回看用，不该无上限膨胀） */
export const STUDIO_HISTORY_PROMPT_MAX = 8000;
export const STUDIO_HISTORY_NEGATIVE_MAX = 4000;

/**
 * 历史图片文件名是否安全（防目录穿越）。
 *
 * 为什么单独抽成函数：`data/uploads/hist/` 下的文件名来自数据库字段，
 * 一旦被污染（含 `../` 或路径分隔符）就会变成**任意文件读取**。
 * 抽出来是为了能被 `npm test` 直接覆盖（db.ts / studio-history.ts 都带 server-only，
 * 测试无法 import，所以安全判据必须住在纯模块里）。
 */
export function isSafeHistoryFilename(name: unknown): boolean {
  if (typeof name !== "string" || !name) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  // 不允许点开头：避免生成/读取隐藏文件
  if (name.startsWith(".")) return false;
  return true;
}

/** 历史记录 id 的口径：crypto.randomBytes(8).toString("hex") = 16 位小写 hex */
export function isHistoryId(id: unknown): boolean {
  return typeof id === "string" && /^[0-9a-f]{16}$/.test(id);
}
