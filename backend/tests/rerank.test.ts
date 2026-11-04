import { describe, expect, test } from "bun:test";
import { entitasAngka, pilihRerank, skorEntitas, skorJudul, skorKandidat, tokenPenting } from "../src/services/rerank";
import { decideAbstainKalibrasi } from "../src/services/retrieval";

const kandidat = (isi: Partial<{ id: number; content: string; filename: string; sim: number; document_id: number }>) => ({
  id: isi.id ?? 1,
  content: isi.content ?? "",
  filename: isi.filename ?? "dokumen.pdf",
  section_title: null,
  sim: isi.sim ?? 0.7,
  document_id: isi.document_id ?? 1,
});

describe("sinyal rerank", () => {
  test("entitas angka terambil dari pertanyaan", () => {
    expect(entitasAngka("Berapa target pertumbuhan 5,35% untuk RKP 2026?")).toContain("5,35");
    expect(entitasAngka("Berapa target pertumbuhan?")).toEqual([]);
  });

  test("chunk yang memuat tahun pertanyaan menang", () => {
    const q = "target RKP 2026";
    const cocok = kandidat({ content: "Target RKP 2026 sebesar 5,35%", sim: 0.8 });
    const lain = kandidat({ content: "Target RKP 2025 sebesar 5,2%", sim: 0.8 });
    expect(skorEntitas(q, cocok)).toBeGreaterThan(skorEntitas(q, lain));
    expect(skorKandidat(q, cocok, 0.5)).toBeGreaterThan(skorKandidat(q, lain, 0.5));
  });

  test("judul/bagian dokumen ikut dinilai", () => {
    const q = "kebijakan pangan";
    const d = kandidat({ content: "isi", filename: "Kebijakan-Pangan-2026.pdf" });
    expect(skorJudul(q, d)).toBeGreaterThan(0);
  });

  test("token umum dibuang", () => {
    expect(tokenPenting("berapa target yang ada")).not.toContain("yang");
    expect(tokenPenting("berapa target yang ada")).toContain("target");
  });
});

describe("pemilihan hasil (MMR + batas per dokumen)", () => {
  test("membatasi chunk dari dokumen yang sama", () => {
    const kandidatBanyak = Array.from({ length: 6 }, (_, i) =>
      kandidat({ id: i + 1, content: `isi chunk ${i} tentang target 2026`, document_id: 7, sim: 0.9 - i * 0.01 }),
    );
    const hasil = pilihRerank(kandidatBanyak, "target 2026", 5, {
      sim: 0.4, leksikal: 0.2, entitas: 0.3, judul: 0.1, lambda: 0.3, perDokumen: 2,
    });
    expect(hasil.length).toBe(2);
  });

  test("menghindari chunk yang hampir identik", () => {
    const teks = "Target pertumbuhan ekonomi 2026 adalah 5,35 persen dari PDB";
    const daftar = [
      kandidat({ id: 1, content: teks, document_id: 1, sim: 0.9 }),
      kandidat({ id: 2, content: teks, document_id: 2, sim: 0.89 }),
      kandidat({ id: 3, content: "Kemiskinan ekstrem 2026 ditargetkan 0,5 persen", document_id: 3, sim: 0.8 }),
    ];
    const hasil = pilihRerank(daftar, "target 2026", 2, {
      sim: 0.4, leksikal: 0.2, entitas: 0.3, judul: 0.1, lambda: 0.8, perDokumen: 3,
    });
    const id = hasil.map((h) => h.id);
    expect(id).toContain(1);
    expect(id).not.toContain(2);
  });
});

describe("kalibrasi abstain", () => {
  test("vektor rendah tapi leksikal kuat → jangan menolak", () => {
    expect(decideAbstainKalibrasi(0.5, 0.4, 0.58, 0.12)).toBe(false);
  });

  test("vektor rendah dan leksikal lemah → menolak", () => {
    expect(decideAbstainKalibrasi(0.5, 0.02, 0.58, 0.12)).toBe(true);
  });

  test("vektor cukup tinggi → tidak menolak", () => {
    expect(decideAbstainKalibrasi(0.7, 0, 0.58, 0.12)).toBe(false);
  });
});
