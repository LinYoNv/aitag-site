import { notFound } from "next/navigation";
import Link from "next/link";
import { getUserByHandle, getUserStats, listWorks, listBookmarkedWorks, getUserPref } from "@/lib/db";
import { requireLogin } from "@/lib/guard";
import { currentUser } from "@/lib/auth";
import { expandHiddenTags, defaultHiddenTags } from "@/lib/r18g-tags";
import UserPageClient from "@/components/UserPageClient";

export const dynamic = "force-dynamic";

export default async function UserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  // Next 路由对中文路径参数可能不自动解码（/u/空雨 → %E7%A9%BA%E9%9B%A8），
  // 这里统一解码：已解码的中文 decodeURIComponent 原样返回，不会抛错
  let username = rawUsername;
  try {
    username = decodeURIComponent(rawUsername);
  } catch {
    // 保持原值
  }
  // 登录拦截（主页需登录才能访问，返回值仅用于权限校验）
  await requireLogin();

  // 当前浏览者（用于 R18G 屏蔽：用户主页作品/收藏列表也遵循浏览者偏好）
  const viewer = await currentUser();
  const pref = viewer ? getUserPref(viewer.id) : null;
  let blockedPosTags: string[] = [];
  if (pref?.enabled) {
    const hasSelection = pref.selected.length > 0 || pref.custom.length > 0;
    blockedPosTags = hasSelection
      ? expandHiddenTags(pref.selected, pref.custom)
      : defaultHiddenTags();
  }

  // 按句柄解析：用户名或昵称都能打开（详情页的作者链接用的是作品作者名=昵称）
  const user = getUserByHandle(username);
  if (!user) notFound();

  // 作者名别名集合（昵称 + 登录名）：改过昵称的账号，历史作品的 author_name
  // 可能是旧昵称或注册名，主页作品与统计必须两者都算
  const authorNames = Array.from(
    new Set([user.author_name || user.username, user.username]),
  );

  const stats = getUserStats(authorNames);
  const works = listWorks({
    author_in: authorNames,
    sort: "new",
    page: 1,
    page_size: 48,
    blocked_pos_tags: blockedPosTags,
  });
  // 收藏 Tab：展示该用户收藏的作品（公开，参照 Pixiv 收藏页）
  const bookmarked = listBookmarkedWorks(user.id, 1, 48, blockedPosTags);

  return (
    <UserPageClient
      user={{
        username: user.username,
        author_name: user.author_name,
        avatar: user.avatar,
        role: user.role,
        create_date: user.create_date,
      }}
      stats={stats}
      works={works}
      bookmarked={bookmarked}
      backLink={
        <Link
          href="/"
          className="text-sm text-[#aeb6c2] hover:text-[#4c9fff]"
        >
          ← 返回图库
        </Link>
      }
    />
  );
}
