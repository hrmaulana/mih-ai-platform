/**
 * berita-scorer-core.ts — pipeline scoring 3-axis (relevansi/dampak/sentimen_teks)
 * untuk Pantau Berita PKPN, dipakai bersama oleh backend dan service analisis.
 *
 * Alur: code phase (detectClusters → relevanceFloor → lexicon), LLM phase
 * (structured prompt → validasi JSON), post-process (validateLLMKeywords,
 * applyFloor, union klaster).
 *
 * Perbedaan antar-paket disuntikkan lewat `createBeritaScorer(config)`:
 *  - sumber kredensial/base URL (backend: process.env; analisis: config)
 *  - fungsi highlight & lexicon milik paket masing-masing (dataset keyword berbeda)
 * sehingga skor tetap mengikuti kaidah tiap paket.
 */

export interface ScoreResult {
  relevansi_llm: number
  relevansi_final: number
  lantai_diterapkan: boolean
  dampak: "positif" | "negatif" | "netral" | "tidak_ada"
  sentimen_teks: "positif" | "negatif" | "netral"
  klaster_pkpn: number[]
  topik: string
  alasan: string
  keyword_highlight: { kata: string; kategori?: string }[]
  lexicon_score: number
  confidence: number
  perlu_review_manual: boolean
  model: string
  prompt_version: string
}

export interface LLMResponse {
  relevansi: number
  dampak: "positif" | "negatif" | "netral" | "tidak_ada"
  sentimen_teks: "positif" | "negatif" | "netral"
  klaster_pkpn: number[]
  topik: string
  alasan: string
  keyword_highlight: { kata: string; kategori?: string }[]
}

export interface HighlightDeps {
  detectClusters: (text: string) => { klaster: number[] }
  relevanceFloor: (text: string) => number
  applyFloor: (llmRelevansi: number | null, text: string) => number
  validateLLMKeywords: (
    text: string,
    llmKeywords: { kata: string; kategori?: string }[]
  ) => { kata: string; kategori?: string }[]
}

export interface ScorerConfig extends HighlightDeps {
  /** API key OpenRouter; bila kosong → mode code-only (tanpa LLM). */
  apiKey?: string
  /** Base URL OpenRouter (backend: https://openrouter.ai/api/v1). */
  baseUrl: string
  /** Skor lexicon paket (mis. calculateLexiconScore). */
  lexiconScore: (judul: string, isi: string) => { score: number }
  defaultModel?: string
  promptVersion?: string
  /** Dipakai di header HTTP-Referer (default: https://mih.keuanganppn1.cloud). */
  httpReferer?: string
}

export const SCORING_SYSTEM_PROMPT = `Anda adalah analis kebijakan pembangunan di Kedeputian Perencanaan Makro Pembangunan Bappenas.
Tugas Anda: menganalisis berita dan memberikan skor pada tiga sumbu (axis):

## 1. Relevansi PKPN (0-3)
- 0 = Tidak relevan
- 1 = Terkait makro
- 2 = Cukup relevan
- 3 = Sangat relevan

## 2. Dampak (positif/negatif/netral/tidak_ada)
Dampak berita terhadap pencapaian program PKPN.

## 3. Sentimen Teks (positif/negatif/netral)
Sentimen dari teks berita secara umum.

Klaster PKPN:
1 = Kedaulatan Pangan
2 = Kemandirian Energi dan Air
3 = Pendidikan
4 = Kesehatan
5 = Hilirisasi dan Industrialisasi
6 = Infrastruktur, Perumahan dan Ketahanan Bencana
7 = Ekonomi Kerakyatan dan Desa
8 = Penurunan Kemiskinan

RESPON HANYA dalam format JSON TANPA markdown atau teks lain di luar JSON:
{"relevansi":0-3,"dampak":"positif|negatif|netral|tidak_ada","sentimen_teks":"positif|negatif|netral","klaster_pkpn":[],"topik":"...","alasan":"...","keyword_highlight":[{"kata":"...","kategori":"pkpn|makro"}]}`

/** Parsing JSON toleran: JSON murni → blok JSON di dalam teks → pembersihan umum. */
export function parseLLMJson(content: string): LLMResponse | null {
  let parsed: LLMResponse | null = null
  try {
    parsed = JSON.parse(content)
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        const cleaned = jsonMatch[0]
          .replace(/,(\s*[}\]])/g, "$1") // hapus trailing koma
          .replace(/\/\/.*/g, "") // hapus komentar
        try {
          parsed = JSON.parse(cleaned)
        } catch {
          return null
        }
      }
    }
  }
  return parsed ?? null
}

