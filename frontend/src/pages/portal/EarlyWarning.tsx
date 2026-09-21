import { useEffect, useState, useCallback } from "react"
import { CLUSTERS, CLUSTER_ICONS, segment } from "../../lib/highlight"

// ===== Types =====

interface Article {
  id: number
  judul: string
  sumber: string
  url: string
  published_at: string | null
  sentimen: string
  sentimen_score: number
  confidence: string
  ringkasan: string
  alert_level: string
  is_alert: boolean
  created_at: string
  // PKPN fields (optional — may come from early-warning or PKPN API)
  pkpn_clusters: number[] | null
  pkpn_score: number | null
  pkpn_literal: boolean | null
  // Extended PKPN fields (from /api/pantau-berita/berita)
  relevansi_llm?: number
  relevansi_final?: number
  lantai_diterapkan?: boolean
  dampak?: string
  sentimen_teks?: string
  klaster_pkpn?: number[]
  topik?: string
  alasan?: string
  perlu_review_manual?: boolean
  lexicon_score?: number | null
  confidence_num?: number | null
  model?: string
  prompt_version?: string
  diambil_at?: string
  terbit_at?: string
}

interface Meta {
  total: number
  page: number
  limit: number
  total_pages: number
  summary: {
    total_alert: number
    danger: number
    warning: number
    info: number
  }
}

interface SummaryData {
  alerts: { judul: string; alert_level: string; sumber: string; sentimen_score: number }[]
  trend: { tanggal: string; avg_score: number; total: number }[]
  stats: { total_hari_ini: number; danger: number; warning: number }
  pkpn_cluster?: { klaster: number; jumlah: number }[]
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

// ===== Options =====

const SUMBER_OPTIONS = [
  { value: "", label: "Semua Sumber" },
  { value: "cnbc", label: "CNBC Indonesia" },
  { value: "katadata", label: "Katadata" },
  { value: "antara", label: "Antara Ekonomi" },
  { value: "tempo-bisnis", label: "Tempo Bisnis" },
  { value: "tempo-nasional", label: "Tempo Nasional" },
  { value: "liputan6", label: "Liputan6 Bisnis" },
]

const SENTIMEN_OPTIONS = [
  { value: "", label: "Semua Sentimen" },
  { value: "positif", label: "Positif" },
  { value: "negatif", label: "Negatif" },
  { value: "netral", label: "Netral" },
]

const DAMPAK_OPTIONS = [
  { value: "", label: "Semua Dampak" },
  { value: "positif", label: "Positif" },
  { value: "negatif", label: "Negatif" },
  { value: "netral", label: "Netral" },
  { value: "tidak_ada", label: "Tidak Ada" },
]

const REL_OPTIONS = [
  { value: "0", label: "Min. Relevansi: 0" },
  { value: "1", label: "Min. Relevansi: 1+" },
  { value: "2", label: "Min. Relevansi: 2+" },
  { value: "3", label: "Min. Relevansi: 3" },
]

const KLASTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Semua Klaster" },
  ...Object.entries(CLUSTERS).map(([k, v]) => ({
    value: k,
    label: `${CLUSTER_ICONS[Number(k)] ?? ""} ${v}`,
  })),
]

