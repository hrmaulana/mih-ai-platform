import { describe, expect, it } from "bun:test";
import { tokenize, bobotToken, lexicalScore, rrfFuse, decideAbstain } from "../src/services/retrieval";

describe("retrieval.tokenize", () => {
  it("membuang kata umum & tanda baca, menahan angka penting", () => {
    const t = tokenize("Berapa pertumbuhan ekonomi Indonesia pada tahun 2026?");
    expect(t).toContain("pertumbuhan");
    expect(t).toContain("2026");
    expect(t).not.toContain("pada");
    expect(t).not.toContain("berapa");
  });
});

describe("retrieval.bobotToken", () => {
  it("angka dan persentase berbobot lebih tinggi daripada kata biasa", () => {
    expect(bobotToken("2026")).toBeGreaterThan(bobotToken("ekonomi"));
    expect(bobotToken("4,7%")).toBeGreaterThan(bobotToken("ekonomi"));
    expect(bobotToken("75,7")).toBeGreaterThan(bobotToken("pertumbuhan"));
  });
});

describe("retrieval.lexicalScore", () => {
  it("chunk yang memuat angka kunci kueri lebih tinggi daripada yang tidak", () => {
    const kueri = "Berapa rata-rata harga minyak mentah triwulan I 2026?";
    const cocok = lexicalScore(kueri, "Harga minyak mentah rata-rata USD75,7 per barel pada triwulan I 2026.");
    const tidak = lexicalScore(kueri, "Pertumbuhan ekonomi Indonesia didorong konsumsi rumah tangga.");
    expect(cocok).toBeGreaterThan(tidak);
    expect(cocok).toBeGreaterThan(0.5);
  });

  it("kueri tanpa token bermakna → skor 0", () => {
    expect(lexicalScore("dan atau yang", "teks apa saja")).toBe(0);
  });
});

describe("retrieval.rrfFuse", () => {
  const v = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const l = [{ id: 3 }, { id: 1 }, { id: 9 }];

  it("menggabungkan dua peringkat menjadi satu skor gabungan", () => {
    const f = rrfFuse(v, l);
    expect(f.size).toBe(4);
    expect(f.has(1) && f.has(3) && f.has(9)).toBe(true);
  });

  it("dokumen yang muncul di kedua daftar mengalahkan yang hanya di satu", () => {
    const f = rrfFuse(v, l);
    expect(f.get(1)!).toBeGreaterThan(f.get(2)!);
    expect(f.get(3)!).toBeGreaterThan(f.get(9)!);
  });
});

describe("retrieval.decideAbstain", () => {
  it("menolak bila skor terbaik di bawah ambang atau tidak ada hasil", () => {
    expect(decideAbstain(0.2, 0.35)).toBe(true);
    expect(decideAbstain(null, 0.35)).toBe(true);
  });

  it("tidak menolak bila skor terbaik memadai", () => {
    expect(decideAbstain(0.62, 0.35)).toBe(false);
  });
});

describe("retrieval.harusMenolak (jalur aplikasi)", () => {
  it("menolak bila skor di bawah ambang, tetapi tidak memaksa pada jalur webhook", async () => {
    const rag = await import("../src/services/rag");
    const cfg = (await import("../src/config")).config;
    cfg.ragAbstainMin = 0.58;
    expect(rag.harusMenolak({ labeled: [], context: "", isComparison: false, bestScore: 0.4 })).toBe(true);
    expect(rag.harusMenolak({ labeled: [], context: "", isComparison: false, bestScore: 0.7 })).toBe(false);
    // skor tidak diketahui (jalur webhook) -> jangan pernah dipaksa menolak
    expect(rag.harusMenolak({ labeled: [], context: "", isComparison: false, bestScore: null })).toBe(false);
  });

  it("frasa penolakan sama dengan yang diminta system prompt", () => {
    const teks = "Saya tidak menemukan informasi tersebut dalam dokumen yang tersedia.";
    return import("../src/services/rag").then((rag) => expect(rag.JAWABAN_TIDAK_DITEMUKAN).toBe(teks));
  });
});

describe("llm.selectSystemPrompt varian", () => {
  it("varian 1 = bawaan; varian 2 menambah catatan anti-penolakan-keliru", async () => {
    const llm = await import("../src/services/llm");
    expect(llm.selectSystemPrompt(false, 1)).toBe(llm.SYSTEM_PROMPT);
    const v2 = llm.selectSystemPrompt(false, 2);
    expect(v2).toContain("Kalimat penolakan HANYA dipakai");
    expect(llm.selectSystemPrompt(true, 2)).toContain("INSTRUKSI KHUSUS");
  });
});

