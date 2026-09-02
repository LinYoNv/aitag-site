import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 咒语图库",
  description: "AI 绘画作品与 Prompt 咒语检索图库",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
