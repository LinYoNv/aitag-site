#!/usr/bin/env node
// 创建一个 admin 用户（可直接运行：node scripts/create-admin.mjs <username> <password>）
// 幂等：同名用户存在则提示跳过，不覆盖。
// 用法（在 site 目录下）：
//   node scripts/create-admin.mjs admin '你的密码'
// 注意：密码会出现在 shell 历史，请自行斟酌；也可以改成从环境变量读。
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "aitag.db");

const [, , usernameArg, passwordArg] = process.argv;
const username = (usernameArg || process.env.ADMIN_USER || "").trim();
const password = passwordArg || process.env.ADMIN_PASS || "";

if (!username || !password) {
  console.error("用法: node scripts/create-admin.mjs <用户名> <密码>");
  console.error("或设置环境变量 ADMIN_USER / ADMIN_PASS 后直接运行");
  process.exit(1);
}

// 与 src/lib/auth.ts hashPassword 完全一致的格式：salt:hash（scrypt, 64 字节, hex）
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const db = new DatabaseSync(DB_PATH);
// 与 src/lib/db.ts 相同的表结构（幂等）
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    author_name TEXT NOT NULL DEFAULT '',
    create_date TEXT NOT NULL
  );
`);

const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
if (exists) {
  console.error(`用户 ${username} 已存在，跳过（如需改密请先删行或改脚本）`);
  process.exit(2);
}

db.prepare(
  `INSERT INTO users (id, username, password_hash, role, author_name, create_date)
   VALUES (?, ?, ?, 'admin', ?, ?)`,
).run(
  crypto.randomBytes(8).toString("hex"),
  username,
  hashPassword(password),
  username,
  new Date().toISOString(),
);
console.log(`已创建 admin 用户: ${username}`);
db.close();