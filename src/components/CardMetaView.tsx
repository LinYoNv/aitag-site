"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";
import { artistsToText, COMFY_ORDER, NAI_ORDER, type ArtistTag } from "@/lib/param-view";

interface Props {
  /** 单张图对应的参数对象（per_image 项或整个 metadata） */
  data: Record<string, unknown> | null;
  /** 卡片序号（多图时显示 图N） */
  index?: number;
  /** 当前图片原始 URL（下载按钮用） */
  imageSrc?: string;
}

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

export default function CardMetaView({ data, index, imageSrc }: Props) {
  const [view, setView] = useState<"formatted" | "json">("formatted");
  const [downloading, setDownloading] = useState(false);

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

  // 下载当前图片：fetch → blob → 触发下载（跨域图片需 blob 才能改文件名）
  async function handleDownload() {
    if (!imageSrc || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(imageSrc, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : blob.type.includes("jpeg") ? "jpg" : "img";
      const name = `aitag-${typeof index === "number" ? `image-${index + 1}` : "image"}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // 降级：直接打开原图让浏览器保存
      if (imageSrc) window.open(imageSrc, "_blank");
    } finally {
      setDownloading(false);
    }
  }

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
          {imageSrc && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              title="下载当前图片"
              className={`px-2 py-0.5 rounded text-[11px] border inline-flex items-center gap-1 ${
                downloading
                  ? "bg-[#151922] border-[#262b36] text-[#5a6270]"
                  : "bg-[#151922] border-[#262b36] text-[#aeb6c2] hover:border-[#7aff9a] hover:text-[#7aff9a]"
              }`}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloading ? "下载中…" : "下载"}
            </button>
          )}
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
                if (k === "artists" || k === "prompt" || k === "uc") return null;
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
