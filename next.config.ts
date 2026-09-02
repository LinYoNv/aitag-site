import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // 站点图片全部走 public 静态路径，不用 next/image 优化
    unoptimized: true,
  },
  // SQLite 数据文件在运行时生成，构建时不碰
  serverExternalPackages: [],
};

export default nextConfig;
