import { createHmac, timingSafeEqual } from "node:crypto";

export interface JwtPayload {
  userId: number;
  role: string;
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

export function verifyToken(token: string, jwtSecret: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  const expected = Buffer.from(sign(jwtSecret, `${h}.${p}`));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let decodedHeader: any;
  try {
    decodedHeader = JSON.parse(Buffer.from(h, "base64url").toString());
  } catch {
    return null;
  }
  if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT") return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;
  if (!payload.userId || !payload.role) return null;

  return payload;
}