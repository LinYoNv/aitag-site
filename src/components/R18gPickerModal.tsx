"use client";

import { useEffect, useMemo, useState } from "react";
import {
  R18G_GROUPS,
  type R18GGroup,
  parseCustomTags,
  defaultHiddenTags,
} from "@/lib/r18g-tags";

interface Props {
  open: boolean;
  selected: string[];
  custom: string[];
  onClose: () => void;
  onSave: (selected: string[], custom: string[]) => void;
}

export default function R18gPickerModal({
  open,
  selected,
  custom,
  onClose,
  onSave,
}: Props) {
  const [activeGroupId, setActiveGroupId] = useState(R18G_GROUPS[0]?.id ?? "scat_fecal");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [customRaw, setCustomRaw] = useState("");
  const [query, setQuery] = useState("");

  // 打开时重置为当前保存值；从未选过词时预勾选推荐组（粪便 + 兽人）
  useEffect(() => {
    if (open) {
      const saved = new Set(selected.map((s) => s.toLowerCase()));
      if (selected.length === 0 && custom.length === 0) {
        for (const t of defaultHiddenTags()) saved.add(t);
      }
      setChecked(saved);
      setCustomRaw(custom.join(", "));
      setQuery("");
    }
  }, [open, selected, custom]);

  const activeGroup = R18G_GROUPS.find((g) => g.id === activeGroupId) ?? null;

  const customParsed = useMemo(() => parseCustomTags(customRaw), [customRaw]);

  // 中英搜索：跨组匹配 en / zh（大小写不敏感）
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hits: { group: R18GGroup; en: string; zh: string }[] = [];
    for (const g of R18G_GROUPS) {
      if (g.id === "custom") continue;
      for (const t of g.tags) {
        if (t.en.toLowerCase().includes(q) || t.zh.toLowerCase().includes(q)) {
          hits.push({ group: g, en: t.en, zh: t.zh });
        }
      }
    }
    return hits;
  }, [query]);

  if (!open) return null;

  const toggle = (en: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      const key = en.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = () => {
    onSave([...checked], customParsed);
  };

  const inputCls =
    "w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#5a6270] outline-none focus:border-[#4c9fff]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-[#151922] border border-[#262b36] rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* 头部 */}
        <div className="px-5 pt-4 pb-3 border-b border-[#262b36]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-[#e6edf3]">
              管理屏蔽词
            </h2>
            <button
              onClick={onClose}
              className="text-[#aeb6c2] hover:text-[#e6edf3] text-2xl leading-none px-1 font-light"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-[#5a6270] mt-1">
            勾选你不想看到的 tag。开启总开关后，正向提示词里含这些词的作品会在图库、个人主页、收藏列表中自动隐藏。
          </p>
          {/* 搜索框 */}
          <div className="mt-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 tag，中文 / 英文均可（如 scat、粪便、兽人）"
              className={inputCls}
            />
          </div>
        </div>

        {/* 主体：左分组 + 右 tag */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* 左：分组 */}
          <div className="w-36 sm:w-44 shrink-0 border-r border-[#262b36] overflow-y-auto py-2">
            {R18G_GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGroupId(g.id)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-l-2 ${
                  activeGroupId === g.id
                    ? "bg-[#151922] text-[#4c9fff] border-[#4c9fff]"
                    : "text-[#aeb6c2] hover:text-[#e6edf3] border-transparent"
                }`}
              >
                <span className="block truncate">{g.label}</span>
                {g.id === "custom" && customParsed.length > 0 && (
                  <span className="text-[10px] text-[#4c9fff]">{customParsed.length} 项</span>
                )}
              </button>
            ))}
          </div>

          {/* 右：tag 勾选 / 搜索结果 / 自定义 */}
          <div className="flex-1 overflow-y-auto p-4 min-w-0">
            {query.trim() ? (
              // 搜索结果模式
              searchResults && searchResults.length > 0 ? (
                <div className="space-y-3">
                  {searchResults.map((hit, i) => (
                    <label
                      key={hit.en + i}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(hit.en.toLowerCase())}
                        onChange={() => toggle(hit.en)}
                        className="w-4 h-4 accent-[#4c9fff] shrink-0"
                      />
                      <span className="text-sm text-[#e6edf3] group-hover:text-[#4c9fff]">
                        {hit.en}
                        <span className="text-xs text-[#5a6270] ml-2">{hit.zh}</span>
                      </span>
                      <span className="ml-auto text-[10px] text-[#5a6270]">
                        {hit.group.label}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#5a6270]">没有匹配的 tag</p>
              )
            ) : activeGroup && activeGroup.id === "custom" ? (
              // 自定义组：文本输入
              <div>
                <p className="text-xs text-[#aeb6c2] mb-2">
                  输入要屏蔽的英文 tag（逗号或换行分隔），保存后立即生效：
                </p>
                <textarea
                  value={customRaw}
                  onChange={(e) => setCustomRaw(e.target.value)}
                  rows={6}
                  placeholder={"scat, furry, guro"}
                  className={inputCls + " font-mono"}
                />
                {customParsed.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {customParsed.map((t) => (
                      <span
                        key={t}
                        className="text-xs bg-[#1c2230] border border-[#262b36] text-[#4c9fff] px-2 py-1 rounded-md"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // 正常分组 mode
              <>
                <p className="text-xs text-[#aeb6c2] mb-3">{activeGroup?.desc}</p>
                {activeGroup && activeGroup.tags.length > 0 ? (
                  <div className="space-y-2.5">
                    {activeGroup.tags.map((t, i) => (
                      <label
                        key={i}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={checked.has(t.en.toLowerCase())}
                          onChange={() => toggle(t.en)}
                          className="w-4 h-4 accent-[#4c9fff] shrink-0"
                        />
                        <span className="text-sm text-[#e6edf3] group-hover:text-[#4c9fff] font-mono">
                          {t.en}
                        </span>
                        <span className="text-xs text-[#5a6270]">{t.zh}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="px-5 py-3.5 border-t border-[#262b36] flex items-center gap-3 justify-end">
          <span className="text-xs text-[#5a6270] mr-auto">
            已勾选 {checked.size} 个预置词
            {customParsed.length > 0 ? ` + ${customParsed.length} 个自定义` : ""}
          </span>
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg bg-[#151922] border border-[#262b36] text-[#aeb6c2] hover:text-[#e6edf3] hover:border-[#4c9fff]"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="text-sm px-4 py-2 rounded-lg bg-[#4c9fff] text-white hover:opacity-90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}