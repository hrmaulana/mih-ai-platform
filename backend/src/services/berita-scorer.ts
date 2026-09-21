/**
 * berita-scorer.ts
 * Pipeline scoring 3-axis (relevansi/dampak/sentimen_teks) untuk Pantau Berita PKPN
 *
 * Alur:
 * 1. Code phase: detectClusters → relevanceFloor → lexicon_score
 * 2. LLM phase: call LLM with structured prompt → validate JSON
 * 3. Post-process: validateLLMKeywords, applyFloor, union klaster
 * 4. Return skor final
 */

import { detectClusters, relevanceFloor, applyFloor, validateLLMKeywords } from "../lib/highlight"
import { calculateLexiconScore } from "../lib/lexicon"
import { createHash } from "node:crypto"

// ===== Types =====

export interface ScoreResult {
  relevansi_llm: number       // 0-3 dari LLM
  relevansi_final: number     // 0-3 setelah applyFloor
  lantai_diterapkan: boolean  // true jika floor > llm
  dampak: "positif" | "negatif" | "netral" | "tidak_ada"
  sentimen_teks: "positif" | "negatif" | "netral"
  klaster_pkpn: number[]
  topik: string
  alasan: string
  keyword_highlight: { kata: string; kategori?: string }[]
  lexicon_score: number
  confidence: number          // 0-1, seberapa yakin
  perlu_review_manual: boolean
  model: string
  prompt_version: string
}

interface LLMResponse {
  relevansi: number
  dampak: "positif" | "negatif" | "netral" | "tidak_ada"
  sentimen_teks: "positif" | "negatif" | "netral"
  klaster_pkpn: number[]
  topik: string
  alasan: string
  keyword_highlight: { kata: string; kategori?: string }[]
}

// ===== Helpers =====

/** Hitung SHA256 hash dari string */
export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

// ===== LLM Call =====

const SYSTEM_PROMPT = `Anda adalah analis kebijakan pembangunan di Kedeputian Perencanaan Makro Pembangunan Bappenas.
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

async function callLLM(text: string): Promise<LLMResponse | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null

  const truncated = text.slice(0, 3000) // limit context

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://mih.keuanganppn1.cloud",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-v4-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Berita:\n${truncated}` },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
      },
    )

    if (!response.ok) {
      console.warn(`[berita-scorer] OpenRouter returned ${response.status}`)
      return null
    }

    const data = await response.json()
    const content: string = data?.choices?.[0]?.message?.content ?? ""

    // Parse JSON dari response — coba full parse dulu, lalu fallback ke regex
    let parsed: LLMResponse | null = null

    // Attempt 1: langsung JSON.parse
    try {
      parsed = JSON.parse(content)
    } catch {
      // Attempt 2: extract dari markdown code block atau JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {
          // Attempt 3: cleanup umum (hapus trailing koma, etc.)
          const cleaned = jsonMatch[0]
            .replace(/,(\s*[}\]])/g, "$1")  // hapus trailing koma
            .replace(/\/\/.*/g, "")          // hapus komentar
          try {
            parsed = JSON.parse(cleaned)
          } catch {
            return null
          }
        }
      }
    }

    if (!parsed) return null

    // Validasi field
    if (typeof parsed.relevansi !== "number" || parsed.relevansi < 0 || parsed.relevansi > 3) {
      parsed.relevansi = 0
    }
    parsed.relevansi = Math.round(parsed.relevansi) // pastikan integer

    const validDampak = ["positif", "negatif", "netral", "tidak_ada"]
    if (!validDampak.includes(parsed.dampak)) {
      parsed.dampak = "netral"
    }

    const validSentimen = ["positif", "negatif", "netral"]
    if (!validSentimen.includes(parsed.sentimen_teks)) {
      parsed.sentimen_teks = "netral"
    }

    if (!Array.isArray(parsed.klaster_pkpn)) {
      parsed.klaster_pkpn = []
    }
    parsed.klaster_pkpn = parsed.klaster_pkpn
      .filter((k: unknown) => typeof k === "number" && k >= 1 && k <= 8)
      .map((k: number) => Math.round(k))

    if (!parsed.topik || typeof parsed.topik !== "string") parsed.topik = ""
    if (!parsed.alasan || typeof parsed.alasan !== "string") parsed.alasan = ""
    if (!Array.isArray(parsed.keyword_highlight)) parsed.keyword_highlight = []

    return parsed
  } catch (err) {
    console.warn("[berita-scorer] LLM call failed:", err)
    return null
  }
}

// ===== Retry Logic =====

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

// ===== Main Scorer =====

export async function scoreArticle(
  judul: string,
  isi: string,
): Promise<ScoreResult> {
  const fullText = `${judul}\n${isi || ""}`

  // 1. Code phase
  const lexResult = calculateLexiconScore(judul, isi)
  const codeFloor = relevanceFloor(fullText)
  const detect = detectClusters(fullText)

  // 2. LLM phase
  const llmResult = await callLLMWithRetry(fullText)

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
  const codeKlaster = detect.klaster
  const allClusters = new Set([...codeKlaster, ...klaster_pkpn])
  klaster_pkpn = [...allClusters].sort((a, b) => a - b)

  // 6. Tentukan perlu_review_manual
  const perlu_review_manual =
    relevansi_final !== relevansi_llm ||
    Math.abs(lexResult.score) < 0.15 ||
    (llmResult === null && codeFloor > 0)

  // 7. lexicon_score: pakai absolute value sebagai indikator kekuatan sinyal
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
    model: "deepseek/deepseek-v4-flash",
    prompt_version: "v1",
  }
}