"use client";

import { useState } from "react";

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

// 画师区块：展示提取出的 artist 列表（负向权重用删除线/标注，花括号权重保留原文）
function ArtistBlock({ artists }: { artists: ArtistTag[] }) {
  if (!artists || artists.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="text-[11px] font-semibold text-[#aeb6c2] mb-1">
        画师 Artist
      </div>
      <div className="flex flex-wrap gap-1.5">
        {artists.map((a) => (
          <span
            key={a.name}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-mono ${
              a.weight < 0
                ? "bg-[#2a1a1a] text-[#ff9a9a] border-[#5a2a2a]"
                : "bg-[#1a2233] text-[#4c9fff] border-[#2a3a55]"
            }`}
            title={a.weight < 0 ? `负向权重 ${a.weight}（已抑制）` : a.raw ? `原始：${a.raw}` : `权重 ${a.weight}`}
          >
            <span className={a.weight < 0 ? "line-through opacity-70" : ""}>
              {a.raw ?? a.name}
            </span>
            {a.weight !== 1 && (
              <span className="text-[9px] opacity-70">
                {a.weight < 0 ? `${a.weight}` : `×${a.weight}`}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
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
  ["cfg_rescale", "CFG Rescale"],
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

export default function CardMetaView({ data, index }: Props) {
  const [view, setView] = useState<"formatted" | "json">("formatted");

  if (!data) return null;

  const fmt =
    data._format === "comfyui"
      ? "comfyui"
      : data._format === "manual"
        ? "manual"
        : "nai";

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
          {/* Prompt && Negative 折叠块（NAI / ComfyUI / manual 共用） */}
          {(data.prompt || data.uc) && (
            <>
              <details className="mb-2 group" open>
                <summary className="cursor-pointer text-xs font-semibold text-[#aeb6c2] hover:text-[#e6edf3] list-none flex items-center gap-1">
                  <span className="text-[10px] text-[#5a6270] group-open:rotate-90 inline-block transition-transform">▶</span>
                  Prompt
                  <span className="ml-auto text-[10px] text-[#4c9fff] font-normal">
                    {String(data.prompt ?? "").length > 0 ? `${String(data.prompt).length} 字符` : "（无）"}
                  </span>
                </summary>
                <div className="mt-1 bg-[#0f1218] border border-[#262b36] rounded p-2 text-[11px] text-[#e6edf3] whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-auto">
                  {String(data.prompt ?? "") || <span className="text-[#5a6270]">（无）</span>}
                </div>
              </details>

              <details className="mb-2 group" open>
                <summary className="cursor-pointer text-xs font-semibold text-[#aeb6c2] hover:text-[#e6edf3] list-none flex items-center gap-1">
                  <span className="text-[10px] text-[#5a6270] group-open:rotate-90 inline-block transition-transform">▶</span>
                  Negative Prompt
                  <span className="ml-auto text-[10px] text-[#aeb6c2] font-normal">
                    {String(data.uc ?? "").length > 0 ? `${String(data.uc).length} 字符` : "（无）"}
                  </span>
                </summary>
                <div className="mt-1 bg-[#0f1218] border border-[#262b36] rounded p-2 text-[11px] text-[#e6edf3] whitespace-pre-wrap break-words leading-relaxed max-h-32 overflow-auto">
                  {String(data.uc ?? "") || <span className="text-[#5a6270]">（无）</span>}
                </div>
              </details>
            </>
          )}

          {fmt === "manual" ? (
            !data.prompt && !data.uc ? (
              <div className="text-[11px] text-[#aeb6c2]">
                该图片无结构化参数，可切换到 JSON 查看原始内容。
              </div>
            ) : null
          ) : (
            <>
              <ArtistBlock
                artists={(data.artists as ArtistTag[] | undefined) ?? []}
              />
              <div className="grid grid-cols-2 gap-1.5">
                {(fmt === "comfyui" ? COMFY_ORDER : NAI_ORDER).map(([k, label]) => {
                  if (k === "artists") return null;
                  const v = data[k];
                  if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0))
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
            </>
          )}
        </>
      )}
    </div>
  );
}