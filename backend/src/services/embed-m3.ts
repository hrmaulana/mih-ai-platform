/**
 * Embedding bge-m3 (multibahasa, 1024 dim) — dijalankan lokal lewat ONNX.
 *
 * Dipakai sebagai alternatif `text-embedding-3-small` untuk korpus Indonesia
 * yang bercampur istilah teknis, singkatan, dan angka. Model dimuat sekali
 * (lazy) dari /data/models/bge-m3.
 */
import { config } from "../config";

let pipaPromise: Promise<any> | null = null;

async function muatPipa() {
  const { pipeline } = await import("@huggingface/transformers");
  // `pooling`/`normalize` valid saat runtime tetapi tidak ada di tipe v4.
  return pipeline("feature-extraction", config.ragM3ModelPath, {
    dtype: config.ragM3Dtype as any,
    pooling: "cls",
    normalize: true,
  } as any);
}

/** Kembalikan vektor 1024-dim (sudah dinormalisasi) untuk tiap teks. */
export async function embedM3(teks: string[]): Promise<number[][]> {
  if (teks.length === 0) return [];
  if (!pipaPromise) pipaPromise = muatPipa();
  const pipa = await pipaPromise;
  const keluar: number[][] = [];
  const ukuran = config.ragM3Batch;
  for (let i = 0; i < teks.length; i += ukuran) {
    const bagian = teks.slice(i, i + ukuran);
    const hasil: any = await pipa(bagian, { pooling: "cls", normalize: true });
    const dims: number[] = hasil.dims ?? [bagian.length, 1024];
    const data: ArrayLike<number> = hasil.data;
    const per = dims[dims.length - 1];
    for (let j = 0; j < bagian.length; j++) {
      keluar.push(Array.from(data as any).slice(j * per, (j + 1) * per) as number[]);
    }
  }
  return keluar;
}
