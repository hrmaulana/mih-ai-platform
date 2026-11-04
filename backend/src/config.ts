const sessionSecret = process.env.SESSION_SECRET ?? "";
if (sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET harus berupa string acak minimal 32 karakter");
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://mih:mih@localhost:5432/mih",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  fallbackApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  fallbackModel: process.env.FALLBACK_MODEL ?? "deepseek-chat",
  fallbackBaseUrl: process.env.FALLBACK_BASE_URL ?? "https://api.deepseek.com/v1",
  comparisonModel: process.env.COMPARISON_MODEL ?? "gpt-4o",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  embeddingDim: Number(process.env.EMBEDDING_DIM ?? 1536),
  sessionSecret,
  jwtSecret: process.env.JWT_SECRET ?? sessionSecret,
  port: Number(process.env.PORT ?? 3000),
  dataDir: process.env.DATA_DIR ?? "/data",
  vectorK: Number(process.env.VECTOR_K ?? 8),
  chatHistoryTurns: Number(process.env.CHAT_HISTORY_TURNS ?? 8),
  ragWebhookUrl: process.env.N8N_RAG_WEBHOOK_URL ?? "",
  // Retrieval hibrida (vektor + leksikal, digabung RRF lalu diperingkat ulang).
  ragHybrid: (process.env.RAG_HYBRID ?? "true") !== "false",
  // Ekspansi kueri: beberapa varian kueri di-embed lalu digabung (RRF).
  // Rerank tahap 2: MaxSim antar-kalimat memakai embedding yang sama.
  // MaxSim diukur 31 Okt: menambah ~3,3 s latensi TANPA menaikkan hit@8/dokumen-terambil -> default MATI.
  ragMaxSim: (process.env.RAG_MAXSIM ?? "false") === "true",
  ragMaxSimKandidat: Number(process.env.RAG_MAXSIM_KANDIDAT ?? 12),
  // Penulisan ulang kueri oleh LLM (1 panggilan kecil) sebelum pencarian vektor.
  // Tulis-ulang kueri diukur 31 Okt: hit@8 58,3%->66,7% (bagus) TETAPI dokumen-terambil
  // 66,7%->58,3%, salah sitasi 0%->8,3%, latensi +2 s -> default MATI (pakai RAG_REWRITE=true).
  ragRewrite: (process.env.RAG_REWRITE ?? "false") === "true",
  // Ambang "pencarian awal lemah" untuk memicu tulis-ulang kueri bersyarat.
  ragRewriteMin: Number(process.env.RAG_REWRITE_MIN ?? 0.65),
  ragEkspansi: (process.env.RAG_EKSPANSI ?? "false") === "true",
  // Kandidat yang diambil dari tiap sumber sebelum penggabungan.
  ragCandidateK: Number(process.env.RAG_CANDIDATE_K ?? 45),
  // Ekspansi multi-kueri: kueri asli + varian kata kunci (naikkan recall).
  ragVarian: (process.env.RAG_VARIAN ?? "true") !== "false",
  // Penjaga deterministik: skor kemiripan terbaik di bawah ambang ini -> paksa menolak.
  ragAbstainMin: Number(process.env.RAG_ABSTAIN_MIN ?? 0.58),
  // Kalibrasi abstain: bila bukti leksikal kuat, jangan menolak walau skor vektor rendah.
  ragAbstainLexMin: Number(process.env.RAG_ABSTAIN_LEX_MIN ?? 0.12),
  // Porsi minimum token penting yang harus muncul di konteks saat skor vektor rendah.
  ragAbstainCakupan: Number(process.env.RAG_ABSTAIN_CAKUPAN ?? 0.3),
  // Reranker ringan (sim + leksikal + entitas + judul + MMR).
  ragRerank: (process.env.RAG_RERANK ?? "true") !== "false",
  // Varian system prompt: 1 = bawaan, 2 = tambahan anti-penolakan-keliru (uji A/B).
  promptVariant: Number(process.env.PROMPT_VARIANT ?? 3),
  llmProvider: process.env.LLM_PROVIDER ?? "openai", // "openai" | "mock"
};
