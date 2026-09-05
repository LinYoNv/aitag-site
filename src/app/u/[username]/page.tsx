import { notFound } from "next/navigation";
import Link from "next/link";
import { getUserByUsername, getUserStats, listWorks, listBookmarkedWorks } from "@/lib/db";
import { requireLogin } from "@/lib/guard";
import UserPageClient from "@/components/UserPageClient";

export const dynamic = "force-dynamic";

export default async function UserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  // 登录拦截（主页需登录才能访问，返回值仅用于权限校验）
  await requireLogin();
  const user = getUserByUsername(username);
  if (!user) notFound();

  const stats = getUserStats(user.author_name || user.username);
  const works = listWorks({
    author: user.author_name || user.username,
    sort: "new",
    page: 1,
    page_size: 48,
  });
  // 收藏 Tab：展示该用户收藏的作品（公开，参照 Pixiv 收藏页）
  const bookmarked = listBookmarkedWorks(user.id, 1, 48);

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
