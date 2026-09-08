#!/usr/bin/env node
// ============================================================
// aitag 图片缓存预热脚本
// 用法：node scripts/warmup-images.mjs [--only-list]
//   --only-list  只列出所有图片 URL（不生成缓存）
//
// 作用：扫描 DB 中全部作品的图片，预生成缩略图(thumb)和预览图(preview)
// 缓存，避免详情页/画廊首批访问时现算卡顿。
// 参照 aitag.win 的多档尺寸策略，部署后执行一次即可。
// ============================================================

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DB_PATH = process.env.AITAG_DB || path.join(ROOT, "data", "aitag.db");
const UPLOAD_DIR = path.join(ROOT, "data", "uploads");
const THUMB_DIR = path.join(UPLOAD_DIR, "thumb");
const PREVIEW_DIR = path.join(UPLOAD_DIR, "preview");

const onlyList = process.argv.includes("--only-list");

const SRC_DIRS = [
  UPLOAD_DIR,
  path.join(ROOT, "public", "images", "uploads"),
  path.join(ROOT, "public", "images", "works"),
];

function findSource(name) {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  for (const dir of SRC_DIRS) {
    const candidate = path.join(dir, name);
    if (candidate.startsWith(dir) && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const works = db.prepare("SELECT id, images FROM works").all();
db.close();

// 收集去重后的图片文件名
const names = new Set();
for (const w of works) {
  let images = [];
  try {
    images = JSON.parse(w.images || "[]");
  } catch {
    // 忽略坏 JSON
  }
  for (const img of images) {
    if (typeof img !== "string" || !img) continue;
    const name = path.basename(img);
    if (name) names.add(name);
  }
}

console.log(`扫描到 ${works.length} 个作品，${names.size} 个唯一图片文件`);

if (onlyList) {
  for (const n of [...names].sort()) console.log(" ", n);
  process.exit(0);
}

let thumbOk = 0;
let thumbMiss = 0;
let previewOk = 0;
let previewMiss = 0;
let missing = 0;

for (const name of [...names].sort()) {
  const src = findSource(name);
  if (!src) {
    missing++;
    console.warn(`[missing] ${name}`);
    continue;
  }
  const base = path.basename(name, path.extname(name));

  // 缩略图 480px WebP
  const thumbPath = path.join(THUMB_DIR, `${base}.webp`);
  if (!fs.existsSync(thumbPath)) {
    try {
      const buf = await sharp(src).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      fs.mkdirSync(THUMB_DIR, { recursive: true });
      fs.writeFileSync(thumbPath, buf);
      thumbOk++;
    } catch (e) {
      thumbMiss++;
      console.warn(`[thumb fail] ${name}: ${e?.message || e}`);
    }
  } else {
    thumbOk++;
  }

  // 预览图 1400px WebP
  const previewPath = path.join(PREVIEW_DIR, `${base}.webp`);
  if (!fs.existsSync(previewPath)) {
    try {
      const buf = await sharp(src).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      fs.mkdirSync(PREVIEW_DIR, { recursive: true });
      fs.writeFileSync(previewPath, buf);
      previewOk++;
    } catch (e) {
      previewMiss++;
      console.warn(`[preview fail] ${name}: ${e?.message || e}`);
    }
  } else {
    previewOk++;
  }
}

console.log(`\n完成：thumb ${thumbOk} 命中/生成，${thumbMiss} 失败；preview ${previewOk} 命中/生成，${previewMiss} 失败；源文件缺失 ${missing}`);