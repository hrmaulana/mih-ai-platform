import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type LayananItem, type LayananJenis } from "../../api";
import { units } from "../../data/portal";
import { usePortalAuth } from "./PortalLayout";

/*
 * Halaman Layanan Publik — satu komponen generik untuk enam bagian menu
 * (dasar hukum, jenis layanan, teknis, survey, layanan lainnya, dokumentasi).
 *
 * Sumber data: /api/layanan (server menyaring item ber-akses "login" bila
 * pengunjung belum login), sehingga blok internal tidak pernah terkirim ke
 * pengunjung anonim.
 *
 * Rute:
 *   /layanan/:jenis                → bagian (enam nilai di URL_JENIS)
 *   /layanan/jenis-layanan/:slug   → satu layanan utama
 */

const URL_JENIS: Record<string, LayananJenis> = {
  "dasar-hukum": "dasar_hukum",
  "jenis-layanan": "jenis_layanan",
  teknis: "teknis",
  survey: "survey",
  "layanan-lainnya": "layanan_lainnya",
  dokumentasi: "dokumentasi",
};

const JUDUL: Record<LayananJenis, string> = {
  dasar_hukum: "Dasar Hukum",
  jenis_layanan: "Jenis Layanan",
  teknis: "Teknis Permohonan Layanan",
  survey: "Survey Kepuasan Masyarakat",
  layanan_lainnya: "Jenis Layanan Lainnya",
  dokumentasi: "Dokumentasi Pelaksanaan Layanan",
};

const namaUnit = (slug: string) => units.find((u) => u.slug === slug)?.name ?? slug;

/** Blok "perlu login" — dipakai saat pengunjung anonim melihat bagian internal. */
function KotakLogin({ pesan }: { pesan: string }) {
  return (
    <div className="layanan-locked">
      <b>🔒 Konten internal</b>
      <span>{pesan}</span>
      <div style={{ marginTop: 14 }}>
        <Link className="button primary" to="/login">
          Masuk untuk melihat
        </Link>
      </div>
    </div>
  );
}

function Poster({ url, judul }: { url?: string; judul: string }) {
  if (!url) return <div className="layanan-poster">[ {judul} belum diunggah ]</div>;
  return (
    <div className="layanan-poster" style={{ padding: 0, overflow: "hidden" }}>
      <img src={url} alt={judul} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}

function TombolKontak({ wa, email }: { wa?: string; email?: string }) {
  const waBersih = (wa ?? "").replace(/[^0-9]/g, "").replace(/^0/, "62");
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {wa ? (
        <a className="button amber" href={`https://wa.me/${waBersih}`} target="_blank" rel="noreferrer">
          💬 WhatsApp
        </a>
      ) : null}
      {email ? (
        <a className="button ghost-outline" href={`mailto:${email}`}>
          ✉️ Email
        </a>
      ) : null}
      {!wa && !email ? <p className="muted">Kontak belum diisi.</p> : null}
    </div>
  );
}

