// 进程内滑动窗口限流器（standalone 单进程部署足够用；重启清零可接受）

const buckets = new Map<string, number[]>();

/** 滑动窗口限流：窗口内已超过 limit 次返回 false（并计本次），否则返回 true */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  // 防御性清理：map 极端膨胀时（万键级），周期性清一次空桶
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.length === 0) buckets.delete(k);
    }
  }
  return true;
}

/** 从请求取客户端 IP（Caddy 反代场景） */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}