const ALERT_LABEL: Record<string, { icon: string; label: string; badge: string }> = {
  danger: { icon: "\u{1F534}", label: "Danger", badge: "bg-red-100 text-red-800 border-red-300" },
  warning: { icon: "\u{1F7E1}", label: "Warning", badge: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  info: { icon: "\u2139\uFE0F", label: "Info", badge: "bg-blue-100 text-blue-800 border-blue-300" },
}

const PKPN_SCORE_CLASS: Record<number, string> = {
  0: "bg-slate-100 text-slate-500 border-slate-200",
  1: "bg-yellow-50 text-yellow-700 border-yellow-200",
  2: "bg-orange-50 text-orange-700 border-orange-200",
  3: "bg-green-100 text-green-800 border-green-300",
}

const DAMPAK_BADGE: Record<string, { icon: string; cls: string }> = {
  positif: { icon: "\uD83D\uDCC8", cls: "bg-green-100 text-green-800 border-green-200" },
  negatif: { icon: "\uD83D\uDCC9", cls: "bg-red-100 text-red-800 border-red-200" },
  netral: { icon: "\u2796", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  tidak_ada: { icon: "\uD83D\uDEAB", cls: "bg-gray-100 text-gray-500 border-gray-200" },
}

const SENTIMEN_BADGE: Record<string, { icon: string; cls: string }> = {
  positif: { icon: "\uD83D\uDE0A", cls: "bg-green-50 text-green-700 border-green-200" },
  negatif: { icon: "\uD83D\uDE1F", cls: "bg-red-50 text-red-700 border-red-200" },
  netral: { icon: "\uD83D\uDE10", cls: "bg-slate-50 text-slate-600 border-slate-200" },
}

const REL_SCORE_CLS: Record<number, string> = {
  0: "bg-slate-100 text-slate-500",
  1: "bg-yellow-50 text-yellow-700",
  2: "bg-orange-50 text-orange-700",
  3: "bg-green-100 text-green-800",
}

// ===== Helpers =====

function formatDate(dateStr: string | null): string {
  if (!dateStr || !dateStr.trim()) return "-"
  const normalized = dateStr.includes(" ") ? dateStr.replace(" ", "T") : dateStr
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return "-"
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
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

/** Render teks dengan highlight PKPN */
function HighlightText({ text }: { text: string }) {
  const segs = segment(text)
  return (
    <>
      {segs.map((s, i) =>
        s.match ? (
          <mark
            key={i}
            className={`hl hl-${s.match.cat}${s.match.weak ? " hl-weak" : ""}`}
          >
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
function ClusterRail({ data, onSelect }: { data: KlasterRingkasan[]; onSelect?: (klaster: number) => void }) {
  if (!data || data.length === 0) return null

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-bold text-slate-700">Ringkasan Klaster PKPN</h3>
      <div className="cluster-rail flex flex-wrap gap-2">
        {data.map((c) => {
          const icon = CLUSTER_ICONS[c.klaster] ?? "\uD83D\uDCCB"
          const name = CLUSTERS[c.klaster] ?? `Klaster ${c.klaster}`
          const total = c.jumlah_artikel
          const pctPos = total > 0 ? (c.positif / total) * 100 : 0

          return (
            <div
              key={c.klaster}
              onClick={() => onSelect?.(c.klaster)}
              className="cluster-card flex min-w-[160px] cursor-pointer flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <span>{icon}</span>
                <span className="truncate">{name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">{total} artikel</span>
                <span className="text-slate-500">
                  <span className="text-green-600">{c.positif}</span>
                  {" / "}
                  <span className="text-red-600">{c.negatif}</span>
                </span>
              </div>
              {/* Balance bar: negatif←→positif */}
              <div className="balance-bar flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-red-400"
                  style={{ width: `${100 - pctPos}%` }}
                  title={`Negatif: ${c.negatif}`}
                />
                <div
                  className="bg-green-400"
                  style={{ width: `${pctPos}%` }}
                  title={`Positif: ${c.positif}`}
                />
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <span>Relevansi:</span>
                <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(c.rata_relevansi / 3) * 100}%` }}
                  />
                </div>
                <span className="font-semibold">{c.rata_relevansi.toFixed(1)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** WeeklyImpactChart: bar chart mingguan divergen */
function WeeklyImpactChart({ data }: { data: TrenItem[] }) {
  if (!data || data.length === 0) return null

  const maxTotal = Math.max(...data.map((t) => t.total), 1)

  return (
    <div className="impact-chart mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-lg font-bold text-slate-900">Tren Mingguan PKPN</h3>

      <div className="flex items-end gap-2" style={{ height: 180 }}>
        {data.map((t) => {
          const totalHeight = Math.max(8, (t.total / maxTotal) * 150)
          const posHeight = t.positif > 0 ? Math.max(4, (t.positif / t.total) * totalHeight) : 0
          const negHeight = t.negatif > 0 ? Math.max(4, (t.negatif / t.total) * totalHeight) : 0
          const netralHeight = Math.max(4, totalHeight - posHeight - negHeight)

          return (
            <div key={t.tanggal} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col-reverse items-center" style={{ height: totalHeight }}>
                {/* Stacked bar: netral (base) + positif (top) + negatif (bottom) */}
                <div
                  className="w-full rounded-t bg-slate-200"
                  style={{ height: `${netralHeight}px` }}
                  title={`Netral: ${t.netral}`}
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

export default function EarlyWarning() {
  // Early warning state
  const [articles, setArticles] = useState<Article[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)

  // PKPN dashboard state
  const [klasterData, setKlasterData] = useState<KlasterRingkasan[]>([])
  const [trenData, setTrenData] = useState<TrenItem[]>([])

  // Filters
  const [page, setPage] = useState(1)
  const [sumber, setSumber] = useState("")
  const [sentimen, setSentimen] = useState("")
  const [klaster, setKlaster] = useState("")
  const [q, setQ] = useState("")
  // PKPN filters
  const [dampak, setDampak] = useState("")
  const [minRel, setMinRel] = useState("0")
  const [perluReview, setPerluReview] = useState(false)

  // Expand
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Summary / trend data for chart
  const [summary, setSummary] = useState<SummaryData | null>(null)

  // Fetch early warning articles
  const fetchArticles = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("limit", "20")
    if (sumber) params.set("sumber", sumber)
    if (sentimen) params.set("sentimen", sentimen)
    if (q) params.set("q", q)

    try {
      const res = await fetch(`/api/early-warning?${params}`)
      const data = await res.json()
      setArticles(data.data ?? [])
      setMeta(data.meta ?? { total: 0, page: 1, limit: 20, total_pages: 0, summary: { total_alert: 0, danger: 0, warning: 0, info: 0 } })
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [page, sumber, sentimen, q])

  // Fetch PKPN articles (3-axis scoring)
  const fetchPkpnArticles = useCallback(async () => {
    const params = new URLSearchParams()
    params.set("page", "1")
    params.set("limit", "50")
    if (dampak) params.set("dampak", dampak)
    if (minRel !== "0") params.set("minRel", minRel)
    if (klaster) params.set("klaster", klaster)
    if (perluReview) params.set("perlu_review", "true")
    if (q) params.set("q", q)
    if (sumber) params.set("sumber", sumber)

    try {
      const res = await fetch(`/api/pantau-berita/berita?${params}`)
      const data = await res.json()
      const pkpnArticles: Article[] = (data.data ?? []).map((a: any) => ({
        id: a.id,
        judul: a.judul,
        sumber: a.sumber,
        url: a.url,
        published_at: a.terbit_at ?? a.diambil_at ?? null,
        created_at: a.diambil_at ?? "",
        sentimen: a.sentimen_teks ?? "netral",
        sentimen_score: a.lexicon_score ?? 0,
        confidence: a.confidence?.toString() ?? "0",
        ringkasan: a.ringkasan ?? "",
        alert_level: a.dampak === "negatif" ? "warning" : "info",
        is_alert: a.dampak === "negatif",
        pkpn_clusters: a.klaster_pkpn ?? [],
        pkpn_score: a.relevansi_final ?? 0,
        pkpn_literal: false,
        relevansi_llm: a.relevansi_llm,
        relevansi_final: a.relevansi_final,
        lantai_diterapkan: a.lantai_diterapkan,
        dampak: a.dampak,
        sentimen_teks: a.sentimen_teks,
        klaster_pkpn: a.klaster_pkpn ?? [],
        topik: a.topik,
        alasan: a.alasan,
        perlu_review_manual: a.perlu_review_manual,
        lexicon_score: a.lexicon_score,
        confidence_num: a.confidence,
        model: a.model,
        prompt_version: a.prompt_version,
        diambil_at: a.diambil_at,
        terbit_at: a.terbit_at,
      }))

      // Merge PKPN articles into early warning articles by ID
      setArticles((prev) => {
        const merged = new Map<number, Article>()
        for (const a of prev) merged.set(a.id, a)
        for (const a of pkpnArticles) {
          if (merged.has(a.id)) {
            // Merge: PKPN fields supplement existing article
            const existing = merged.get(a.id)!
            merged.set(a.id, { ...existing, ...a })
          } else {
            merged.set(a.id, a)
          }
        }
        return Array.from(merged.values())
      })
    } catch {
      // silent
    }
  }, [dampak, minRel, klaster, perluReview, q, sumber])

  useEffect(() => {
    fetchArticles()
  }, [fetchArticles])

  useEffect(() => {
    if (dampak || minRel !== "0" || klaster || perluReview) {
      fetchPkpnArticles()
    }
  }, [fetchPkpnArticles, dampak, minRel, klaster, perluReview])

  // Fetch summary/trend once
  useEffect(() => {
    fetch("/api/early-warning/summary")
      .then((r) => r.json())
      .then((d) => setSummary(d ?? { alerts: [], trend: [], stats: { total_hari_ini: 0, danger: 0, warning: 0 }, pkpn_cluster: [] }))
      .catch(() => {})
  }, [])

  // Fetch PKPN dashboard data
  useEffect(() => {
    Promise.all([
      fetch("/api/pantau-berita/ringkasan-klaster"),
      fetch("/api/pantau-berita/tren"),
    ])
      .then(async ([klasterRes, trenRes]) => {
        const klasterData = await klasterRes.json()
        const trenData = await trenRes.json()
        setKlasterData(klasterData.data ?? [])
        setTrenData(trenData.data ?? [])
      })
      .catch(() => {})
  }, [])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [sumber, sentimen, klaster, q, dampak, minRel, perluReview])

  // Client-side cluster filter
  const filteredArticles = klaster
    ? articles.filter((a) => {
        const clusters = a.pkpn_clusters ?? a.klaster_pkpn ?? []
        return clusters.includes(Number(klaster))
      })
    : articles

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const maxTotal = summary
    ? Math.max(...summary.trend.map((t) => t.total), 1)
    : 1

  const handleClusterSelect = (klasterId: number) => {
    setKlaster(String(klasterId))
  }

  return (
    <div className="py-8">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Early Warning Dashboard
            </h1>
            <p className="text-sm text-slate-500">
              Pemantauan berita dengan early warning + scoring PKPN 3-axis
            </p>
          </div>
          {meta && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              {meta.total + (klasterData.reduce((s, c) => s + c.jumlah_artikel, 0))} artikel
            </span>
          )}
        </div>

        {/* Stat Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-3xl font-extrabold text-red-700">
              {meta?.summary.danger ?? 0}
            </p>
            <p className="text-sm font-semibold text-red-600">Danger</p>
          </div>
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-center">
            <p className="text-3xl font-extrabold text-yellow-700">
              {meta?.summary.warning ?? 0}
            </p>
            <p className="text-sm font-semibold text-yellow-600">Warning</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
            <p className="text-3xl font-extrabold text-blue-700">
              {meta?.summary.info ?? 0}
            </p>
            <p className="text-sm font-semibold text-blue-600">Info</p>
          </div>
        </div>

        {/* Cluster Rail */}
        <ClusterRail data={klasterData} onSelect={handleClusterSelect} />

        {/* Weekly Impact Chart */}
        <WeeklyImpactChart data={trenData} />

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={sumber}
            onChange={(e) => setSumber(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {SUMBER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={sentimen}
            onChange={(e) => setSentimen(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {SENTIMEN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={dampak}
            onChange={(e) => setDampak(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {DAMPAK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={minRel}
            onChange={(e) => setMinRel(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {REL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={klaster}
            onChange={(e) => setKlaster(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {KLASTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
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
            className="min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
          />
        </div>

        {/* PKPN Cluster Trending */}
        {summary?.pkpn_cluster && summary.pkpn_cluster.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              Trending Klaster:
            </span>
            {summary.pkpn_cluster.map((c) => (
              <span
                key={c.klaster}
                className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700"
              >
                {CLUSTER_ICONS[c.klaster] ?? ""}{" "}
                {CLUSTERS[c.klaster] ?? `Klaster ${c.klaster}`}
                <span className="ml-0.5 text-green-500">({c.jumlah})</span>
              </span>
            ))}
          </div>
        )}

        {/* Article list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="mb-2 h-5 w-3/4 rounded bg-slate-200" />
                <div className="h-4 w-1/2 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-500">Tidak ada artikel ditemukan</p>
          </div>
        ) : (
          <div className="mb-6 space-y-3">
            {filteredArticles.map((article) => {
              const badge =
                ALERT_LABEL[article.alert_level] ?? ALERT_LABEL.info
              const isOpen = expanded.has(article.id)
              const pkpnClusters: number[] = article.pkpn_clusters ?? article.klaster_pkpn ?? []
              const pkpnScore: number = article.pkpn_score ?? 0
              const dampakBadge = DAMPAK_BADGE[article.dampak ?? ""] ?? null
              const sentimenBadge = SENTIMEN_BADGE[article.sentimen_teks ?? ""] ?? null
              const relCls = article.relevansi_final !== undefined
                ? REL_SCORE_CLS[article.relevansi_final] ?? REL_SCORE_CLS[0]
                : null

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
                      {/* Alert badge */}
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${badge.badge}`}
                      >
                        {badge.icon} {badge.label}
                      </span>

                      {/* Dampak badge (PKPN) */}
                      {dampakBadge && (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${dampakBadge.cls}`}>
                          {dampakBadge.icon} {article.dampak!.replace("_", " ")}
                        </span>
                      )}

                      {/* Sentimen badge (PKPN) */}
                      {sentimenBadge && (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${sentimenBadge.cls}`}>
                          {sentimenBadge.icon}
                        </span>
                      )}

                      {/* Relevansi score (PKPN) */}
                      {relCls && article.relevansi_final !== undefined && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${relCls}`}>
                          R{article.relevansi_final}
                          {article.lantai_diterapkan && "\u2B06"}
                        </span>
                      )}

                      {/* PKPN cluster badges */}
                      {pkpnClusters.length > 0 &&
                        pkpnClusters.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                          >
                            {CLUSTER_ICONS[c] ?? ""}{" "}
                            {CLUSTERS[c]?.split(" ")[0] ?? `K${c}`}
                          </span>
                        ))}

                      {/* PKPN score badge */}
                      {pkpnScore > 0 && (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${PKPN_SCORE_CLASS[pkpnScore] ?? PKPN_SCORE_CLASS[0]}`}>
                          PKPN: {pkpnScore}
                        </span>
                      )}

                      {/* Perlu review flag */}
                      {article.perlu_review_manual && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          {"\u26A0\uFE0F"} Review
                        </span>
                      )}

                      <span className="text-xs font-semibold uppercase text-slate-400">
                        {SUMBER_OPTIONS.find((o) => o.value === article.sumber)
                          ?.label ?? article.sumber}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {article.judul}
                    </h3>

                    {article.topik && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {"\uD83C\uDFF7\uFE0F"} {article.topik}
                      </p>
                    )}

                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(article.published_at ?? article.created_at)}
                      {article.diambil_at && ` \u00B7 ${timeAgo(article.diambil_at)}`}
                    </p>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                      {article.ringkasan && (
                        <p className="mb-3 text-sm leading-relaxed text-slate-700">
                          <HighlightText text={article.ringkasan} />
                        </p>
                      )}

                      {/* 3-axis detail (PKPN) */}
                      {(article.relevansi_final !== undefined || article.dampak || article.sentimen_teks) && (
                        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {article.relevansi_final !== undefined && (
                            <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                              <p className="text-[11px] font-bold uppercase text-slate-500">Relevansi</p>
                              <p className="mt-0.5 text-sm font-bold text-slate-800">
                                {article.relevansi_llm !== undefined ? `LLM: ${article.relevansi_llm} \u2192 ` : ""}
                                Final: {article.relevansi_final}
                                {article.lantai_diterapkan && " (dinaikkan floor)"}
                              </p>
                            </div>
                          )}
                          {article.dampak && (
                            <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                              <p className="text-[11px] font-bold uppercase text-slate-500">Dampak</p>
                              <p className="mt-0.5 text-sm font-bold text-slate-800 capitalize">
                                {dampakBadge?.icon ?? ""} {article.dampak.replace("_", " ")}
                              </p>
                            </div>
                          )}
                          {article.sentimen_teks && (
                            <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                              <p className="text-[11px] font-bold uppercase text-slate-500">Sentimen Teks</p>
                              <p className="mt-0.5 text-sm font-bold text-slate-800 capitalize">
                                {sentimenBadge?.icon ?? ""} {article.sentimen_teks}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Alasan LLM */}
                      {article.alasan && (
                        <p className="mb-2 text-xs italic text-slate-500">
                          "{article.alasan}"
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-500">
                          Score: {Number(article.sentimen_score).toFixed(3)}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-500">
                          Confidence: {article.confidence}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-500">
                          Sentimen: {article.sentimen}
                        </span>
                        {article.lexicon_score !== null && article.lexicon_score !== undefined && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-500">
                              Lexicon: {article.lexicon_score.toFixed(3)}
                            </span>
                          </>
                        )}
                        {article.model && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-500">
                              Model: {article.model}
                            </span>
                          </>
                        )}
                        {pkpnScore > 0 && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="font-semibold text-emerald-600">
                              PKPN Score: {pkpnScore}
                              {article.pkpn_literal && " (literal)"}
                            </span>
                          </>
                        )}
                        {pkpnClusters.length > 0 && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-500">
                              Klaster:{" "}
                              {pkpnClusters
                                .map(
                                  (c) =>
                                    `${CLUSTER_ICONS[c] ?? ""} ${CLUSTERS[c]?.split(" ")[0] ?? `K${c}`}`,
                                )
                                .join(", ")}
                            </span>
                          </>
                        )}
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

        {/* Trend Chart (existing EW) */}
        {summary && summary.trend.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
              Tren Sentimen 7 Hari
            </h3>

            <div className="flex items-end gap-1" style={{ height: 160 }}>
              {summary.trend.map((t) => {
                const height = Math.max(12, (t.total / maxTotal) * 140)
                const color =
                  t.avg_score < -0.1
                    ? "#ef4444"
                    : t.avg_score > 0.1
                      ? "#22c55e"
                      : "#94a3b8"

                return (
                  <div
                    key={t.tanggal}
                    className="flex flex-1 flex-col items-center"
                  >
                    <div
                      className="w-full rounded-t"
                      style={{
                        height,
                        background: color,
                        opacity: 0.85,
                      }}
                      title={`${t.tanggal}: ${t.total} artikel, rata-rata ${Number(t.avg_score).toFixed(3)}`}
                    />
                    <span className="mt-1 text-[10px] text-slate-500">
                      {new Date(t.tanggal + "T00:00:00").toLocaleDateString(
                        "id-ID",
                        { weekday: "short", day: "numeric" },
                      )}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-600">
                      {Number(t.avg_score).toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-red-400" />{" "}
                Negatif
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-green-400" />{" "}
                Positif
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-slate-300" />{" "}
                Netral
              </span>
            </div>
          </div>
        )}
      </div>

      {/* CSS tambahan */}
      <style>{`
        .cluster-rail { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
        .cluster-rail::-webkit-scrollbar { height: 4px; }
        .cluster-rail::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }

        .cluster-card { transition: all 0.15s ease; }
        .cluster-card:hover { border-color: #a7f3d0; }

        .balance-bar { overflow: hidden; }

        .impact-chart { }

        .tag-relevansi { font-variant-numeric: tabular-nums; }
        .tag-dampak { }
        .tag-klaster { }

        .hl-pkpn { background: #d1fae5; color: #065f46; border-radius: 2px; padding: 0 2px; }
        .hl-makro { background: #dbeafe; color: #1e40af; border-radius: 2px; padding: 0 2px; }
        .hl-weak { opacity: 0.55; }
      `}</style>
    </div>
  )
}
