// 画师条目（与 lib/types ArtistTag 一致）
export interface ArtistTag {
  name: string;
  weight: number;
  raw?: string;
}

// NovelAI 参数的可读字段顺序
export const NAI_ORDER: Array<[string, string]> = [
  ["prompt", "Prompt"],
  ["uc", "Negative Prompt"],
  ["model", "Model"],
  ["sampler", "Sampler"],
  ["steps", "Steps"],
  ["width", "Width"],
  ["height", "Height"],
  ["scale", "Scale"],
  ["seed", "Seed"],
  ["noise_schedule", "Noise Schedule"],
  ["sm", "SM"],
  ["sm_dyn", "SM Dyn"],
  ["dynamic_thresholding", "Dynamic Thresholding"],
  ["cfg_rescale", "cfg"],
  ["uncond_scale", "Uncond Scale"],
  ["version", "Version"],
  ["request_type", "Request Type"],
];

// ComfyUI 参数的可读字段顺序
export const COMFY_ORDER: Array<[string, string]> = [
  ["prompt", "Prompt"],
  ["uc", "Negative Prompt"],
  ["model", "Model 底模"],
  ["loras", "LoRA"],
  ["sampler", "Sampler"],
  ["scheduler", "Scheduler"],
  ["steps", "Steps"],
  ["cfg", "CFG"],
  ["seed", "Seed"],
  ["width", "Width"],
  ["height", "Height"],
];

// 把画师列表渲染成一行可复制的文本（按出现顺序，保留权重语法）
export function artistsToText(artists: ArtistTag[]): string {
  return artists.map((a) => a.raw ?? a.name).join(", ");
}
