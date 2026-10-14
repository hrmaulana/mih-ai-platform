import { afterAll, beforeAll, expect, test } from "bun:test";
import request from "supertest";
import { createApp } from "../src/app";
import { testDb, applySchema, truncateAll } from "./helpers";
import { hashPassword } from "../src/lib/passwords";

const app = createApp();
let cookie = "";

// Satu embedding identik untuk semua dokumen → cosine antar-dokumen = 1,
// sehingga semua pasangan lintas klaster punya semantik kuat (≥ ambang default 0.5).
const VEC = JSON.stringify(Array.from({ length: 1536 }, (_, i) => (i === 200 ? 1 : 0)));

beforeAll(async () => {
  await applySchema();
  await truncateAll();
  await testDb.query(
    "INSERT INTO users (name,email,unit_kerja,password_hash,is_admin) VALUES ('Admin','admin@x.c','Uji',$1,TRUE)",
    [hashPassword("adminpw")]
  );
  const login = await request(app).post("/api/auth/login").send({ email: "admin@x.c", password: "adminpw" });
  cookie = login.headers["set-cookie"][0].split(";")[0];

  // 3 dokumen tersortir ke klaster 1 (filename memuat "pdb"),
  // 3 dokumen ke klaster 2 (filename memuat "inflasi").
  // Kombinasi 3×3 = 9 pasangan lintas klaster, semuanya kemiripan → 1.
  const filenames = [
    "pdb-2024-a.pdf",
    "pdb-2025-b.pdf",
    "pdb-2026-c.pdf",
    "inflasi-2024-x.pdf",
    "inflasi-2025-y.pdf",
    "inflasi-2026-z.pdf",
  ];
  for (const name of filenames) {
    const r = await testDb.query(
      `INSERT INTO documents (filename, file_type, file_extension, sha256, file_path, status, chunk_count)
       VALUES ($1,'laporan','pdf',$2,$3,'completed',1) RETURNING id`,
      [name, `sha-${name}`, `/data/raw/${name}`]
    );
    await testDb.query(
      `INSERT INTO chunks (document_id, content, embedding, page_or_slide, chunk_index)
       VALUES ($1, 'teks', $2::vector, 1, 0)`,
      [r.rows[0].id, VEC]
    );
  }
});

afterAll(async () => {
  await truncateAll();
});

test("cluster_edges.semantic = rata-rata kemiripan (dalam 0..1) dan pair_count ada", async () => {
  const res = await request(app).get("/api/documents/graph").set("Cookie", cookie);
  expect(res.status).toBe(200);
  // Hanya ada satu pasangan klaster (klaster 1 dan 2) di antara 6 dokumen.
  expect(res.body.cluster_edges).toHaveLength(1);
  const ce = res.body.cluster_edges[0];

  // Field pair_count wajib ada dan berupa bilangan bulat ≥ 1.
  expect(typeof ce.pair_count).toBe("number");
  expect(ce.pair_count).toBeGreaterThanOrEqual(1);

  // semantic adalah RATA-RATA kemiripan pasangan → harus dalam skala 0..1.
  expect(ce.semantic).toBeGreaterThanOrEqual(0);
  expect(ce.semantic).toBeLessThanOrEqual(1);

  // Semua pasangan lintas klaster identik → rata-rata tepat 1; 3×3 = 9 pasangan.
  expect(ce.semantic).toBe(1);
  expect(ce.pair_count).toBe(9);
});