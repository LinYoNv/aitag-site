import { notFound } from "next/navigation";
import { getWorkById, getUserActionState } from "@/lib/db";
import { requireLogin } from "@/lib/guard";
import WorkDetailClient from "@/components/WorkDetailClient";

export const dynamic = "force-dynamic";

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireLogin();
  const work = getWorkById(id);
  if (!work) notFound();

  // 删除权限：管理员可删全部；作者只能删自己的（按用户名匹配）
  const canDelete = user.role === "admin" || work.author_name === user.username;

  // 当前用户对作品的点赞/收藏状态
  const actionState = getUserActionState(user.id, id);

  return (
    <WorkDetailClient
      work={{ ...work, user_liked: actionState.liked, user_bookmarked: actionState.bookmarked }}
      canDelete={canDelete}
      isAdmin={user.role === "admin"}
    />
  );
}
