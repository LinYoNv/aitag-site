"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { parsePngMetadata } from "@/lib/png";
import type { PngParseResult } from "@/lib/types";
import UserBadge from "@/components/UserBadge";

interface UserInfo {
  username: string;
  role: string;
  author_name: string;
  avatar?: string;
}

interface FileEntry {
  file: File;
  url: string;
  parseResult: PngParseResult | null;
  prompt: string;
  negative: string;
}

export default function UploadPageClient({ user }: { user: UserInfo }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"png" | "manual">("png");

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);

  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [aiType, setAiType] = useState("nai");
  const [manualPrompt, setManualPrompt] = useState("");
  const [manualNegative, setManualNegative] = useState("");
  const [shareTitle, setShareTitle] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newEntries: FileEntry[] = [];
    for (const file of files) {
      const entry: FileEntry = {
        file,
        url: URL.createObjectURL(file),
        parseResult: null,
        prompt: "",
        negative: "",
      };

      if (tab === "png" && file.type === "image/png") {
        try {
          const buf = await file.arrayBuffer();
          const res = parsePngMetadata(buf);
          entry.parseResult = res;
          if (res.ok && res.novelai) {
            entry.prompt = res.novelai.prompt;
            entry.negative = res.novelai.negativePrompt;
          }
        } catch {
          entry.parseResult = { ok: false, error: "失败：解析出错" };
        }
      }

      newEntries.push(entry);
    }
    setEntries((prev) => [...prev, ...newEntries]);
    setResult(null);
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (entries.length === 0) {
      setResult({ ok: false, msg: "失败：请先选择图片" });
      return;
    }
    setSubmitting(true);
    setResult(null);

    try {
      const form = new FormData();
      form.append("title", title);
      form.append("caption", caption);
      form.append("ai_type", aiType);
      form.append("author_name", user.username);
      form.append("share_title", shareTitle ? "1" : "0");

      entries.forEach((entry, i) => {
        form.append("files", entry.file);
        let meta: Record<string, unknown> | null = null;
        if (tab === "png") {
          // 平铺 NovelAI comment 里的完整参数到顶层，供详情页展示
          const rawMeta = entry.parseResult?.metadata as
            | (Record<string, unknown> & { comment?: Record<string, unknown> })
            | undefined;
          const comment = rawMeta?.comment;
          meta = {
            prompt: entry.prompt,
            uc: entry.negative,
            ...(rawMeta ?? {}),
            // comment 内的关键生成参数平铺到顶层（与种子数据一致）
            ...(comment && typeof comment === "object"
              ? {
                  sampler: comment.sampler,
                  steps: comment.steps,
                  width: comment.width,
                  height: comment.height,
                  scale: comment.scale,
                  seed: comment.seed,
                  noise_schedule: comment.noise_schedule,
                  sm: comment.sm,
                  sm_dyn: comment.sm_dyn,
                  dynamic_thresholding: comment.dynamic_thresholding,
                  cfg_rescale: comment.cfg_rescale,
                  uncond_scale: comment.uncond_scale,
                  version: comment.version,
                  request_type: comment.request_type,
                }
              : {}),
          };
          // 保留 comment 本身（JSON 视图可用）
          meta.comment = comment ?? null;
        } else {
          meta = { prompt: manualPrompt || null, uc: manualNegative || null };
        }
        form.append(`meta_${i}`, JSON.stringify(meta));
      });

      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json()) as {
        ok?: boolean;
        id?: string;
        ids?: string[];
        count?: number;
        error?: string;
      };
      if (res.ok && data.ok) {
        const target = data.id ?? data.ids?.[0];
        setResult({
          ok: true,
          msg: `上传成功！共 ${data.count ?? 1} 件` + (shareTitle && entries.length > 1 ? "（已合并）" : ""),
        });
        if (target) {
          window.location.href = `/i/${target}`;
        } else {
          window.location.reload();
        }
      } else {
        setResult({ ok: false, msg: data.error ?? "失败：上传出错" });
      }
    } catch (e) {
      setResult({
        ok: false,
        msg: "失败：" + (e instanceof Error ? e.message : "网络错误"),
      });
    } finally {
      setSubmitting(false);
    }
  }

  // 当前上传方式下的参数预览（供上传者确认）
  function renderParamPreview() {
    if (entries.length === 0) return null;
    return (
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-[#e6edf3]">
            参数预览（确认无误后提交）
          </h3>
          <span className="text-xs text-[#5a6270]">共 {entries.length} 张</span>
        </div>
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="bg-[#151922] border border-[#262b36] rounded-xl p-3"
            >
              <div className="flex items-center gap-3 mb-2">
                <img
                  src={entry.url}
                  alt={`图片 ${i + 1}`}
                  className="w-14 h-14 object-cover rounded-lg shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#e6edf3]">
                      图片 {i + 1}
                    </span>
                    {tab === "png" ? (
                      entry.parseResult?.ok ? (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#14241a] text-[#7aff9a] border border-[#2a4a2a]">
                          ✓ 已解析
                        </span>
                      ) : (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#2a1a1a] text-[#ff7a7a] border border-[#5a2a2a]">
                          {entry.parseResult?.error ?? "失败"}
                        </span>
                      )
                    ) : (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#1a2233] text-[#4c9fff] border border-[#2a3a55]">
                        手动参数
                      </span>
                    )}
                    <button
                      onClick={() => removeEntry(i)}
                      className="ml-auto text-xs text-[#aeb6c2] hover:text-red-400 px-2 py-0.5 rounded hover:bg-[#2a1a1a]"
                    >
                      ✕
                    </button>
                  </div>
                  {tab === "png" && entry.parseResult?.ok && (
                    <div className="text-[11px] text-[#5a6270] mt-1 font-mono truncate">
                      {entry.parseResult.novelai?.sampler} ·{" "}
                      {entry.parseResult.novelai?.steps} 步 · seed{" "}
                      {entry.parseResult.novelai?.seed} ·{" "}
                      {entry.parseResult.width}×{entry.parseResult.height}
                    </div>
                  )}
                </div>
              </div>

              {/* 可编辑参数 */}
              {tab === "png" ? (
                <>
                  <textarea
                    value={entry.prompt}
                    onChange={(e) =>
                      setEntries((prev) =>
                        prev.map((p, idx) =>
                          idx === i ? { ...p, prompt: e.target.value } : p,
                        ),
                      )
                    }
                    placeholder="Prompt（可修改）"
                    rows={2}
                    className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-xs text-[#e6edf3] font-mono outline-none focus:border-[#4c9fff] mb-2 resize-y"
                  />
                  <textarea
                    value={entry.negative}
                    onChange={(e) =>
                      setEntries((prev) =>
                        prev.map((p, idx) =>
                          idx === i ? { ...p, negative: e.target.value } : p,
                        ),
                      )
                    }
                    placeholder="Negative Prompt（可修改）"
                    rows={1}
                    className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-xs text-[#e6edf3] font-mono outline-none focus:border-[#4c9fff] resize-y"
                  />
                </>
              ) : (
                <div className="text-xs text-[#5a6270]">
                  将使用下方统一的 Prompt / Negative 参数
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 backdrop-blur bg-[#0b0d10]/90 border-b border-[#262b36] px-6 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="text-lg font-bold text-[#e6edf3] hover:text-[#4c9fff] whitespace-nowrap"
        >
          ← AI 咒语图库
        </Link>
        <span className="text-sm text-[#aeb6c2]">上传作品</span>
        <div className="ml-auto">
          <UserBadge
            username={user.username}
            isAdmin={user.role === "admin"}
            avatar={user.avatar}
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        <h1 className="text-xl font-bold text-[#e6edf3] mb-5">上传作品</h1>

        {/* 选择上传方式：两个切换卡片 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => {
              setTab("png");
              setEntries([]);
              setResult(null);
            }}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              tab === "png"
                ? "border-[#4c9fff] bg-gradient-to-br from-[#16233a] to-[#10131a] shadow-[0_0_20px_rgba(76,159,255,0.15)]"
                : "border-[#262b36] bg-[#11141b] hover:border-[#3a4a63]"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  tab === "png"
                    ? "border-[#4c9fff] bg-[#4c9fff]"
                    : "border-[#3a4252]"
                }`}
              >
                {tab === "png" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </span>
              <span className="text-[#e6edf3] font-semibold text-sm">
                自带元数据
              </span>
              <span className="ml-auto text-[#5a6270] text-xs">PNG</span>
            </div>
            <p className="text-xs text-[#7a8394] leading-relaxed">
              NovelAI / SD 生成的 PNG 内含完整参数，自动读取
            </p>
          </button>

          <button
            onClick={() => {
              setTab("manual");
              setEntries([]);
              setResult(null);
            }}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              tab === "manual"
                ? "border-[#4c9fff] bg-gradient-to-br from-[#16233a] to-[#10131a] shadow-[0_0_20px_rgba(76,159,255,0.15)]"
                : "border-[#262b36] bg-[#11141b] hover:border-[#3a4a63]"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  tab === "manual"
                    ? "border-[#4c9fff] bg-[#4c9fff]"
                    : "border-[#3a4252]"
                }`}
              >
                {tab === "manual" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </span>
              <span className="text-[#e6edf3] font-semibold text-sm">
                不带元数据
              </span>
              <span className="ml-auto text-[#5a6270] text-xs">JPG/WebP</span>
            </div>
            <p className="text-xs text-[#7a8394] leading-relaxed">
              普通图片，手动填写 Prompt 与参数
            </p>
          </button>
        </div>

        {/* 拖拽/选择区 */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
            dragging
              ? "border-[#4c9fff] bg-[#1a2233] scale-[1.01]"
              : "border-[#2a3242] bg-gradient-to-b from-[#131722] to-[#0f1218] hover:border-[#4c9fff] hover:from-[#151b29] hover:to-[#10131a]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={tab === "png" ? "image/png" : "image/png,image/jpeg,image/webp"}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-2xl transition-all ${
              dragging
                ? "bg-[#4c9fff]/20 text-[#4c9fff]"
                : "bg-[#1a2233] text-[#7a8394]"
            }`}
          >
            ⬆
          </div>
          <div className="text-[#e6edf3] text-base font-medium mb-1.5">
            {tab === "png"
              ? "拖拽 PNG 图片到此处，或点击选择"
              : "拖拽图片到此处，或点击选择"}
          </div>
          <div className="text-[#5a6270] text-sm">
            支持 png、jpg 等图片格式
            {tab === "png" && (
              <span className="text-[#4c9fff]"> · 自动读取参数</span>
            )}
          </div>
        </div>

        {/* 已选图片列表 */}
        {entries.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-[#e6edf3] font-medium">
                已选 {entries.length} 张
              </span>
              {entries.length > 1 && (
                <label className="ml-auto flex items-center gap-2 text-sm text-[#aeb6c2] cursor-pointer hover:text-[#e6edf3] transition-colors">
                  <input
                    type="checkbox"
                    checked={shareTitle}
                    onChange={(e) => setShareTitle(e.target.checked)}
                    className="accent-[#4c9fff] w-4 h-4"
                  />
                  共用标题（合并为同一作品）
                </label>
              )}
            </div>
            {/* 简单缩略图行 */}
            <div className="flex gap-2 flex-wrap mb-4">
              {entries.map((entry, i) => (
                <div key={i} className="relative group">
                  <img
                    src={entry.url}
                    alt={`图片 ${i + 1}`}
                    className="w-16 h-16 object-cover rounded-lg border border-[#262b36]"
                  />
                  <button
                    onClick={() => removeEntry(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#2a1a1a] border border-[#5a2a2a] text-[#ff7a7a] text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 参数预览区 */}
        {renderParamPreview()}

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[#e6edf3] mb-1">
                标题{entries.length > 1 && shareTitle ? "（共用）" : ""}
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={entries.length > 1 && shareTitle ? "所有图片共用的标题" : ""}
                className="w-full bg-[#151922] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#4c9fff]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#e6edf3] mb-1">作者</label>
              <div className="w-full bg-[#151922] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#4c9fff] flex items-center justify-between">
                <span className="truncate">{user.username}</span>
                <span className="text-[10px] text-[#5a6270] shrink-0 ml-2">
                  {user.role === "admin" ? "管理员" : "可删除自己上传的作品"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#e6edf3] mb-1">类型</label>
            <select
              value={aiType}
              onChange={(e) => setAiType(e.target.value)}
              className="bg-[#151922] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3]"
            >
              <option value="nai">NovelAI</option>
              <option value="nai_x">NAI-X</option>
              <option value="sd">Stable Diffusion</option>
              <option value="comfyui">ComfyUI</option>
              <option value="other">其他</option>
            </select>
          </div>

          {tab === "manual" && (
            <>
              <div>
                <label className="block text-sm text-[#e6edf3] mb-1">
                  Prompt（可留空）
                </label>
                <textarea
                  value={manualPrompt}
                  onChange={(e) => setManualPrompt(e.target.value)}
                  rows={4}
                  className="w-full bg-[#151922] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] font-mono outline-none focus:border-[#4c9fff]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#e6edf3] mb-1">
                  Negative Prompt（可留空）
                </label>
                <textarea
                  value={manualNegative}
                  onChange={(e) => setManualNegative(e.target.value)}
                  rows={2}
                  className="w-full bg-[#151922] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] font-mono outline-none focus:border-[#4c9fff]"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-[#e6edf3] mb-1">简介</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              className="w-full bg-[#151922] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#4c9fff]"
            />
          </div>

          {result && (
            <div
              className={`rounded-lg px-4 py-3 text-sm ${
                result.ok
                  ? "bg-[#14241a] border border-[#2a4a2a] text-[#7aff9a]"
                  : "bg-[#2a1a1a] border border-[#5a2a2a] text-[#ff7a7a]"
              }`}
            >
              {result.msg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || entries.length === 0}
            className="w-full bg-[#4c9fff] text-white font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting
              ? "提交中…"
              : entries.length === 0
                ? "请先选择图片"
                : `提交上传（${entries.length} 张${shareTitle && entries.length > 1 ? " · 合并" : ""}）`}
          </button>
        </form>
      </main>
    </div>
  );
}
