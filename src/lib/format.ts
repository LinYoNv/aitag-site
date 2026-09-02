import type { AiType } from "@/lib/types";

const TYPE_LABELS: Record<AiType, string> = {
  sd: "SD",
  nai: "NAI",
  nai_x: "NAI-X",
  comfyui: "ComfyUI",
  other: "AI",
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
