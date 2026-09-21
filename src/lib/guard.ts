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

/**
 * 游客可访问的页面用它：已登录返回用户，未登录返回 null（**不跳转**）。
 *
 * 开放给游客的是「只读」页面：画廊、作品详情、用户主页。
 * 会写入数据或消耗额度的页面（生图台 / 上传 / 个人资料）仍走 requireLogin。
 *
 * ⚠️ 游客没有账号 = 没有个人偏好，所以 R18G 屏蔽必须按「推荐默认组」兜底，
 *    不能因为 viewer 为 null 就什么都不屏蔽 —— 那等于把重口内容直接摊给全网。
 *    各页面组装 blockedPosTags 时都要走 blockedTagsFor(viewer)。
 */
export async function optionalUser(): Promise<UserRow | null> {
  return currentUser();
}

export type { UserRow };
