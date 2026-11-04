import { describe, expect, test } from "bun:test";
import { hitungBiaya } from "../src/lib/prices";
import { isBot, kelompokJalur, kelasStatus } from "../src/lib/trafik";

describe("hitungBiaya", () => {
  const harga = { usd_in_per_1m: 0.15, usd_out_per_1m: 0.6 };

  test("menghitung biaya dari token masuk & keluar", () => {
    // 1jt token in (0,15) + 0,5jt token out (0,30) = 0,45
    expect(hitungBiaya(harga, 1_000_000, 500_000)).toBe(0.45);
  });

  test("token nol di satu sisi tetap dihitung sisi lain", () => {
    expect(hitungBiaya(harga, 0, 1_000_000)).toBe(0.6);
    expect(hitungBiaya(harga, 1_000_000, 0)).toBe(0.15);
  });

  test("tanpa token sama sekali → null", () => {
    expect(hitungBiaya(harga, 0, 0)).toBeNull();
    expect(hitungBiaya(harga, null, null)).toBeNull();
  });

  test("model tanpa harga → null, bukan 0", () => {
    expect(hitungBiaya(null, 1000, 1000)).toBeNull();
    expect(hitungBiaya({ usd_in_per_1m: null, usd_out_per_1m: 1 }, 1000, 1000)).toBeNull();
  });
});

describe("klasifikasi trafik", () => {
  test("UA bot dikenali", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)", "/")).toBe(true);
    expect(isBot("curl/8.5.0", "/")).toBe(true);
    expect(isBot("", "/")).toBe(true);
  });

  test("browser manusia bukan bot", () => {
    expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0 Safari/537.36", "/documents")).toBe(false);
  });

  test("path scanner dikenali walau UA menyamar", () => {
    expect(isBot("Mozilla/5.0 Chrome/156", "/wp-login.php")).toBe(true);
    expect(isBot("Mozilla/5.0 Chrome/156", "/.env")).toBe(true);
    expect(isBot("Mozilla/5.0 Chrome/156", "/.git/config")).toBe(true);
  });

  test("jalur dikelompokkan", () => {
    expect(kelompokJalur("/assets/index-abc.js")).toBe("/assets/*");
    expect(kelompokJalur("/api/ask?x=1")).toBe("/api/ask");
    expect(kelompokJalur("/documents/123")).toBe("/documents/:id");
    expect(kelompokJalur("/")).toBe("/");
  });

  test("kelas status", () => {
    expect(kelasStatus(200)).toBe("2xx");
    expect(kelasStatus(301)).toBe("3xx");
    expect(kelasStatus(404)).toBe("4xx");
    expect(kelasStatus(503)).toBe("5xx");
  });
});
