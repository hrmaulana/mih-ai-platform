// Logika murni untuk graf relasi dokumen (2D & 3D).
// Dipisah dari komponen agar mudah diuji dan dipakai ulang.

// Radius node dokumen: 5..22 px, membesar dengan derajat (dikunci di 30).
export function docRadius(degree: number): number {
  return 5 + Math.min(degree, 30) * (17 / 30);
}

// Jarak link drilldown: lebih renggang saat kemiripan tinggi.
export function docLinkDistance(semantic: number | null): number {
  return 90 + Math.min(Math.max(semantic ?? 0, 0), 1) * 40;
}

// Jarak link peta klaster (semantic rata-rata 0..1).
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
  return (
    (o.showSem && e.semantic !== null && e.semantic >= o.minSem) ||
    (o.showCit && (e.citations ?? 0) > 0)
  );
}

// Batas edge 3D: ambil yang paling semantik.
export const EDGE_CAP_3D = 1500;
export function capEdges3D<T extends { semantic: number | null }>(
  links: T[],
): { links: T[]; capped: boolean } {
  if (links.length <= EDGE_CAP_3D) return { links, capped: false };
  const top = [...links]
    .sort((a, b) => (b.semantic ?? 0) - (a.semantic ?? 0))
    .slice(0, EDGE_CAP_3D);
  return { links: top, capped: true };
}

// Koordinat Z stabil untuk 3D (deterministik dari id, bukan acak).
export function stableZ(id: number): number {
  return (((id * 2654435761) % 1000) / 1000) * 200 - 100;
}