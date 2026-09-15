import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

interface AlertItem {
  id: number
  judul: string
  sumber: string
  sentimen_score: number
  alert_level: "danger" | "warning" | "info"
  created_at: string
}

interface TrendItem {
  tanggal: string
  avg_score: number
  total: number
}

interface Stats {
  total_hari_ini: number
  danger: number
  warning: number
}

interface SummaryData {
  alerts: AlertItem[]
  trend: TrendItem[]
  stats: Stats
}

const ALERT_BADGE: Record<string, { icon: string; color: string }> = {
  danger: { icon: "\u{1F534}", color: "bg-red-100 text-red-800 border-red-300" },
  warning: { icon: "\u{1F7E1}", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  info: { icon: "\u2139\uFE0F", color: "bg-blue-100 text-blue-800 border-blue-300" },
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const d = new Date(dateStr).getTime()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return "baru saja"
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`
  return `${Math.floor(diff / 86400)} hari lalu`
}

export default function EarlyWarningWidget() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const fetchData = () => {
      fetch("/api/early-warning/summary")
        .then((r) => r.json())
        .then((d) => {
          if (mounted) setData(d)
        })
        .catch(() => {})
        .finally(() => {
          if (mounted) setLoading(false)
        })
    }

    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000) // refresh tiap 5 menit

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-1/3 rounded bg-slate-200" />
          <div className="h-4 w-full rounded bg-slate-200" />
          <div className="h-4 w-full rounded bg-slate-200" />
          <div className="h-4 w-2/3 rounded bg-slate-200" />
        </div>
      </div>
    )
  }

  if (!data) return null

  const maxTotal = Math.max(...data.trend.map((t) => t.total), 1)
  const avgScore = data.trend.length > 0
    ? data.trend.reduce((s, t) => s + t.avg_score, 0) / data.trend.length
    : 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          Early Warning
        </h3>
        <Link
          to="/portal/early-warning"
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          Lihat Detail &rarr;
        </Link>
      </div>

      {/* Alert cards */}
      <div className="space-y-2">
        {data.alerts.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">
            Tidak ada peringatan aktif
          </p>
        )}
        {data.alerts.slice(0, 5).map((alert) => {
          const badge = ALERT_BADGE[alert.alert_level] ?? ALERT_BADGE.info
          return (
            <div
              key={alert.id}
              className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3"
            >
              <span className="flex-shrink-0 text-base">{badge.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {alert.judul}
                </p>
                <p className="text-xs text-slate-500">
                  {alert.sumber} &bull; {timeAgo(alert.created_at)} &bull;{" "}
                  score: {alert.sentimen_score.toFixed(3)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Trend bar */}
      {data.trend.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>7 hari</span>
            <span>
              Rata-rata:{" "}
              <span
                className={
                  avgScore < -0.1
                    ? "font-semibold text-red-600"
                    : avgScore > 0.1
                      ? "font-semibold text-green-600"
                      : "font-semibold text-slate-600"
                }
              >
                {avgScore.toFixed(3)}
              </span>
            </span>
          </div>
          <div className="flex h-6 items-end gap-0.5">
            {data.trend.map((t) => {
              const height = Math.max(8, (t.total / maxTotal) * 32)
              const color =
                t.avg_score < -0.1
                  ? "bg-red-400"
                  : t.avg_score > 0.1
                    ? "bg-green-400"
                    : "bg-slate-300"
              return (
                <div
                  key={t.tanggal}
                  className="flex flex-1 flex-col items-center"
                  title={`${t.tanggal}: ${t.total} artikel (rata-rata ${t.avg_score.toFixed(3)})`}
                >
                  <div
                    className={`w-full rounded-t ${color}`}
                    style={{ height }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mini stats */}
      {data.stats && (
        <div className="mt-3 flex gap-4 text-xs text-slate-600">
          <span>Hari ini: {data.stats.total_hari_ini} artikel</span>
          {data.stats.danger > 0 && (
            <span className="font-semibold text-red-600">
              {data.stats.danger} danger
            </span>
          )}
          {data.stats.warning > 0 && (
            <span className="font-semibold text-yellow-600">
              {data.stats.warning} warning
            </span>
          )}
        </div>
      )}
    </div>
  )
}
