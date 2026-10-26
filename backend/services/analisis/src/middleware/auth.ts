/**
 * Middleware Bearer JWT service ini — logika ada di shared/auth.ts,
 * di sini hanya mengikat config + verifier paket ini.
 */

import { createRequireAuth } from "../../../../../shared/auth";
import { config } from "../config";
import { verifyToken } from "../lib/jwt";

export const { requireAuth } = createRequireAuth({
  verify: (token: string) => verifyToken(token, config.jwtSecret),
  getSecret: () => config.jwtSecret,
});
