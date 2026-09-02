import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import RegisterForm from "@/components/RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await currentUser();
  if (user) redirect("/");
  return <RegisterForm />;
}
