"use client";

import { useState } from "react";
import Link from "next/link";
import type { Work } from "@/lib/types";
import { typeLabel, typeClass, formatDate } from "@/lib/format";
import { getPerImageMetas } from "@/lib/types";
import MetadataView from "@/components/MetadataView";

export default function WorkDetailClient({ work }: { work: Work }) {
  const [current, setCurrent] = useState(0);
  const perImages = getPerImageMetas(work.metadata);
  const images = work.images.length > 0 ? work.images : [];
  const multi = images.length > 1;

  // 当前选中图片的参数（多图时 per_image 对应项；单图时整个 metadata）
  const currentMeta = multi ? (perImages[current] ?? null) : null;

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

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* 标题区：标题 + 作者时间 */}
        <div className="mb-4 flex items-start gap-3">
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

        {/* 图片 + 元数据 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 图片区 */}
          <div>
            {images.length > 0 ? (
              <>
                <img
                  src={images[current]}
                  alt={`${work.title || work.id} ${current + 1}`}
                  className="w-full rounded-xl border border-[#262b36]"
                />
                {multi && (
                  <>
                    {/* 缩略图切换 */}
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                      {images.map((img, i) => (
                        <button
                          key={img}
                          onClick={() => setCurrent(i)}
                          className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border transition-colors ${
                            i === current
                              ? "border-[#4c9fff] ring-2 ring-[#4c9fff]/40"
                              : "border-[#262b36] hover:border-[#4c9fff]"
                          }`}
                        >
                          <img
                            src={img}
                            alt={`${work.title} ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-[#5a6270] mt-1">
                      {current + 1} / {images.length}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="w-full aspect-square rounded-xl bg-[#151922] flex items-center justify-center text-[#aeb6c2]">
                无图片
              </div>
            )}
          </div>

          {/* 元数据区：多图时展示当前图参数 */}
          <div>
            <MetadataView
              metadata={work.metadata}
              perImage={currentMeta as Record<string, unknown> | null}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
