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

export function signToken(userId: number, role: string, jwtSecret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    userId,
    role,
    iat: now,
    exp: now + 60 * 60 * 24, // 24 hours
  };
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(jwtSecret, `${header}.${payloadStr}`);
  return `${header}.${payloadStr}.${signature}`;
}

export function verifyToken(token: string, jwtSecret: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  // Verify signature
  const expected = Buffer.from(sign(jwtSecret, `${h}.${p}`));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  // Verify header
  let decodedHeader: any;
  try {
    decodedHeader = JSON.parse(Buffer.from(h, "base64url").toString());
  } catch {
    return null;
  }
  if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT") return null;

  // Decode & verify payload
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