/**
 * Lexicon Sentimen Ekonomi Indonesia
 *
 * Kamus sentimen spesifik konteks ekonomi Indonesia untuk MIH Early Warning System.
 * Menggunakan metodologi hybrid: lexicon scoring + negation handling + intensifier.
 *
 * Range skor: -1.000 (sangat negatif) s.d +1.000 (sangat positif)
 */

// ===== Kamus Positif (+1) =====
const POSITIVE_WORDS: string[] = [
  "meningkat", "pertumbuhan", "naik", "surplus", "untung", "laba", "pulih",
  "ekspansi", "menguat", "optimis", "perbaikan", "kenaikan", "apresiasi",
  "stabil", "efisien", "produktif", "investasi", "menguntungkan", "positif",
  "melambung", "subur", "makmur", "sejahtera", "maju", "berkembang",
]

// ===== Kamus Negatif (-1) =====
const NEGATIVE_WORDS: string[] = [
  "turun", "penurunan", "defisit", "krisis", "rugi", "phk", "moratorium",
  "resesi", "stagnan", "melemah", "kontraksi", "beban", "gagal", "bangkrut",
  "pemotongan", "refocussing", "darurat", "terpuruk", "kolaps", "mencekik",
  "terlilit", "macet", "terhambat", "kendala",
]

// ===== Domain-specific weights =====
const DOMAIN_LEXICON: Record<string, number> = {
  // Selalu negatif di konteks Bappenas
  refocussing: -1.0,
  // Anggaran dipindah — umumnya karena ada masalah
  realokasi: -0.5,
  // Positif jika konteks perbaikan
  efisiensi: 0.5,
  // Netral — istilah teknis
  pagu: 0,
  dipa: 0,
  sakti: 0,
  // Biasanya karena perubahan yg tidak direncanakan
  revisi: -0.3,
}

// ===== Kata negasi =====
const NEGATION_WORDS: string[] = ["tidak", "belum", "bukan"]

// ===== Intensifier multipliers =====
const INTENSIFIERS: Record<string, number> = {
  sangat: 1.5,
  amat: 1.5,
  "sangat sekali": 1.5,
  cukup: 0.7,
  agak: 0.5,
  sedikit: 0.5,
  paling: 2.0,
}

/**
 * Tokenize teks ke array kata lowercased
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[<>"',.!?;:()\[\]{}]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Hitung skor sentimen berbasis lexicon
 *
 * Formula:
 *   lex_score = (Σ(positif × intensifier) + Σ(negatif × intensifier × -1))
 *               ÷ (total_kata_terdeteksi + 1)
 *
 * Range: -1.000 s.d +1.000
 *
 * Negation: Jika kata negasi muncul 1-3 kata sebelum kata sentimen → balik nilai (× -1)
 * Intensifier: sangat/amat(×1.5), cukup(×0.7), agak/sedikit(×0.5), paling(×2.0)
 */
export function calculateLexiconScore(
  judul: string,
  konten?: string,
): { score: number; details: { positive: string[]; negative: string[] } } {
  const teks = konten ? `${judul} ${konten}` : judul
  const tokens = tokenize(teks)

  // Build kamus lookup
  const posSet = new Set(POSITIVE_WORDS)
  const negSet = new Set(NEGATIVE_WORDS)
  const negationSet = new Set(NEGATION_WORDS)

  let totalScore = 0
  let detectedCount = 0
  const positiveDetected: string[] = []
  const negativeDetected: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i]
    let baseScore: number | null = null
    let isPositive = false
    let isNegative = false

    // Cek domain lexicon dulu
    if (word in DOMAIN_LEXICON) {
      const ds = DOMAIN_LEXICON[word]
      if (ds !== 0) {
        baseScore = ds
        if (ds > 0) isPositive = true
        else isNegative = true
      }
    }

    // Cek kamus positif/negatif
    if (baseScore === null) {
      if (posSet.has(word)) {
        baseScore = 1.0
        isPositive = true
      } else if (negSet.has(word)) {
        baseScore = -1.0
        isNegative = true
      }
    }

    if (baseScore === null) continue

    // Cek intensifier (1-3 kata sebelumnya)
    let multiplier = 1.0
    for (let j = Math.max(0, i - 3); j < i; j++) {
      const prevWord = tokens[j]
      if (prevWord in INTENSIFIERS) {
        multiplier = INTENSIFIERS[prevWord]
        break
      }
      // Cek bigram "sangat sekali"
      if (j + 1 < i && `${prevWord} ${tokens[j + 1]}` in INTENSIFIERS) {
        multiplier = INTENSIFIERS[`${prevWord} ${tokens[j + 1]}`]
        break
      }
    }

    // Cek negation (1-3 kata sebelumnya)
    let negate = false
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (negationSet.has(tokens[j])) {
        negate = true
        break
      }
    }

    let score = baseScore * multiplier
    if (negate) score *= -1

    totalScore += score
    detectedCount++

    if (isPositive) positiveDetected.push(word)
    if (isNegative) negativeDetected.push(word)
  }

  // Normalisasi
  const finalScore =
    detectedCount > 0
      ? Math.max(-1, Math.min(1, totalScore / (detectedCount + 1)))
      : 0

  return {
    score: Math.round(finalScore * 1000) / 1000,
    details: {
      positive: [...new Set(positiveDetected)],
      negative: [...new Set(negativeDetected)],
    },
  }
}