export default function PortalLayanan() {
  const { jenis: urlJenis, slug } = useParams();
  const { user } = usePortalAuth();
  const jenis = URL_JENIS[urlJenis ?? ""];

  const [items, setItems] = useState<LayananItem[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!jenis) return;
    setMemuat(true);
    api
      .layanan(jenis)
      .then(setItems)
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false));
  }, [jenis, user?.id]);

  if (!jenis) {
    return (
      <section className="section">
        <div className="container">
          <p className="eyebrow">Layanan Publik</p>
          <h1 className="page-title">Bagian tidak ditemukan</h1>
          <p className="muted">Bagian layanan yang Anda cari tidak tersedia.</p>
        </div>
      </section>
    );
  }

  const publik = items.filter((i) => i.akses === "publik");
  const internal = items.filter((i) => i.akses === "login");

  const kepala = (
    <section className="section" style={{ background: "white", paddingBottom: 40 }}>
      <div className="container">
        <p className="eyebrow">Layanan Publik</p>
        <h1 className="page-title">{JUDUL[jenis]}</h1>
      </div>
    </section>
  );

  if (memuat) {
    return (
      <>
        {kepala}
        <div className="container" style={{ paddingBottom: 80 }}>
          <p className="muted">Memuat…</p>
        </div>
      </>
    );
  }
  if (galat) {
    return (
      <>
        {kepala}
        <div className="container" style={{ paddingBottom: 80 }}>
          <p className="muted">Gagal memuat konten: {galat}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {kepala}

      {/* ================= JENIS LAYANAN (sidebar 8 layanan) ================= */}
      {jenis === "jenis_layanan" && (
        <div className="container service-layout" style={{ paddingBottom: 80, marginTop: 0 }}>
          <aside className="service-sidebar">
            <div className="sidebar-menu-title">Daftar Layanan PMP</div>
            {publik.map((s) => (
              <Link
                key={s.slug}
                className={`sidebar-link${s.slug === slug || (!slug && s === publik[0]) ? " active" : ""}`}
                to={`/layanan/jenis-layanan/${s.slug}`}
              >
                {s.judul}
              </Link>
            ))}
          </aside>
          <article className="card">
            <div className="card-body">
              {(() => {
                const aktif = publik.find((s) => s.slug === slug) ?? publik[0];
                if (!aktif) return <p className="muted">Belum ada layanan yang dipublikasikan.</p>;
                const ruang = (aktif.payload.ruang_lingkup ?? []) as string[];
                const pengampu = (aktif.payload.unit_pengampu ?? []) as string[];
                return (
                  <>
                    <h2 className="layanan-judul">{aktif.judul}</h2>
                    <p className="layanan-label">Deskripsi Layanan</p>
                    <p className="muted" style={{ lineHeight: 1.85 }}>
                      {aktif.payload.deskripsi}
                    </p>

                    <p className="layanan-label">Ruang Lingkup</p>
                    {ruang.length ? (
                      <ul className="layanan-bullet">
                        {ruang.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Ruang lingkup belum diisi.</p>
                    )}

                    <p className="layanan-label">Unit Pengampu</p>
                    {pengampu.length ? (
                      <p style={{ margin: 0 }}>
                        {pengampu.map((u) => (
                          <span className="layanan-tag" key={u}>
                            {namaUnit(u)}
                          </span>
                        ))}
                      </p>
                    ) : (
                      <p className="muted">Unit pengampu belum ditetapkan.</p>
                    )}
                  </>
                );
              })()}
            </div>
          </article>
        </div>
      )}

      {/* ================= DASAR HUKUM ================= */}
      {jenis === "dasar_hukum" && (
        <div className="container" style={{ paddingBottom: 80 }}>
          <article className="card">
            <div className="card-body">
              <p className="muted">Klik salah satu dokumen untuk membukanya.</p>
              <table className="layanan-tabel">
                <thead>
                  <tr>
                    <th>Nomor</th>
                    <th>Judul</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {publik.map((d) => (
                    <tr key={d.id}>
                      <td>{d.payload.nomor}</td>
                      <td>{d.judul}</td>
                      <td style={{ textAlign: "right" }}>
                        {d.payload.file_url ? (
                          <a className="button ghost-outline" href={d.payload.file_url} target="_blank" rel="noreferrer">
                            Lihat
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {publik.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        Belum ada dokumen dasar hukum.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      )}

      {/* ================= TEKNIS PERMOHONAN ================= */}
      {jenis === "teknis" && (
        <div className="container" style={{ paddingBottom: 80 }}>
          <article className="card">
            <div className="card-body">
              {publik.length === 0 ? (
                <p className="muted">Konten teknis belum diisi.</p>
              ) : (
                <div className="layanan-grid-2">
                  <div>
                    <p className="layanan-label">Skema Layanan</p>
                    <Poster url={publik[0].payload.poster_url} judul="Poster skema layanan" />
                  </div>
                  <div>
                    <p className="layanan-label">Kontak Resmi</p>
                    <p className="muted">Untuk pertanyaan dan permohonan layanan, hubungi:</p>
                    <TombolKontak wa={publik[0].payload.wa} email={publik[0].payload.email} />
                  </div>
                </div>
              )}
            </div>
          </article>
        </div>
      )}

      {/* ================= SURVEY KEPUASAN ================= */}
      {jenis === "survey" && (
        <div className="container" style={{ paddingBottom: 80 }}>
          <article className="card" style={{ marginBottom: 24 }}>
            <div className="card-body">
              {publik.length === 0 ? (
                <p className="muted">Konten survei belum diisi.</p>
              ) : (
                <div className="layanan-grid-2">
                  <Poster url={publik[0].payload.poster_url} judul="Poster survei" />
                  <div>
                    <p className="muted">Bantu kami meningkatkan layanan dengan mengisi survei kepuasan.</p>
                    {publik[0].payload.link ? (
                      <a className="button primary" href={publik[0].payload.link} target="_blank" rel="noreferrer">
                        Isi Survei
                      </a>
                    ) : (
                      <p className="muted">Tautan survei belum tersedia.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </article>

          <article className="card">
            <div className="card-body">
              <h2 className="layanan-judul">Laporan Survei</h2>
              {internal.length > 0 ? (
                <table className="layanan-tabel">
                  <thead>
                    <tr>
                      <th>Periode</th>
                      <th>Judul</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {internal.map((l) => (
                      <tr key={l.id}>
                        <td>{l.payload.periode}</td>
                        <td>{l.judul}</td>
                        <td style={{ textAlign: "right" }}>
                          {l.payload.file_url ? (
                            <a className="button ghost-outline" href={l.payload.file_url} target="_blank" rel="noreferrer">
                              Unduh
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <KotakLogin pesan="Laporan survei hanya tampil untuk pengguna yang sudah login." />
              )}
            </div>
          </article>
        </div>
      )}

      {/* ================= LAYANAN LAINNYA ================= */}
      {jenis === "layanan_lainnya" && (
        <div className="container" style={{ paddingBottom: 80 }}>
          <article className="card">
            <div className="card-body">
              <p className="muted">Layanan di luar delapan layanan utama.</p>
              <div className="layanan-grid-2" style={{ marginTop: 18 }}>
                {publik.map((l) => (
                  <div className="card" key={l.id}>
                    <div className="card-body">
                      <h3 className="layanan-sub">{l.judul}</h3>
                      <p className="muted">{l.payload.penjelasan}</p>
                      <p className="layanan-label">Kontak</p>
                      <TombolKontak wa={l.payload.kontak?.wa} email={l.payload.kontak?.email} />
                      {l.payload.kontak?.nama ? (
                        <p className="muted" style={{ marginTop: 8 }}>
                          {l.payload.kontak.nama}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
                {publik.length === 0 && <p className="muted">Belum ada layanan lain.</p>}
              </div>
            </div>
          </article>
        </div>
      )}

      {/* ================= DOKUMENTASI PELAKSANAAN ================= */}
      {jenis === "dokumentasi" && (
        <div className="container" style={{ paddingBottom: 80 }}>
          <article className="card" style={{ marginBottom: 24 }}>
            <div className="card-body">
              <h2 className="layanan-judul">Dokumentasi Kegiatan</h2>
              {publik.length ? (
                <div className="gallery-grid">
                  {publik.flatMap((d) =>
                    ((d.payload.foto ?? []) as string[]).map((f, i) => (
                      <figure key={`${d.id}-${i}`} style={{ margin: 0 }}>
                        <img src={f} alt={`${d.judul} ${i + 1}`} />
                        <figcaption className="muted" style={{ fontSize: "0.9rem", marginTop: 8 }}>
                          {d.judul}
                          {d.payload.tanggal ? ` — ${d.payload.tanggal}` : ""}
                        </figcaption>
                      </figure>
                    )),
                  )}
                </div>
              ) : (
                <p className="muted">Belum ada dokumentasi kegiatan.</p>
              )}
            </div>
          </article>

          <article className="card">
            <div className="card-body">
              <h2 className="layanan-judul">Laporan Penerimaan</h2>
              {internal.length > 0 ? (
                <table className="layanan-tabel">
                  <thead>
                    <tr>
                      <th>Jenis</th>
                      <th>Periode</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {internal.map((l) => (
                      <tr key={l.id}>
                        <td>{l.judul}</td>
                        <td>{l.payload.periode}</td>
                        <td style={{ textAlign: "right" }}>
                          {l.payload.file_url ? (
                            <a className="button ghost-outline" href={l.payload.file_url} target="_blank" rel="noreferrer">
                              Unduh
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <KotakLogin pesan="Laporan penerimaan mahasiswa & tamu dinas hanya tampil setelah login." />
              )}
            </div>
          </article>
        </div>
      )}
    </>
  );
}
