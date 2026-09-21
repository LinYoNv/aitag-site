import { notFound } from "next/navigation";
import { getWorkById, getUserActionState } from "@/lib/db";
import { optionalUser } from "@/lib/guard";
import { isOwnAuthorName } from "@/lib/names";
import WorkDetailClient from "@/components/WorkDetailClient";

export const dynamic = "force-dynamic";

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 详情页对游客开放（只读）；canDelete 与点赞收藏都按「无 user」安全降级
  const user = await optionalUser();
  const work = getWorkById(id);
  if (!work) notFound();

  // 删除权限：管理员可删全部；作者只能删自己的（昵称或注册名命中即算本人）
  // 游客（user 为 null）一律 false
  const canDelete =
    !!user && (user.role === "admin" || isOwnAuthorName(work.author_name, user));

  // 当前用户对作品的点赞/收藏状态（游客无状态，按钮点了会引导去登录）
  const actionState = user
    ? getUserActionState(user.id, id)
    : { liked: false, bookmarked: false };

  return (
    <WorkDetailClient
      work={{ ...work, user_liked: actionState.liked, user_bookmarked: actionState.bookmarked }}
      canDelete={canDelete}
      isAdmin={user?.role === "admin"}
      isGuest={!user}
    />
  );
}
