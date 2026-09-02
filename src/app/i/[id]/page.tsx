import { notFound } from "next/navigation";
import { getWorkById } from "@/lib/db";
import WorkDetailClient from "@/components/WorkDetailClient";

export const dynamic = "force-dynamic";

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const work = getWorkById(id);
  if (!work) notFound();
  return <WorkDetailClient work={work} />;
}
