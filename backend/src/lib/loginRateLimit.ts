import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface LoginRateLimitOptions {
  max?: number;
  windowMs?: number;
}

// In-memory fixed-window rate limiter per IP untuk endpoint login.
// Cukup untuk backend single-instance (tanpa Redis). Bucket kedaluwarsa
// dibersihkan berkala agar Map tidak membocorkan memori.

function clientIp(req: Request): string {
  // nginx host (VPS & Arthakarya) menyetel X-Forwarded-For; header tepercaya
  // karena backend hanya bind di jaringan internal Docker.
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

export function createLoginRateLimiter(opts: LoginRateLimitOptions = {}) {
  const max = opts.max ?? Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10);
  const windowMs = opts.windowMs ?? Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
  const buckets = new Map<string, Bucket>();

  const sweep = setInterval(() => {
    const t = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt <= t) buckets.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  if (typeof sweep.unref === "function") sweep.unref();

  return function rateLimitLogin(req: Request, res: Response, next: NextFunction) {
    const key = clientIp(req);
    const t = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - t) / 1000)));
      return res.status(429).json({ error: "terlalu banyak percobaan login, coba lagi nanti" });
    }
    next();
  };
}