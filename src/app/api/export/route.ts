import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { getWorkById } from "@/lib/db";

export const runtime = "nodejs";

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: Array<{ name: string; data: Buffer }>) {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const f of files) {
    const n = Buffer.from(f.name, "utf8"), crc = crc32(f.data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50,0); h.writeUInt16LE(20,4); h.writeUInt16LE(0x800,6); h.writeUInt16LE(0,8); h.writeUInt32LE(crc,14); h.writeUInt32LE(f.data.length,18); h.writeUInt32LE(f.data.length,22); h.writeUInt16LE(n.length,26); h.writeUInt16LE(0,28);
    local.push(h,n,f.data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50,0); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt16LE(0x800,8); c.writeUInt32LE(crc,16); c.writeUInt32LE(f.data.length,20); c.writeUInt32LE(f.data.length,24); c.writeUInt16LE(n.length,28); c.writeUInt32LE(offset,42); central.push(c,n); offset += h.length+n.length+f.data.length;
  }
  const body = Buffer.concat(local), cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50,0); e.writeUInt16LE(files.length,8); e.writeUInt16LE(files.length,10); e.writeUInt32LE(cd.length,12); e.writeUInt32LE(body.length,16); return Buffer.concat([body,cd,e]);
}

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "ids 不能为空" }, { status: 400 });
  const files: Array<{ name: string; data: Buffer }> = [];
  for (const id of ids.slice(0, 100)) {
    const work = getWorkById(String(id)); if (!work) continue;
    const params = work.metadata ?? {};
    files.push({ name: `${work.id}/parameters.json`, data: Buffer.from(JSON.stringify(params, null, 2), "utf8") });
    for (const [i, url] of work.images.entries()) {
      const name = path.basename(url); const p = path.join(process.cwd(), "data", "uploads", name);
      if (name && fs.existsSync(p)) files.push({ name: `${work.id}/${i + 1}-${name}`, data: fs.readFileSync(p) });
    }
  }
  const out = zip(files);
  return new NextResponse(new Uint8Array(out), { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=aitag-export.zip" } });
}
