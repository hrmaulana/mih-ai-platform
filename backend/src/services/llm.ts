import OpenAI from "openai";
import { config } from "../config";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const SYSTEM_PROMPT = [
  "Anda adalah asisten AI internal Kedeputian Perencanaan Makro Pembangunan.",
  "Jawab dalam Bahasa Indonesia, gunakan HANYA konteks yang diberikan.",
  "Jika konteks tidak cukup, jawab 'Saya tidak menemukan informasi tersebut dalam dokumen yang tersedia.'",
  "Wajib merujuk sumber dengan format [n] sesuai daftar konteks, contoh: 'Menurut [1] ...'.",
].join("\n");

export const COMPARISON_SYSTEM_PROMPT = [
  "Anda adalah asisten AI internal Kedeputian Perencanaan Makro Pembangunan.",
  "Jawab dalam Bahasa Indonesia, gunakan HANYA konteks yang diberikan.",
  "Jika konteks tidak cukup, jawab 'Saya tidak menemukan informasi tersebut dalam dokumen yang tersedia.'",
  "Wajib merujuk sumber dengan format [n] sesuai daftar konteks, contoh: 'Menurut [1] ...'.",
  "",
  "INSTRUKSI KHUSUS UNTUK PERTANYAAN PERBANDINGAN:",
  "Pertanyaan ini membandingkan beberapa dokumen/entitas. Anda HARUS:",
  "1. Identifikasi dokumen mana yang membahas setiap sisi perbandingan (lihat heading 'Dokumen' di konteks).",
  "2. Sajikan jawaban dalam format terstruktur: tabel perbandingan, daftar berurutan, atau poin-poin per aspek.",
  "3. Untuk setiap aspek, tampilkan nilai/keadaan dari KEDUA sisi dengan rujukan [n] ke konteks yang sesuai.",
  "4. Jika suatu aspek hanya ada di satu sisi, nyatakan secara eksplisit.",
  "5. Akhiri dengan ringkasan perbedaan utama.",
  "Contoh format:",
  "| Aspek | RKP 2026 [1] | RKP 2027 [3] |",
  "|-------|--------------|--------------|",
  "| Pertumbuhan | 5,1% [1] | 5,3% [3] |",
  "Atau gunakan daftar poin per aspek bila tabel tidak cocok.",
].join("\n");

/** Varian 2: mencegah penolakan keliru ketika konteks sebenarnya memuat bukti relevan. */
export const OVERREFUSAL_ADDENDUM = [
  "Catatan penting: bila konteks memuat angka atau pernyataan yang relevan dengan pertanyaan — walaupun hanya sebagian, atau hanya dari satu dokumen — JAWABLAH memakai angka/pernyataan itu beserta rujukan [n].",
  "Kalimat penolakan HANYA dipakai bila konteks benar-benar tidak membahas topik yang ditanyakan.",
].join("\n");

/** Varian 3: mode ANALITIK — boleh menghitung/menalar dari angka konteks, tanpa fakta luar. */
export const ANALITIK_ADDENDUM = [
  "Anda juga bertindak sebagai analis. Selain mengutip, Anda DIDORONG untuk:",
  "1. menghitung (selisih, jumlah, persentase, rasio) dari angka-angka yang ADA di konteks;",
  "2. membandingkan angka antar dokumen/periode yang ada di konteks;",
  "3. menyimpulkan arah (naik/turun/melandai) dari angka yang tersedia;",
  "4. mensintesis beberapa bagian konteks menjadi kesimpulan.",
  "Aturan yang tidak boleh dilanggar: setiap angka yang Anda sebutkan harus berasal dari konteks, atau merupakan hasil hitungan dari angka konteks — sebutkan angka pembentuknya agar bisa ditelusuri.",
  "Jangan menambahkan fakta, angka, atau prakiraan dari luar konteks. Bila konteks hanya memuat sebagian, katakan bagian mana yang tersedia dan bagian mana yang tidak.",
].join("\n");

export function selectSystemPrompt(isComparison: boolean, variant: number = config.promptVariant): string {
  const dasar = isComparison ? COMPARISON_SYSTEM_PROMPT : SYSTEM_PROMPT;
  if (variant >= 3) return `${dasar}\n${ANALITIK_ADDENDUM}`;
  return variant >= 2 ? `${dasar}\n${OVERREFUSAL_ADDENDUM}` : dasar;
}

export interface JawabanDenganUsage {
  text: string;
  model: string;
  tokenIn: number | null;
  tokenOut: number | null;
}

