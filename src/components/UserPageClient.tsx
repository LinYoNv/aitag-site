"use client";

import { useState } from "react";
import Link from "next/link";
import GalleryCard from "@/components/GalleryCard";
import type { PagedWorks } from "@/lib/types";

interface UserInfo {
  username: string;
  author_name: string;
  avatar?: string;
  role: string;
  create_date: string;
}

interface Props {
  user: UserInfo;
  stats: { work_count: number; total_likes: number; total_bookmarks: number; total_views: number };
  works: PagedWorks;
  bookmarked: PagedWorks;
  backLink?: React.ReactNode;
}

function DefaultAvatar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="32" fill="#1f2937" />
      <circle cx="32" cy="24" r="10" fill="#6b7280" />
      <path d="M14 54c0-9.9 8.1-16 18-16s18 6.1 18 16" fill="#6b7280" />
    </svg>
  );
}

export default function UserPageClient({ user, stats, works, bookmarked, backLink }: Props) {
  const [tab, setTab] = useState<"works" | "bookmarks">("works");
  const createDate = user.create_date ? new Date(user.create_date).toLocaleDateString("zh-CN") : "";

  const statItems: Array<{ label: string; value: number }> = [
    { label: "作品", value: stats.work_count },
    { label: "点赞", value: stats.total_likes },
    { label: "收藏", value: stats.total_bookmarks },
    { label: "浏览", value: stats.total_views },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 backdrop-blur bg-[#0b0d10]/90 border-b border-[#262b36] px-4 sm:px-6 py-2 sm:py-3 flex items-center gap-4">
        <Link href="/" className="text-base sm:text-lg font-bold text-[#e6edf3] hover:text-[#4c9fff] whitespace-nowrap">
          AI 咒语图库
        </Link>
        <span className="text-sm text-[#aeb6c2] truncate">{user.author_name || user.username} 的主页</span>
        <div className="ml-auto">{backLink}</div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* 资料卡（参照 Pixiv 用户主页顶部） */}
        <div className="bg-[#151922] border border-[#262b36] rounded-2xl p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* 头像 */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-[#262b36] shrink-0">
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <DefaultAvatar className="w-full h-full" />
              )}
            </div>
            {/* 用户名 + 简介 */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h1 className="text-2xl font-bold text-[#e6edf3] truncate">
                  {user.author_name || user.username}
                </h1>
                {user.role === "admin" && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-[#3a2a1a] text-[#ffb45a] border border-[#5a4a2a] shrink-0">
                    管理员
                  </span>
                )}
              </div>
              <div className="text-sm text-[#aeb6c2] mt-1.5">
                @{user.username}
              </div>
              <div className="text-sm text-[#aeb6c2] mt-3">
                加入于 {createDate}
              </div>
            </div>
          </div>

          {/* 统计行（参照 Pixiv 作品/收藏/关注数字） */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 mt-6 pt-5 border-t border-[#262b36]">
            {statItems.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-[#e6edf3]">
                  {s.value}
                </div>
                <div className="text-xs text-[#aeb6c2] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab 滑块：作品 | 收藏（参照 Pixiv） */}
        <div className="mb-4 flex items-center gap-6 border-b border-[#262b36]">
          <button
            onClick={() => setTab("works")}
            className={`relative pb-2.5 text-sm font-medium transition-colors ${
              tab === "works" ? "text-[#4c9fff]" : "text-[#aeb6c2] hover:text-[#e6edf3]"
            }`}
          >
            作品
            <span className="ml-1.5 text-xs text-[#5a6270]">{works.total}</span>
            {tab === "works" && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#4c9fff] rounded-full" />
            )}
          </button>
          <button
            onClick={() => setTab("bookmarks")}
            className={`relative pb-2.5 text-sm font-medium transition-colors ${
              tab === "bookmarks" ? "text-[#4c9fff]" : "text-[#aeb6c2] hover:text-[#e6edf3]"
            }`}
          >
            收藏
            <span className="ml-1.5 text-xs text-[#5a6270]">{bookmarked.total}</span>
            {tab === "bookmarks" && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#4c9fff] rounded-full" />
            )}
          </button>
        </div>

        {/* 作品网格 */}
        {tab === "works" ? (
          works.items.length > 0 ? (
            <div className="gallery-grid">
              {works.items.map((w) => (
                <GalleryCard key={w.id} work={w} />
              ))}
            </div>
          ) : (
            <div className="text-center text-[#aeb6c2] py-16">还没有上传作品</div>
          )
        ) : bookmarked.items.length > 0 ? (
          <div className="gallery-grid">
            {bookmarked.items.map((w) => (
              <GalleryCard key={w.id} work={w} />
            ))}
          </div>
        ) : (
          <div className="text-center text-[#aeb6c2] py-16">还没有收藏作品</div>
        )}
      </main>
    </div>
  );
}
