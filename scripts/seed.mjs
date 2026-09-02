// 种子数据导入脚本（纯 Node .mjs，服务端运行）
// 用法：node scripts/seed.mjs [张数=10] [目录=image_history]
// 从 AstrBot 真实图片目录挑 N 张 NovelAI PNG，解析内嵌元数据，
// 复制图片到 public/images/works/，写入 SQLite。

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ===== 配置 =====
const COUNT = parseInt(process.argv[2] ?? "10", 10);
const SRC_SUB = process.argv[3] ?? "image_history"; // companion_images | image_history
const SRC_DIR = path.join(
  "/host/opt/astrbot/data/plugin_data/astrbot_plugin_nai_image",
  SRC_SUB,
);
const DST_DIR = path.join(process.cwd(), "public", "images", "works");
const DB_PATH = path.join(process.cwd(), "data", "aitag.db");

// ===== PNG 解析（Node 版，与前端 png.ts 逻辑一致）=====
function parsePng(buf) {
  // Buffer -> 底层 ArrayBuffer（注意 byteOffset）
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const bytes = new Uint8Array(ab);
  const view = new DataView(ab);
  const chunks = [];
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(
      bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7],
    );
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > bytes.length) break;
    chunks.push({ type, data: bytes.slice(dataStart, dataEnd) });
    pos = dataEnd + 4;
  }
  let width = 0, height = 0;
  const texts = {};
  for (const c of chunks) {
    if (c.type === "IHDR" && c.data.length >= 8) {
      const dv = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
      width = dv.getUint32(0);
      height = dv.getUint32(4);
    } else if (c.type === "tEXt") {
      let nul = -1;
      for (let i = 0; i < c.data.length; i++) {
        if (c.data[i] === 0) { nul = i; break; }
      }
      let keyword = "", value = "";
      for (let i = 0; i < c.data.length; i++) {
        if (nul !== -1 && i >= nul) {
          if (i > nul) value += String.fromCharCode(c.data[i]);
        } else {
          keyword += String.fromCharCode(c.data[i]);
        }
      }
      texts[keyword] = value;
    }
  }
  return { width, height, texts };
}

// ===== 挑选图片（尽量挑参数各异的）=====
const files = fs.readdirSync(SRC_DIR)
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .sort((a, b) => {
    // 尽量交错：按文件大小排序后均匀取样，避免连续同 prompt
    const sa = fs.statSync(path.join(SRC_DIR, a)).size;
    const sb = fs.statSync(path.join(SRC_DIR, b)).size;
    return sa - sb;
  });

console.log(`[seed] 源目录 ${SRC_DIR} 共 ${files.length} 张 PNG，准备导入 ${Math.min(COUNT, files.length)} 张`);

// 均匀取样
const step = Math.max(1, Math.floor(files.length / Math.min(COUNT, files.length)));
const picked = [];
for (let i = 0; i < files.length && picked.length < Math.min(COUNT, files.length); i += step) {
  picked.push(files[i]);
}

// ===== 数据库 =====
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(DST_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    caption TEXT DEFAULT '',
    create_date TEXT NOT NULL,
    ai_type TEXT NOT NULL DEFAULT 'nai',
    image_count INTEGER NOT NULL DEFAULT 1,
    tags TEXT NOT NULL DEFAULT '[]',
    author_name TEXT NOT NULL DEFAULT '群友',
    total_view INTEGER NOT NULL DEFAULT 0,
    total_bookmarks INTEGER NOT NULL DEFAULT 0,
    images TEXT NOT NULL DEFAULT '[]',
    metadata TEXT
  );
`);

let ok = 0, skipped = 0;
const insert = db.prepare(`
  INSERT OR REPLACE INTO works
  (id, title, caption, create_date, ai_type, image_count, tags, author_name, total_view, total_bookmarks, images, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const f of picked) {
  const srcPath = path.join(SRC_DIR, f);
  const buf = fs.readFileSync(srcPath);
  let parsed;
  try {
    parsed = parsePng(buf);
  } catch (e) {
    console.log(`  ⏭  ${f}: 解析失败 ${e.message}`);
    skipped++;
    continue;
  }

  const { texts } = parsed;
  let comment = null;
  try {
    comment = texts.Comment ? JSON.parse(texts.Comment) : null;
  } catch {
    comment = null;
  }

  // 只有带 Comment（NovelAI 参数）的才导入
  if (!comment) {
    console.log(`  ⏭  ${f}: 无 NovelAI Comment 元数据，跳过`);
    skipped++;
    continue;
  }

  const id = f.replace(/\.png$/i, "").replace(/^nai_/, "");
  const newName = `w_${id}.png`;
  const dstPath = path.join(DST_DIR, newName);
  fs.copyFileSync(srcPath, dstPath);

  const prompt = String(comment.prompt ?? "");
  const uc = String(comment.uc ?? "");
  // id 是 19 位 Unix 毫秒时间戳，超出 Number 安全范围；取前 13 位做日期
  const ms = BigInt(id);
  const createDate = new Date(Number(ms / 1000000n)).toISOString();

  const metadata = {
    ...comment,
    _source_file: f,
    _png: {
      width: parsed.width,
      height: parsed.height,
      software: texts.Software ?? "",
      source: texts.Source ?? "",
    },
  };

  insert.run(
    id,
    (comment.prompt ?? "").slice(0, 30) || f,
    uc.slice(0, 80),
    createDate,
    "nai",
    1,
    JSON.stringify([]),
    "群友",
    0,
    0,
    JSON.stringify([`/images/works/${newName}`]),
    JSON.stringify(metadata),
  );
  ok++;
  console.log(`  ✅ ${f}  ${parsed.width}x${parsed.height}  seed=${comment.seed}  prompt=${prompt.slice(0, 40)}…`);
}

console.log(`\n[seed] 完成：成功 ${ok} 张，跳过 ${skipped} 张`);
console.log(`[seed] 图片目录：${DST_DIR}`);
console.log(`[seed] 数据库：${DB_PATH}`);
db.close();
