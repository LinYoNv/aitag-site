import UploadPageClient from "@/components/UploadPageClient";
import { requireLogin } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await requireLogin();
  return (
    <UploadPageClient
      user={{
        username: user.username,
        role: user.role,
        author_name: user.author_name,
      }}
    />
  );
}
