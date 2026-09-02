import { NextRequest, NextResponse } from "next/server";
import { listWorks } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const prompt = sp.get("prompt") ?? undefined;
  const sort = (sp.get("sort") as "new" | "monthly" | null) ?? undefined;
  const time_range = sp.get("time_range") ?? undefined;
  const page = Number(sp.get("page") ?? "1");
  const page_size = Number(sp.get("page_size") ?? "24");

  const result = listWorks({
    q: q || undefined,
    prompt: prompt || undefined,
    sort: sort === "monthly" ? "monthly" : "new",
    time_range: time_range || undefined,
    page: Number.isFinite(page) ? page : 1,
    page_size: Number.isFinite(page_size) ? page_size : 24,
  });

  return NextResponse.json(result);
}
