import { useEffect, useState } from "react";
import { api, type LayananItem, type LayananJenis } from "../api";
import { units } from "../data/portal";
import { slugify } from "../lib/slug";
import { Button, Card, ErrorBanner, Field, Input, Select } from "./ui";

/*
 * Panel CMS: Kelola Layanan Publik.
 *
 * Satu tabel generik di backend (jenis + payload JSONB), tetapi form di sini
 * disusun per jenis agar admin tidak perlu menulis JSON mentah.
 */

const JENIS_LABEL: Record<LayananJenis, string> = {
  jenis_layanan: "Jenis Layanan",
  dasar_hukum: "Dasar Hukum",
  teknis: "Teknis & Kontak",
  survey: "Survey Kepuasan",
  layanan_lainnya: "Layanan Lainnya",
  dokumentasi: "Dokumentasi",
};

type FieldType = "text" | "textarea" | "lines" | "units" | "checkbox";

interface FieldDef {
  key: string; // dot-path di dalam payload, mis. "kontak.wa"
  label: string;
  type: FieldType;
  hint?: string;
}

/** Susunan field payload per jenis — dipakai untuk form & penyimpanan. */
const FIELDS: Record<LayananJenis, FieldDef[]> = {
  jenis_layanan: [
    { key: "deskripsi", label: "Deskripsi Layanan", type: "textarea" },
    { key: "ruang_lingkup", label: "Ruang Lingkup", type: "lines", hint: "Satu poin per baris" },
    { key: "unit_pengampu", label: "Unit Pengampu", type: "units" },
  ],
  dasar_hukum: [
    { key: "nomor", label: "Nomor", type: "text" },
    { key: "tahun", label: "Tahun", type: "text" },
    { key: "file_url", label: "URL File (PDF)", type: "text" },
    { key: "nama_file", label: "Nama File", type: "text" },
  ],
  teknis: [
    { key: "poster_url", label: "URL Poster Skema", type: "text" },
    { key: "wa", label: "Nomor WhatsApp", type: "text" },
    { key: "email", label: "Email Layanan", type: "text" },
  ],
  survey: [
    { key: "poster_url", label: "URL Poster Survei", type: "text" },
    { key: "link", label: "Link Survei", type: "text" },
    { key: "periode", label: "Periode (khusus laporan)", type: "text", hint: "Isi bila baris ini adalah laporan survei" },
    { key: "file_url", label: "URL File Laporan", type: "text" },
  ],
  layanan_lainnya: [
    { key: "penjelasan", label: "Penjelasan", type: "textarea" },
    { key: "kontak.nama", label: "Nama PIC", type: "text" },
    { key: "kontak.wa", label: "WA PIC", type: "text" },
    { key: "kontak.email", label: "Email PIC", type: "text" },
  ],
  dokumentasi: [
    { key: "tanggal", label: "Tanggal Kegiatan", type: "text" },
    { key: "foto", label: "URL Foto", type: "lines", hint: "Satu URL per baris" },
    { key: "periode", label: "Periode (khusus laporan)", type: "text", hint: "Isi bila baris ini adalah laporan penerimaan" },
    { key: "file_url", label: "URL File Laporan", type: "text" },
  ],
};

const EMPTY_FORM = {
  slug: "",
  judul: "",
  urutan: "0",
  akses: "publik" as "publik" | "login",
  is_published: true,
};

