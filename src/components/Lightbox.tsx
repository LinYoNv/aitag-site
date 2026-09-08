"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** 图片 URL 列表（多图切换） */
  images: string[];
  /** 当前打开的图片下标；null = 关闭 */
  index: number | null;
  /** 图片标题（显示在灯箱头部） */
  title?: string;
  onClose: () => void;
  /** 切换到指定下标 */
  onNavigate: (next: number) => void;
}

/**
 * 灯箱组件（参照 Image Studio 的 image-preview 实现）
 * - 点图片打开，点遮罩 / 图片 / Esc 关闭
 * - 多图时左右按钮 / 键盘 ←→ / 触屏滑动切换，dots 指示位置
 */
export default function Lightbox({ images, index, title, onClose, onNavigate }: Props) {
  const open = index !== null && index >= 0 && index < images.length;
  const current = open ? (index as number) : 0;
  const multi = images.length > 1;
  // 触屏滑动起点（参照参考项目的 48px 阈值判定）
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  // 滑动切换后 500ms 内的点击不关闭（防止误触）
  const swipeAt = useRef(0);

  // 打开时：键盘监听 + 页面滚动锁
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onNavigate(Math.max(0, current - 1));
      else if (e.key === "ArrowRight") onNavigate(Math.min(images.length - 1, current + 1));
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, current, images.length, onClose, onNavigate]);

  if (!open) return null;

  const hasPrev = current > 0;
  const hasNext = current < images.length - 1;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="图片预览">
      <div className="lightbox__backdrop" onClick={onClose} />
      <div className="lightbox__panel">
        <div className="lightbox__head">
          <h2>
            {title || "图片预览"}
            {multi && <span className="lightbox__counter">{current + 1} / {images.length}</span>}
          </h2>
          <button type="button" className="lightbox__close" onClick={onClose} aria-label="关闭图片预览" title="关闭 (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div
          className="lightbox__viewport"
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            touchStartX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null || touchStartY.current === null) return;
            const t = e.changedTouches[0];
            if (!t) return;
            const deltaX = t.clientX - touchStartX.current;
            const deltaY = t.clientY - touchStartY.current;
            touchStartX.current = null;
            touchStartY.current = null;
            if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
            swipeAt.current = Date.now();
            onNavigate(Math.max(0, Math.min(images.length - 1, current + (deltaX < 0 ? 1 : -1))));
          }}
        >
          <div className="lightbox__body">
            <img
              src={images[current]}
              alt={`${title || "图片"} ${current + 1}`}
              draggable={false}
              onClick={() => {
                // 滑动切换后 500ms 内点击不关闭（防止误触）
                if (Date.now() - swipeAt.current < 500) return;
                onClose();
              }}
            />
          </div>
          {hasPrev && (
            <button
              type="button"
              className="lightbox__nav is-previous"
              onClick={() => onNavigate(current - 1)}
              aria-label="查看上一张图片"
              title="上一张 (←)"
            >
              ‹
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              className="lightbox__nav is-next"
              onClick={() => onNavigate(current + 1)}
              aria-label="查看下一张图片"
              title="下一张 (→)"
            >
              ›
            </button>
          )}
          {multi && (
            <div className="lightbox__dots" aria-label="图片位置">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`lightbox__dot ${i === current ? "is-active" : ""}`}
                  onClick={() => onNavigate(i)}
                  aria-label={`查看第 ${i + 1} 张`}
                  aria-current={i === current ? "true" : "false"}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}