import Link from "next/link";
import type { WorkListItem } from "@/lib/types";
import { typeLabel, typeClass, formatDate } from "@/lib/format";

export default function GalleryCard({ work }: { work: WorkListItem }) {
  return (
    <Link href={`/i/${work.id}`} className="gallery-card" title={work.title}>
      {/* 类型徽章（左上） */}
      <span className={typeClass(work.ai_type)}>{typeLabel(work.ai_type)}</span>
      {/* 图数角标（右上） */}
      {work.image_count > 1 && (
        <span className="count-badge">{work.image_count}</span>
      )}
      <img
        src={work.cover}
        alt={work.title}
        loading="lazy"
        className="gallery-card-img"
      />
      {/* 左下信息层 */}
      <div className="card-info">
        <div className="title">{work.title || work.id}</div>
        <div className="meta">
          {work.author_name} · {formatDate(work.create_date)}
        </div>
      </div>
    </Link>
  );
}
