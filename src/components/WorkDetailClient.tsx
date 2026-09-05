"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Work } from "@/lib/types";
import { typeLabel, typeClass, formatDate } from "@/lib/format";
import { getPerImageMetas } from "@/lib/types";
import CardMetaView from "@/components/CardMetaView";

interface Props {
  work: Work;
  canDelete?: boolean;
  isAdmin?: boolean;
}

export default function WorkDetailClient({ work, canDelete, isAdmin }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");
  const [liked, setLiked] = useState(work.user_liked ?? false);
  const [bookmarked, setBookmarked] = useState(work.user_bookmarked ?? false);
  const [likes, setLikes] = useState(work.total_likes ?? 0);
  const [bookmarks, setBookmarks] = useState(work.total_bookmarks ?? 0);
  const [views, setViews] = useState(work.total_view ?? 0);
  const [actionMsg, setActionMsg] = useState("");
  const perImages = getPerImageMetas(work.metadata);
  const images = work.images.length > 0 ? work.images : [];
  const multi = images.length > 1;

  // 打开详情页计一次浏览量
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/works/${work.id}/view`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok) setViews(d.total_view);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [work.id]);

  // 点赞 / 收藏 toggle
  const handleAction = useCallback(
    async (action: "like" | "bookmark") => {
      setActionMsg("");
      const isActive = action === "like" ? liked : bookmarked;
      // 乐观更新
      if (action === "like") {
        setLiked(!isActive);
        setLikes((v) => v + (isActive ? -1 : 1));
      } else {
        setBookmarked(!isActive);
        setBookmarks((v) => v + (isActive ? -1 : 1));
      }
      try {
        const res = await fetch(`/api/works/${work.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = (await res.json()) as { ok?: boolean; active?: boolean; count?: number; error?: string };
        if (res.ok && data.ok) {
          if (action === "like") {
            setLiked(!!data.active);
            setLikes(data.count ?? 0);
          } else {
            setBookmarked(!!data.active);
            setBookmarks(data.count ?? 0);
          }
        } else {
          // 回滚
          if (action === "like") {
            setLiked(isActive);
            setLikes((v) => v - (isActive ? -1 : 1));
          } else {
            setBookmarked(isActive);
            setBookmarks((v) => v - (isActive ? -1 : 1));
          }
          setActionMsg(data.error ?? "操作失败，请先登录");
        }
      } catch {
        // 回滚
        if (action === "like") {
          setLiked(isActive);
          setLikes((v) => v - (isActive ? -1 : 1));
        } else {
          setBookmarked(isActive);
          setBookmarks((v) => v - (isActive ? -1 : 1));
        }
        setActionMsg("网络错误");
      }
    },
    [work.id, liked, bookmarked],
  );

  async function handleDelete() {
    if (!window.confirm("确定删除这个作品吗？此操作不可恢复。")) return;
    setDeleting(true);
    setDeleteMsg("");
    try {
      const res = await fetch(`/api/works/${work.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        window.location.href = "/";
      } else {
        setDeleteMsg(data.error ?? "删除失败");
        setDeleting(false);
      }
    } catch {
      setDeleteMsg("网络错误");
      setDeleting(false);
    }
  }

  // 计算每张图对应的参数：
  // - 多图（metadata.per_image 结构）→ per_image[i]
  // - 单图 → 整个 metadata
  const metaForImage = (i: number): Record<string, unknown> | null => {
    if (multi) {
      return (perImages[i] as Record<string, unknown>) ?? null;
    }
    return (work.metadata as Record<string, unknown>) ?? null;
  };

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-[#0b0d10]/90 border-b border-[#262b36] px-4 sm:px-6 py-2 sm:py-3 flex items-center gap-3">
        <Link
          href="/"
          className="text-base sm:text-lg font-bold text-[#e6edf3] hover:text-[#4c9fff] whitespace-nowrap"
        >
          ← AI 咒语图库
        </Link>
        <span className="text-sm text-[#aeb6c2] truncate">
          作品 {work.id}
        </span>
        {isAdmin && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-[#3a2a1a] text-[#ffb45a] border border-[#5a4a2a] shrink-0">
            管理员
          </span>
        )}
        {canDelete && (
          <>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto text-sm px-4 py-1.5 rounded-lg bg-[#2a1a1a] border border-[#5a2a2a] text-[#ff7a7a] hover:bg-[#3a1a1a] disabled:opacity-50 shrink-0"
            >
              {deleting ? "删除中…" : "删除作品"}
            </button>
            {deleteMsg && (
              <span className="text-xs text-[#ff7a7a]">{deleteMsg}</span>
            )}
          </>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* 标题区：标题 + 作者时间 */}
        <div className="mb-4 flex items-start gap-3">
          <span className={typeClass(work.ai_type)} style={{ position: "static" }}>
            {typeLabel(work.ai_type)}
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[#e6edf3]">
              {work.title || work.id}
            </h1>
            <div className="text-sm text-[#aeb6c2] mt-1">
              <Link
                href={`/u/${encodeURIComponent(work.author_name)}`}
                className="hover:text-[#4c9fff]"
              >
                {work.author_name}
              </Link>
              {" · "}{formatDate(work.create_date)}
              {multi && (
                <span className="ml-2 text-[#4c9fff]">
                  {images.length} 张图
                </span>
              )}
              {work.tags.length > 0 && (
                <span className="ml-2">
                  {work.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-block bg-[#151922] border border-[#262b36] rounded px-1.5 py-0.5 text-xs mr-1"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 操作条：浏览量 + 点赞 + 收藏（小图标，参照 aitag.win） */}
        <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
          <span
            className="inline-flex items-center gap-1.5 text-sm text-[#aeb6c2] px-3 py-1.5 rounded-lg bg-[#151922] border border-[#262b36]"
            title="浏览量"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {views}
          </span>
          <button
            onClick={() => handleAction("like")}
            title={liked ? "取消点赞" : "点赞"}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              liked
                ? "bg-[#1a2a3a] border-[#4c9fff] text-[#4c9fff]"
                : "bg-[#151922] border-[#262b36] text-[#aeb6c2] hover:border-[#4c9fff]"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
            {likes}
          </button>
          <button
            onClick={() => handleAction("bookmark")}
            title={bookmarked ? "取消收藏" : "收藏"}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              bookmarked
                ? "bg-[#3a2a1a] border-[#ffb45a] text-[#ffb45a]"
                : "bg-[#151922] border-[#262b36] text-[#aeb6c2] hover:border-[#ffb45a]"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {bookmarks}
          </button>
          {actionMsg && (
            <span className="text-xs text-[#ff7a7a]">{actionMsg}</span>
          )}
        </div>

        {/* 图片区：单图放大显示，多图一排最多三张（参照 aitag.win） */}
        {images.length > 0 ? (
          <div className={`detail-images ${multi ? "" : "single"}`}>
            {images.map((img, i) => (
              <div key={img} className="img-card">
                <img
                  src={img}
                  alt={`${work.title || work.id} ${i + 1}`}
                  loading="lazy"
                />
                <CardMetaView
                  data={metaForImage(i)}
                  index={multi ? i : undefined}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full aspect-square rounded-xl bg-[#151922] flex items-center justify-center text-[#aeb6c2]">
            无图片
          </div>
        )}
      </main>
    </div>
  );
}
