import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import request from "supertest";
import { createApp } from "../src/app";
import { testDb, applySchema, truncateAll } from "./helpers";
import { hashToken } from "../src/lib/token";
import { hashPassword } from "../src/lib/passwords";

// S1 loop pertumbuhan: umpan balik harus tersimpan bersih (bisa ditambang nanti),
// dan muatan tidak sah ditolak di pintu masuk — bukan dibiarkan masuk tabel.
const app = createApp();
const TOKEN = "mih_fb";

beforeAll(async () => {
  await applySchema();
  // Tabel umpan balik datang dari migrasi (init.sql hanya skema dasar), jadi migrasinya
  // dijalankan di sini — sekaligus membuktikan berkas migrasi bisa diterapkan.
  await testDb.query(readFileSync(new URL("../../db/migrations/006_chat_feedback.sql", import.meta.url), "utf8"));
  await truncateAll();
  const user = await testDb.query(
    "INSERT INTO users (name,email,unit_kerja,password_hash,is_admin) VALUES ('FB','fb@t.c','Uji',$1,FALSE) RETURNING id",
    [hashPassword("x")],
  );
  await testDb.query(
    "INSERT INTO api_tokens (user_id,name,token_hash,scope,daily_limit) VALUES ($1,'t',$2,'internal-read',10)",
    [user.rows[0].id, hashToken(TOKEN)],
  );
});

afterAll(async () => {
  await truncateAll();
});

const kirim = (muatan: unknown) =>
  request(app).post("/api/feedback").set("Authorization", `Bearer ${TOKEN}`).send(muatan as object);

test("menyimpan umpan balik yang sah", async () => {
  const res = await kirim({
    pertanyaan: "Berapa pertumbuhan ekonomi 2026?",
    jawaban: "5,3 persen [1].",
    sitasi: [{ label: 1, filename: "rkp.pdf" }],
    nilai: 1,
    model: "gpt-4o-mini",
    skorTerbaik: 0.71,
    promptVariant: 3,
  });
  expect(res.status).toBe(201);
  const { rows } = await testDb.query("SELECT nilai, sitasi, skor_terbaik FROM chat_feedback WHERE id=$1", [res.body.id]);
  expect(Number(rows[0].nilai)).toBe(1);
  expect(Array.isArray(rows[0].sitasi)).toBe(true);
  expect(Number(rows[0].skor_terbaik)).toBeCloseTo(0.71, 2);
});

test("menolak nilai di luar 1/-1", async () => {
  const res = await kirim({ pertanyaan: "apa itu inflasi", jawaban: "a", nilai: 0 });
  expect(res.status).toBe(400);
});

test("menolak jawaban kosong", async () => {
  const res = await kirim({ pertanyaan: "apa itu inflasi", jawaban: "   ", nilai: 1 });
  expect(res.status).toBe(400);
});

test("menolak alasan lebih dari 500 karakter", async () => {
  const res = await kirim({ pertanyaan: "apa itu inflasi", jawaban: "a", nilai: -1, alasan: "x".repeat(501) });
  expect(res.status).toBe(400);
});

test("menolak permintaan tanpa token", async () => {
  const res = await request(app).post("/api/feedback").send({ pertanyaan: "apa itu inflasi", jawaban: "a", nilai: 1 });
  expect([401, 403]).toContain(res.status);
});
