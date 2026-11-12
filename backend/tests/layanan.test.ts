import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import request from "supertest";
import { createApp } from "../src/app";
import { testDb, applySchema } from "./helpers";
import { hashPassword } from "../src/lib/passwords";

// Menu Layanan Publik: konten dibaca portal, dikelola CMS.
// Yang dijaga di sini: item ber-akses "login" TIDAK boleh bocor ke pengunjung
// yang belum login, dan hanya admin yang boleh mengubah konten.
const app = createApp();
let cookieAdmin = "";
let cookieStaf = "";

beforeAll(async () => {
  await applySchema();
  // Tabel layanan_publik datang dari migrasi (init.sql hanya skema dasar).
  await testDb.query(readFileSync(new URL("../../db/migrations/015_layanan_publik.sql", import.meta.url), "utf8"));

  await testDb.query("TRUNCATE users RESTART IDENTITY CASCADE");
  await testDb.query(
    "INSERT INTO users (name,email,unit_kerja,password_hash,is_admin) VALUES ('Admin','a@x.c','Uji',$1,TRUE)",
    [hashPassword("adminpw")],
  );
  await testDb.query(
    "INSERT INTO users (name,email,unit_kerja,password_hash,is_admin) VALUES ('Staf','s@x.c','Uji',$1,FALSE)",
    [hashPassword("stafpw")],
  );
  const a = await request(app).post("/api/auth/login").send({ email: "a@x.c", password: "adminpw" });
  cookieAdmin = a.headers["set-cookie"][0].split(";")[0];
  const s = await request(app).post("/api/auth/login").send({ email: "s@x.c", password: "stafpw" });
  cookieStaf = s.headers["set-cookie"][0].split(";")[0];
});

afterAll(async () => {
  await testDb.query("TRUNCATE layanan_publik RESTART IDENTITY CASCADE");
});

beforeEach(async () => {
  await testDb.query("TRUNCATE layanan_publik RESTART IDENTITY CASCADE");
  await testDb.query(
    `INSERT INTO layanan_publik (jenis, slug, judul, urutan, akses, is_published, payload) VALUES
      ('jenis_layanan','layanan-a','Layanan A',1,'publik',TRUE,'{"deskripsi":"A"}'),
      ('jenis_layanan','layanan-b','Layanan B',2,'publik',TRUE,'{"deskripsi":"B"}'),
      ('survey','laporan-survei','Laporan Survei',1,'login',TRUE,'{"periode":"2026"}'),
      ('jenis_layanan','draf-c','Draf C',3,'publik',FALSE,'{}')`,
  );
});

// ---------- publik ----------

test("pengunjung (belum login) hanya menerima item publik & terbit", async () => {
  const res = await request(app).get("/api/layanan");
  expect(res.status).toBe(200);
  const slugs = res.body.map((r: any) => r.slug).sort();
  expect(slugs).toEqual(["layanan-a", "layanan-b"]); // tanpa draf, tanpa item login
});

test("pengguna login juga menerima item ber-akses login", async () => {
  const res = await request(app).get("/api/layanan").set("Cookie", cookieStaf);
  expect(res.status).toBe(200);
  const slugs = res.body.map((r: any) => r.slug).sort();
  expect(slugs).toEqual(["laporan-survei", "layanan-a", "layanan-b"]);
});

test("filter jenis menyaring hasil", async () => {
  const res = await request(app).get("/api/layanan?jenis=jenis_layanan");
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(2);
  expect(res.body.every((r: any) => r.jenis === "jenis_layanan")).toBe(true);
});

test("jenis tidak dikenal ditolak 400", async () => {
  const res = await request(app).get("/api/layanan?jenis=ngawur");
  expect(res.status).toBe(400);
});

