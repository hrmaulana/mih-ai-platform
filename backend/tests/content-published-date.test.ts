import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import request from "supertest";
import { createApp } from "../src/app";
import { testDb, applySchema } from "./helpers";
import { hashPassword } from "../src/lib/passwords";

// Tanggal terbit berita/publikasi.
// Yang dijaga di sini: urutan berita/publikasi HARUS kronologis (bukan
// leksikografis seperti waktu kolom `date` masih TEXT), dan tanggal terbit
// bisa diisi/diubah dari CMS.
const app = createApp();
let cookie = "";

beforeAll(async () => {
  await applySchema();
  await testDb.query(readFileSync(new URL("../../db/migrations/017_content_published_date.sql", import.meta.url), "utf8"));
  await testDb.query("TRUNCATE users RESTART IDENTITY CASCADE");
  await testDb.query(
    "INSERT INTO users (name,email,unit_kerja,password_hash,is_admin) VALUES ('Admin','a@x.c','Uji',$1,TRUE)",
    [hashPassword("adminpw")],
  );
  const login = await request(app).post("/api/auth/login").send({ email: "a@x.c", password: "adminpw" });
  cookie = login.headers["set-cookie"][0].split(";")[0];
});

afterAll(async () => {
  await testDb.query("TRUNCATE content RESTART IDENTITY CASCADE");
});

beforeEach(async () => {
  await testDb.query("TRUNCATE content RESTART IDENTITY CASCADE");
});

const kirim = (body: Record<string, unknown>) =>
  request(app).post("/api/admin/content").set("Cookie", cookie).send(body);

test("kolom published_date ada & bertipe date", async () => {
  const { rows } = await testDb.query(
    "SELECT data_type FROM information_schema.columns WHERE table_name='content' AND column_name='published_date'",
  );
  expect(rows.length).toBe(1);
  expect(rows[0].data_type).toBe("date");
});

test("migrasi mem-parse format Indonesia dan ISO dengan benar", async () => {
  await testDb.query(
    `INSERT INTO content (type, slug, title, date, created_at) VALUES
      ('news','a','A','8 Agustus 2026','2026-08-26 10:00+07'),
      ('news','b','B','27 November 2025','2026-08-26 10:00+07'),
      ('news','c','C','2026-11-12','2026-11-12 09:00+07'),
      ('news','d','D','','2026-09-01 09:00+07')`,
  );
  // jalankan ulang migrasi (idempoten) untuk baris yang baru dimasukkan
  await testDb.query(readFileSync(new URL("../../db/migrations/017_content_published_date.sql", import.meta.url), "utf8"));

  const { rows } = await testDb.query("SELECT slug, published_date FROM content ORDER BY slug");
  const map = Object.fromEntries(rows.map((r: any) => [r.slug, r.published_date]));
  expect(new Date(map.a).toISOString().slice(0, 10)).toBe("2026-08-08");
  expect(new Date(map.b).toISOString().slice(0, 10)).toBe("2025-11-27");
  expect(new Date(map.c).toISOString().slice(0, 10)).toBe("2026-11-12");
  expect(new Date(map.d).toISOString().slice(0, 10)).toBe("2026-09-01"); // fallback created_at
});

test("urutan /api/content kronologis menurun (bukan leksikografis)", async () => {
  await testDb.query(
    `INSERT INTO content (type, slug, title, date, published_date, is_published) VALUES
      ('news','jun','Juni','25 Juni 2026','2026-06-25',TRUE),
      ('news','agu','Agustus','8 Agustus 2026','2026-08-08',TRUE),
      ('news','nov','November','27 November 2025','2025-11-27',TRUE),
      ('news','apr','April','16 April 2026','2026-04-16',TRUE)`,
  );
  const res = await request(app).get("/api/content");
  expect(res.status).toBe(200);
  // Terbaru lebih dulu: 8 Agu 2026 > 25 Jun 2026 > 16 Apr 2026 > 27 Nov 2025
  expect(res.body.map((r: any) => r.slug)).toEqual(["agu", "jun", "apr", "nov"]);
});

test("CMS: menambah konten dengan published_date tersimpan", async () => {
  const res = await kirim({
    type: "news",
    slug: "berita-baru",
    title: "Berita Baru",
    content: "<p>isi</p>",
    published_date: "2026-03-15",
  });
  expect(res.status).toBe(201);
  const { rows } = await testDb.query("SELECT published_date FROM content WHERE slug='berita-baru'");
  expect(new Date(rows[0].published_date).toISOString().slice(0, 10)).toBe("2026-03-15");
});

test("CMS: tanpa published_date → diisi tanggal hari ini", async () => {
  const res = await kirim({ type: "news", slug: "tanpa-tanggal", title: "Tanpa Tanggal", content: "<p>x</p>" });
  expect(res.status).toBe(201);
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await testDb.query("SELECT published_date FROM content WHERE slug='tanpa-tanggal'");
  expect(new Date(rows[0].published_date).toISOString().slice(0, 10)).toBe(today);
});

test("CMS: published_date dapat diubah", async () => {
  const buat = await kirim({ type: "news", slug: "ubah", title: "Ubah", content: "<p>x</p>", published_date: "2026-01-01" });
  expect(buat.status).toBe(201);
  const upd = await request(app)
    .put(`/api/admin/content/${buat.body.id}`)
    .set("Cookie", cookie)
    .send({ published_date: "2026-12-31" });
  expect(upd.status).toBe(200);
  const { rows } = await testDb.query("SELECT published_date FROM content WHERE id=$1", [buat.body.id]);
  expect(new Date(rows[0].published_date).toISOString().slice(0, 10)).toBe("2026-12-31");
});

test("created_at tetap waktu pembuatan baris (tidak diubah published_date)", async () => {
  const res = await kirim({ type: "news", slug: "cek-created", title: "Cek", content: "<p>x</p>", published_date: "2020-01-01" });
  expect(res.status).toBe(201);
  const { rows } = await testDb.query("SELECT published_date, created_at FROM content WHERE id=$1", [res.body.id]);
  expect(new Date(rows[0].published_date).toISOString().slice(0, 10)).toBe("2020-01-01");
  // created_at harus "sekarang", bukan 2020
  const selisihHari = Math.abs(Date.now() - new Date(rows[0].created_at).getTime()) / 86400000;
  expect(selisihHari).toBeLessThan(1);
});
