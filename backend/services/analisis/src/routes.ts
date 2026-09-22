import { Router } from "express";
import { requireAuth } from "./middleware/auth";
import { scoreArticle } from "./services/berita-scorer";
import { calculateLexiconScore } from "./lib/lexicon";
import { analyzeSentimentLLM } from "./lib/llm-sentiment";

const router = Router();

// ---- Healthcheck ----
router.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "analisis" });
});

// ---- POST /api/analisis/sentimen ----
// Analisis sentimen teks menggunakan LLM (dengan fallback lexicon)
router.post("/api/analisis/sentimen", requireAuth, async (req, res) => {
  try {
    const { text, sumber } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text wajib diisi (string)" });
    }

    // Hitung lexicon score dulu
    const lexResult = calculateLexiconScore(text);

    let finalScore = lexResult.score;
    let method = "lexicon";
    let keyword = lexResult.details.positive.slice(0, 3).join(", ");
    let ringkasan = "";

    // Jika ambiguitas, gunakan LLM
    if (Math.abs(lexResult.score) < 0.3) {
      const llmResult = await analyzeSentimentLLM(text, sumber);
      if (llmResult.score !== 0 || llmResult.keyword) {
        finalScore = (lexResult.score + llmResult.score) / 2;
        method = "hybrid";
        keyword = llmResult.keyword || keyword;
        ringkasan = llmResult.ringkasan;
      }
    }

    let sentimen: string;
    if (finalScore > 0.1) sentimen = "positif";
    else if (finalScore < -0.1) sentimen = "negatif";
    else sentimen = "netral";

    res.json({
      success: true,
      data: {
        sentimen,
        skor: Math.round(finalScore * 1000) / 1000,
        rincian: {
          lexicon_score: lexResult.score,
          kata_positif: lexResult.details.positive,
          kata_negatif: lexResult.details.negative,
          keyword,
          ringkasan,
          metode: method,
        },
      },
    });
  } catch (err) {
    console.error("[analisis] sentimen error:", err);
    res.status(500).json({ error: "gagal menganalisis sentimen" });
  }
});

// ---- POST /api/analisis/pkpn ----
// Skor 3-axis PKPN: relevansi, dampak, sentimen_teks
router.post("/api/analisis/pkpn", requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text wajib diisi (string)" });
    }

    const score = await scoreArticle(text, "");

    res.json({
      success: true,
      data: {
        relevansi: score.relevansi_final,
        relevansi_llm: score.relevansi_llm,
        lantai_diterapkan: score.lantai_diterapkan,
        dampak: score.dampak,
        sentimen_teks: score.sentimen_teks,
        klaster_pkpn: score.klaster_pkpn,
        topik: score.topik,
        alasan: score.alasan,
        keyword_highlight: score.keyword_highlight,
        lexicon_score: score.lexicon_score,
        confidence: score.confidence,
        perlu_review_manual: score.perlu_review_manual,
      },
    });
  } catch (err) {
    console.error("[analisis] pkpn error:", err);
    res.status(500).json({ error: "gagal menilai artikel PKPN" });
  }
});

// ---- POST /api/analisis/lexicon ----
// Skor lexicon cepat (tanpa LLM)
router.post("/api/analisis/lexicon", requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text wajib diisi (string)" });
    }

    const result = calculateLexiconScore(text);

    res.json({
      success: true,
      data: {
        lexicon_score: result.score,
        pos_words: result.details.positive,
        neg_words: result.details.negative,
      },
    });
  } catch (err) {
    console.error("[analisis] lexicon error:", err);
    res.status(500).json({ error: "gagal menghitung skor lexicon" });
  }
});

export default router;