/**
 * LLM Sentiment Analysis — Wrapper untuk OpenRouter / DeepSeek v4 flash
 *
 * Dipanggil hanya ketika lexicon memberikan hasil ambigu (|lex_score| < 0.3).
 * Fallback: jika OPENROUTER_API_KEY tidak tersedia, return score 0.
 */

interface LLMResponse {
  sentimen: "positif" | "negatif" | "netral"
  score: number
  alasan: string
}

export async function analyzeSentimentLLM(
  judul: string,
  konten?: string,
): Promise<{ score: number; keyword: string; ringkasan: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    return { score: 0, keyword: "", ringkasan: "" }
  }

  const teks = konten ? `Judul: ${judul}\n\nKonten: ${konten.slice(0, 500)}` : judul

  const systemPrompt = `Anda adalah analis sentimen berita ekonomi Indonesia.
Gunakan metodologi berikut:
- Positif: pertumbuhan, peningkatan, surplus, perbaikan
- Negatif: penurunan, defisit, krisis, pemotongan, refocussing
- Netral: laporan faktual tanpa opini yang jelas

Analisis sentimen EKONOMI dari berita berikut (bukan sentimen umum).
Output dalam format JSON:
{"sentimen": "positif|negatif|netral", "score": -1.0..1.0, "alasan": "...", "keyword": "...", "ringkasan": "..."}`

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://mih.keuanganppn1.cloud",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-v4-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: teks },
          ],
          temperature: 0.1,
          max_tokens: 300,
        }),
      },
    )

    if (!response.ok) {
      console.warn(`[llm-sentiment] OpenRouter returned ${response.status}`)
      return { score: 0, keyword: "", ringkasan: "" }
    }

    const data = await response.json()
    const content: string = data?.choices?.[0]?.message?.content ?? ""

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { score: 0, keyword: "", ringkasan: "" }
    }

    const parsed: LLMResponse & { keyword?: string; ringkasan?: string } =
      JSON.parse(jsonMatch[0])

    const score =
      parsed.sentimen === "positif"
        ? Math.max(0, Math.min(1, parsed.score ?? 0.5))
        : parsed.sentimen === "negatif"
          ? Math.min(0, Math.max(-1, parsed.score ?? -0.5))
          : 0

    return {
      score: Math.round(score * 1000) / 1000,
      keyword: parsed.keyword ?? "",
      ringkasan: parsed.ringkasan ?? "",
    }
  } catch (err) {
    console.warn("[llm-sentiment] Error:", err)
    return { score: 0, keyword: "", ringkasan: "" }
  }
}