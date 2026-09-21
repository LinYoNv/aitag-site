import { requireLogin } from "@/lib/guard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "生图台 · AI 咒语图库",
};

/**
 * 生图台入口页：服务端登录门控后全屏加载 public/studio/ 面板。
 * 面板为独立静态页（移植自 nai_image test-panel），通过 session cookie
 * 调用 /api/studio/*（同源自动带 cookie）；未登录由 /api 401 兜底跳 /login。
 */
export default async function StudioPage() {
  await requireLogin();
  return (
    <iframe
      src="/studio/index.html?v=1.4.0"
      title="生图台"
      className="studio-frame"
      allow="clipboard-write"
    />
  );
}
