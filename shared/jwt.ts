/**
 * jwt.ts — JWT HS256 minimal (tanpa dependensi) untuk semua paket MIH.
 *
 * Sebelumnya disalin 4x (backend, analisis, artikel, crawler) dengan varian:
 * backend punya `signToken`, crawler melewatkan cek header + membaca secret
 * dari config sendiri. Semua varian itu tetap didukung lewat opsi di sini.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface JwtPayload {
  userId: number;
  role: string; // "user" | "admin"
  iat: number;
  exp: number;
}

const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Buat token HS256. Default masa berlaku 24 jam (perilaku backend). */
export function signToken(
  userId: number,
  role: string,
  jwtSecret: string,
  ttlSeconds = 60 * 60 * 24,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { userId, role, iat: now, exp: now + ttlSeconds };
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(jwtSecret, `${header}.${payloadStr}`);
  return `${header}.${payloadStr}.${signature}`;
}

/**
 * Verifikasi token HS256.
 *
 * @param verifyHeader `true` (default) juga memvalidasi header alg/typ —
 *   perilaku backend/analisis/artikel. Crawler memakai `false` (kompatibel
 *   dengan implementasi lamanya yang tidak memeriksa header).
 */
export function verifyToken(
  token: string,
  jwtSecret: string,
  opts: { verifyHeader?: boolean } = {},
): JwtPayload | null {
  const { verifyHeader = true } = opts;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  // Verify signature
  const expected = Buffer.from(sign(jwtSecret, `${h}.${p}`));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  if (verifyHeader) {
    let decodedHeader: any;
    try {
      decodedHeader = JSON.parse(Buffer.from(h, "base64url").toString());
    } catch {
      return null;
    }
    if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT") return null;
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null; // expired
  if (!payload.userId || !payload.role) return null;

  return payload;
}
