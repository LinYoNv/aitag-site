"use client";

import { useEffect, useRef, useState } from "react";
import CardMetaView from "@/components/CardMetaView";

interface Props {
  /** 图片 URL 列表（多图切换） */
  images: string[];
  /** 每张图对应的参数（右侧面板展示，单图作品也可省略） */
  metas?: (Record<string, unknown> | null)[];
  /** 当前打开的图片下标；null = 关闭 */
  index: number | null;
  /** 图片标题（显示在灯箱头部） */
  title?: string;
  onClose: () => void;
  /** 切换到指定下标 */
  onNavigate: (next: number) => void;
}

/** 图片滑动过渡条目：正在退场的旧图 + 方向（1=向左滑/下一张，-1=向右滑/上一张） */
interface Slide {
  src: string;
  dir: 1 | -1;
}

/**
 * 灯箱组件（参照 Image Studio image-preview 增强）
 * - 点图片打开，点遮罩 / 图片 / Esc 关闭
 * - 多图时左右按钮 / 键盘 ←→ / 触屏滑动切换，dots 指示位置
 * - 切换带滑动过渡动画（旧图退场 + 新图进场）
 * - 横向布局：左侧图片（contain 缩小居中），右侧参数面板
 */
export default function Lightbox({ images, metas, index, title, onClose, onNavigate }: Props) {
  const open = index !== null && index >= 0 && index < images.length;
  const current = open ? (index as number) : 0;
  const multi = images.length > 1;
  // 触屏滑动起点（参照参考项目 48px 阈值判定）
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  // 滑动切换后 500ms 内的点击不关闭（防止误触）
  const swipeAt = useRef(0);
  // 正在退场的旧图（退出动画结束后清空）
  const [slide, setSlide] = useState<Slide | null>(null);

  // 统一导航：记录退场旧图和方向，交给父级更新下标
  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(images.length - 1, next));
    if (clamped === current) return;
    setSlide({ src: images[current], dir: clamped > current ? 1 : -1 });
    onNavigate(clamped);
  };

  // 打开时：键盘监听 + 页面滚动锁
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(current - 1);
      else if (e.key === "ArrowRight") go(current + 1);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current, images.length, onClose]);

  if (!open) return null;

  const hasPrev = current > 0;
  const hasNext = current < images.length - 1;
  // 当前图进场方向（跟随上一次退场方向，初次打开无动画）
  const enterDir = slide ? slide.dir : 0;

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
        <div className="lightbox__main">
          <div className={`lightbox__viewport${metas && metas[current] ? " has-side" : ""}`}
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
              go(current + (deltaX < 0 ? 1 : -1));
            }}
          >
            <div className="lightbox__body">
              {/* 退场的旧图：滑出动画结束后移除 */}
              {slide && (
                <img
                  key={`leave-${slide.src}`}
                  src={slide.src}
                  alt=""
                  draggable={false}
                  className={slide.dir === 1 ? "lightbox__img-leave-left" : "lightbox__img-leave-right"}
                  onAnimationEnd={() => setSlide(null)}
                />
              )}
              <img
                key={`enter-${images[current]}`}
                src={images[current]}
                alt={`${title || "图片"} ${current + 1}`}
                draggable={false}
                className={
                  enterDir === 1
                    ? "lightbox__img-enter-right"
                    : enterDir === -1
                      ? "lightbox__img-enter-left"
                      : undefined
                }
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
                onClick={() => go(current - 1)}
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
                onClick={() => go(current + 1)}
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
                    onClick={() => go(i)}
                    aria-label={`查看第 ${i + 1} 张`}
                    aria-current={i === current ? "true" : "false"}
                  />
                ))}
              </div>
            )}
          </div>
          {/* 右侧参数面板：跟随当前图片显示对应参数 */}
          <aside className="lightbox__side">
            <CardMetaView
              data={metas && metas[current] ? metas[current] : null}
              index={multi ? current : undefined}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}