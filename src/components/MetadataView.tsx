"use client";

import { useState } from "react";

interface Props {
  metadata: Record<string, unknown> | null;
  /** 多图作品时传入当前选中图片的参数对象（覆盖 metadata 顶层字段） */
  perImage?: Record<string, unknown> | null;
}

// NovelAI 参数的可读字段顺序
const NAI_ORDER: Array<[string, string]> = [
  ["prompt", "Prompt"],
  ["uc", "Negative Prompt"],
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

function JsonView({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="bg-[#0f1218] border border-[#262b36] rounded-lg p-4 text-xs text-[#c8d1dc] overflow-auto max-h-[70vh] whitespace-pre-wrap break-words">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function PromptBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4">
      <div className="text-sm font-semibold text-[#aeb6c2] mb-1">{label}</div>
      <div className="bg-[#0f1218] border border-[#262b36] rounded-lg p-3 text-sm text-[#e6edf3] whitespace-pre-wrap break-words leading-relaxed">
        {value || <span className="text-[#5a6270]">（无）</span>}
      </div>
    </div>
  );
}

export default function MetadataView({ metadata, perImage }: Props) {
  const [view, setView] = useState<"formatted" | "json">("formatted");

  if (!metadata && !perImage) {
    return (
      <div className="text-sm text-[#aeb6c2]">无元数据</div>
    );
  }

  // 多图时用 perImage（当前图参数）；否则用 metadata 顶层
  const data = perImage ?? metadata;
  const isNai =
    data !== null &&
    data !== undefined &&
    (data._source_file !== undefined || "prompt" in data || "uc" in data);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="text-sm font-semibold text-[#e6edf3]">AI 参数</div>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setView("formatted")}
            className={`px-3 py-1 rounded-lg text-xs border ${
              view === "formatted"
                ? "bg-[#4c9fff] border-[#4c9fff] text-white"
                : "bg-[#151922] border-[#262b36] text-[#aeb6c2] hover:border-[#4c9fff]"
            }`}
          >
            指令视图
          </button>
          <button
            onClick={() => setView("json")}
            className={`px-3 py-1 rounded-lg text-xs border ${
              view === "json"
                ? "bg-[#4c9fff] border-[#4c9fff] text-white"
                : "bg-[#151922] border-[#262b36] text-[#aeb6c2] hover:border-[#4c9fff]"
            }`}
          >
            JSON 原文
          </button>
        </div>
      </div>

      {view === "json" ? (
        <JsonView data={(data as Record<string, unknown>) ?? {}} />
      ) : isNai ? (
        <div>
          <PromptBlock label="Prompt" value={String(data.prompt ?? "")} />
          <PromptBlock label="Negative Prompt" value={String(data.uc ?? "")} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {NAI_ORDER.filter(([k]) => k !== "prompt" && k !== "uc").map(
              ([k, label]) => {
                const v = data[k];
                if (v === undefined || v === null || v === "") return null;
                return (
                  <div
                    key={k}
                    className="bg-[#151922] border border-[#262b36] rounded-lg px-3 py-2"
                  >
                    <div className="text-xs text-[#aeb6c2]">{label}</div>
                    <div className="text-sm text-[#e6edf3] font-mono break-all">
                      {String(v)}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-[#aeb6c2]">
          该图片没有 NovelAI 结构化参数，可切换到 JSON 原文查看。
        </div>
      )}
    </div>
  );
}
