# Relasi Dokumen: Keterbacaan 2D + Mode 3D — Implementation Plan

> **For Hermes:** Eksekusi per tahap dengan TDD. Jangan deploy sebelum screenshot 2D dan 3D disetujui.

**Goal:** Peta klaster dan drilldown terbaca (node, label, dan garis tidak bertumpuk), dan tersedia toggle 2D/3D.

**Architecture:** Komponen `DocumentGraph.tsx` tetap satu. Logika murni (radius, jarak, filter, label) dipindah ke `documentGraphMath.ts` agar bisa diuji. Mode 3D memakai `react-force-graph-3d` (1.29.2, butuh `three`) dengan `React.lazy`, sehingga halaman 2D tidak memuat Three.js. Backend hanya berubah pada agregasi bobot klaster.

**Tech Stack:** React 19, react-force-graph-2d 1.29.1, react-force-graph-3d 1.29.2, three, `bun test` (frontend sudah memakai bun test).

**Default yang saya usulkan (bisa diubah):** 2D default; label 3D hanya saat hover; edge 3D dibatasi 1500 dengan memilih yang semantik tertinggi.

---

## Tahap 1 — Bobot klaster jadi rata-rata (backend)

**File:** `backend/src/routes/documents.ts` (blok `agg`/`clusterEdges`, sekitar baris 107–127)
**Test baru:** `backend/tests/documents-graph.test.ts`

Tes (RED): setiap `cluster_edges[i].semantic` berada di 0–1, dan `pair_count` ada.

Perubahan kode:
```ts
const agg = new Map<string, { sum: number; n: number; citations: number }>();
for (const e of edges as any[]) {
  const a = clusterByDoc.get(Number(e.source));
  const b = clusterByDoc.get(Number(e.target));
  if (a == null || b == null || a === b) continue;
  const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
  const cur = agg.get(key) ?? { sum: 0, n: 0, citations: 0 };
  if (e.semantic != null) { cur.sum += Number(e.semantic); cur.n += 1; }
  cur.citations += Number(e.citations ?? 0);
  agg.set(key, cur);
}
const clusterEdges = [...agg.entries()].map(([key, v]) => {
  const [source, target] = key.split(":").map(Number);
  return {
    source,
    target,
    semantic: v.n > 0 ? Number((v.sum / v.n).toFixed(3)) : null,
    citations: v.citations > 0 ? v.citations : null,
    pair_count: v.n,
  };
});
```

Verifikasi: `bun test` di backend (baseline 118 tes harus tetap hijau).

---

## Tahap 2 — Modul logika murni (frontend)

**File baru:** `frontend/src/pages/documentGraphMath.ts`

```ts
// Radius node dokumen: 5..22 px, membesar dengan derajat.
export function docRadius(degree: number): number {
  return 5 + Math.min(degree, 30) * (17 / 30);
}

// Jarak link drilldown: lebih renggang saat kemiripan tinggi.
export function docLinkDistance(semantic: number | null): number {
  return 90 + Math.min(Math.max(semantic ?? 0, 0), 1) * 40;
}

// Jarak link peta klaster (semantic sekarang rata-rata 0..1).
export function clusterLinkDistance(semantic: number | null): number {
  return 140 + Math.min(Math.max(semantic ?? 0, 0), 1) * 80;
}

// Label hanya saat zoom cukup; di bawahnya titik saja.
export const LABEL_MIN_SCALE = 1.6;
export function shouldDrawLabel(globalScale: number): boolean {
  return globalScale >= LABEL_MIN_SCALE;
}

// Filter edge (sama dengan passFilter di komponen).
export function passEdge(
  e: { semantic: number | null; citations: number | null },
  o: { showSem: boolean; showCit: boolean; minSem: number },
): boolean {
  return (o.showSem && e.semantic !== null && e.semantic >= o.minSem)
    || (o.showCit && (e.citations ?? 0) > 0);
}

// Batas edge 3D: ambil yang paling semantik.
export const EDGE_CAP_3D = 1500;
export function capEdges3D<T extends { semantic: number | null }>(links: T[]): { links: T[]; capped: boolean } {
  if (links.length <= EDGE_CAP_3D) return { links, capped: false };
  const top = [...links].sort((a, b) => (b.semantic ?? 0) - (a.semantic ?? 0)).slice(0, EDGE_CAP_3D);
  return { links: top, capped: true };
}

// Koordinat Z stabil untuk 3D (deterministik dari id, bukan acak).
export function stableZ(id: number): number {
  return ((id * 2654435761) % 1000) / 1000 * 200 - 100;
}
```

