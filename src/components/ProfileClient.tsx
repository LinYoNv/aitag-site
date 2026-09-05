"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import UserBadge from "@/components/UserBadge";

interface Props {
  user: {
    username: string;
    role: string;
    author_name: string;
    avatar?: string;
    create_date: string;
  };
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

export default function ProfileClient({ user }: Props) {
  const [avatar, setAvatar] = useState(user.avatar ?? "");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // API Token
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenMsg, setTokenMsg] = useState("");

  // 挂载时查询是否已有 token（不返回明文，仅判断状态）
  useEffect(() => {
    fetch("/api/me/token")
      .then((r) => r.json())
      .then((d) => {
        if (d?.hasToken) {
          setHasToken(true);
          setTokenMsg("（Token 已启用，明文只在生成时显示一次）");
        }
      })
      .catch(() => {});
  }, []);

  const handleRegenerateToken = useCallback(async () => {
    setTokenLoading(true);
    setTokenMsg("");
    try {
      const res = await fetch("/api/me/token", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (res.ok && data.ok && data.token) {
        setToken(data.token);
        setHasToken(true);
        setTokenMsg("✓ 已生成，请立即复制保存");
      } else {
        setTokenMsg(data.error ?? "生成失败");
      }
    } catch {
      setTokenMsg("网络错误");
    } finally {
      setTokenLoading(false);
    }
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/me/avatar", { method: "POST", body: fd });
      const data = (await res.json()) as { ok?: boolean; avatar?: string; error?: string };
      if (res.ok && data.ok && data.avatar) {
        setAvatar(data.avatar);
        setMsg({ ok: true, text: "头像已更新" });
      } else {
        setMsg({ ok: false, text: data.error ?? "上传失败" });
      }
    } catch {
      setMsg({ ok: false, text: "网络错误" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const createDate = user.create_date ? new Date(user.create_date).toLocaleDateString("zh-CN") : "";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 backdrop-blur bg-[#0b0d10]/90 border-b border-[#262b36] px-4 sm:px-6 py-2 sm:py-3 flex items-center gap-4">
        <Link href="/" className="text-base sm:text-lg font-bold text-[#e6edf3] whitespace-nowrap hover:text-[#4c9fff]">
          AI 咒语图库
        </Link>
        <span className="text-sm text-[#aeb6c2]">个人资料</span>
        <div className="ml-auto">
          <UserBadge
            username={user.username}
            isAdmin={user.role === "admin"}
            avatar={avatar}
          />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="bg-[#151922] border border-[#262b36] rounded-2xl p-5 sm:p-8">
          {/* 头像 */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#262b36] mb-3">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <DefaultAvatar className="w-full h-full" />
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-sm bg-[#151922] border border-[#262b36] text-[#e6edf3] px-4 py-1.5 rounded-lg hover:border-[#4c9fff] disabled:opacity-50"
            >
              {uploading ? "上传中…" : "更换头像"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFile}
            />
            {msg && (
              <p className={`mt-2 text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
                {msg.text}
              </p>
            )}
          </div>

          {/* 信息 */}
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-[#262b36] pb-3">
              <dt className="text-[#aeb6c2]">用户名</dt>
              <dd className="text-[#e6edf3]">{user.username}</dd>
            </div>
            <div className="flex justify-between border-b border-[#262b36] pb-3">
              <dt className="text-[#aeb6c2]">角色</dt>
              <dd className="text-[#e6edf3]">
                {user.role === "admin" ? (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-[#3a2a1a] text-[#ffb45a] border border-[#5a4a2a]">
                    管理员
                  </span>
                ) : (
                  "用户"
                )}
              </dd>
            </div>
            <div className="flex justify-between border-b border-[#262b36] pb-3">
              <dt className="text-[#aeb6c2]">昵称</dt>
              <dd className="text-[#e6edf3]">{user.author_name || user.username}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#aeb6c2]">注册时间</dt>
              <dd className="text-[#e6edf3]">{createDate}</dd>
            </div>
          </dl>

          {/* API Token（供外部插件上传鉴权，仅本人可见） */}
          <div className="mt-6 pt-5 border-t border-[#262b36]">
            <div className="text-sm font-semibold text-[#e6edf3] mb-1">
              API Token
            </div>
            <p className="text-xs text-[#5a6270] mb-3">
              用于外部插件通过接口上传作品时标识你的账号。Token 只显示一次，请立即复制保存；重新生成后旧 Token 立即失效。
            </p>
            {token ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-xs text-[#4c9fff] font-mono break-all">
                    {token}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard
                        .writeText(token)
                        .then(() => setTokenMsg("✓ 已复制"))
                        .catch(() => setTokenMsg("复制失败"));
                      setTimeout(() => setTokenMsg(""), 1500);
                    }}
                    className="shrink-0 text-sm px-3 py-2 rounded-lg bg-[#151922] border border-[#262b36] text-[#e6edf3] hover:border-[#4c9fff]"
                  >
                    复制
                  </button>
                </div>
                {tokenMsg && (
                  <p className="text-xs text-green-400">{tokenMsg}</p>
                )}
                <button
                  onClick={handleRegenerateToken}
                  disabled={tokenLoading}
                  className="text-xs bg-[#2a1a1a] border border-[#5a2a2a] text-[#ff7a7a] px-3 py-1.5 rounded-lg hover:bg-[#3a1a1a] disabled:opacity-50"
                >
                  {tokenLoading ? "生成中…" : "重新生成（旧 Token 立即失效）"}
                </button>
              </div>
            ) : (
              <button
                onClick={handleRegenerateToken}
                disabled={tokenLoading}
                className="text-sm bg-[#4c9fff] text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {tokenLoading ? "生成中…" : hasToken ? "重新生成（旧 Token 立即失效）" : "生成 Token"}
              </button>
            )}
            {!token && tokenMsg && (
              <p className="text-xs text-[#5a6270] mt-2">{tokenMsg}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
