"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Props {
  username: string;
  isAdmin?: boolean;
  avatar?: string;
}

// 默认头像（内联 SVG：深色底 + 人形剪影），无需外网
function DefaultAvatar() {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
      <rect width="64" height="64" rx="32" fill="#1f2937" />
      <circle cx="32" cy="24" r="10" fill="#6b7280" />
      <path
        d="M14 54c0-9.9 8.1-16 18-16s18 6.1 18 16"
        fill="#6b7280"
      />
    </svg>
  );
}

export default function UserBadge({ username, isAdmin, avatar }: Props) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <div className="relative shrink-0 ml-auto" ref={ref}>
      {/* 头像按钮 */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-[#262b36] hover:border-[#4c9fff] transition-colors p-0.5 pr-1"
        aria-label="用户菜单"
      >
        <span className="w-8 h-8 rounded-full overflow-hidden">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={username} className="w-full h-full object-cover" />
          ) : (
            <DefaultAvatar />
          )}
        </span>
        {isAdmin && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3a2a1a] text-[#ffb45a] border border-[#5a4a2a] mr-0.5">
            管理员
          </span>
        )}
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-[#151922] border border-[#262b36] rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
          {/* 上半：用户信息 */}
          <div className="px-4 py-3 flex items-center gap-3 border-b border-[#262b36]">
            <span className="w-10 h-10 rounded-full overflow-hidden shrink-0">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt={username} className="w-full h-full object-cover" />
              ) : (
                <DefaultAvatar />
              )}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#e6edf3] truncate flex items-center gap-1.5">
                {username}
                {isAdmin && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3a2a1a] text-[#ffb45a] border border-[#5a4a2a] shrink-0">
                    管理员
                  </span>
                )}
              </div>
              <div className="text-xs text-[#aeb6c2]">
                {isAdmin ? "管理员" : "用户"}
              </div>
            </div>
          </div>

          {/* 菜单项 */}
          <div className="py-1.5">
            <Link
              href={`/u/${encodeURIComponent(username)}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-[#e6edf3] hover:bg-[#1c212b] transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#aeb6c2]">
                <path
                  fillRule="evenodd"
                  d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                  clipRule="evenodd"
                />
              </svg>
              我的主页
            </Link>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-[#e6edf3] hover:bg-[#1c212b] transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#aeb6c2]">
                <path
                  fillRule="evenodd"
                  d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                  clipRule="evenodd"
                />
              </svg>
              个人资料设置
            </Link>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-[#ff7a7a] hover:bg-[#1c212b] transition-colors disabled:opacity-50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path
                  fillRule="evenodd"
                  d="M3 4a1 1 0 011-1h7a1 1 0 010 2H5v10h6a1 1 0 110 2H4a1 1 0 01-1-1V4zm13.7 4.3a1 1 0 010 1.4l-2.5 2.5a1 1 0 01-1.4-1.4l.79-.8H10a1 1 0 110-2h3.59l-.8-.8a1 1 0 011.42-1.4l2.5 2.5z"
                  clipRule="evenodd"
                />
              </svg>
              {loggingOut ? "登出中…" : "登出"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