describe("retrieval.varianKueri (ekspansi kueri)", () => {
  it("menghasilkan beberapa varian: kueri asli, tanpa kata tanya, dan kantong kata kunci", async () => {
    const { varianKueri } = await import("../src/services/retrieval");
    const v = varianKueri("Berapa rata-rata harga minyak mentah pada triwulan I tahun 2026?");
    expect(v.length).toBeGreaterThanOrEqual(3);
    expect(v[0]).toContain("minyak");
    expect(v.some((x) => x === "minyak mentah triwulan 2026" || x.includes("minyak mentah"))).toBe(true);
    expect(new Set(v).size).toBe(v.length); // tidak ada duplikat
  });

  it("kueri pendek tetap menghasilkan minimal satu varian", async () => {
    const { varianKueri } = await import("../src/services/retrieval");
    expect(varianKueri("inflasi").length).toBeGreaterThanOrEqual(1);
  });
});

describe("retrieval.rrfFuseBanyak", () => {
  it("menggabungkan lebih dari dua peringkat", async () => {
    const { rrfFuseBanyak } = await import("../src/services/retrieval");
    const f = rrfFuseBanyak([[{ id: 1 }, { id: 2 }], [{ id: 2 }], [{ id: 3 }, { id: 2 }]]);
    expect(f.size).toBe(3);
    expect(f.get(2)!).toBeGreaterThan(f.get(1)!);
    expect(f.get(2)!).toBeGreaterThan(f.get(3)!);
  });
});

describe("retrieval.pecahKalimat", () => {
  it("memecah chunk menjadi kalimat bermakna dan membuang potongan terlalu pendek", async () => {
    const { pecahKalimat } = await import("../src/services/retrieval");
    const k = pecahKalimat("Pertumbuhan ekonomi 5,1 persen. Ekspor naik 3,2 persen. Ya.", 8, 15);
    expect(k.length).toBe(2);
    expect(k[0]).toContain("Pertumbuhan ekonomi");
  });

  it("menghormati batas jumlah kalimat", async () => {
    const { pecahKalimat } = await import("../src/services/retrieval");
    const t = Array.from({ length: 20 }, (_, i) => `Kalimat panjang nomor ${i} menjelaskan sesuatu yang penting.`).join(" ");
    expect(pecahKalimat(t, 5, 15).length).toBe(5);
  });
});

describe("retrieval.skorMaxSim", () => {
  it("mengambil kemiripan tertinggi antar kueri dan kalimat, dan menormalkan vektor", async () => {
    const { skorMaxSim } = await import("../src/services/retrieval");
    const q = [1, 0, 0];
    const kalimat = [[0, 1, 0], [10, 0, 0]]; // vektor kedua searah kueri
    expect(skorMaxSim(q, kalimat)).toBeCloseTo(1, 3);
    expect(skorMaxSim(q, [[0, 1, 0]])).toBeCloseTo(0, 3);
    expect(skorMaxSim(q, [])).toBe(0);
  });
});

describe("llm.bersihkanKueri (penulisan ulang kueri)", () => {
  it("membuang kutipan/newline dan memampatkan spasi", async () => {
    const { bersihkanKueri } = await import("../src/services/llm");
    expect(bersihkanKueri('  "pertumbuhan ekonomi 2026"\n')).toBe("pertumbuhan ekonomi 2026");
  });

  it("menolak keluaran kosong/terlalu pendek dan memotong yang kepanjangan", async () => {
    const { bersihkanKueri } = await import("../src/services/llm");
    expect(bersihkanKueri("")).toBe("");
    expect(bersihkanKueri("ab")).toBe("");
    const panjang = Array.from({ length: 60 }, (_, i) => `kata${i}`).join(" ");
    expect(bersihkanKueri(panjang).split(" ").length).toBe(25);
  });
});

describe("llm.tulisUlangKueri", () => {
  it("mode mock mengembalikan pertanyaan apa adanya tanpa memanggil jaringan", async () => {
    const llm = await import("../src/services/llm");
    const cfg = (await import("../src/config")).config;
    const lama = cfg.llmProvider;
    cfg.llmProvider = "mock";
    expect(await llm.tulisUlangKueri("Berapa inflasi 2026?")).toBe("Berapa inflasi 2026?");
    cfg.llmProvider = lama;
  });
});

describe("retrieval.perluTulisUlang (tulis-ulang bersyarat)", () => {
  it("tidak menulis ulang bila pencarian awal sudah kuat", async () => {
    const { perluTulisUlang } = await import("../src/services/retrieval");
    expect(perluTulisUlang(0.72, 4, 0.65)).toBe(false);
  });
  it("menulis ulang bila kemiripan rendah, tanpa hasil leksikal, atau tanpa hasil sama sekali", async () => {
    const { perluTulisUlang } = await import("../src/services/retrieval");
    expect(perluTulisUlang(0.6, 4, 0.65)).toBe(true);
    expect(perluTulisUlang(0.72, 0, 0.65)).toBe(true);
    expect(perluTulisUlang(null, 3, 0.65)).toBe(true);
  });
});
