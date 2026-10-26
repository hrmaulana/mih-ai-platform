/**
 * Pembungkus crawler: shared/jwt.ts + secret dari config service ini.
 * `verifyHeader: false` mempertahankan perilaku crawler sebelumnya
 * (tidak memeriksa header alg/typ).
 */

import { config } from "../config";
import { verifyToken as verify, type JwtPayload } from "../../../../../shared/jwt";

export type { JwtPayload };

export function verifyToken(token: string): JwtPayload | null {
  return verify(token, config.jwtSecret, { verifyHeader: false });
}
