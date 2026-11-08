/**
 * Penilai LLM-judge untuk harness end-to-end.
 *
 * Menggantikan pencocokan substring yang terlalu kasar: jawaban benar yang
 * menulis "5,35%" alih-alih "5,35 persen" tidak lagi dihitung gagal. Satu
 * panggilan murah per kasus mengembalikan tiga skor ala RAGAS:
 *   - faithfulness : porsi klaim jawaban yang didukung konteks
 *   - relevancy    : seberapa langsung jawaban menjawab pertanyaan
 *   - recall       : apakah fakta yang diharapkan ada di konteks yang diambil
 */
import OpenAI from "openai";
import { config } from "../config";

export interface SkorJuri {
  faithfulness: number;
  relevancy: number;
  recall: number;
  alasan?: string;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Parser murni: terima JSON longgar (kadang model menambahkan teks). */
export function parseSkor(teks: string): SkorJuri | null {
  const mulai = teks.indexOf("{");
  const akhir = teks.lastIndexOf("}");
  if (mulai < 0 || akhir <= mulai) return null;
  let data: any;
  try {
    data = JSON.parse(teks.slice(mulai, akhir + 1));
  } catch {
    return null;
  }
  const ambil = (v: any) => {
    if (typeof v === "number") return clamp01(v);
    if (typeof v === "string") return clamp01(Number(v.replace(",", ".")));
    return 0;
  };
  return {
    faithfulness: ambil(data.faithfulness),
    relevancy: ambil(data.relevancy),
    recall: ambil(data.recall),
    alasan: typeof data.alasan === "string" ? data.alasan.slice(0, 200) : undefined,
  };
}

export async function nilaiDenganJuri(
  pertanyaan: string,
  fakta: string,
  konteks: string,
  jawaban: string,
): Promise<SkorJuri | null> {
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const sistem =
    "Anda penilai sistem tanya-jawab berbasis dokumen. Nilai tiga hal dan jawab HANYA JSON. " +
    "faithfulness: porsi klaim dalam JAWABAN yang didukung KONTEKS (0..1). " +
    "relevancy: seberapa langsung JAWABAN menjawab PERTANYAAN (0..1). " +
    "recall: apakah FAKTA yang diharapkan dapat ditemukan di KONTEKS (0..1). " +
    'Format: {"faithfulness":0.0,"relevancy":0.0,"recall":0.0,"alasan":"singkat"}';
  const isi =
    `PERTANYAAN:\n${pertanyaan}\n\nFAKTA YANG DIHARAPKAN:\n${fakta}\n\n` +
    `KONTEKS:\n${konteks.slice(0, 6000)}\n\nJAWABAN:\n${jawaban.slice(0, 2000)}`;
  try {
    const resp = await client.chat.completions.create({
      model: config.judgeModel,
      temperature: 0,
      messages: [
        { role: "system", content: sistem },
        { role: "user", content: isi },
      ],
    });
    return parseSkor(resp.choices[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}
