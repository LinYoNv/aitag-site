// 生图台「生图历史」——服务端落盘与裁剪（server-only）
//
// 设计要点：
//  1. **图片落盘、库里只存文件名**。把 base64 直接塞进 SQLite 是诱惑（实现最短），
//     但一张 2K 图几百 KB → 20 张就是十几 MB 的库，且每次列历史都要 JSON 里全量搬一遍。
//  2. **落原图 + 独立缩略图**。面板只显示 4 张缩略图，但点开要看大图/下载，
//     所以原图也留着；缩略图是 480px WebP（与图库画廊同规格），列表首屏才不至于拖百 KB。
//  3. **保留 20 条**（db.STUDIO_HISTORY_LIMIT）。超出后从旧到新裁剪，
//     **库里删记录的同时必须删盘上的文件** —— 只裁库会留下永远无人引用的图，磁盘只涨不落。
//  4. 历史是**附加能力**：任何一步失败都只打日志，绝不能让「生图成功但存历史失败」变成 500。
//     这是本项目最贵的 bug 类型（静默降级），所以失败一律 console.warn 点名。
import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  insertStudioHistory,
  listStudioHistory,
  pruneStudioHistory,
  type StudioHistoryRow,
} from "./db";
import {
  STUDIO_HISTORY_NEGATIVE_MAX,
  STUDIO_HISTORY_PROMPT_MAX,
  STUDIO_HISTORY_THUMB_QUALITY,
  STUDIO_HISTORY_THUMB_WIDTH,
  isSafeHistoryFilename,
} from "./studio-presets";

/** 历史图片目录：data/uploads/hist（原图）与 data/uploads/hist/thumb（缩略图） */
const HIST_DIR = path.join(process.cwd(), "data", "uploads", "hist");
const HIST_THUMB_DIR = path.join(HIST_DIR, "thumb");

const THUMB_WIDTH = STUDIO_HISTORY_THUMB_WIDTH;
const THUMB_QUALITY = STUDIO_HISTORY_THUMB_QUALITY;

export interface StudioHistoryItem {
  id: string;
  url: string;
  thumb_url: string;
  ext: string;
  backend: string;
  model: string;
  size: string;
  prompt: string;
  negative: string;
  create_date: string;
}

function toItem(row: StudioHistoryRow): StudioHistoryItem {
  return {
    id: row.id,
    // 走 API 路由而不是静态目录：data/ 不在 public 下（与图库上传图同口径）
    url: `/api/studio/history/${row.id}`,
    thumb_url: `/api/studio/history/${row.id}?thumb=1`,
    ext: row.ext,
    backend: row.backend,
    model: row.model,
    size: row.size,
    prompt: row.prompt,
    negative: row.negative,
    create_date: row.create_date,
  };
}

/**
 * 保存一次生成的图片为历史记录。
 * @returns 新增的记录数（0 = 全部失败，调用方据此打日志，但**不应**把生图判为失败）
 */
export async function saveStudioHistory(opts: {
  userId: string;
  images: Array<{ buf: Buffer; ext: string }>;
  backend: string;
  model: string;
  size: string;
  prompt: string;
  negative: string;
  meta: unknown;
}): Promise<number> {
  if (!opts.images.length) return 0;
  // sharp 不可用时**不放弃历史**：退化成「缩略图 = 原图」（列表会重一些，但记录不丢）。
  // 这里绝不能直接 return —— 那就是"功能静默降级"，本项目最贵的 bug 类型。
  let sharpMod: typeof import("sharp").default | null = null;
  try {
    sharpMod = (await import("sharp")).default;
  } catch (e) {
    console.warn("[studio] 生图历史：sharp 不可用 → 缩略图退化为原图（历史仍会记录）", e);
  }

  let saved = 0;
  const failed: string[] = [];
  for (const img of opts.images) {
    const id = crypto.randomBytes(8).toString("hex");
    const file = `${id}.${img.ext}`;
    // 缩略图统一 WebP（与图库 /api/images/thumb 同规格）；生成失败则回退成原图文件名
    let thumb = file;
    try {
      fs.mkdirSync(HIST_THUMB_DIR, { recursive: true });
      if (sharpMod) {
        const thumbBuf = await sharpMod(img.buf)
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: THUMB_QUALITY })
          .toBuffer();
        thumb = `${id}.webp`;
        fs.writeFileSync(path.join(HIST_THUMB_DIR, thumb), thumbBuf);
      }
      fs.writeFileSync(path.join(HIST_DIR, file), img.buf);

      insertStudioHistory({
        id,
        user_id: opts.userId,
        file,
        thumb,
        ext: img.ext,
        backend: opts.backend,
        model: opts.model,
        size: opts.size,
        // 提示词截断存储：历史只是回看用，不该让单条记录无上限膨胀
        prompt: (opts.prompt || "").slice(0, STUDIO_HISTORY_PROMPT_MAX),
        negative: (opts.negative || "").slice(0, STUDIO_HISTORY_NEGATIVE_MAX),
        meta: opts.meta ? JSON.stringify(opts.meta) : null,
      });
      saved++;
    } catch (e) {
      failed.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (failed.length) {
    // 静默丢弃是最贵的 bug：明确记录"存了几张/丢了几张/为什么"
    console.warn(
      `[studio] 生图历史：${saved}/${opts.images.length} 张入库成功，失败 ${failed.length} 张 → ${failed.join("; ")}`,
    );
  }

  // 裁剪到 20 条：库记录与磁盘文件一起删
  try {
    const victims = pruneStudioHistory(opts.userId);
    removeFiles(victims);
  } catch (e) {
    console.warn("[studio] 生图历史裁剪失败（历史会暂时超过 20 条）:", e);
  }
  return saved;
}

/** 列出某用户的生图历史 */
export function getStudioHistory(userId: string, limit?: number): StudioHistoryItem[] {
  return listStudioHistory(userId, limit).map(toItem);
}

/** 解析历史图片的磁盘路径；kind='thumb' 取缩略图。文件名非法一律返回 null */
export function resolveHistoryFile(
  row: StudioHistoryRow,
  kind: "orig" | "thumb",
): string | null {
  const name = kind === "thumb" ? row.thumb : row.file;
  // 判据收口在 isSafeHistoryFilename（纯函数、有 npm test 覆盖），这里不重复实现
  if (!isSafeHistoryFilename(name)) return null;
  const dir = kind === "thumb" ? HIST_THUMB_DIR : HIST_DIR;
  const full = path.join(dir, name);
  // 双保险：拼接后必须仍在目录内（挡符号链接/异常输入）
  if (!full.startsWith(dir + path.sep)) return null;
  return fs.existsSync(full) ? full : null;
}

/** 删除若干历史记录对应的图片文件（记录本身已由 db 层删除） */
export function removeHistoryFiles(rows: StudioHistoryRow[]): void {
  removeFiles(rows);
}

function removeFiles(rows: StudioHistoryRow[]): void {
  let removed = 0;
  const failed: string[] = [];
  for (const row of rows) {
    for (const kind of ["orig", "thumb"] as const) {
      const p = resolveHistoryFile(row, kind);
      if (!p) continue;
      try {
        fs.unlinkSync(p);
        removed++;
      } catch (e) {
        failed.push(`${path.basename(p)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (failed.length) {
    console.warn(`[studio] 生图历史：${removed} 个文件已删，${failed.length} 个删除失败 → ${failed.join("; ")}`);
  }
}
