import { useEffect, useState, useCallback } from "react"

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
}

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

const ALERT_LABEL: Record<string, { icon: string; label: string; badge: string }> = {
  danger: { icon: "\u{1F534}", label: "Danger", badge: "bg-red-100 text-red-800 border-red-300" },
  warning: { icon: "\u{1F7E1}", label: "Warning", badge: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  info: { icon: "\u2139\uFE0F", label: "Info", badge: "bg-blue-100 text-blue-800 border-blue-300" },
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export default function EarlyWarning() {
  const [articles, setArticles] = useState<Article[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [page, setPage] = useState(1)
  const [sumber, setSumber] = useState("")
  const [sentimen, setSentimen] = useState("")
  const [q, setQ] = useState("")

  // Expand
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Summary / trend data for chart
  const [summary, setSummary] = useState<SummaryData | null>(null)

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

  useEffect(() => {
    fetchArticles()
  }, [fetchArticles])

  // Fetch summary/trend once
  useEffect(() => {
    fetch("/api/early-warning/summary")
      .then((r) => r.json())
      .then((d) => setSummary(d ?? { alerts: [], trend: [], stats: { total_hari_ini: 0, danger: 0, warning: 0 } }))
      .catch(() => {})
  }, [])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [sumber, sentimen, q])

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

  return (
    <div className="py-8">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <h1 className="mb-6 text-2xl font-extrabold text-slate-900">
          Early Warning Dashboard
        </h1>

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
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul..."
            className="min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
          />
        </div>

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
        ) : articles.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-500">Tidak ada artikel ditemukan</p>
          </div>
        ) : (
          <div className="mb-6 space-y-3">
            {articles.map((article) => {
              const badge =
                ALERT_LABEL[article.alert_level] ?? ALERT_LABEL.info
              const isOpen = expanded.has(article.id)

              return (
                <div
                  key={article.id}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-sm"
                  onClick={() => toggleExpand(article.id)}
                >
                  <div className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${badge.badge}`}
                      >
                        {badge.icon} {badge.label}
                      </span>
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        {SUMBER_OPTIONS.find((o) => o.value === article.sumber)
                          ?.label ?? article.sumber}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      {article.judul}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(article.published_at ?? article.created_at)}
                    </p>
                  </div>
                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                      {article.ringkasan && (
                        <p className="mb-2 text-sm leading-relaxed text-slate-700">
                          {article.ringkasan}
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

        {/* Trend Chart */}
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
    </div>
  )
}
