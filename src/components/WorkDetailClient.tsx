"use client";

import Link from "next/link";
import type { Work } from "@/lib/types";
import { typeLabel, typeClass, formatDate } from "@/lib/format";
import { getPerImageMetas } from "@/lib/types";
import CardMetaView from "@/components/CardMetaView";

export default function WorkDetailClient({ work }: { work: Work }) {
  const perImages = getPerImageMetas(work.metadata);
  const images = work.images.length > 0 ? work.images : [];
  const multi = images.length > 1;

  // 计算每张图对应的参数：
  // - 多图（metadata.per_image 结构）→ per_image[i]
  // - 单图 → 整个 metadata
  const metaForImage = (i: number): Record<string, unknown> | null => {
    if (multi) {
      return (perImages[i] as Record<string, unknown>) ?? null;
    }
    return (work.metadata as Record<string, unknown>) ?? null;
  };

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-[#0b0d10]/90 border-b border-[#262b36] px-6 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="text-lg font-bold text-[#e6edf3] hover:text-[#4c9fff] whitespace-nowrap"
        >
          ← AI 咒语图库
        </Link>
        <span className="text-sm text-[#aeb6c2] truncate">
          作品 {work.id}
        </span>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* 标题区：标题 + 作者时间 */}
        <div className="mb-6 flex items-start gap-3">
          <span className={typeClass(work.ai_type)} style={{ position: "static" }}>
            {typeLabel(work.ai_type)}
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[#e6edf3]">
              {work.title || work.id}
            </h1>
            <div className="text-sm text-[#aeb6c2] mt-1">
              {work.author_name} · {formatDate(work.create_date)}
              {multi && (
                <span className="ml-2 text-[#4c9fff]">
                  {images.length} 张图
                </span>
              )}
              {work.tags.length > 0 && (
                <span className="ml-2">
                  {work.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-block bg-[#151922] border border-[#262b36] rounded px-1.5 py-0.5 text-xs mr-1"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 多图 Grid：每张图一个卡片（图片 + 参数一体），参照 aitag.win */}
        {images.length > 0 ? (
          <div className="detail-images">
            {images.map((img, i) => (
              <div key={img} className="img-card">
                <img
                  src={img}
                  alt={`${work.title || work.id} ${i + 1}`}
                  loading="lazy"
                />
                <CardMetaView
                  data={metaForImage(i)}
                  index={multi ? i : undefined}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full aspect-square rounded-xl bg-[#151922] flex items-center justify-center text-[#aeb6c2]">
            无图片
          </div>
        )}
      </main>
    </div>
  );
}
