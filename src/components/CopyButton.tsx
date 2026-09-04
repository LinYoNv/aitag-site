"use client";

import { useState } from "react";

/** 复制按钮：点击复制 text 到剪贴板，短暂显示"已复制" */
export default function CopyButton({
  text,
  label = "复制",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 降级：老式 execCommand
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* 忽略复制失败 */
      }
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCopy();
      }}
      title="复制全部内容"
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
        copied
          ? "bg-[#14241a] border-[#2a4a2a] text-[#7aff9a]"
          : "bg-[#151922] border-[#262b36] text-[#7a8394] hover:text-[#4c9fff] hover:border-[#4c9fff]"
      } ${className}`}
    >
      {copied ? "✓ 已复制" : `⧉ ${label}`}
    </button>
  );
}
