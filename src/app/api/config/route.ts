import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    site_name: "AI 咒语图库",
    image_prefix: "",
    languages: ["zh-CN", "en"],
    default_language: "zh-CN",
    upload_enabled: true,
  });
}
