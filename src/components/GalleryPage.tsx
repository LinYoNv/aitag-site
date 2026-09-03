"use client";

import { useEffect, useState, useCallback } from "react";
import GalleryCard from "@/components/GalleryCard";
import UserBadge from "@/components/UserBadge";
import type { PagedWorks } from "@/lib/types";

interface UserInfo {
  username: string;
  role: string;
  author_name: string;
  avatar?: string;
}

export default function GalleryPage({ user }: { user: UserInfo }) {
  const [q, setQ] = useState("");
  const [input, setInput] = useState("");
  const [sort, setSort] = useState<"new" | "monthly">("new");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PagedWorks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("page_size", "24");
      const res = await fetch(`/api/works?${params.toString()}`);
      if (!res.ok) throw new Error("请求失败");
      setData((await res.json()) as PagedWorks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [q, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-[#0b0d10]/90 border-b border-[#262b36] px-4 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-base sm:text-lg font-bold text-[#e6edf3] whitespace-nowrap">
          AI 咒语图库
        </h1>
        <form
          className="flex-1 flex gap-2 max-w-xl max-sm:order-[100] max-sm:basis-full"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input.trim());
            setPage(1);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="搜索 作品ID/作者/标签/参数…"
            className="flex-1 min-w-0 bg-[#151922] border border-[#262b36] rounded-lg px-3 py-1.5 text-sm text-[#e6edf3] placeholder-[#5a6270] outline-none focus:border-[#4c9fff]"
          />
          <button
            type="submit"
            className="bg-[#4c9fff] text-white text-sm px-4 py-1.5 rounded-lg hover:opacity-90"
          >
            搜索
          </button>
        </form>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as "new" | "monthly");
            setPage(1);
          }}
          className="bg-[#151922] border border-[#262b36] rounded-lg px-2 py-1.5 text-sm text-[#e6edf3] max-sm:text-xs"
        >
          <option value="new">最新</option>
          <option value="monthly">月榜</option>
        </select>
        <a
          href="/upload"
          className="bg-[#151922] border border-[#262b36] text-[#e6edf3] text-sm max-sm:text-xs px-3 sm:px-4 py-1.5 rounded-lg hover:border-[#4c9fff] whitespace-nowrap"
        >
          + 上传
        </a>
        <UserBadge
          username={user.username}
          isAdmin={user.role === "admin"}
          avatar={user.avatar}
        />
      </header>

      <main className="py-4">
        {error && (
          <div className="px-6 py-2 text-sm text-red-400">{error}</div>
        )}
        {loading && !data && (
          <div className="px-6 py-10 text-center text-[#aeb6c2]">加载中…</div>
        )}
        {data && data.items.length === 0 && (
          <div className="px-6 py-10 text-center text-[#aeb6c2]">
            没有找到作品
          </div>
        )}
        {data && data.items.length > 0 && (
          <>
            <div className="gallery-grid">
              {data.items.map((w) => (
                <GalleryCard key={w.id} work={w} />
              ))}
            </div>
            {/* 分页 */}
            {data.total_pages > 1 && (
              <div className="flex items-center justify-center gap-3 py-6">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-lg bg-[#151922] border border-[#262b36] text-sm disabled:opacity-40 hover:border-[#4c9fff]"
                >
                  上一页
                </button>
                <span className="text-sm text-[#aeb6c2]">
                  {page} / {data.total_pages}（共 {data.total} 件）
                </span>
                <button
                  disabled={page >= data.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg bg-[#151922] border border-[#262b36] text-sm disabled:opacity-40 hover:border-[#4c9fff]"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
