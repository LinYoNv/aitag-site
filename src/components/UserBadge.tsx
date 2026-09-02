"use client";

import { useState } from "react";

interface Props {
  username: string;
  isAdmin?: boolean;
}

export default function UserBadge({ username, isAdmin }: Props) {
  const [loggingOut, setLoggingOut] = useState(false);

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
    <div className="flex items-center gap-2 shrink-0">
      {isAdmin && (
        <span className="text-[11px] px-2 py-0.5 rounded bg-[#3a2a1a] text-[#ffb45a] border border-[#5a4a2a]">
          管理员
        </span>
      )}
      <span className="text-sm text-[#e6edf3]">{username}</span>
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="text-xs text-[#aeb6c2] hover:text-[#ff7a7a] px-2 py-1 rounded hover:bg-[#2a1a1a] border border-transparent hover:border-[#5a2a2a] disabled:opacity-50"
      >
        {loggingOut ? "…" : "登出"}
      </button>
    </div>
  );
}