/**
 * Seperti generateAnswer, tetapi mengembalikan model + jumlah token
 * supaya pemanggil bisa mencatat biaya (usage_logs.token_in/token_out).
 */
export async function generateAnswerDenganUsage(
  question: string,
  context: string,
  history: ChatTurn[] = [],
  isComparison: boolean = false,
  paksaSitasi: boolean = false
): Promise<JawabanDenganUsage> {
  if (config.llmProvider === "mock") {
    return {
      text: `Jawaban (mock) berdasarkan [1]: ${question}`,
      model: "mock",
      tokenIn: null,
      tokenOut: null,
    };
  }
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const model =
    isComparison && config.comparisonModel ? config.comparisonModel : config.openaiModel;
  const resp = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          selectSystemPrompt(isComparison) +
          (paksaSitasi
            ? "\n\nWAJIB: setiap angka, target, dan kesimpulan harus diikuti sitasi [n] dari konteks. Jangan menulis kalimat faktual tanpa [n]."
            : ""),
      },
      ...history,
      { role: "user", content: `Pertanyaan: ${question}\n\nKonteks:\n${context}` },
    ],
  });
  return {
    text: resp.choices[0]?.message?.content ?? "",
    model,
    tokenIn: resp.usage?.prompt_tokens ?? null,
    tokenOut: resp.usage?.completion_tokens ?? null,
  };
}

export async function generateAnswer(
  question: string,
  context: string,
  history: ChatTurn[] = [],
  isComparison: boolean = false
): Promise<string> {
  const hasil = await generateAnswerDenganUsage(question, context, history, isComparison);
  return hasil.text;
}

export async function* streamAnswer(
  question: string,
  context: string,
  history: ChatTurn[] = [],
  isComparison: boolean = false
): AsyncGenerator<string> {
  if (config.llmProvider === "mock") {
    yield `Jawaban (mock) berdasarkan [1]: ${question}`;
    return;
  }

  const providers = [
    {
      apiKey: config.openaiApiKey,
      model: isComparison && config.comparisonModel ? config.comparisonModel : config.openaiModel,
    },
    {
      apiKey: config.fallbackApiKey,
      model: config.fallbackModel,
      baseUrl: config.fallbackBaseUrl,
    },
  ];

  for (const provider of providers) {
    if (!provider.apiKey) continue;
    try {
      const client = new OpenAI({
        apiKey: provider.apiKey,
        baseURL: (provider as any).baseUrl ?? undefined,
      });
      const model = provider.model;
      const stream = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: selectSystemPrompt(isComparison) },
          ...history,
          { role: "user", content: `Pertanyaan: ${question}\n\nKonteks:\n${context}` },
        ],
        stream: true,
      });
      for await (const part of stream) {
        const delta = part.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
      return;
    } catch (err: any) {
      console.warn(`LLM provider ${provider.model} gagal, fallback: ${err.message}`);
    }
  }
}


/** Bersihkan keluaran penulisan ulang kueri agar aman dipakai sebagai kueri pencarian. */
export function bersihkanKueri(teks: string): string {
  const t = (teks || "").replace(/[`"'\n\r]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 3) return "";
  return t.split(" ").slice(0, 25).join(" ");
}

/**
 * Ubah pertanyaan percakapan menjadi kueri bergaya dokumen resmi.
 * Selisih kosakata inilah penyebab utama chunk sumber tidak terambil (baseline 31 Okt:
 * batas atas retrieval 100% bila kueri memakai kosakata dokumen, tetapi hanya 58,3%
 * dengan pertanyaan asli).
 */
export async function tulisUlangKueri(pertanyaan: string): Promise<string> {
  if (config.llmProvider === "mock") return pertanyaan;
  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const resp = await client.chat.completions.create({
      model: config.openaiModel,
      temperature: 0,
      max_tokens: 60,
      messages: [
        {
          role: "system",
          content:
            "Ubah pertanyaan pengguna menjadi kueri pencarian dokumen resmi perencanaan pembangunan Indonesia. " +
            "Keluarkan HANYA kuerinya (maksimal 25 kata), sertakan istilah teknis dan angka penting, tanpa penjelasan.",
        },
        { role: "user", content: pertanyaan },
      ],
    });
    const hasil = bersihkanKueri(resp.choices[0]?.message?.content ?? "");
    return hasil || pertanyaan;
  } catch (err) {
    console.warn("penulisan ulang kueri gagal, memakai pertanyaan asli:", (err as Error).message);
    return pertanyaan;
  }
}