/** Normalisasi + validasi field respons LLM (dipakai sebelum skor dipakai). */
export function normalizeLLMResponse(parsed: LLMResponse): LLMResponse {
  if (typeof parsed.relevansi !== "number" || parsed.relevansi < 0 || parsed.relevansi > 3) {
    parsed.relevansi = 0
  }
  parsed.relevansi = Math.round(parsed.relevansi)

  const validDampak = ["positif", "negatif", "netral", "tidak_ada"]
  if (!validDampak.includes(parsed.dampak)) parsed.dampak = "netral"

  const validSentimen = ["positif", "negatif", "netral"]
  if (!validSentimen.includes(parsed.sentimen_teks)) parsed.sentimen_teks = "netral"

  if (!Array.isArray(parsed.klaster_pkpn)) parsed.klaster_pkpn = []
  parsed.klaster_pkpn = parsed.klaster_pkpn
    .filter((k: unknown) => typeof k === "number" && k >= 1 && k <= 8)
    .map((k: number) => Math.round(k))

  if (!parsed.topik || typeof parsed.topik !== "string") parsed.topik = ""
  if (!parsed.alasan || typeof parsed.alasan !== "string") parsed.alasan = ""
  if (!Array.isArray(parsed.keyword_highlight)) parsed.keyword_highlight = []

  return parsed
}

/**
 * Bangun scorer yang terikat ke konfigurasi & ketergantungan satu paket.
 */
export function createBeritaScorer(cfg: ScorerConfig) {
  const model = cfg.defaultModel ?? "deepseek/deepseek-v4-flash"
  const promptVersion = cfg.promptVersion ?? "v1"
  const referer = cfg.httpReferer ?? "https://mih.keuanganppn1.cloud"
  const { detectClusters, relevanceFloor, applyFloor, validateLLMKeywords, lexiconScore } = cfg

  async function callLLM(text: string): Promise<LLMResponse | null> {
    const apiKey = cfg.apiKey
    if (!apiKey) return null

    const truncated = text.slice(0, 3000) // limit context

    try {
      const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": referer,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SCORING_SYSTEM_PROMPT },
            { role: "user", content: `Berita:\n${truncated}` },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
      })

      if (!response.ok) {
        console.warn(`[berita-scorer] OpenRouter returned ${response.status}`)
        return null
      }

      const data = await response.json()
      const content: string = data?.choices?.[0]?.message?.content ?? ""
      const parsed = parseLLMJson(content)
      if (!parsed) return null
      return normalizeLLMResponse(parsed)
    } catch (err) {
      console.warn("[berita-scorer] LLM call failed:", err)
      return null
    }
  }

  async function callLLMWithRetry(text: string, maxRetries = 2): Promise<LLMResponse | null> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await callLLM(text)
      if (result !== null) return result
      if (attempt < maxRetries) {
        console.warn(`[berita-scorer] LLM attempt ${attempt + 1} failed, retrying...`)
      }
    }
    return null
  }

  async function scoreArticle(judul: string, isi: string): Promise<ScoreResult> {
    const fullText = `${judul}\n${isi || ""}`

    // 1. Code phase
    const lexResult = lexiconScore(judul, isi)
    const codeFloor = relevanceFloor(fullText)
    const detect = detectClusters(fullText)

    // 2. LLM phase (dilewati total bila tidak ada API key — mode code-only)
    const llmResult = cfg.apiKey ? await callLLMWithRetry(fullText) : null

    // 3. Post-process & merge
    let relevansi_llm = 0
    let dampak: ScoreResult["dampak"] = "tidak_ada"
    let sentimen_teks: ScoreResult["sentimen_teks"] = "netral"
    let klaster_pkpn: number[] = []
    let topik = ""
    let alasan = ""
    let keyword_highlight: { kata: string; kategori?: string }[] = []
    let confidence = 0.3

    if (llmResult) {
      relevansi_llm = llmResult.relevansi
      dampak = llmResult.dampak
      sentimen_teks = llmResult.sentimen_teks
      klaster_pkpn = llmResult.klaster_pkpn
      topik = llmResult.topik
      alasan = llmResult.alasan
      keyword_highlight = validateLLMKeywords(fullText, llmResult.keyword_highlight)
      confidence = 0.7
    } else {
      // Fallback: code-only
      relevansi_llm = codeFloor
      dampak = "netral"
      sentimen_teks = lexResult.score > 0.1 ? "positif" : lexResult.score < -0.1 ? "negatif" : "netral"
      klaster_pkpn = detect.klaster
      keyword_highlight = []
      confidence = 0.25
    }

    // 4. Apply floor: relevansi_final tidak boleh di bawah code floor
    const relevansi_final = applyFloor(relevansi_llm, fullText)
    const lantai_diterapkan = relevansi_final > relevansi_llm

    // 5. Union klaster: gabung klaster dari code + LLM
    const allClusters = new Set([...detect.klaster, ...klaster_pkpn])
    klaster_pkpn = [...allClusters].sort((a, b) => a - b)

    // 6. Tentukan perlu_review_manual
    const perlu_review_manual =
      relevansi_final !== relevansi_llm ||
      Math.abs(lexResult.score) < 0.15 ||
      (llmResult === null && codeFloor > 0)

    // 7. lexicon_score: indikator kekuatan sinyal
    const lexicon_score = lexResult.score

    return {
      relevansi_llm,
      relevansi_final,
      lantai_diterapkan,
      dampak,
      sentimen_teks,
      klaster_pkpn,
      topik,
      alasan,
      keyword_highlight,
      lexicon_score,
      confidence,
      perlu_review_manual,
      model,
      prompt_version: promptVersion,
    }
  }

  return { scoreArticle, callLLM, callLLMWithRetry }
}
