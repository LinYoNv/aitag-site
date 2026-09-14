#!/usr/bin/env node
/**
 * 词库导入 // taglib-import
 * ---------------------------------------------------------------------------
 * 把 WeiLin-Comfyui-Tools 的中文词库（tags_templete/userdatas_zh_CN.db）转换成
 * 本项目自用的 data/taglib.db，供 /api/studio/tags 查询。
 *
 * ⚠️ 数据来源许可：WeiLin-Comfyui-Tools-panel 为 GPL-3.0。
 *    因此**产物一律放 data/（已 gitignore），不提交到本项目的公开仓库**。
 *
 * 用法：
 *   node scripts/taglib-import.mjs                      # 用本地缓存的源库
 *   node scripts/taglib-import.mjs --download           # 先从 GitHub 拉源库（走代理）
 *   node scripts/taglib-import.mjs --src <path>         # 指定源库
 *   node scripts/taglib-import.mjs --out <path>         # 指定输出（默认 data/taglib.db）
 *   node scripts/taglib-import.mjs --emit-json <path>   # 额外导出精选库 JSON（可给前端兜底）
 */
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SRC_URL =
  "https://raw.githubusercontent.com/weilin9999/WeiLin-Comfyui-Tools-panel/main/tags_templete/userdatas_zh_CN.db";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.resolve(opt("--src", "/tmp/weilin/userdatas_zh_CN.db"));
const out = path.resolve(opt("--out", path.join(root, "data", "taglib.db")));
const emitJson = opt("--emit-json", "");

if (flag("--download") || !fs.existsSync(src)) {
  console.log(`[import] 下载源库 → ${src}`);
  fs.mkdirSync(path.dirname(src), { recursive: true });
  // 用 curl 而不是 fetch：curl 会读 http_proxy/https_proxy 环境变量
  execFileSync("curl", ["-sL", "--max-time", "300", "-o", src, SRC_URL], { stdio: "inherit" });
}
if (!fs.existsSync(src)) {
  console.error(`[import] 找不到源库：${src}（先加 --download）`);
  process.exit(1);
}

const s = new DatabaseSync(src, { readOnly: true });
const tmp = out + ".tmp";
fs.mkdirSync(path.dirname(out), { recursive: true });
// 连 journal/wal 残留一起清：上次崩在事务里会留下 -journal，直接重开会报 "file is not a database"
for (const suffix of ["", "-journal", "-wal", "-shm"]) fs.rmSync(tmp + suffix, { force: true });
const d = new DatabaseSync(tmp);

d.exec(`
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort INTEGER, color TEXT);
  CREATE TABLE groups (id INTEGER PRIMARY KEY, cat_id INTEGER NOT NULL, name TEXT NOT NULL, sort INTEGER);
  CREATE TABLE tags (id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL, name TEXT NOT NULL, zh TEXT, sort INTEGER);
  CREATE TABLE booru (tag TEXT PRIMARY KEY, zh TEXT);
  CREATE INDEX idx_groups_cat ON groups(cat_id);
  CREATE INDEX idx_tags_group ON tags(group_id);
  CREATE INDEX idx_tags_name ON tags(name);
`);

const insCat = d.prepare("INSERT INTO categories (id,name,sort,color) VALUES (?,?,?,?)");
const insGrp = d.prepare("INSERT INTO groups (id,cat_id,name,sort) VALUES (?,?,?,?)");
const insTag = d.prepare("INSERT INTO tags (id,group_id,name,zh,sort) VALUES (?,?,?,?,?)");
const insBooru = d.prepare("INSERT INTO booru (tag,zh) VALUES (?,?)");

let nCat = 0, nGrp = 0, nTag = 0, nBooru = 0;
const skipped = { emptyGroup: [], renamedGroup: 0, emptyBooru: 0 };

// 源库里确实有脏数据：tag_subgroups 里存在 name 为 NULL 的行
// （id 120 / 126，都挂在「汉服」下、且 0 标签）。目标表 groups.name 是 NOT NULL，
// 直接插 NULL 会让整个事务以 SQLITE_CONSTRAINT_NOTNULL(1299) 失败 —— 这就是当初导入炸掉的原因。
// 处理原则：**不丢数据**。没标签的空组直接跳过（UI 上是噪音）；
// 万一将来出现"有标签但没名字"的组，用占位名保留下来，并打印出来让人知道。
const withTags = new Set(s.prepare("SELECT DISTINCT subgroup_id AS id FROM tag_tags").all().map((r) => r.id));

