// 共享类型定义（前后端通用）

export type AiType = "sd" | "nai" | "nai_x" | "comfyui" | "other";

// NAI 画师条目（从 prompt 提取）
export interface ArtistTag {
  name: string;
  /** 数值权重（无权重前缀时为 1；负向为负数；花括号权重时仍为 1） */
  weight: number;
  /** 原始权重表达（如 `{{{{artist:asanagi}}}}`、`1.4::artist:nueegochi ::`），用于忠实展示 */
  raw?: string;
}

// ---- NovelAI 参数 ----
export interface NovelAiMetadata {
  prompt: string;
  negativePrompt: string;
  sampler: string;
  steps: number;
  width: number;
  height: number;
  scale: number;
  seed: number;
  noiseSchedule: string;
  model: string;
  /** 提取出的画师列表（可选） */
  artists?: ArtistTag[];
  [key: string]: unknown;
}

// ---- ComfyUI 参数（从 workflow JSON 抽取的可读字段）----
export interface ComfyUiMetadata {
  prompt: string;
  negativePrompt: string;
  /** 底模 / checkpoint 名称 */
  model: string;
  /** LoRA 列表（名称，可能有多个） */
  loras: string[];
  sampler: string;
  scheduler: string;
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
  /** 原始 workflow JSON 文本（保留供 JSON 视图） */
  rawJson?: string;
  [key: string]: unknown;
}

export interface Work {
  id: string;
  title: string;
  caption: string;
  create_date: string;
  ai_type: AiType;
  image_count: number;
  tags: string[];
  author_name: string;
  total_view: number;
  total_bookmarks: number;
  images: string[];
  metadata: Record<string, unknown> | null;
}

// 多图作品：每张图各自的参数（metadata.per_image 数组元素）
export interface PerImageMeta {
  prompt: string | null;
  uc: string | null;
  sampler?: string;
  steps?: number;
  width?: number;
  height?: number;
  scale?: number;
  seed?: number;
  noise_schedule?: string;
  /** 画师列表（数组形式，详情页展示） */
  artists?: ArtistTag[];
  [key: string]: unknown;
}

// 从 work.metadata 中取单图参数（兼容旧数据：直接取顶层字段）
export function getPerImageMetas(metadata: Record<string, unknown> | null): PerImageMeta[] {
  if (!metadata) return [];
  if (Array.isArray(metadata.per_image)) {
    return metadata.per_image as PerImageMeta[];
  }
  // 旧数据：整个 metadata 视为单图参数
  return [metadata as unknown as PerImageMeta];
}

export interface WorkListItem {
  id: string;
  title: string;
  caption: string;
  create_date: string;
  ai_type: AiType;
  image_count: number;
  tags: string[];
  author_name: string;
  total_view: number;
  total_bookmarks: number;
  cover: string;
}

export interface PagedWorks {
  items: WorkListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// PNG 元数据解析结果（前端解析器输出）
export interface PngParseResult {
  ok: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
  novelai?: NovelAiMetadata;
  comfyui?: ComfyUiMetadata;
  width?: number;
  height?: number;
}
