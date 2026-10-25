/**
 * highlight-core.ts — inti bersama modul highlight PKPN/Makropembangunan.
 *
 * Dipakai oleh beberapa paket MIH (backend, service crawler) yang sebelumnya
 * menyimpan salinan identik: buildMatcher, findMatches, detectClusters,
 * relevanceFloor, plus tipe & helper-nya.
 *
 * data KEYWORDS tetap milik masing-masing paket (setnya berbeda), lalu diikat
 * lewat `createHighlight(KEYWORDS)`.
 */

export interface KeywordEntry {
  cat: string
  cluster: number[]
  terms: string[]
  weak: boolean
}

export interface MatchResult {
  start: number
  end: number
  text: string
  cat: string
  cluster: number[]
  weak: boolean
}

export interface SegmentResult {
  text: string
  match?: MatchResult
}

export interface ClusterResult {
  klaster: number[]
  hits: Record<number, number>
  strong: number
  weak: number
  literalPKPN: boolean
}

export interface Matcher {
  source: string
  lookup: Map<string, KeywordEntry>
}

export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
// spasi di keyword boleh cocok dengan spasi/newline berapa pun
export const flex = (term: string) => term.trim().split(/\s+/).map(esc).join("\\s+")

/**
 * Bangun regex tunggal dari daftar keyword.
 * Frasa terpanjang diurutkan lebih dulu supaya "Kampung Nelayan Merah Putih"
 * menang atas "Merah Putih" dan sejenisnya.
 */
export function buildMatcher(entries: KeywordEntry[]): Matcher {
  const lookup = new Map<string, KeywordEntry>()
  const terms: string[] = []
  for (const e of entries) {
    for (const t of e.terms) {
      lookup.set(norm(t), e)
      terms.push(t)
    }
  }
  terms.sort((a, b) => b.length - a.length)
  const alt = terms.map(flex).join("|")
  // batas kata yang aman untuk huruf Unicode dan angka
  const source = `(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`
  return { source, lookup }
}

/** Semua kecocokan di teks: [{start, end, text, cat, cluster, weak}] */
export function findMatches(text: string, matcher: Matcher): MatchResult[] {
  if (!text) return []
  const re = new RegExp(matcher.source, "giu") // regex baru per panggilan (lastIndex aman)
  const out: MatchResult[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const e = matcher.lookup.get(norm(m[0]))
    if (!e) continue
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      cat: e.cat,
      cluster: e.cluster,
      weak: e.weak,
    })
  }
  return out
}

/** Pecah teks jadi segmen: [{text}] atau [{text, match}] — aman untuk React (tanpa innerHTML). */
export function segment(text: string, matcher: Matcher): SegmentResult[] {
  const out: SegmentResult[] = []
  let pos = 0
  for (const m of findMatches(text, matcher)) {
    if (m.start > pos) out.push({ text: text.slice(pos, m.start) })
    out.push({ text: m.text, match: m })
    pos = m.end
  }
  if (pos < text.length) out.push({ text: text.slice(pos) })
  return out
}

/**
 * Deteksi klaster PKPN dari teks (hanya keyword "strong").
 * Return: { klaster: [3,4], hits: {3: 2, 4: 1}, strong: n, weak: n, literalPKPN: bool }
 */
export function detectClusters(text: string, matcher: Matcher): ClusterResult {
  const hits: Record<number, number> = {}
  let strong = 0, weak = 0, literalPKPN = false
  for (const m of findMatches(text, matcher)) {
    if (m.cat !== "pkpn") continue
    if (m.weak) { weak++; continue }
    strong++
    if (/^(pkpn|program\s+kerja\s+prioritas\s+nasional)$/i.test(m.text)) literalPKPN = true
    for (const c of m.cluster) hits[c] = (hits[c] || 0) + 1
  }
  const klaster = Object.keys(hits)
    .map(Number)
    .sort((a, b) => hits[b] - hits[a] || a - b)
  return { klaster, hits, strong, weak, literalPKPN }
}

/**
 * Skor relevansi minimum dari kode (0-3):
 *  - menyebut "PKPN" secara literal          -> 3
 *  - ada keyword program PKPN (strong)        -> 2
 *  - hanya keyword makro (strong)             -> 1
 *  - kosong / hanya keyword weak              -> 0
 */
export function relevanceFloor(text: string, matcher: Matcher): number {
  const d = detectClusters(text, matcher)
  if (d.literalPKPN) return 3
  if (d.strong > 0) return 2
  const macro = findMatches(text, matcher).some((m) => m.cat === "makro" && !m.weak)
  return macro ? 1 : 0
}

/** Gabungkan penilaian LLM dengan lantai dari kode: skor akhir tidak boleh di bawah lantai. */
export function applyFloor(llmRelevansi: number | null, text: string, matcher: Matcher): number {
  return Math.max(llmRelevansi ?? 0, relevanceFloor(text, matcher))
}

/**
 * Buang keyword dari LLM yang tidak benar-benar ada di teks (anti-halusinasi).
 * llmKeywords: [{kata, kategori}]
 */
export function validateLLMKeywords(
  text: string,
  llmKeywords: { kata: string; kategori?: string }[] = []
): { kata: string; kategori?: string }[] {
  const hay = norm(text)
  return llmKeywords.filter((k) => k && k.kata && hay.includes(norm(k.kata)))
}

/**
 * Ikat inti ke satu set keyword milik paket.
 * Mengembalikan fungsi siap pakai satu-argumen (pemanggil tidak perlu mengoper matcher).
 */
export function createHighlight(entries: KeywordEntry[]) {
  const matcher = buildMatcher(entries)
  return {
    matcher,
    findMatches: (text: string) => findMatches(text, matcher),
    segment: (text: string) => segment(text, matcher),
    detectClusters: (text: string) => detectClusters(text, matcher),
    relevanceFloor: (text: string) => relevanceFloor(text, matcher),
    applyFloor: (llmRelevansi: number | null, text: string) => applyFloor(llmRelevansi, text, matcher),
    validateLLMKeywords: (
      text: string,
      llmKeywords: { kata: string; kategori?: string }[] = []
    ) => validateLLMKeywords(text, llmKeywords),
  }
}
