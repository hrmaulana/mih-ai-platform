/**
 * Middleware Bearer JWT service crawler — logika ada di shared/auth.ts.
 * Tanpa `getSecret`: verifier paket ini yang menangani secret (perilaku lama).
 */

import { createRequireAuth } from "../../../../../shared/auth";
import { verifyToken } from "../lib/jwt";

export const { requireAuth, requireAdmin } = createRequireAuth({
  verify: (token: string) => verifyToken(token),
});
