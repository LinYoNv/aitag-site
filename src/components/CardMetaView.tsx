"use client";

import { useState } from "react";

interface Props {
  /** 单张图对应的参数对象（per_image 项或整个 metadata） */
  data: Record<string, unknown> | null;
  /** 卡片序号（多图时显示 图N） */
  index?: number;
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

export default function CardMetaView({ data, index }: Props) {
  const [view, setView] = useState<"formatted" | "json">("formatted");

  if (!data) return null;

  const isNai =
    data._source_file !== undefined || "prompt" in data || "uc" in data;

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
      ) : isNai ? (
        <div>
          {/* Prompt 折叠块 */}
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

          {/* 技术参数网格 */}
          <div className="grid grid-cols-2 gap-1.5">
            {NAI_ORDER.map(([k, label]) => {
              const v = data[k];
              if (v === undefined || v === null || v === "") return null;
              return (
                <div
                  key={k}
                  className="bg-[#0f1218] border border-[#262b36] rounded px-2 py-1"
                >
                  <div className="text-[10px] text-[#5a6270]">{label}</div>
                  <div className="text-[11px] text-[#e6edf3] font-mono truncate">
                    {String(v)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-[#aeb6c2]">
          该图片没有 NovelAI 结构化参数，可切换到 JSON 查看。
        </div>
      )}
    </div>
  );
}
