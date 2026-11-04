import { describe, expect, test } from "bun:test";
import { normalisasi, verbatim } from "../scripts/generate-eval-set";

describe("validasi jawaban verbatim", () => {
  const isi = "Target pertumbuhan ekonomi 2026 ditetapkan sebesar 5,35 persen dalam RKP.";

  test("kutipan persis diterima", () => {
    expect(verbatim(isi, "5,35 persen")).toBe(true);
    expect(verbatim(isi, "Target pertumbuhan ekonomi 2026")).toBe(true);
  });

  test("perbedaan kapitalisasi & spasi tetap diterima", () => {
    expect(verbatim(isi, "  target   PERTUMBUHAN ekonomi  ")).toBe(true);
  });

  test("parafrase ditolak", () => {
    expect(verbatim(isi, "lima koma tiga puluh lima persen")).toBe(false);
    expect(verbatim(isi, "pertumbuhan ekonomi ditargetkan 5,4%")).toBe(false);
  });

  test("jawaban terlalu pendek ditolak", () => {
    expect(verbatim(isi, "5")).toBe(false);
  });

  test("normalisasi menghapus tanda kutip dan spasi ganda", () => {
    expect(normalisasi('“Target  2026”')).toBe("target 2026");
  });
});
