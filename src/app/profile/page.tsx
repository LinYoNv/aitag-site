import { requireLogin } from "@/lib/guard";
import ProfileClient from "@/components/ProfileClient";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireLogin();
  return (
    <ProfileClient
      user={{
        username: user.username,
        role: user.role,
        author_name: user.author_name,
        avatar: user.avatar,
        create_date: user.create_date,
      }}
    />
  );
}
