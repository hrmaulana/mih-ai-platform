/**
 * Reranker cross-encoder (bge-reranker-base, ONNX quantized).
 *
 * Menggantikan skor heuristik sebagai tahap peringkat akhir: model menilai
 * pasangan (pertanyaan, chunk) secara langsung, bukan membandingkan vektor
 * terpisah. Ini komponen yang di literatur (Anthropic, "Contextual Retrieval")
 * memberi dampak terbesar setelah perbaikan retrieval.
 *
 * Model dimuat sekali (lazy) dari path lokal agar tidak bergantung jaringan
 * container; lihat volume `~/mih/models:/models:ro` di compose.
 */
import { config } from "../config";

let cePromise: Promise<{ tok: any; model: any }> | null = null;

async function muatCE() {
  const { AutoTokenizer, AutoModelForSequenceClassification } = await import("@huggingface/transformers");
  const path = config.ragCeModelPath;
  const tok = await AutoTokenizer.from_pretrained(path);
  const model = await AutoModelForSequenceClassification.from_pretrained(path, {
    dtype: config.ragCeDtype as any,
  });
  return { tok, model };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Skor relevansi (query, passage) — 0..1. */
export async function skorCE(kueri: string, teks: string[]): Promise<number[]> {
  if (teks.length === 0) return [];
  if (!cePromise) cePromise = muatCE();
  const { tok, model } = await cePromise;
  const skor: number[] = [];
  for (const t of teks) {
    const input = await tok(kueri, {
      text_pair: t,
      padding: true,
      truncation: true,
      max_length: config.ragCeMaxTokens,
    });
    const res: any = await model(input);
    const logit = Number(res?.logits?.data?.[0] ?? 0);
    skor.push(sigmoid(logit));
  }
  return skor;
}

/** Urutkan item menurun berdasarkan skor CE (murni, mudah dites). */
export function urutkanCE<T>(item: T[], skor: number[]): T[] {
  return item
    .map((it, i) => ({ it, s: Number.isFinite(skor[i]) ? skor[i] : 0 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it);
}
