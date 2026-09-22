import type { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { verifyToken } from "../lib/jwt";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing or invalid authorization header" });
  }
  const token = auth.slice(7);
  const secret = config.jwtSecret;
  if (!secret) {
    return res.status(500).json({ error: "JWT secret not configured" });
  }
  const payload = verifyToken(token, secret);
  if (!payload) {
    return res.status(401).json({ error: "invalid or expired token" });
  }
  (req as any).userId = payload.userId;
  (req as any).role = payload.role;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if ((req as any).role !== "admin") {
      return res.status(403).json({ error: "admin only" });
    }
    next();
  });
}