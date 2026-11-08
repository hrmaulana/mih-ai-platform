import OpenAI from "openai";
import { config } from "../config";

export interface HasilVerifikasi {
  jumlahKlaim: number;
  takDidukung: string[];
  skor: number;
}

/** Parser keluaran LLM (murni, mudah dites). */
export function parseVerifikasi(teks: string): HasilVerifikasi | null {
  const m = teks.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const n = Number(o.jumlah_klaim ?? o.jumlahKlaim ?? 0);
    const t = Array.isArray(o.tak_didukung) ? o.tak_didukung.map(String) : [];
    let s = Number(o.skor);
    if (!Number.isFinite(s)) s = n > 0 ? Math.max(0, 1 - t.length / n) : 1;
    return {
      jumlahKlaim: Number.isFinite(n) ? n : 0,
      takDidukung: t,
      skor: Math.min(1, Math.max(0, s)),
    };
  } catch {
    return null;
  }
}

/** Nilai apakah klaim jawaban didukung kutipan. */
export async function verifikasiKlaim(
  jawaban: string,
  konteks: string,
): Promise<HasilVerifikasi | null> {
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const sys =
    "Kamu pemeriksa fakta. Bandingkan JAWABAN dengan KUTIPAN. " +
    'Balas JSON: {"jumlah_klaim":n,"tak_didukung":["klaim"],"skor":0..1}. ' +
    "skor = porsi klaim yang didukung kutipan. Jangan menilai gaya bahasa.";
  const user = `KUTIPAN:\n${konteks.slice(0, 6000)}\n\nJAWABAN:\n${jawaban.slice(0, 1500)}`;
  try {
    const r = await client.chat.completions.create({
      model: config.judgeModel,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    return parseVerifikasi(r.choices[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}
