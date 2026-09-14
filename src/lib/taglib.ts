// 中文提示词库 —— 服务端专用（读 data/taglib.db）
// ---------------------------------------------------------------------------
// 数据由 `node scripts/taglib-import.mjs` 从 WeiLin-Comfyui-Tools-panel 的
// 中文词库（userdatas_zh_CN.db）同步而来。
//
// ⚠️ 许可：上游为 GPL-3.0，因此产物 data/taglib.db **只在服务端使用、绝不进公开仓库**
//    （data/ 已在 .gitignore 中）。面板上必须保留来源署名，见 SOURCE_NOTE。
//
// 库文件缺失时不是错误：返回 null，前端会回退到自带的 tags.default.json。
// 这样"没同步词库"的环境照样能用，只是标签少一些。

import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.join(process.cwd(), "data");
export const TAGLIB_DB_PATH = path.join(DATA_DIR, "taglib.db");

/** 面板上展示的来源署名（GPL-3.0 要求） */
export const SOURCE_NOTE =
  "词库数据来源：WeiLin-Comfyui-Tools-panel 中文标签库（GPL-3.0），已本地同步；检索在服务端完成。";

export type TagLibTag = { name: string; zh: string };
export type TagLibGroup = { id: string; name: string; tags: TagLibTag[] };
export type TagLibCategory = { id: string; name: string; groups: TagLibGroup[] };
export type TagLibLibrary = {
  version: number;
  name: string;
  note: string;
  source: string;
  imported_at: string;
  categories: TagLibCategory[];
};

let cached: { mtimeMs: number; db: DatabaseSync } | null = null;

/** 打开词库（只读）。文件不存在返回 null。 */
function open(): DatabaseSync | null {
  if (!fs.existsSync(TAGLIB_DB_PATH)) return null;
  const mtimeMs = fs.statSync(TAGLIB_DB_PATH).mtimeMs;
  if (cached && cached.mtimeMs === mtimeMs) return cached.db;
  if (cached) {
    try {
      cached.db.close();
    } catch {
      /* 忽略关闭失败 */
    }
    cached = null;
  }
  const db = new DatabaseSync(TAGLIB_DB_PATH, { readOnly: true });
  cached = { mtimeMs, db };
  return db;
}

function meta(db: DatabaseSync, key: string): string {
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key=?").get(key) as { value?: string } | undefined;
    return String(row?.value ?? "");
  } catch {
    return "";
  }
}

/** 词库是否已就绪（用于前端提示与健康检查） */
export function tagLibraryExists(): boolean {
  return fs.existsSync(TAGLIB_DB_PATH);
}

/**
 * 读取完整分类树，结构与 public/studio/tags.default.json 完全一致，
 * 因此前端不需要任何转换逻辑即可直接替换基础库。
 */
export function readTagLibrary(): TagLibLibrary | null {
  const db = open();
  if (!db) return null;

  const cats: TagLibCategory[] = [];
  const catRows = db.prepare("SELECT id,name FROM categories ORDER BY sort,id").all() as { id: number; name: string }[];
  const groupStmt = db.prepare("SELECT id,name FROM groups WHERE cat_id=? ORDER BY sort,id");
  const tagStmt = db.prepare("SELECT name,zh FROM tags WHERE group_id=? ORDER BY sort,id");

  for (const c of catRows) {
    const groups: TagLibGroup[] = [];
    for (const g of groupStmt.all(c.id) as { id: number; name: string }[]) {
      const tags = (tagStmt.all(g.id) as { name: string; zh: string }[]).map((t) => ({
        name: t.name,
        zh: t.zh || "",
      }));
      groups.push({ id: `g${g.id}`, name: g.name, tags });
    }
    cats.push({ id: `c${c.id}`, name: c.name, groups });
  }

  const counts = meta(db, "counts");
  let summary = "";
  try {
    const n = JSON.parse(counts || "{}") as Record<string, number>;
    summary = `分类 ${n.categories ?? cats.length} / 分组 ${n.groups ?? "?"} / 标签 ${n.tags ?? "?"}`;
  } catch {
    summary = `分类 ${cats.length}`;
  }

  return {
    version: 1,
    name: "WeiLin 中文词库",
    note: `${SOURCE_NOTE}（${summary}）`,
    source: meta(db, "source"),
    imported_at: meta(db, "imported_at"),
    categories: cats,
  };
}

/**
 * danbooru 中文检索：源库有 14 万条 tag，其中 2.2 万条带中文翻译。
 * 这里是"精选库之外"的补充 —— 用户输中文也能找到对应英文 tag。
 *
 * 注意列名是 booru.zh（导入时把源库的 translate 映射成了 zh）；
 * 写错列名会被下面的 catch 吞掉、表现为"搜不到任何东西"，所以出错要打日志而不是静默返回空。
 */
export function searchBooru(query: string, limit = 60): TagLibTag[] {
  const db = open();
  if (!db) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const escaped = q.replace(/[%_\\]/g, (m) => "\\" + m);
  try {
    return db
      .prepare(
        `SELECT tag AS name, zh FROM booru
         WHERE LOWER(tag) LIKE ? ESCAPE '\\' OR LOWER(zh) LIKE ? ESCAPE '\\'
         ORDER BY CASE WHEN LOWER(tag) = ? THEN 0 WHEN LOWER(tag) LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, LENGTH(tag)
         LIMIT ?`,
      )
      .all(`%${escaped}%`, `%${escaped}%`, q, `${escaped}%`, limit) as { name: string; zh: string }[];
  } catch (e) {
    console.warn("[taglib] danbooru 检索失败:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** 词库统计（健康检查 / 调试用） */
export function tagLibraryStats(): { ready: boolean; categories: number; groups: number; tags: number; booru: number } | null {
  const db = open();
  if (!db) return { ready: false, categories: 0, groups: 0, tags: 0, booru: 0 };
  const one = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  return {
    ready: true,
    categories: one("SELECT COUNT(*) c FROM categories"),
    groups: one("SELECT COUNT(*) c FROM groups"),
    tags: one("SELECT COUNT(*) c FROM tags"),
    booru: one("SELECT COUNT(*) c FROM booru"),
  };
}
