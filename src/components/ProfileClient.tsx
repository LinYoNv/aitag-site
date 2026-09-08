"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import UserBadge from "@/components/UserBadge";
import DefaultAvatar from "@/components/DefaultAvatar";
import R18gPickerModal from "@/components/R18gPickerModal";
import type { R18GPref } from "@/lib/r18g-tags";

interface Props {
  user: {
    username: string;
    role: string;
    author_name: string;
    avatar?: string;
    create_date: string;
  };
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
  // 修改密码
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  // R18G 屏蔽偏好
  const [r18gEnabled, setR18gEnabled] = useState(false);
  const [r18gSelected, setR18gSelected] = useState<string[]>([]);
  const [r18gCustom, setR18gCustom] = useState<string[]>([]);
  const [r18gLoaded, setR18gLoaded] = useState(false);
  const [r18gMsg, setR18gMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [r18gSaving, setR18gSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  // 挂载时加载 R18G 屏蔽偏好
  useEffect(() => {
    fetch("/api/me/pref")
      .then((r) => r.json())
      .then((d) => {
        if (d?.pref) {
          const p = d.pref as R18GPref;
          setR18gEnabled(p.enabled === true);
          setR18gSelected(Array.isArray(p.selected) ? p.selected : []);
          setR18gCustom(Array.isArray(p.custom) ? p.custom : []);
        }
      })
      .catch(() => {})
      .finally(() => setR18gLoaded(true));
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

  // 修改密码
  const handleChangePassword = useCallback(async () => {
    if (!oldPw || !newPw) {
      setPwMsg({ ok: false, text: "请填写旧密码和新密码" });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ ok: false, text: "新密码至少 8 位" });
      return;
    }
    if (newPw !== newPw2) {
      setPwMsg({ ok: false, text: "两次输入的新密码不一致" });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setPwMsg({ ok: true, text: "✓ 密码已修改" });
        setOldPw("");
        setNewPw("");
        setNewPw2("");
      } else {
        setPwMsg({ ok: false, text: data.error ?? "修改失败" });
      }
    } catch {
      setPwMsg({ ok: false, text: "网络错误" });
    } finally {
      setPwLoading(false);
    }
  }, [oldPw, newPw, newPw2]);

  // R18G 偏好：保存到后端
  const saveR18GPref = useCallback(
    async (next: R18GPref) => {
      setR18gSaving(true);
      setR18gMsg(null);
      try {
        const res = await fetch("/api/me/pref", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pref: next }),
        });
        const data = (await res.json()) as { ok?: boolean; pref?: R18GPref; error?: string };
        if (res.ok && data.ok && data.pref) {
          setR18gEnabled(data.pref.enabled === true);
          setR18gSelected(data.pref.selected ?? []);
          setR18gCustom(data.pref.custom ?? []);
          setR18gMsg({ ok: true, text: "✓ 已保存" });
        } else {
          setR18gMsg({ ok: false, text: data.error ?? "保存失败" });
        }
      } catch {
        setR18gMsg({ ok: false, text: "网络错误" });
      } finally {
        setR18gSaving(false);
      }
    },
    [],
  );

  const toggleR18g = useCallback(
    (on: boolean) => {
      saveR18GPref({
        enabled: on,
        selected: r18gSelected,
        custom: r18gCustom,
      });
    },
    [saveR18GPref, r18gSelected, r18gCustom],
  );

  const handlePickerSave = useCallback(
    (selected: string[], custom: string[]) => {
      setPickerOpen(false);
      saveR18GPref({ enabled: r18gEnabled, selected, custom });
    },
    [saveR18GPref, r18gEnabled],
  );

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

          {/* 修改密码 */}
          <div className="mt-6 pt-5 border-t border-[#262b36]">
            <div className="text-sm font-semibold text-[#e6edf3] mb-1">
              修改密码
            </div>
            <p className="text-xs text-[#5a6270] mb-4">
              修改后需用新密码重新登录，其他已登录会话不受影响。
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleChangePassword();
              }}
            >
              <div>
                <label htmlFor="old-pw" className="block text-xs text-[#aeb6c2] mb-1">
                  当前密码
                </label>
                <input
                  id="old-pw"
                  type="password"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                  autoComplete="current-password"
                  className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#5a6270] outline-none focus:border-[#4c9fff]"
                />
              </div>
              <div>
                <label htmlFor="new-pw" className="block text-xs text-[#aeb6c2] mb-1">
                  新密码 <span className="text-[#5a6270]">（至少 8 位）</span>
                </label>
                <input
                  id="new-pw"
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#5a6270] outline-none focus:border-[#4c9fff]"
                />
              </div>
              <div>
                <label htmlFor="new-pw2" className="block text-xs text-[#aeb6c2] mb-1">
                  确认新密码
                </label>
                <input
                  id="new-pw2"
                  type="password"
                  value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)}
                  autoComplete="new-password"
                  className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#5a6270] outline-none focus:border-[#4c9fff]"
                />
              </div>
              {pwMsg && (
                <p className={`text-xs ${pwMsg.ok ? "text-green-400" : "text-red-400"}`}>
                  {pwMsg.text}
                </p>
              )}
              <button
                type="submit"
                disabled={pwLoading}
                className="text-sm bg-[#4c9fff] text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {pwLoading ? "提交中…" : "修改密码"}
              </button>
            </form>
          </div>

          {/* R18G 内容屏蔽 */}
          <div className="mt-6 pt-5 border-t border-[#262b36]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#e6edf3]">
                  R18G 内容屏蔽
                </div>
                <p className="text-xs text-[#5a6270] mt-0.5">
                  开启后，正向提示词中含所选 tag 的作品会在图库、个人主页、收藏中自动隐藏。
                </p>
              </div>
              <button
                role="switch"
                aria-checked={r18gEnabled}
                aria-label="R18G 内容屏蔽开关"
                disabled={!r18gLoaded || r18gSaving}
                onClick={() => toggleR18g(!r18gEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                  r18gEnabled ? "bg-[#4c9fff]" : "bg-[#262b36]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    r18gEnabled ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPickerOpen(true)}
                disabled={!r18gLoaded}
                className="text-xs bg-[#151922] border border-[#262b36] text-[#e6edf3] px-3 py-1.5 rounded-lg hover:border-[#4c9fff] disabled:opacity-50"
              >
                管理屏蔽词
              </button>
              <span className="text-xs text-[#5a6270]">
                {r18gSelected.length > 0 || r18gCustom.length > 0
                  ? `已选 ${r18gSelected.length} 个预置词${r18gCustom.length > 0 ? ` + ${r18gCustom.length} 个自定义` : ""}`
                  : "未选择，开启后默认屏蔽粪便类与纯兽人内容"}
              </span>
            </div>
            {r18gMsg && (
              <p className={`text-xs mt-2 ${r18gMsg.ok ? "text-green-400" : "text-red-400"}`}>
                {r18gMsg.text}
              </p>
            )}
          </div>
        </div>
      </main>

      <R18gPickerModal
        open={pickerOpen}
        selected={r18gSelected}
        custom={r18gCustom}
        onClose={() => setPickerOpen(false)}
        onSave={handlePickerSave}
      />
    </div>
  );
}
