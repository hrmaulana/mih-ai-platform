import { Router } from "express";
import { pool } from "../db";
import { requireAdmin } from "../middleware/sessionAuth";

/**
 * Menu Layanan Publik — konten 6 bagian (dasar hukum, jenis layanan, teknis,
 * survey, layanan lainnya, dokumentasi) yang dikelola dari CMS admin.
 *
 * Satu tabel generik `layanan_publik` (jenis + payload JSONB) dipakai untuk
 * keenam bentuk konten, sehingga menambah bentuk baru tidak perlu migrasi.
 */

const JENIS = [
  "dasar_hukum",
  "jenis_layanan",
  "teknis",
  "survey",
  "layanan_lainnya",
  "dokumentasi",
] as const;
type Jenis = (typeof JENIS)[number];

const AKSES = ["publik", "login"] as const;

const COLS = `id, jenis, slug, judul, urutan, akses, is_published, payload, created_at, updated_at`;

function isJenis(v: unknown): v is Jenis {
  return typeof v === "string" && (JENIS as readonly string[]).includes(v);
}

function isAkses(v: unknown): v is (typeof AKSES)[number] {
  return typeof v === "string" && (AKSES as readonly string[]).includes(v);
}

/** Validasi muatan dasar. Mengembalikan pesan galat, atau null bila sah. */
function validateBody(body: any): string | null {
  if (!isJenis(body?.jenis)) return `jenis harus salah satu dari: ${JENIS.join(", ")}`;
  if (typeof body?.judul !== "string" || body.judul.trim().length === 0) return "judul wajib diisi";
  if (body.judul.length > 300) return "judul maksimal 300 karakter";
  if (typeof body?.slug !== "string" || !/^[a-z0-9-]+$/.test(body.slug)) {
    return "slug wajib diisi dan hanya boleh huruf kecil, angka, dan tanda hubung";
  }
  if (body.akses !== undefined && !isAkses(body.akses)) return "akses harus 'publik' atau 'login'";
  const payload = body?.payload ?? {};
  if (typeof payload !== "object" || Array.isArray(payload) || payload === null) {
    return "payload harus berupa objek JSON";
  }
  if (body.urutan !== undefined && !Number.isInteger(Number(body.urutan))) return "urutan harus bilangan bulat";
  return null;
}

// ============================================================
// Publik — dibaca halaman portal
// ============================================================
const router = Router();

/**
 * GET /api/layanan?jenis=...
 * Hanya item `is_published`. Item ber-akses `login` disembunyikan bila
 * pengunjung belum login (dipakai untuk laporan survei & laporan penerimaan).
 */
router.get("/layanan", async (req, res) => {
  const jenis = typeof req.query.jenis === "string" ? req.query.jenis.trim() : "";
  const loggedIn = Boolean(req.session?.userId);

  const params: unknown[] = [];
  const where: string[] = ["is_published = true"];

  if (jenis) {
    if (!isJenis(jenis)) return res.status(400).json({ error: "jenis tidak dikenal" });
    params.push(jenis);
    where.push(`jenis = $${params.length}`);
  }
  if (!loggedIn) where.push("akses = 'publik'");

  const { rows } = await pool.query(
    `SELECT ${COLS} FROM layanan_publik
      WHERE ${where.join(" AND ")}
      ORDER BY jenis, urutan, id`,
    params,
  );
  res.json(rows);
});

// ============================================================
// Admin (CMS) — kelola konten
// ============================================================
export const layananAdminRouter = Router();

layananAdminRouter.use(requireAdmin);

/** Daftar semua item, termasuk draf & item login-only. */
layananAdminRouter.get("/layanan", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM layanan_publik ORDER BY jenis, urutan, id`,
  );
  res.json(rows);
});

/** Buat item baru. */
layananAdminRouter.post("/layanan", async (req, res) => {
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });

  const { jenis, slug, judul, payload } = req.body;
  const akses = isAkses(req.body.akses) ? req.body.akses : "publik";
  const urutan = req.body.urutan === undefined ? 0 : Number(req.body.urutan);
  const isPublished = req.body.is_published === undefined ? true : Boolean(req.body.is_published);

  try {
    const { rows } = await pool.query(
      `INSERT INTO layanan_publik (jenis, slug, judul, urutan, akses, is_published, payload, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLS}`,
      [jenis, slug, judul.trim(), urutan, akses, isPublished, payload, req.session?.userId ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e?.code === "23505") return res.status(409).json({ error: "slug sudah dipakai" });
    throw e;
  }
});

/** Ubah item. */
layananAdminRouter.put("/layanan/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id tidak valid" });

  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });

  const { jenis, slug, judul, payload } = req.body;
  const akses = isAkses(req.body.akses) ? req.body.akses : "publik";
  const urutan = req.body.urutan === undefined ? 0 : Number(req.body.urutan);
  const isPublished = req.body.is_published === undefined ? true : Boolean(req.body.is_published);

  try {
    const { rows } = await pool.query(
      `UPDATE layanan_publik
          SET jenis = $1, slug = $2, judul = $3, urutan = $4, akses = $5,
              is_published = $6, payload = $7, updated_at = now()
        WHERE id = $8
        RETURNING ${COLS}`,
      [jenis, slug, judul.trim(), urutan, akses, isPublished, payload, id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "item tidak ditemukan" });
    res.json(rows[0]);
  } catch (e: any) {
    if (e?.code === "23505") return res.status(409).json({ error: "slug sudah dipakai" });
    throw e;
  }
});

/** Hapus item. */
layananAdminRouter.delete("/layanan/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id tidak valid" });
  const { rowCount } = await pool.query(`DELETE FROM layanan_publik WHERE id = $1`, [id]);
  if (rowCount === 0) return res.status(404).json({ error: "item tidak ditemukan" });
  res.json({ ok: true });
});

export default router;