test("item login-only tidak muncul di daftar publik meski jenisnya sama", async () => {
  await testDb.query(
    `INSERT INTO layanan_publik (jenis, slug, judul, akses, payload)
     VALUES ('dokumentasi','lap-internal','Laporan Internal','login','{}')`,
  );
  const publik = await request(app).get("/api/layanan?jenis=dokumentasi");
  expect(publik.body.length).toBe(0);
  const login = await request(app).get("/api/layanan?jenis=dokumentasi").set("Cookie", cookieStaf);
  expect(login.body.length).toBe(1);
});

// ---------- admin (CMS) ----------

test("daftar admin butuh login (401)", async () => {
  const res = await request(app).get("/api/admin/layanan");
  expect(res.status).toBe(401);
});

test("non-admin ditolak 403", async () => {
  const res = await request(app).get("/api/admin/layanan").set("Cookie", cookieStaf);
  expect(res.status).toBe(403);
});

test("admin melihat semua item termasuk draf", async () => {
  const res = await request(app).get("/api/admin/layanan").set("Cookie", cookieAdmin);
  expect(res.status).toBe(200);
  const slugs = res.body.map((r: any) => r.slug);
  expect(slugs).toContain("draf-c");
  expect(slugs).toContain("laporan-survei");
});

test("admin dapat membuat item baru", async () => {
  const res = await request(app)
    .post("/api/admin/layanan")
    .set("Cookie", cookieAdmin)
    .send({
      jenis: "layanan_lainnya",
      slug: "penerimaan-tamu",
      judul: "Penerimaan Tamu Dinas",
      akses: "publik",
      payload: { penjelasan: "Kunjungan dinas", kontak: { nama: "Sekretariat", wa: "", email: "" } },
    });
  expect(res.status).toBe(201);
  expect(res.body.slug).toBe("penerimaan-tamu");
  const { rows } = await testDb.query("SELECT payload FROM layanan_publik WHERE slug=$1", ["penerimaan-tamu"]);
  expect(rows[0].payload.penjelasan).toBe("Kunjungan dinas");
});

test("slug duplikat ditolak 409", async () => {
  const res = await request(app)
    .post("/api/admin/layanan")
    .set("Cookie", cookieAdmin)
    .send({ jenis: "jenis_layanan", slug: "layanan-a", judul: "Duplikat", payload: {} });
  expect(res.status).toBe(409);
});

test("validasi: jenis salah & payload bukan objek ditolak 400", async () => {
  const salahJenis = await request(app)
    .post("/api/admin/layanan")
    .set("Cookie", cookieAdmin)
    .send({ jenis: "salah", slug: "x-1", judul: "X", payload: {} });
  expect(salahJenis.status).toBe(400);

  const salahPayload = await request(app)
    .post("/api/admin/layanan")
    .set("Cookie", cookieAdmin)
    .send({ jenis: "jenis_layanan", slug: "x-2", judul: "X", payload: [1, 2] });
  expect(salahPayload.status).toBe(400);
});

test("admin dapat mengubah & menghapus item", async () => {
  const list = await request(app).get("/api/admin/layanan").set("Cookie", cookieAdmin);
  const target = list.body.find((r: any) => r.slug === "layanan-a");

  const upd = await request(app)
    .put(`/api/admin/layanan/${target.id}`)
    .set("Cookie", cookieAdmin)
    .send({ jenis: "jenis_layanan", slug: "layanan-a", judul: "Layanan A (revisi)", akses: "login", payload: { deskripsi: "diubah" } });
  expect(upd.status).toBe(200);
  expect(upd.body.judul).toBe("Layanan A (revisi)");
  expect(upd.body.akses).toBe("login");

  const del = await request(app).delete(`/api/admin/layanan/${target.id}`).set("Cookie", cookieAdmin);
  expect(del.status).toBe(200);
  expect(del.body.ok).toBe(true);

  const after = await request(app).get("/api/admin/layanan").set("Cookie", cookieAdmin);
  expect(after.body.find((r: any) => r.slug === "layanan-a")).toBeUndefined();
});
