import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import type { UserRow } from "@/lib/db";

// 页面级登录保护：未登录跳 /login
// 返回当前用户供页面使用
export async function requireLogin(): Promise<UserRow> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export type { UserRow };
