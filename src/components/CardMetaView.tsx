"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";

interface Props {
  /** 单张图对应的参数对象（per_image 项或整个 metadata） */
  data: Record<string, unknown> | null;
  /** 卡片序号（多图时显示 图N） */
  index?: number;
}

// 画师条目（与 lib/types ArtistTag 一致）
interface ArtistTag {
  name: string;
  weight: number;
  raw?: string;
}

// 把画师列表渲染成一行可复制的文本（按出现顺序，保留权重语法）
function artistsToText(artists: ArtistTag[]): string {
  return artists.map((a) => a.raw ?? a.name).join(", ");
}

// NovelAI 参数的可读字段顺序
const NAI_ORDER: Array<[string, string]> = [
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
const COMFY_ORDER: Array<[string, string]> = [
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

// 可折叠文本框：标题 + 右上角复制按钮 + 内容（与 Prompt/Negative 同款样式）
function CopyableBox({
  title,
  text,
  maxH,
  countColor = "#4c9fff",
}: {
  title: string;
  text: string;
  maxH: string;
  countColor?: string;
}) {
  return (
    <details className="mb-2 group" open>
      <summary className="cursor-pointer text-xs font-semibold text-[#aeb6c2] hover:text-[#e6edf3] list-none flex items-center gap-1">
        <span className="text-[10px] text-[#5a6270] group-open:rotate-90 inline-block transition-transform">
          ▶
        </span>
        {title}
        <span className="ml-auto">
          <CopyButton text={text} label="复制" />
        </span>
        <span className="text-[10px] font-normal" style={{ color: countColor }}>
          {text.length > 0 ? `${text.length} 字符` : "（无）"}
        </span>
      </summary>
      <div
        className={`mt-1 bg-[#0f1218] border border-[#262b36] rounded p-2 text-[11px] text-[#e6edf3] whitespace-pre-wrap break-words leading-relaxed overflow-auto ${maxH}`}
      >
        {text || <span className="text-[#5a6270]">（无）</span>}
      </div>
    </details>
  );
}

export default function CardMetaView({ data, index }: Props) {
  const [view, setView] = useState<"formatted" | "json">("formatted");

  if (!data) return null;

  const fmt =
    data._format === "comfyui"
      ? "comfyui"
      : data._format === "manual"
        ? "manual"
        : "nai";

  const promptText = String(data.prompt ?? "");
  const negativeText = String(data.uc ?? "");
  const artists = (data.artists as ArtistTag[] | undefined) ?? [];
  const artistsText = artistsToText(artists);

  return (
    <div className="p-3 border-t border-[#262b36]">
      {/* 头部：图序号 + 指令/JSON 切换 */}
      <div className="flex items-center gap-2 mb-2">
        {typeof index === "number" && (
          <span className="text-xs font-semibold text-[#4c9fff]">
            图 {index + 1}
          </span>
        )}
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setView("formatted")}
            className={`px-2 py-0.5 rounded text-[11px] border ${
              view === "formatted"
                ? "bg-[#4c9fff] border-[#4c9fff] text-white"
                : "bg-[#151922] border-[#262b36] text-[#aeb6c2] hover:border-[#4c9fff]"
            }`}
          >
            指令
          </button>
          <button
            onClick={() => setView("json")}
            className={`px-2 py-0.5 rounded text-[11px] border ${
              view === "json"
                ? "bg-[#4c9fff] border-[#4c9fff] text-white"
                : "bg-[#151922] border-[#262b36] text-[#aeb6c2] hover:border-[#4c9fff]"
            }`}
          >
            JSON
          </button>
        </div>
      </div>

      {view === "json" ? (
        <pre className="text-[11px] text-[#c8d1dc] whitespace-pre-wrap break-words max-h-72 overflow-auto font-mono">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <>
          {/* Prompt / Negative Prompt / 画师 文本框（NAI / ComfyUI / manual 共用） */}
          {promptText && (
            <CopyableBox title="Prompt" text={promptText} maxH="max-h-48" />
          )}
          {negativeText && (
            <CopyableBox
              title="Negative Prompt"
              text={negativeText}
              maxH="max-h-32"
              countColor="#aeb6c2"
            />
          )}
          {artistsText && (
            <CopyableBox
              title="画师 Artist"
              text={artistsText}
              maxH="max-h-32"
              countColor="#4c9fff"
            />
          )}

          {fmt === "manual" ? (
            !promptText && !negativeText ? (
              <div className="text-[11px] text-[#aeb6c2]">
                该图片无结构化参数，可切换到 JSON 查看原始内容。
              </div>
            ) : null
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {(fmt === "comfyui" ? COMFY_ORDER : NAI_ORDER).map(([k, label]) => {
                if (k === "artists") return null;
                const v = data[k];
                if (
                  v === undefined ||
                  v === null ||
                  v === "" ||
                  (Array.isArray(v) && v.length === 0)
                )
                  return null;
                const text = Array.isArray(v) ? v.join(", ") : String(v);
                return (
                  <div
                    key={k}
                    className="bg-[#0f1218] border border-[#262b36] rounded px-2 py-1"
                  >
                    <div className="text-[10px] text-[#5a6270]">{label}</div>
                    <div className="text-[11px] text-[#e6edf3] font-mono truncate">
                      {text}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
