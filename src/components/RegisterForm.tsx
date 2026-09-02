"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("两次密码不一致");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setDone(true);
      } else {
        setError(data.error ?? "注册失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0b0d10" }}>
        <div className="w-full max-w-sm mx-4 bg-[#151922] border border-[#262b36] rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-lg font-bold text-[#e6edf3] mb-2">注册成功</h1>
          <p className="text-sm text-[#aeb6c2] mb-6">
            现在去登录吧！
          </p>
          <Link
            href="/login"
            className="block w-full bg-[#4c9fff] text-white font-semibold py-2.5 rounded-lg text-center hover:opacity-90"
          >
            去登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0b0d10" }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm mx-4 bg-[#151922] border border-[#262b36] rounded-2xl p-8"
      >
        <h1 className="text-xl font-bold text-[#e6edf3] mb-1 text-center">
          注册账号
        </h1>
        <p className="text-sm text-[#aeb6c2] mb-6 text-center">
          注册后上传的作品归属你的账号，可删除自己上传的图
        </p>

        <div className="mb-4">
          <label className="block text-sm text-[#e6edf3] mb-1">用户名</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#4c9fff]"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-[#e6edf3] mb-1">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#4c9fff]"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-[#e6edf3] mb-1">确认密码</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-[#0f1218] border border-[#262b36] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#4c9fff]"
          />
        </div>

        {error && (
          <div className="mb-4 bg-[#2a1a1a] border border-[#5a2a2a] rounded-lg px-3 py-2 text-sm text-[#ff7a7a]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#4c9fff] text-white font-semibold py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "注册中…" : "注册"}
        </button>

        <div className="mt-4 text-center text-sm text-[#aeb6c2]">
          已有账号？
          <Link href="/login" className="text-[#4c9fff] hover:underline ml-1">
            去登录
          </Link>
        </div>
      </form>
    </div>
  );
}
