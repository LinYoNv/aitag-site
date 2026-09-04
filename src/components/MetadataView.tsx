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

// ComfyUI 参数的可读字段顺序
const COMFY_ORDER: Array<[string, string]> = [
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

// 画师区块：展示提取出的 artist 列表（负向权重用删除线/标注）
interface ArtistTag {
  name: string;
  weight: number;
  raw?: string;
}
function ArtistBlock({ artists }: { artists: ArtistTag[] }) {
  if (!artists || artists.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="text-sm font-semibold text-[#aeb6c2] mb-1">
        画师 Artist
      </div>
      <div className="flex flex-wrap gap-2">
        {artists.map((a) => (
          <span
            key={a.name}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-sm font-mono ${
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
              <span className="text-[10px] opacity-70">
                {a.weight < 0 ? `${a.weight}` : `×${a.weight}`}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function ParamGrid({
  data,
  order,
  skipKeys,
}: {
  data: Record<string, unknown>;
  order: Array<[string, string]>;
  skipKeys: Set<string>;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {order
        .filter(([k]) => !skipKeys.has(k))
        .map(([k, label]) => {
          const v = data[k];
          if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0))
            return null;
          const text = Array.isArray(v) ? v.join(", ") : String(v);
          return (
            <div
              key={k}
              className="bg-[#151922] border border-[#262b36] rounded-lg px-3 py-2"
            >
              <div className="text-xs text-[#aeb6c2]">{label}</div>
              <div className="text-sm text-[#e6edf3] font-mono break-all">
                {text}
              </div>
            </div>
          );
        })}
    </div>
  );
}

export default function MetadataView({ metadata, perImage }: Props) {
  const [view, setView] = useState<"formatted" | "json">("formatted");

  if (!metadata && !perImage) {
    return <div className="text-sm text-[#aeb6c2]">无元数据</div>;
  }

  // 多图时用 perImage（当前图参数）；否则用 metadata 顶层
  const data = (perImage ?? metadata) as Record<string, unknown> | null;

  // 判定格式：_format 优先；老数据（无 _format 但有 prompt/uc）视为 nai
  const fmt = data?._format === "comfyui" ? "comfyui" : data?._format === "manual" ? "manual" : "nai";

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
            {fmt === "comfyui" ? "工作流视图" : "指令视图"}
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
        <JsonView data={data ?? {}} />
      ) : fmt === "comfyui" ? (
        <div>
          <PromptBlock label="Prompt" value={String(data?.prompt ?? "")} />
          <PromptBlock label="Negative Prompt" value={String(data?.uc ?? "")} />
          <ParamGrid
            data={data ?? {}}
            order={COMFY_ORDER}
            skipKeys={new Set(["prompt", "uc"])}
          />
        </div>
      ) : fmt === "manual" ? (
        <div className="text-sm text-[#aeb6c2] space-y-1">
          {data?.prompt ? (
            <PromptBlock label="Prompt" value={String(data.prompt)} />
          ) : null}
          {data?.uc ? (
            <PromptBlock label="Negative Prompt" value={String(data.uc)} />
          ) : null}
          {!data?.prompt && !data?.uc && (
            <span>该作品为手动上传，无结构化参数。</span>
          )}
        </div>
      ) : (
        <div>
          <PromptBlock label="Prompt" value={String(data?.prompt ?? "")} />
          <PromptBlock label="Negative Prompt" value={String(data?.uc ?? "")} />
          <ArtistBlock
            artists={(data?.artists as ArtistTag[] | undefined) ?? []}
          />
          <ParamGrid
            data={data ?? {}}
            order={NAI_ORDER}
            skipKeys={new Set(["prompt", "uc", "artists"])}
          />
        </div>
      )}
    </div>
  );
}