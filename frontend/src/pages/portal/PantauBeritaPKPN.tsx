/**
 * PantauBeritaPKPN.tsx
 * Halaman dashboard Pantau Berita PKPN — 3-axis scoring
 * Layout: ClusterRail, WeeklyImpactChart, NewsFeed, FilterBar
 * Bahasa Indonesia untuk semua user-facing text
 */

import { useEffect, useState, useCallback } from "react"
import { segment, CLUSTERS, CLUSTER_ICONS } from "../../lib/highlight"

// ===== Types =====

interface ArticleRow {
  id: number
  url: string
  sumber: string
  judul: string
  ringkasan: string | null
  terbit_at: string
  diambil_at: string
  relevansi_llm: number
  relevansi_final: number
  lantai_diterapkan: boolean
  dampak: "positif" | "negatif" | "netral" | "tidak_ada"
  sentimen_teks: "positif" | "negatif" | "netral"
  klaster_pkpn: number[]
  topik: string
  alasan: string
  keyword_highlight: { kata: string; kategori?: string }[]
  lexicon_score: number | null
  confidence: number | null
  perlu_review_manual: boolean
  model: string
  prompt_version: string
}

interface KlasterRingkasan {
  klaster: number
  jumlah_artikel: number
  positif: number
  negatif: number
  rata_relevansi: number
}

interface TrenItem {
  tanggal: string
  total: number
  rata_relevansi: number
  positif: number
  negatif: number
  netral: number
  tidak_ada: number
}

interface Meta {
  total: number
  page: number
  limit: number
  total_pages: number
}

// ===== Helpers =====

const DAMPAK_OPTIONS = [
  { value: "", label: "Semua Dampak" },
  { value: "positif", label: "Positif" },
  { value: "negatif", label: "Negatif" },
  { value: "netral", label: "Netral" },
  { value: "tidak_ada", label: "Tidak Ada" },
]

const SUMBER_OPTIONS = [
  { value: "", label: "Semua Sumber" },
  { value: "cnbc", label: "CNBC Indonesia" },
  { value: "katadata", label: "Katadata" },
  { value: "antara", label: "Antara Ekonomi" },
  { value: "tempo-bisnis", label: "Tempo Bisnis" },
  { value: "tempo-nasional", label: "Tempo Nasional" },
  { value: "liputan6", label: "Liputan6 Bisnis" },
  { value: "economist", label: "The Economist" },
  { value: "politico", label: "Politico" },
]

const REL_OPTIONS = [
  { value: "0", label: "Min. Relevansi: 0" },
  { value: "1", label: "Min. Relevansi: 1+" },
  { value: "2", label: "Min. Relevansi: 2+" },
  { value: "3", label: "Min. Relevansi: 3" },
]

const DAMPAK_BADGE: Record<string, { icon: string; cls: string }> = {
  positif: { icon: "📈", cls: "bg-green-100 text-green-800 border-green-200" },
  negatif: { icon: "📉", cls: "bg-red-100 text-red-800 border-red-200" },
  netral: { icon: "➖", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  tidak_ada: { icon: "🚫", cls: "bg-gray-100 text-gray-500 border-gray-200" },
}

const SENTIMEN_BADGE: Record<string, { icon: string; cls: string }> = {
  positif: { icon: "😊", cls: "bg-green-50 text-green-700 border-green-200" },
  negatif: { icon: "😟", cls: "bg-red-50 text-red-700 border-red-200" },
  netral: { icon: "😐", cls: "bg-slate-50 text-slate-600 border-slate-200" },
}

const REL_SCORE_CLS: Record<number, string> = {
  0: "bg-slate-100 text-slate-500",
  1: "bg-yellow-50 text-yellow-700",
  2: "bg-orange-50 text-orange-700",
  3: "bg-green-100 text-green-800",
}

function formatDate(dateStr: string | null): string {
  if (!dateStr || !dateStr.trim()) return "-"
  const normalized = dateStr.includes(" ") ? dateStr.replace(" ", "T") : dateStr
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return "-"
  return d.toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  })
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "-"
  const normalized = dateStr.includes(" ") ? dateStr.replace(" ", "T") : dateStr
  const d = new Date(normalized).getTime()
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60) return "baru saja"
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`
  return `${Math.floor(diff / 86400)} hari lalu`
}

// ===== Components =====

function HighlightText({ text }: { text: string }) {
  const segs = segment(text)
  return (
    <>
      {segs.map((s, i) =>
        s.match ? (
          <mark key={i} className={`hl hl-${s.match.cat}${s.match.weak ? " hl-weak" : ""}`}>
            {s.text}
          </mark>
        ) : (
          s.text
        ),
      )}
    </>
  )
}

/** ClusterRail: horizontal bar dengan ringkasan per klaster */
function ClusterRail({ data }: { data: KlasterRingkasan[] }) {
  if (!data || data.length === 0) return null

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-bold text-slate-700">Ringkasan Klaster PKPN</h3>
      <div className="flex flex-wrap gap-2">
        {data.map((c) => {
          const icon = CLUSTER_ICONS[c.klaster] ?? "📋"
          const name = CLUSTERS[c.klaster] ?? `Klaster ${c.klaster}`
          const sentiment =
            c.negatif > c.positif
              ? "text-red-600"
              : c.positif > c.negatif
                ? "text-green-600"
                : "text-slate-500"

          return (
            <div
              key={c.klaster}
              className="flex min-w-[140px] flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <span>{icon}</span>
                <span className="truncate">{name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">{c.jumlah_artikel} artikel</span>
                <span className={sentiment}>
                  👍{c.positif} 👎{c.negatif}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <span>Relevansi:</span>
                <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(c.rata_relevansi / 3) * 100}%` }}
                  />
                </div>
                <span className="font-semibold">{c.rata_relevansi}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** WeeklyImpactChart: bar chart mingguan */
