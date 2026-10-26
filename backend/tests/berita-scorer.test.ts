import { describe, it, expect } from "bun:test";
import { createBeritaScorer } from "../../shared/berita-scorer-core.js";
import { detectClusters, relevanceFloor, applyFloor, validateLLMKeywords } from "../src/lib/highlight.js";
import { calculateLexiconScore } from "../src/lib/lexicon.js";

// Hermetis: bikin scorer sendiri dengan apiKey KOSONG → jalur code-only,
// tanpa jaringan dan tanpa bergantung pada .env / cache modul.
const scorer = createBeritaScorer({
  apiKey: undefined,
  baseUrl: "https://openrouter.ai/api/v1",
  lexiconScore: calculateLexiconScore,
  detectClusters,
  relevanceFloor,
  applyFloor,
  validateLLMKeywords,
});

describe("berita-scorer (pipeline bersama shared/berita-scorer-core)", () => {
  it("teks literal PKPN: floor jadi skor final, confidence code-only, metadata konsisten", async () => {
    const r = await scorer.scoreArticle(
      "Program Kerja Prioritas Nasional",
      "Pemerintah mempercepat PKPN di daerah."
    );
    expect(r.relevansi_llm).toBe(3);        // code-only: relevansi_llm = code floor
    expect(r.relevansi_final).toBe(3);
    expect(r.lantai_diterapkan).toBe(false);
    expect(r.confidence).toBe(0.25);        // jalur fallback code-only
    expect(r.dampak).toBe("netral");
    expect(r.model).toBe("deepseek/deepseek-v4-flash");
    expect(r.prompt_version).toBe("v1");
  });

  it("teks tanpa keyword PKPN/makro: skor 0 dan klaster kosong", async () => {
    const r = await scorer.scoreArticle("Cuaca hari ini", "Hujan turun sejak pagi di sebagian wilayah.");
    expect(r.relevansi_final).toBe(0);
    expect(r.klaster_pkpn).toEqual([]);
    expect(r.keyword_highlight).toEqual([]);
  });

  it("klaster hasil code phase terurut menaik (union deterministik)", async () => {
    const r = await scorer.scoreArticle(
      "Kedaulatan pangan dan energi",
      "Kampung Nelayan Merah Putih serta PLTS 100 GW dibahas dalam rapat."
    );
    expect(Array.isArray(r.klaster_pkpn)).toBe(true);
    expect(r.klaster_pkpn).toEqual([...r.klaster_pkpn].sort((a, b) => a - b));
    expect(r.klaster_pkpn.length).toBeGreaterThan(0);
  });

  it("mode code-only tidak memanggil LLM (tanpa apiKey) dan tetap mengisi lexicon_score", async () => {
    const r = await scorer.scoreArticle("Kinerja positif", "Pertumbuhan ekonomi meningkat dan surplus perdagangan tercatat.");
    expect(["positif", "netral", "negatif"]).toContain(r.sentimen_teks);
    expect(typeof r.lexicon_score).toBe("number");
    expect(r.topik).toBe("");
    expect(r.alasan).toBe("");
  });
});
