import type { AiType } from "@/lib/types";

const TYPE_LABELS: Record<AiType, string> = {
  sd: "SD",
  nai: "NovelAI",
  nai_x: "NAI-X",
  comfyui: "ComfyUI",
  other: "自定义",
};

export function typeLabel(t: AiType): string {
  return TYPE_LABELS[t] ?? t.toUpperCase();
}

export function typeClass(t: AiType): string {
  return `type-pill type-${t === "nai_x" ? "nai-x" : t}`;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * 图片 URL 分级（参照 aitag.win：缩略图/预览/原图 多档尺寸）
 * 原图：/api/images/<name>   或   /images/works/<name>（存量作品静态路径）
 * 缩略图：/api/images/thumb/<name>（480px WebP，画廊卡片用）
 * 预览图：/api/images/preview/<name>（1400px WebP，详情页网格用，灯箱才用原图）
 */
function toDerivedUrl(img: string, kind: "thumb" | "preview"): string {
  if (img.startsWith("/api/images/")) {
    return img.replace("/api/images/", `/api/images/${kind}/`);
  }
  if (img.startsWith("/images/works/")) {
    return img.replace("/images/works/", `/api/images/${kind}/`);
  }
  // 未知路径保持原样（保证可用性）
  return img;
}

/** 缩略图 URL（画廊卡片） */
export function toThumbUrl(img: string): string {
  return toDerivedUrl(img, "thumb");
}

/** 预览图 URL（详情页网格） */
export function toPreviewUrl(img: string): string {
  return toDerivedUrl(img, "preview");
}
