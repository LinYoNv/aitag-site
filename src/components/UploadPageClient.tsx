"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { parsePngMetadata, parseComfyUi } from "@/lib/png";
import type { PngParseResult } from "@/lib/types";
import UserBadge from "@/components/UserBadge";

type UploadMode = "nai" | "comfyui" | "manual";

interface UserInfo {
  username: string;
  role: string;
  author_name: string;
  avatar?: string;
}

// 每个文件的可编辑参数
interface FileEntry {
  file: File;
  url: string;
  parseResult: PngParseResult | null;
  // 可编辑字段（字符串方便输入框绑定）
  prompt: string;
  negative: string;
  sampler: string;
  steps: string;
  scale: string; // NAI: CFG Scale
  cfg: string; // ComfyUI: CFG
  seed: string;
  width: string;
  height: string;
  model: string;
  scheduler: string;
  loras: string; // 逗号分隔
  // ComfyUI 手动粘贴的 workflow JSON
  comfyRaw: string;
  // 是否成功解析出结构化参数
  parsed: boolean;
  hasComfy: boolean; // 该图读到了 comfyui 参数
  hasNai: boolean; // 该图读到了 novelai 参数
}

const empty = (): Omit<FileEntry, "file" | "url" | "parseResult"> => ({
  prompt: "",
  negative: "",
  sampler: "",
  steps: "",
  scale: "",
  cfg: "",
  seed: "",
  width: "",
  height: "",
  model: "",
  scheduler: "",
  loras: "",
  comfyRaw: "",
  parsed: false,
  hasComfy: false,
  hasNai: false,
});

const CARD_STYLES = {
  base: "text-left p-4 rounded-xl border-2 transition-all",
  active:
    "border-[#4c9fff] bg-gradient-to-br from-[#16233a] to-[#10131a] shadow-[0_0_20px_rgba(76,159,255,0.15)]",
  inactive: "border-[#262b36] bg-[#11141b] hover:border-[#3a4a63]",
};

const RADIO = {
  base: "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
  on: "border-[#4c9fff] bg-[#4c9fff]",
  off: "border-[#3a4252]",
};

function ParamField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] text-[#7a8394] mb-0.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-[#0f1218] border border-[#262b36] rounded-md px-2 py-1.5 text-xs text-[#e6edf3] font-mono outline-none focus:border-[#4c9fff] disabled:opacity-40"
      />
    </div>
  );
}