d.exec("BEGIN");
try {
  for (const c of s.prepare("SELECT id_index,name,color FROM tag_groups ORDER BY id_index").all()) {
    insCat.run(c.id_index, String(c.name ?? "").trim() || "(未命名)", c.id_index, c.color ?? null);
    nCat++;
  }
  for (const g of s.prepare("SELECT id_index,group_id,name FROM tag_subgroups ORDER BY group_id,id_index").all()) {
    const name = String(g.name ?? "").trim();
    if (!name) {
      if (!withTags.has(g.id_index)) {
        skipped.emptyGroup.push(g.id_index);
        continue;
      }
      skipped.renamedGroup++;
      insGrp.run(g.id_index, g.group_id, "(未命名)", g.id_index);
      nGrp++;
      continue;
    }
    insGrp.run(g.id_index, g.group_id, name, g.id_index);
    nGrp++;
  }
  for (const t of s.prepare("SELECT id_index,subgroup_id,text,desc FROM tag_tags ORDER BY subgroup_id,id_index").all()) {
    if (!t.text) continue;
    const name = String(t.text).trim();
    if (!name) continue;
    insTag.run(t.id_index, t.subgroup_id, name, String(t.desc ?? "").trim(), t.id_index);
    nTag++;
  }
  // 只导有中文翻译的行：源库 140782 行里仅 22045 行带翻译，其余全是空串。
  // 全量导入会白白撑大产物 6 倍，而空翻译对"查中文"没有任何用处。
  for (const b of s.prepare("SELECT tag,translate FROM danbooru_tag WHERE translate IS NOT NULL AND TRIM(translate) <> ''").all()) {
    const tag = String(b.tag ?? "").trim();
    const zh = String(b.translate ?? "").trim();
    if (!tag || !zh) {
      skipped.emptyBooru++;
      continue;
    }
    try {
      insBooru.run(tag, zh);
      nBooru++;
    } catch (e) {
      skipped.emptyBooru++;
      if (skipped.emptyBooru <= 3) console.warn(`[import] booru 行跳过：${tag} -> ${e.message}`);
    }
  }
  d.exec("COMMIT");
} catch (e) {
  // 事务里任何一步失败都要回滚并说清楚是哪一类数据出的问题，
  // 否则只会看到一个光秃秃的 1299，得重新猜（这个坑真踩过）。
  d.exec("ROLLBACK");
  console.error(`[import] 导入失败：${e.message}`);
  console.error(`[import] 已写入统计：分类 ${nCat} / 分组 ${nGrp} / 标签 ${nTag} / booru ${nBooru}`);
  d.close();
  s.close();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) fs.rmSync(tmp + suffix, { force: true });
  process.exit(1);
}

d.prepare("INSERT INTO meta (key,value) VALUES (?,?)").run("source", SRC_URL);
d.prepare("INSERT INTO meta (key,value) VALUES (?,?)").run("imported_at", new Date().toISOString());
d.prepare("INSERT INTO meta (key,value) VALUES (?,?)").run("license", "GPL-3.0 (数据来源 WeiLin-Comfyui-Tools-panel)");
d.prepare("INSERT INTO meta (key,value) VALUES (?,?)").run("counts", JSON.stringify({ categories: nCat, groups: nGrp, tags: nTag, booru: nBooru }));
d.exec("VACUUM");
d.close();
s.close();

fs.rmSync(out, { force: true });
fs.renameSync(tmp, out);
console.log(`[import] 完成 → ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`[import] 分类 ${nCat} / 分组 ${nGrp} / 精选标签 ${nTag} / danbooru 中文 ${nBooru}`);
// 跳过与兜底一律打印：静默丢数据是排查成本最高的一类 bug
if (skipped.emptyGroup.length) {
  console.log(`[import] 跳过 ${skipped.emptyGroup.length} 个"无名字且无标签"的空组：${skipped.emptyGroup.join(", ")}`);
}
if (skipped.renamedGroup) console.log(`[import] ⚠️ ${skipped.renamedGroup} 个组缺名字但有标签 → 已用「(未命名)」保留`);
if (skipped.emptyBooru) console.log(`[import] 跳过 ${skipped.emptyBooru} 行无有效中文的 danbooru 词条`);

if (emitJson) {
  const lib = buildLibrary(out);
  fs.writeFileSync(emitJson, JSON.stringify(lib));
  console.log(`[import] 精选库 JSON → ${emitJson} (${(fs.statSync(emitJson).size / 1024).toFixed(0)} KB)`);
}

/** 导出精选库（供前端兜底/离线用） */
export function buildLibrary(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const cats = [];
  for (const c of db.prepare("SELECT id,name FROM categories ORDER BY sort,id").all()) {
    const groups = [];
    for (const g of db.prepare("SELECT id,name FROM groups WHERE cat_id=? ORDER BY sort,id").all(c.id)) {
      const tags = db
        .prepare("SELECT name,zh FROM tags WHERE group_id=? ORDER BY sort,id")
        .all(g.id)
        .map((t) => ({ name: t.name, zh: t.zh || "" }));
      groups.push({ id: `g${g.id}`, name: g.name, tags });
    }
    cats.push({ id: `c${c.id}`, name: c.name, groups });
  }
  db.close();
  return { version: 1, name: "WeiLin 中文词库（本地同步）", categories: cats };
}
