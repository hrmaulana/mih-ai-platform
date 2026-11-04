import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

/**
 * Log Harian — metrik nyata dari usage_logs, access_daily, daily_metrics.
 * Angka kosong berarti "belum ada data", bukan nol yang dikarang.
 */

interface BarisMetrik {
  tanggal: string;
  kategori: string;
  metrik: string;
  dimensi: string;
  nilai: number;
}
interface BarisTrafik {
  tanggal: string;
  hits_manusia: number | null;
  hits_bot: number | null;
  ip_manusia: number | null;
  err_5xx: number | null;
}
interface DataMetrik {
  rentang: { dari: string; sampai: string };
  seri: BarisMetrik[];
  trafik: BarisTrafik[];
  jalur_atas: Array<{ jalur: string; hits: number; ip: number }>;
  pertanyaan_gagal: Array<{ id: number; question: string; latency_ms: number | null; created_at: string }>;
  pertanyaan_teratas: Array<{ question: string; n: number }>;
  model: Array<{ model: string; n: number; biaya_usd: string; token_in: number; token_out: number }>;
}

const hariISO = (mundur: number) => new Date(Date.now() - mundur * 86_400_000).toISOString().slice(0, 10);

/** Ambil satu metrik dari seri harian. */
function seriMetrik(seri: BarisMetrik[], metrik: string): Array<{ tanggal: string; nilai: number }> {
  return seri
    .filter((r) => r.metrik === metrik && r.dimensi === "")
    .map((r) => ({ tanggal: r.tanggal, nilai: Number(r.nilai) }))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

function total(seri: BarisMetrik[], metrik: string): number {
  return seriMetrik(seri, metrik).reduce((n, r) => n + r.nilai, 0);
}

function Sparkline({ data, warna = "#2563eb" }: { data: Array<{ tanggal: string; nilai: number }>; warna?: string }) {
  const w = 640;
  const h = 90;
  if (data.length < 2) {
    return <div className="flex h-[90px] items-center justify-center text-xs text-slate-400">Belum cukup data untuk grafik</div>;
  }
  const max = Math.max(...data.map((d) => d.nilai), 1);
  const x = (i: number) => 6 + (i / (data.length - 1)) * (w - 12);
  const y = (v: number) => h - 8 - (v / max) * (h - 20);
  const garis = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.nilai).toFixed(1)}`).join(" ");
  const area = `${garis} L${x(data.length - 1).toFixed(1)},${h - 8} L6,${h - 8} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Grafik tren harian">
      <path d={area} fill={warna} opacity={0.1} />
      <path d={garis} fill="none" stroke={warna} strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={d.tanggal} cx={x(i)} cy={y(d.nilai)} r={2} fill={warna} />
      ))}
    </svg>
  );
}

