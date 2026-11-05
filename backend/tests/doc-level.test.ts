import { describe, expect, test } from "bun:test";
import { saringDokumenTeratas } from "../src/services/rag";

const k = (doc: number, skor: number) => ({ r: { document_id: doc } as any, skor });

describe("peringkat dokumen (dua tahap)", () => {
  test("dokumen dengan beberapa chunk cocok menang atas satu chunk tinggi", () => {
    // dok 2 punya tiga chunk baik (bukti menyebar); dok 1 hanya satu chunk puncak.
    const pra = [k(1, 0.90), k(2, 0.80), k(2, 0.78), k(2, 0.76), k(3, 0.60)];
    const hasil = saringDokumenTeratas(pra, 1);
    expect(hasil.every((x) => x.r.document_id === 2)).toBe(true);
  });

  test("hanya dokumen teratas yang dipertahankan", () => {
    const pra = [k(1, 0.9), k(2, 0.8), k(3, 0.7), k(4, 0.1)];
    const hasil = saringDokumenTeratas(pra, 2);
    const dok = [...new Set(hasil.map((x) => x.r.document_id))].sort();
    expect(dok).toEqual([1, 2]);
  });

  test("urutan chunk di dalam dokumen tidak berubah", () => {
    const pra = [k(5, 0.9), k(5, 0.5), k(6, 0.8)];
    const hasil = saringDokumenTeratas(pra, 1);
    expect(hasil.map((x) => x.skor)).toEqual([0.9, 0.5]);
  });
});