/** Baca nilai dot-path dari objek. */
function getPath(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Tulis nilai dot-path ke objek (menyalin agar tidak memutasi state). */
function setPath(obj: any, path: string, value: any): any {
  const keys = path.split(".");
  const salinan = { ...obj };
  let cur = salinan;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] ?? {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return salinan;
}

export default function LayananAdminPanel() {
  const [jenis, setJenis] = useState<LayananJenis>("jenis_layanan");
  const [items, setItems] = useState<LayananItem[]>([]);
  const [payload, setPayload] = useState<Record<string, any>>({});
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // true = slug diisi manual, jangan ditimpa otomatis dari judul
  const [slugManual, setSlugManual] = useState(false);
  const [error, setError] = useState("");
  const [sukses, setSukses] = useState("");

  const muat = async () => {
    try {
      setItems(await api.adminLayanan());
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    muat();
  }, []);

  const barisJenis = items.filter((i) => i.jenis === jenis);

  function resetForm() {
    setEditingId(null);
    setSlugManual(false);
    setForm({ ...EMPTY_FORM });
    setPayload({});
    setError("");
  }

  function mulaiUbah(item: LayananItem) {
    setEditingId(item.id);
    // item lama sudah punya slug -> jangan ditimpa otomatis
    setSlugManual(true);
    setForm({
      slug: item.slug,
      judul: item.judul,
      urutan: String(item.urutan),
      akses: item.akses,
      is_published: item.is_published,
    });
    setPayload(item.payload ?? {});
    setError("");
    setSukses("");
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSukses("");
    try {
      const muatan = {
        jenis,
        slug: form.slug.trim(),
        judul: form.judul.trim(),
        urutan: Number(form.urutan) || 0,
        akses: form.akses,
        is_published: form.is_published,
        payload,
      };
      if (editingId === null) {
        await api.createLayanan(muatan);
        setSukses("Item baru tersimpan.");
      } else {
        await api.updateLayanan(editingId, muatan);
        setSukses("Perubahan tersimpan.");
      }
      resetForm();
      await muat();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function hapus(item: LayananItem) {
    if (!window.confirm(`Hapus "${item.judul}"?`)) return;
    setBusy(true);
    try {
      await api.deleteLayanan(item.id);
      if (editingId === item.id) resetForm();
      await muat();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function renderField(def: FieldDef) {
    const nilai = getPath(payload, def.key);
    if (def.type === "units") {
      const terpilih: string[] = Array.isArray(nilai) ? nilai : [];
      return (
        <div key={def.key} className="sm:col-span-2">
          <Field label={def.label}>
            <div className="flex flex-wrap gap-3 pt-1">
              {units
                .filter((u) => u.slug !== "deputi")
                .map((u) => (
                  <label key={u.slug} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="accent-blue-900"
                      checked={terpilih.includes(u.slug)}
                      onChange={(e) => {
                        const baru = e.target.checked
                          ? [...terpilih, u.slug]
                          : terpilih.filter((s) => s !== u.slug);
                        setPayload((p) => setPath(p, def.key, baru));
                      }}
                    />
                    {u.name}
                  </label>
                ))}
            </div>
          </Field>
        </div>
      );
    }
    if (def.type === "lines") {
      const teks = Array.isArray(nilai) ? nilai.join("\n") : (nilai ?? "");
      return (
        <div key={def.key} className="sm:col-span-2">
          <Field label={def.label}>
            <textarea
              rows={4}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={teks}
              onChange={(e) =>
                setPayload((p) =>
                  setPath(p, def.key, e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)),
                )
              }
            />
          </Field>
          {def.hint && <p className="mt-1 text-xs text-slate-500">{def.hint}</p>}
        </div>
      );
    }
    if (def.type === "textarea") {
      return (
        <div key={def.key} className="sm:col-span-2">
          <Field label={def.label}>
            <textarea
              rows={3}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={nilai ?? ""}
              onChange={(e) => setPayload((p) => setPath(p, def.key, e.target.value))}
            />
          </Field>
        </div>
      );
    }
    return (
      <div key={def.key}>
        <Field label={def.label}>
          <Input
            value={nilai ?? ""}
            onChange={(e) => setPayload((p) => setPath(p, def.key, e.target.value))}
          />
        </Field>
        {def.hint && <p className="mt-1 text-xs text-slate-500">{def.hint}</p>}
      </div>
    );
  }

  return (
    <Card interactive={false} className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-slate-600">Kelola Layanan Publik</h2>
        <Button variant="secondary" onClick={resetForm} disabled={busy}>
          Form Baru
        </Button>
      </div>

      {/* sub-tab per bagian */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(JENIS_LABEL) as LayananJenis[]).map((j) => (
          <button
            key={j}
            type="button"
            onClick={() => {
              setJenis(j);
              resetForm();
            }}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${
              j === jenis
                ? "border-blue-900 bg-blue-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-900 hover:text-blue-900"
            }`}
          >
            {JENIS_LABEL[j]}
          </button>
        ))}
      </div>

      {error && <div className="mt-3"><ErrorBanner>{error}</ErrorBanner></div>}
      {sukses && <p className="mt-3 text-xs font-semibold text-emerald-600">{sukses}</p>}

      {/* tabel item */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-left">
              <th className="px-3 py-2 text-xs font-extrabold uppercase text-slate-600">Judul</th>
              <th className="px-3 py-2 text-xs font-extrabold uppercase text-slate-600">Slug</th>
              <th className="px-3 py-2 text-xs font-extrabold uppercase text-slate-600">Akses</th>
              <th className="px-3 py-2 text-xs font-extrabold uppercase text-slate-600">Status</th>
              <th className="px-3 py-2 text-right text-xs font-extrabold uppercase text-slate-600">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {barisJenis.map((item) => (
              <tr key={item.id} className="border-b border-slate-200 last:border-0">
                <td className="px-3 py-2 text-slate-700">{item.judul}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{item.slug}</td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {item.akses === "login" ? "login" : "publik"}
                </td>
                <td className="px-3 py-2">
                  {item.is_published ? (
                    <span className="text-xs font-semibold text-emerald-600">tampil</span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-600">draf</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button
                    className="text-xs font-bold text-blue-900 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => mulaiUbah(item)}
                  >
                    Edit
                  </button>
                  <button
                    className="ml-3 text-xs font-bold text-red-600 underline underline-offset-2 hover:text-red-700 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => hapus(item)}
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {barisJenis.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-xs text-slate-500">
                  Belum ada item pada bagian ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* form */}
      <form onSubmit={simpan} className="mt-5 border-t border-slate-200 pt-5">
        <h3 className="text-xs font-extrabold uppercase text-slate-500">
          {editingId === null ? "Tambah item" : `Ubah item #${editingId}`} — {JENIS_LABEL[jenis]}
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Judul">
            <Input
              value={form.judul}
              onChange={(e) => {
                const judul = e.target.value;
                setForm({
                  ...form,
                  judul,
                  slug: slugManual ? form.slug : slugify(judul),
                });
              }}
              required
            />
          </Field>
          <Field label="Slug" hint="Terisi otomatis dari Judul — bisa diubah manual">
            <Input
              value={form.slug}
              onChange={(e) => {
                const v = e.target.value;
                if (v.trim() === "") {
                  // dikosongkan -> kembali ke mode otomatis
                  setSlugManual(false);
                  setForm({ ...form, slug: slugify(form.judul) });
                } else {
                  setSlugManual(true);
                  setForm({ ...form, slug: v });
                }
              }}
              placeholder="huruf-kecil-dan-hubung"
              required
            />
          </Field>
          <Field label="Urutan">
            <Input
              type="number"
              value={form.urutan}
              onChange={(e) => setForm({ ...form, urutan: e.target.value })}
            />
          </Field>
          <Field label="Akses">
            <Select
              value={form.akses}
              onChange={(e) => setForm({ ...form, akses: e.target.value as "publik" | "login" })}
            >
              <option value="publik">publik</option>
              <option value="login">login (hanya tampil setelah masuk)</option>
            </Select>
          </Field>

          {FIELDS[jenis].map(renderField)}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="accent-blue-900"
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
            />
            Tampilkan di portal
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" type="submit" disabled={busy}>
            {editingId === null ? "Tambah" : "Simpan"}
          </Button>
          <Button variant="secondary" type="button" onClick={resetForm} disabled={busy}>
            Batal
          </Button>
        </div>
      </form>
    </Card>
  );
}