**Test:** `frontend/tests/documentGraphMath.test.ts` (bun test)
- `docRadius(0)=5`, `docRadius(30)=22`, nilai di luar rentang tetap di batas.
- `docLinkDistance(null)=90`, `docLinkDistance(1)=130`.
- `clusterLinkDistance` untuk semantic 0..1 tidak melebihi 220.
- `shouldDrawLabel(1.5)=false`, `shouldDrawLabel(1.6)=true`.
- `passEdge` sama dengan perilaku lama untuk kombinasi showSem/showCit.
- `capEdges3D` untuk 2000 link: hasil 1500, `capped=true`, dan urutan menurun berdasarkan semantic.
- `stableZ(id)` sama untuk id yang sama di dua pemanggilan.

---

## Tahap 3 — Keterbacaan 2D (`DocumentGraph.tsx`)

Ganti nilai di effect force (sekitar baris 272–383):

Mode `map`:
```tsx
g.d3Force("charge")?.strength((n: any) => -6 * radius(n));
g.d3Force("link")?.distance((l: any) => clusterLinkDistance(l.semantic));
```

Mode `cluster` (drilldown):
```tsx
g.d3Force("charge")?.strength(-220);
g.d3Force("link")?.distance((l: any) => docLinkDistance(l.semantic));
g.d3Force("link")?.strength(0.2);
// collide padding 10 -> 18
g.d3Force("collide", collideForce(() => graphDataRef.current.nodes, radius, 18));
```

Radius node drilldown memakai `docRadius(degree.get(id) ?? 1)`.

Label node di `nodeCanvasObject`: bungkus dengan `if (shouldDrawLabel(globalScale)) { ...fillText... }`.

Ambang default drilldown: `useState("0.6")` tetap; peta klaster memakai ambang yang sama.

Verifikasi: build, lalu screenshot 2D sebelum dan sesudah (Chromium headless dengan cookie sesi, route `/documents/relasi`).

---

## Tahap 4 — Mode 3D (lazy)

**Dependensi:** `cd frontend && npm install react-force-graph-3d@^1.29.2 three` (lockfile ikut berubah).

**State dan toggle:**
```tsx
const ForceGraph3D = lazy(() => import("react-force-graph-3d"));
const [dim, setDim] = useState<"2d" | "3d">("2d");
```

Toggle di header kanvas:
```tsx
<button onClick={() => setDim(dim === "2d" ? "3d" : "2d")}>
  {dim === "2d" ? "Mode 3D" : "Mode 2D"}
</button>
```

Render saat `dim === "3d"`:
```tsx
const capped = capEdges3D(graphDataForView.links);
<Suspense fallback={<div>Memuat 3D…</div>}>
  <ForceGraph3D
    graphData={{ nodes: graphDataForView.nodes.map(n => ({ ...n, z: stableZ(Number(n.id)) })), links: capped.links }}
    nodeLabel={(n: any) => n.filename ?? n.name}
    linkWidth={(l: any) => 0.4 + Math.max((l.semantic ?? 0) * 2, Math.min(l.citations ?? 0, 5) * 0.4)}
    nodeVal={(n: any) => docRadius(degree.get(Number(n.id)) ?? 1)}
  />
</Suspense>
{capped.capped && <p>Menampilkan 1500 relasi terkuat dari {graphDataForView.links.length}. Naikkan ambang untuk lebih sedikit.</p>}
```

Catatan: label 3D hanya lewat `nodeLabel` (tooltip hover), tidak ada teks permanen.

**Test:** render 3D dengan data kosong dan data sampel tidak melempar error (smoke test); toggle mengganti renderer.

---

## Tahap 5 — Verifikasi dan deploy

1. `bun test` backend (118) dan frontend (baru), build, lint.
2. Screenshot Chromium headless: peta klaster 2D, drilldown 2D, drilldown 3D. Bandingkan dengan screenshot sebelumnya.
3. Commit, push, tunggu CI dan deploy kantor. Pastikan bundel publik sama dengan kantor.
4. Cek langsung di `https://mih.keuanganppn1.cloud/documents/relasi`.

---

## Risiko dan mitigasi

- **3D berat di perangkat lemah:** batas 1500 edge; 2D tetap default.
- **Bundel membesar:** `three` dimuat lazy; halaman 2D tidak membayarnya. Ukuran bundel dicek di build.
- **Label 3D berputar tidak terbaca:** hover saja; label 2D tetap ada.
- **Perubahan bobot klaster:** dikunci tes Tahap 1 dan dicek visual.

## Keputusan yang masih perlu Anda konfirmasi

1. Mode 3D fitur tambahan dengan default 2D (disarankan)?
2. Label 3D hover saja (disarankan)?
3. Batas 1500 edge dengan peringatan (disarankan)?

**Status:** rencana dan potongan kode saja. Belum ada kode aplikasi yang diubah, belum ada dependensi yang dipasang.
