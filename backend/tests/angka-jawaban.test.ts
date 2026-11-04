import { describe, expect, test } from "bun:test";
import { angkaTakDidukung } from "../src/services/rag";

describe("penjaga angka jawaban", () => {
  const konteks =
    "Target pertumbuhan ekonomi 2026 sebesar 5,35 persen. Kemiskinan ditargetkan 6,5 sampai 7,5 persen.";

  test("angka yang ada di konteks lolos", () => {
    expect(angkaTakDidukung("Target pertumbuhannya 5,35 persen.", konteks)).toEqual([]);
  });

  test("angka yang tidak ada di konteks ditandai", () => {
    // Kasus T11: korpus menyebut Trans Sumatra, tapi tidak panjang jalannya.
    expect(angkaTakDidukung("Panjang jalan tol Trans Sumatra 1.234 km.", konteks)).toEqual(["1.234"]);
  });

  test("satu angka cocok sudah cukup meloloskan (konservatif)", () => {
    expect(angkaTakDidukung("Target 5,35 persen untuk 2026 dan 2027.", konteks)).toEqual([]);
  });

  test("jawaban tanpa angka tidak diperiksa", () => {
    expect(angkaTakDidukung("Saya tidak menemukan informasi tersebut.", konteks)).toEqual([]);
  });
});