function Kartu({ label, nilai, sub, warna }: { label: string; nilai: string; sub?: string; warna?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: warna ?? "#0f172a" }}>{nilai}</div>
      {sub ? <div className="text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default function Metrics() {
  const [data, setData] = useState<DataMetrik | null>(null);
  const [galat, setGalat] = useState("");
  const [memuat, setMemuat] = useState(true);
  const [sampai, setSampai] = useState(hariISO(0));
  const [dari, setDari] = useState(hariISO(29));

  useEffect(() => {
    setMemuat(true);
    api
      .metricsDaily(dari, sampai)
      .then((d) => {
        setData(d);
        setGalat("");
      })
      .catch((e) => setGalat(String(e.message ?? e)))
      .finally(() => setMemuat(false));
  }, [dari, sampai]);

  const ringkas = useMemo(() => {
    if (!data) return null;
    const jumlah = total(data.seri, "jumlah");
    const menolak = total(data.seri, "menolak");
    const biaya = total(data.seri, "biaya_total_usd");
    const p95 = seriMetrik(data.seri, "latency_p95_ms");
    const manusia = data.trafik.reduce((n, t) => n + (t.hits_manusia ?? 0), 0);
    const bot = data.trafik.reduce((n, t) => n + (t.hits_bot ?? 0), 0);
    return {
      jumlah,
      menolak,
      persenMenolak: jumlah ? Math.round((menolak / jumlah) * 1000) / 10 : null,
      biaya,
      p95: p95.length ? p95[p95.length - 1].nilai : null,
      manusia,
      bot,
      userUnik: seriMetrik(data.seri, "user_unik").reduce((n, r) => Math.max(n, r.nilai), 0),
    };
  }, [data]);

  const eksporCSV = () => {
    if (!data) return;
    const baris = [
      "tanggal,kategori,metrik,dimensi,nilai",
      ...data.seri.map((r) => `${r.tanggal},${r.kategori},${r.metrik},${r.dimensi},${r.nilai}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([baris], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mih-metrik-${dari}_${sampai}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Log Harian</h1>
          <p className="text-sm text-slate-500">
            Angka berasal dari <code className="text-xs">usage_logs</code>, <code className="text-xs">access_daily</code>,
            dan <code className="text-xs">daily_metrics</code>. Kosong = belum ada data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-slate-500">Dari</label>
          <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" />
          <label className="text-slate-500">Sampai</label>
          <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" />
          <button onClick={eksporCSV} className="rounded-lg border border-slate-300 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Ekspor CSV
          </button>
        </div>
      </div>

      {galat ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{galat}</div> : null}
      {memuat && !data ? <div className="text-sm text-slate-500">Memuat metrik…</div> : null}

      {ringkas && data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kartu label="Pertanyaan" nilai={String(ringkas.jumlah)} sub={`${data.rentang.dari} → ${data.rentang.sampai}`} />
            <Kartu label="User aktif" nilai={String(ringkas.userUnik)} sub="unik per periode" />
            <Kartu
              label="Menolak"
              nilai={ringkas.persenMenolak === null ? "—" : `${ringkas.persenMenolak}%`}
              sub={`${ringkas.menolak} pertanyaan`}
              warna="#b45309"
            />
            <Kartu label="Latency p95" nilai={ringkas.p95 === null ? "—" : `${Math.round(ringkas.p95)} ms`} sub="hari terakhir" />
            <Kartu
              label="Biaya LLM"
              nilai={ringkas.biaya > 0 ? `$${ringkas.biaya.toFixed(4)}` : "—"}
              sub={ringkas.biaya > 0 ? "periode terpilih" : "harga model belum lengkap"}
              warna="#047857"
            />
            <Kartu
              label="Trafik"
              nilai={String(ringkas.manusia)}
              sub={`${ringkas.bot} hit bot disaring`}
              warna="#1d4ed8"
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">Pertanyaan per hari</h2>
              <Sparkline data={seriMetrik(data.seri, "jumlah")} />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">Biaya LLM per hari (USD)</h2>
              <Sparkline data={seriMetrik(data.seri, "biaya_total_usd")} warna="#047857" />
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Pertanyaan teratas</h2>
              {data.pertanyaan_teratas.length === 0 ? (
                <p className="text-xs text-slate-400">Belum ada pertanyaan pada rentang ini.</p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {data.pertanyaan_teratas.map((q) => (
                    <li key={q.question} className="flex justify-between gap-3 border-b border-slate-100 pb-1">
                      <span className="truncate text-slate-700" title={q.question}>{q.question}</span>
                      <span className="tabular-nums text-slate-500">{q.n}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Perlu perbaikan (menolak / tanpa sitasi)</h2>
              {data.pertanyaan_gagal.length === 0 ? (
                <p className="text-xs text-slate-400">Tidak ada — bagus.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.pertanyaan_gagal.map((q) => (
                    <li key={q.id} className="border-b border-slate-100 pb-1">
                      <span className="text-slate-700">{q.question}</span>
                      <span className="ml-2 text-xs text-slate-400">{q.latency_ms ?? "—"} ms</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Halaman teratas (manusia)</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="py-1">Jalur</th>
                    <th className="py-1 text-right">Hit</th>
                    <th className="py-1 text-right">IP unik</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jalur_atas.map((r) => (
                    <tr key={r.jalur} className="border-t border-slate-100">
                      <td className="py-1 text-slate-700">{r.jalur}</td>
                      <td className="py-1 text-right tabular-nums">{r.hits}</td>
                      <td className="py-1 text-right tabular-nums text-slate-500">{r.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Biaya per model</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="py-1">Model</th>
                    <th className="py-1 text-right">Panggilan</th>
                    <th className="py-1 text-right">Token in/out</th>
                    <th className="py-1 text-right">Biaya</th>
                  </tr>
                </thead>
                <tbody>
                  {data.model.map((m) => (
                    <tr key={m.model} className="border-t border-slate-100">
                      <td className="py-1 text-slate-700">{m.model}</td>
                      <td className="py-1 text-right tabular-nums">{m.n}</td>
                      <td className="py-1 text-right tabular-nums text-slate-500">
                        {Number(m.token_in).toLocaleString("id-ID")} / {Number(m.token_out).toLocaleString("id-ID")}
                      </td>
                      <td className="py-1 text-right tabular-nums">{Number(m.biaya_usd) > 0 ? `$${Number(m.biaya_usd).toFixed(4)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
