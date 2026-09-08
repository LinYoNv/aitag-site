"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";
import { artistsToText, COMFY_ORDER, NAI_ORDER, type ArtistTag } from "@/lib/param-view";

interface Props {
  metadata: Record<string, unknown> | null;
  /** 多图作品时传入当前选中图片的参数对象（覆盖 metadata 顶层字段） */
  perImage?: Record<string, unknown> | null;
}


function JsonView({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="bg-[#0f1218] border border-[#262b36] rounded-lg p-4 text-xs text-[#c8d1dc] overflow-auto max-h-[70vh] whitespace-pre-wrap break-words">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// 文本框：标题 + 右上角复制按钮 + 内容（Prompt / Negative / 画师 同款样式）
function PromptBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-semibold text-[#aeb6c2]">{label}</div>
        <span className="ml-auto">
          <CopyButton text={value} label="复制" />
        </span>
        <span className="text-xs text-[#5a6270]">
          {value.length > 0 ? `${value.length} 字符` : "（无）"}
        </span>
      </div>
      <div className="bg-[#0f1218] border border-[#262b36] rounded-lg p-3 text-sm text-[#e6edf3] whitespace-pre-wrap break-words leading-relaxed">
        {value || <span className="text-[#5a6270]">（无）</span>}
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
          <PromptBlock
            label="画师 Artist"
            value={artistsToText((data?.artists as ArtistTag[] | undefined) ?? [])}
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
