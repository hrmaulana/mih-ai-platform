import { describe, expect, test } from "bun:test";
import { parseVerifikasi } from "../src/lib/verifikasi";

describe("parser verifikasi klaim", () => {
  test("JSON valid", () => {
    const h = parseVerifikasi('{"jumlah_klaim":4,"tak_didukung":["x"],"skor":0.75}');
    expect(h?.jumlahKlaim).toBe(4);
    expect(h?.skor).toBeCloseTo(0.75, 2);
  });

  test("skor dihitung bila tidak diberikan", () => {
    const h = parseVerifikasi('{"jumlah_klaim":4,"tak_didukung":["a","b"]}');
    expect(h?.skor).toBeCloseTo(0.5, 2);
  });

  test("skor dijepit 0..1", () => {
    expect(parseVerifikasi('{"skor":1.7}')?.skor).toBe(1);
    expect(parseVerifikasi('{"skor":-0.3}')?.skor).toBe(0);
  });

  test("bukan JSON → null", () => {
    expect(parseVerifikasi("tidak ada json")).toBeNull();
  });
});
