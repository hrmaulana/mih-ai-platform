import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";

interface JwtPayload {
  userId: number;
  role: string;
  iat: number;
  exp: number;
}

export function verifyToken(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  function sign(data: string): string {
    return createHmac("sha256", config.jwtSecret).update(data).digest("base64url");
  }

  const expected = Buffer.from(sign(`${h}.${p}`));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

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