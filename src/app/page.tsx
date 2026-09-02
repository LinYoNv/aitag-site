import GalleryPage from "@/components/GalleryPage";
import { requireLogin } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireLogin();
  return (
    <GalleryPage
      user={{
        username: user.username,
        role: user.role,
        author_name: user.author_name,
      }}
    />
  );
}
