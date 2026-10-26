/**
 * auth.ts — middleware autentikasi Bearer JWT bersama untuk paket MIH.
 *
 * Sengaja TIDAK mengimpor tipe dari "express": berkas di `shared/` tidak punya
 * node_modules sendiri, sehingga impor paket pihak ketiga tidak resolvable
 * (baik saat `tsc` maupun saat runtime di dalam kontainer). Tipe di bawah
 * dibuat struktural dan cukup kompatibel dengan Request/Response Express.
 */

import type { JwtPayload } from "./jwt";

/** Bagian Request Express yang dipakai middleware ini. */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  [key: string]: any;
}

/** Bagian Response Express yang dipakai middleware ini. */
export interface AuthResponse {
  status: (code: number) => { json: (body: unknown) => unknown };
}

export interface AuthConfig {
  /** Verifikasi token → payload, atau null bila tidak valid. */
  verify: (token: string) => JwtPayload | null;
  /** Bila diisi, secret kosong → 500 "JWT secret not configured" (analisis/artikel). */
  getSecret?: () => string;
}

export function createRequireAuth(cfg: AuthConfig) {
  function requireAuth(req: AuthRequest, res: AuthResponse, next: () => void) {
    const auth = (req.headers.authorization as string | undefined) ?? "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "missing or invalid authorization header" });
    }
    const token = auth.slice(7);

    if (cfg.getSecret && !cfg.getSecret()) {
      return res.status(500).json({ error: "JWT secret not configured" });
    }

    const payload = cfg.verify(token);
    if (!payload) {
      return res.status(401).json({ error: "invalid or expired token" });
    }

    req.userId = payload.userId;
    req.role = payload.role;
    next();
  }

  function requireAdmin(req: AuthRequest, res: AuthResponse, next: () => void) {
    requireAuth(req, res, () => {
      if (req.role !== "admin") {
        return res.status(403).json({ error: "admin only" });
      }
      next();
    });
  }

  return { requireAuth, requireAdmin };
}