function WeeklyImpactChart({ data }: { data: TrenItem[] }) {
  if (!data || data.length === 0) return null

  const maxTotal = Math.max(...data.map((t) => t.total), 1)

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-lg font-bold text-slate-900">Tren Mingguan</h3>

      <div className="flex items-end gap-2" style={{ height: 180 }}>
        {data.map((t) => {
          const totalHeight = Math.max(8, (t.total / maxTotal) * 150)
          const posHeight = t.positif > 0 ? Math.max(4, (t.positif / t.total) * totalHeight) : 0
          const negHeight = t.negatif > 0 ? Math.max(4, (t.negatif / t.total) * totalHeight) : 0

          return (
            <div key={t.tanggal} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col-reverse items-center" style={{ height: totalHeight }}>
                {/* Stacked bar: netral (base) + positif (top) + negatif (negative) */}
                <div
                  className="w-full rounded-t bg-slate-200"
                  style={{ height: `${Math.max(4, totalHeight - posHeight - negHeight)}px` }}
                />
                {posHeight > 0 && (
                  <div
                    className="w-full bg-green-400"
                    style={{ height: `${posHeight}px` }}
                    title={`Positif: ${t.positif}`}
                  />
                )}
                {negHeight > 0 && (
                  <div
                    className="w-full rounded-t bg-red-400"
                    style={{ height: `${negHeight}px` }}
                    title={`Negatif: ${t.negatif}`}
                  />
                )}
              </div>
              <span className="text-[10px] text-slate-500">
                {new Date(t.tanggal + "T00:00:00").toLocaleDateString("id-ID", {
                  weekday: "short",
                  day: "numeric",
                })}
              </span>
              <span className="text-[10px] font-semibold text-slate-600">{t.total}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded bg-green-400" /> Positif
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded bg-red-400" /> Negatif
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded bg-slate-200" /> Netral
        </span>
      </div>
    </div>
  )
}

// ===== Main Page =====

export default function PantauBeritaPKPN() {
  // Article list state
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)

  // Dashboard data
  const [klasterData, setKlasterData] = useState<KlasterRingkasan[]>([])
  const [trenData, setTrenData] = useState<TrenItem[]>([])

  // Filters
  const [page, setPage] = useState(1)
  const [dampak, setDampak] = useState("")
  const [minRel, setMinRel] = useState("0")
  const [klaster, setKlaster] = useState("")
  const [perluReview, setPerluReview] = useState(false)
  const [q, setQ] = useState("")
  const [sumber, setSumber] = useState("")

  // Expanded articles
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Fetch berita
  const fetchBerita = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("limit", "20")
    if (dampak) params.set("dampak", dampak)
    if (minRel !== "0") params.set("minRel", minRel)
    if (klaster) params.set("klaster", klaster)
    if (perluReview) params.set("perlu_review", "true")
    if (q) params.set("q", q)
    if (sumber) params.set("sumber", sumber)

    try {
      const res = await fetch(`/api/pantau-berita/berita?${params}`)
      const data = await res.json()
      setArticles(data.data ?? [])
      setMeta(data.meta ?? null)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [page, dampak, minRel, klaster, perluReview, q, sumber])

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    try {
      const [klasterRes, trenRes] = await Promise.all([
        fetch("/api/pantau-berita/ringkasan-klaster"),
        fetch("/api/pantau-berita/tren"),
      ])
      const klasterData = await klasterRes.json()
      const trenData = await trenRes.json()
      setKlasterData(klasterData.data ?? [])
      setTrenData(trenData.data ?? [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchBerita()
  }, [fetchBerita])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // Reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [dampak, minRel, klaster, perluReview, q, sumber])

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Cluster filter options
  const clusterOptions = Object.entries(CLUSTERS).map(([k, v]) => ({
    value: k,
    label: `${CLUSTER_ICONS[Number(k)] ?? ""} ${v}`,
  }))

  return (
    <div className="py-8">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Pantau Berita PKPN
            </h1>
            <p className="text-sm text-slate-500">
              Pemantauan berita dengan scoring 3-axis: relevansi, dampak, sentimen
            </p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              🔄 {meta?.total ?? 0} artikel
            </span>
          </div>
        </div>

        {/* Cluster Rail */}
        <ClusterRail data={klasterData} />

        {/* Weekly Impact Chart */}
        <WeeklyImpactChart data={trenData} />

        {/* Filter Bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={dampak}
            onChange={(e) => setDampak(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {DAMPAK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={minRel}
            onChange={(e) => setMinRel(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {REL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={klaster}
            onChange={(e) => setKlaster(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            <option value="">Semua Klaster</option>
            {clusterOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={sumber}
            onChange={(e) => setSumber(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {SUMBER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={perluReview}
              onChange={(e) => setPerluReview(e.target.checked)}
              className="rounded border-slate-300 text-blue-700"
            />
            Perlu Review
          </label>

          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul..."
            className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
          />
        </div>

        {/* Article List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 h-5 w-3/4 rounded bg-slate-200" />
                <div className="h-4 w-1/2 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-500">Tidak ada artikel ditemukan</p>
          </div>
        ) : (
          <div className="mb-6 space-y-3">
            {articles.map((article) => {
              const isOpen = expanded.has(article.id)
              const dampakBadge = DAMPAK_BADGE[article.dampak] ?? DAMPAK_BADGE.netral
              const sentimenBadge = SENTIMEN_BADGE[article.sentimen_teks] ?? SENTIMEN_BADGE.netral
              const relCls = REL_SCORE_CLS[article.relevansi_final] ?? REL_SCORE_CLS[0]

              return (
                <div
                  key={article.id}
                  className={`cursor-pointer rounded-xl border bg-white transition-shadow hover:shadow-sm ${
                    article.perlu_review_manual
                      ? "border-amber-200 ring-1 ring-amber-100"
                      : "border-slate-200"
                  }`}
                  onClick={() => toggleExpand(article.id)}
                >
                  <div className="p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {/* Dampak badge */}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${dampakBadge.cls}`}>
                        {dampakBadge.icon} {article.dampak.replace("_", " ")}
                      </span>

                      {/* Sentimen badge */}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${sentimenBadge.cls}`}>
                        {sentimenBadge.icon}
                      </span>

                      {/* Relevansi score */}
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${relCls}`}>
                        R{article.relevansi_final}
                        {article.lantai_diterapkan && "⬆"}
                      </span>

                      {/* Klaster badges */}
                      {article.klaster_pkpn.length > 0 &&
                        article.klaster_pkpn.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                          >
                            {CLUSTER_ICONS[c] ?? ""} {CLUSTERS[c]?.split(" ")[0] ?? `K${c}`}
                          </span>
                        ))}

                      {/* Perlu review flag */}
                      {article.perlu_review_manual && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          ⚠️ Review
                        </span>
                      )}

                      <span className="text-xs font-semibold uppercase text-slate-400">
                        {SUMBER_OPTIONS.find((o) => o.value === article.sumber)?.label ?? article.sumber}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {article.judul}
                    </h3>

                    {article.topik && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        🏷️ {article.topik}
                      </p>
                    )}

                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(article.terbit_at)} · {timeAgo(article.diambil_at)}
                    </p>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                      {article.ringkasan && (
                        <p className="mb-3 text-sm leading-relaxed text-slate-700">
                          <HighlightText text={article.ringkasan} />
                        </p>
                      )}

                      {/* 3-axis detail */}
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                          <p className="text-[11px] font-bold uppercase text-slate-500">Relevansi</p>
                          <p className="mt-0.5 text-sm font-bold text-slate-800">
                            LLM: {article.relevansi_llm} → Final: {article.relevansi_final}
                            {article.lantai_diterapkan && " (dinaikkan floor)"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                          <p className="text-[11px] font-bold uppercase text-slate-500">Dampak</p>
                          <p className="mt-0.5 text-sm font-bold text-slate-800 capitalize">
                            {dampakBadge.icon} {article.dampak.replace("_", " ")}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                          <p className="text-[11px] font-bold uppercase text-slate-500">Sentimen Teks</p>
                          <p className="mt-0.5 text-sm font-bold text-slate-800 capitalize">
                            {sentimenBadge.icon} {article.sentimen_teks}
                          </p>
                        </div>
                      </div>

                      {article.alasan && (
                        <p className="mb-2 text-xs italic text-slate-500">
                          "{article.alasan}"
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-500">
                          Lexicon: {article.lexicon_score?.toFixed(3) ?? "—"}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-500">
                          Confidence: {article.confidence?.toFixed(2) ?? "—"}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-500">
                          Model: {article.model}
                        </span>
                        {article.url && (
                          <>
                            <span className="text-slate-300">|</span>
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-blue-600 hover:text-blue-800"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Baca Artikel &rarr;
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.total_pages > 1 && (
          <div className="mb-8 flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <span className="text-sm text-slate-600">
              Halaman {meta.page} dari {meta.total_pages}
            </span>
            <button
              disabled={page >= meta.total_pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        )}
      </div>
    </div>
  )
}