export default function UploadPageClient({ user }: { user: UserInfo }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<UploadMode>("nai");

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);

  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [manualPrompt, setManualPrompt] = useState("");
  const [manualNegative, setManualNegative] = useState("");
  const [shareTitle, setShareTitle] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  const aiType = tab === "nai" ? "nai" : tab === "comfyui" ? "comfyui" : "other";

  const switchMode = (m: UploadMode) => {
    setTab(m);
    setEntries([]);
    setResult(null);
  };

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newEntries: FileEntry[] = [];
    for (const file of files) {
      const base = empty();
      const entry: FileEntry = {
        file,
        url: URL.createObjectURL(file),
        parseResult: null,
        ...base,
      };

      if (file.type === "image/png") {
        try {
          const buf = await file.arrayBuffer();
          const res = parsePngMetadata(buf);
          entry.parseResult = res;
          entry.parsed = res.ok;
          // NAI 解析结果
          if (res.ok && res.novelai) {
            entry.hasNai = true;
            entry.prompt = res.novelai.prompt;
            entry.negative = res.novelai.negativePrompt;
            entry.sampler = res.novelai.sampler;
            entry.steps = String(res.novelai.steps || "");
            entry.scale = String(res.novelai.scale || "");
            entry.seed = String(res.novelai.seed || "");
            entry.width = String(res.novelai.width || "");
            entry.height = String(res.novelai.height || "");
            entry.model = res.novelai.model && res.novelai.model !== "NovelAI" ? res.novelai.model : "";
          }
          // ComfyUI 解析结果
          if (res.ok && res.comfyui) {
            entry.hasComfy = true;
            entry.prompt = res.comfyui.prompt;
            entry.negative = res.comfyui.negativePrompt;
            entry.sampler = res.comfyui.sampler;
            entry.cfg = String(res.comfyui.cfg || "");
            entry.seed = String(res.comfyui.seed || "");
            entry.width = String(res.comfyui.width || "");
            entry.height = String(res.comfyui.height || "");
            entry.model = res.comfyui.model;
            entry.scheduler = res.comfyui.scheduler;
            entry.steps = String(res.comfyui.steps || "");
            entry.loras = (res.comfyui.loras ?? []).join(", ");
            entry.comfyRaw = res.comfyui.rawJson ?? "";
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

  function patchEntry(i: number, patch: Partial<FileEntry>) {
    setEntries((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  // 应用粘贴的 ComfyUI workflow JSON 到某个 entry
  function applyComfyJson(i: number) {
    const entry = entries[i];
    const c = parseComfyUi(entry.comfyRaw);
    if (!c) {
      setResult({ ok: false, msg: "该 JSON 不符合 ComfyUI 工作流结构" });
      return;
    }
    patchEntry(i, {
      prompt: c.prompt,
      negative: c.negativePrompt,
      sampler: c.sampler,
      cfg: String(c.cfg || ""),
      seed: String(c.seed || ""),
      width: String(c.width || ""),
      height: String(c.height || ""),
      model: c.model,
      scheduler: c.scheduler,
      steps: String(c.steps || ""),
      loras: (c.loras ?? []).join(", "),
      parsed: true,
      hasComfy: true,
    });
    setResult({ ok: true, msg: "已从 JSON 解析出 ComfyUI 参数" });
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
        let meta: Record<string, unknown>;

        if (tab === "nai") {
          meta = {
            _format: "nai",
            prompt: entry.prompt,
            uc: entry.negative,
            sampler: entry.sampler || null,
            steps: entry.steps ? Number(entry.steps) : null,
            width: entry.width ? Number(entry.width) : null,
            height: entry.height ? Number(entry.height) : null,
            scale: entry.scale ? Number(entry.scale) : null,
            seed: entry.seed ? Number(entry.seed) : null,
            noise_schedule: null,
            model: entry.model || null,
          };
          // 若 PNG 自带 comment，保留完整 comment 供 JSON 视图
          const rawMeta = entry.parseResult?.metadata as
            | (Record<string, unknown> & { comment?: Record<string, unknown> })
            | undefined;
          if (rawMeta?.comment) meta.comment = rawMeta.comment;
        } else if (tab === "comfyui") {
          meta = {
            _format: "comfyui",
            prompt: entry.prompt,
            uc: entry.negative,
            model: entry.model || null,
            loras: entry.loras
              ? entry.loras
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
            sampler: entry.sampler || null,
            scheduler: entry.scheduler || null,
            steps: entry.steps ? Number(entry.steps) : null,
            cfg: entry.cfg ? Number(entry.cfg) : null,
            seed: entry.seed ? Number(entry.seed) : null,
            width: entry.width ? Number(entry.width) : null,
            height: entry.height ? Number(entry.height) : null,
            rawJson: entry.comfyRaw || null,
          };
        } else {
          meta = {
            _format: "manual",
            prompt: manualPrompt || null,
            uc: manualNegative || null,
          };
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

  const isManual = tab === "manual";
  const isComfy = tab === "comfyui";

  // 当前上传方式下的参数预览（每张图可编辑）
  function renderParamPreview() {
    if (entries.length === 0) return null;
    return (
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-[#e6edf3]">
            参数预览（可编辑，确认无误后提交）
          </h3>
          <span className="text-xs text-[#5a6270]">共 {entries.length} 张</span>
        </div>
        <div className="space-y-3">
          {entries.map((entry, i) => {
            const hasAuto = tab === "nai" ? entry.hasNai : entry.hasComfy;
            return (
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
                      {entry.parseResult ? (
                        entry.parsed ? (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#14241a] text-[#7aff9a] border border-[#2a4a2a]">
                            {hasAuto ? "✓ 已解析" : "✓ 已读（无此类型参数）"}
                          </span>
                        ) : (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#2a1a1a] text-[#ff7a7a] border border-[#5a2a2a]">
                            {entry.parseResult.error ?? "失败"}
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
                    {(entry.hasNai || entry.hasComfy) && (
                      <div className="text-[11px] text-[#5a6270] mt-1 font-mono truncate">
                        {entry.sampler || "?"} · {entry.steps || "?"} 步 · seed{" "}
                        {entry.seed || "?"} · {entry.width || "?"}×
                        {entry.height || "?"}
                      </div>
                    )}
                  </div>
                </div>

                {isManual ? (
                  <div className="text-xs text-[#5a6270]">
                    将使用下方统一的 Prompt / Negative 参数
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* 首行：Prompt 与 Negative */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-[#7a8394] mb-0.5">
                          Prompt（可修改）
                        </label>
                        <textarea
                          value={entry.prompt}
                          onChange={(e) => patchEntry(i, { prompt: e.target.value })}
                          rows={3}
                          className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-2 py-1.5 text-xs text-[#e6edf3] font-mono outline-none focus:border-[#4c9fff] resize-y"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#7a8394] mb-0.5">
                          Negative Prompt（可修改）
                        </label>
                        <textarea
                          value={entry.negative}
                          onChange={(e) => patchEntry(i, { negative: e.target.value })}
                          rows={3}
                          className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-2 py-1.5 text-xs text-[#e6edf3] font-mono outline-none focus:border-[#4c9fff] resize-y"
                        />
                      </div>
                    </div>

                    {/* ComfyUI：JSON 粘贴与应用 */}
                    {isComfy && (
                      <div className="border-t border-[#262b36] pt-2">
                        <label className="block text-[11px] text-[#7a8394] mb-1">
                          或粘贴 ComfyUI workflow JSON（若 PNG 未自动解析）
                        </label>
                        <div className="flex gap-2">
                          <textarea
                            value={entry.comfyRaw}
                            onChange={(e) => patchEntry(i, { comfyRaw: e.target.value })}
                            rows={2}
                            placeholder='{"3": {"class_type": "...", "inputs": {...}} ...}'
                            className="flex-1 bg-[#0f1218] border border-[#262b36] rounded-lg px-2 py-1.5 text-xs text-[#e6edf3] font-mono outline-none focus:border-[#4c9fff] resize-y"
                          />
                          <button
                            type="button"
                            onClick={() => applyComfyJson(i)}
                            className="self-center bg-[#151922] border border-[#4c9fff] text-[#4c9fff] text-xs px-3 py-1.5 rounded-lg hover:bg-[#1a2233] whitespace-nowrap"
                          >
                            应用 JSON
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 参数网格 */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <ParamField
                        label="Sampler 采样器"
                        value={entry.sampler}
                        onChange={(v) => patchEntry(i, { sampler: v })}
                      />
                      <ParamField
                        label={isComfy ? "CFG" : "Scale (CFG)"}
                        value={isComfy ? entry.cfg : entry.scale}
                        onChange={(v) => patchEntry(i, isComfy ? { cfg: v } : { scale: v })}
                      />
                      <ParamField
                        label="Steps 步数"
                        value={entry.steps}
                        onChange={(v) => patchEntry(i, { steps: v })}
                      />
                      <ParamField
                        label="Seed 种子"
                        value={entry.seed}
                        onChange={(v) => patchEntry(i, { seed: v })}
                      />
                      <ParamField
                        label="Width 宽"
                        value={entry.width}
                        onChange={(v) => patchEntry(i, { width: v })}
                      />
                      <ParamField
                        label="Height 高"
                        value={entry.height}
                        onChange={(v) => patchEntry(i, { height: v })}
                      />
                      {isComfy && (
                        <ParamField
                          label="Scheduler"
                          value={entry.scheduler}
                          onChange={(v) => patchEntry(i, { scheduler: v })}
                        />
                      )}
                      <ParamField
                        label={isComfy ? "Model 底模" : "Model"}
                        value={entry.model}
                        onChange={(v) => patchEntry(i, { model: v })}
                      />
                      {isComfy && (
                        <div className="sm:col-span-2">
                          <ParamField
                            label="LoRA（多个用逗号分隔）"
                            value={entry.loras}
                            onChange={(v) => patchEntry(i, { loras: v })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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

        {/* 三种上传方式卡片 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {/* NAI */}
          <button
            onClick={() => switchMode("nai")}
            className={`${CARD_STYLES.base} ${
              tab === "nai" ? CARD_STYLES.active : CARD_STYLES.inactive
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`${RADIO.base} ${tab === "nai" ? RADIO.on : RADIO.off}`}
              >
                {tab === "nai" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </span>
              <span className="text-[#e6edf3] font-semibold text-sm">NAI 版本</span>
              <span className="ml-auto text-[#5a6270] text-xs">PNG</span>
            </div>
            <p className="text-xs text-[#7a8394] leading-relaxed">
              NovelAI 生成的 PNG 内含完整参数，自动读取并可在上传时修改
            </p>
          </button>

          {/* ComfyUI */}
          <button
            onClick={() => switchMode("comfyui")}
            className={`${CARD_STYLES.base} ${
              tab === "comfyui" ? CARD_STYLES.active : CARD_STYLES.inactive
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`${RADIO.base} ${
                  tab === "comfyui" ? RADIO.on : RADIO.off
                }`}
              >
                {tab === "comfyui" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </span>
              <span className="text-[#e6edf3] font-semibold text-sm">ComfyUI 版本</span>
              <span className="ml-auto text-[#5a6270] text-xs">PNG/JSON</span>
            </div>
            <p className="text-xs text-[#7a8394] leading-relaxed">
              自动读取内嵌工作流参数；读不到可粘贴 workflow JSON（底模/LoRA/提示词等）
            </p>
          </button>

          {/* 无参数 */}
          <button
            onClick={() => switchMode("manual")}
            className={`${CARD_STYLES.base} ${
              tab === "manual" ? CARD_STYLES.active : CARD_STYLES.inactive
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`${RADIO.base} ${
                  tab === "manual" ? RADIO.on : RADIO.off
                }`}
              >
                {tab === "manual" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </span>
              <span className="text-[#e6edf3] font-semibold text-sm">自行上传无参数</span>
              <span className="ml-auto text-[#5a6270] text-xs">JPG/WebP</span>
            </div>
            <p className="text-xs text-[#7a8394] leading-relaxed">
              普通图片，手动填写 Prompt 与相关参数（类型为「自定义」）
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
            accept={
              tab === "nai"
                ? "image/png"
                : tab === "manual"
                  ? "image/png,image/jpeg,image/webp"
                  : "image/png,image/jpeg,image/webp"
            }
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
            {isManual
              ? "拖拽图片到此处，或点击选择"
              : "拖拽 PNG 图片到此处，或点击选择"}
          </div>
          <div className="text-[#5a6270] text-sm">
            支持 png、jpg 等图片格式
            {!isManual && <span className="text-[#4c9fff]"> · 自动读取参数</span>}
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

          {/* 类型改为只读展示（由上方卡片决定） */}
          <div>
            <label className="block text-sm text-[#e6edf3] mb-1">类型</label>
            <div className="bg-[#151922] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#4c9fff]">
              {aiType === "nai"
                ? "NovelAI"
                : aiType === "comfyui"
                  ? "ComfyUI"
                  : "自定义"}
            </div>
          </div>

          {isManual && (
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