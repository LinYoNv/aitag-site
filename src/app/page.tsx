import GalleryPage from "@/components/GalleryPage";
import { optionalUser } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function Home() {
  // 画廊对游客开放（只读）；生图台/上传/个人资料仍需登录
  const user = await optionalUser();
  return (
    <GalleryPage
      user={
        user
          ? {
              username: user.username,
              role: user.role,
              author_name: user.author_name,
              avatar: user.avatar,
            }
          : null
      }
    />
  );
}
