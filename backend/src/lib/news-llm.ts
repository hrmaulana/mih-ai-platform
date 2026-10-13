import { randomUUID } from "node:crypto"

/** Standalone adapter: no DB singleton, network on import, or route side effects. */
export interface NewsDB {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}
export type NewsMessage = { role: "system" | "user"; content: string }
export interface NewsResult<T> {
  status: "ok" | "pending" | "fallback"
  llm_used: boolean
  source: "openrouter" | "pending" | "lexicon-fallback"
  model: string | null
  perlu_review_manual: boolean
  reason: string
  data: T | null
}

/** Prices are explicit maximum USD per MILLION tokens, also enforced in routing.
 * No model/FX/pricing defaults. All retries are reserved before the first request.
 * Input bound is conservative UTF-8 bytes + 512 tokens/message framing overhead.
 * Caller must validate its own complete JSON schema; no score policy changes here.
 */
function settings(env: Record<string, string | undefined>) {
  const bounded = (key: string, min: number, max: number, integer = false) => {
    const raw = env[key]?.trim()
    const n = raw ? Number(raw) : NaN
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
      throw new Error("Konfigurasi biaya berita belum lengkap atau tidak valid.")
    }
    return n
  }
  const apiKey = env.OPENROUTER_API_KEY?.trim()
  const model = env.NEWS_OPENROUTER_MODEL?.trim()
  if (!apiKey || !model || model.includes(":") || model.length > 200) {
    throw new Error("Kunci atau model berita belum dikonfigurasi.")
  }
  return {
    apiKey, model,
    fx: bounded("NEWS_USD_IDR_RATE", 1, 1_000_000),
    input: bounded("NEWS_MAX_INPUT_TOKENS", 512, 32768, true),
    output: bounded("NEWS_MAX_OUTPUT_TOKENS", 1, 4096, true),
    inputPrice: bounded("NEWS_INPUT_USD_PER_MILLION", 0.000001, 1000),
    outputPrice: bounded("NEWS_OUTPUT_USD_PER_MILLION", 0.000001, 1000),
    margin: bounded("NEWS_COST_MARGIN", 1.1, 3),
    retries: bounded("NEWS_MAX_RETRIES", 0, 2, true),
    timeout: bounded("NEWS_TIMEOUT_MS", 10, 60000, true),
  }
}
function pending<T>(reason: string): NewsResult<T> {
  return { status: "pending", llm_used: false, source: "pending", model: null,
    perlu_review_manual: true, reason, data: null }
}
export function createNewsLLM(deps: {
  db: NewsDB
  env?: Record<string, string | undefined>
  fetch?: (input: string, init: RequestInit) => Promise<Response>
}) {
  return {
    async analyze<T>(messages: NewsMessage[], validate: (value: unknown) => value is T): Promise<NewsResult<T>> {
      let cfg: ReturnType<typeof settings>
      try { cfg = settings(deps.env ?? process.env) }
      catch { return pending("Konfigurasi biaya berita belum lengkap atau tidak valid.") }
      if (!Array.isArray(messages) || !messages.length || messages.length > 8 || messages.some(m =>
        !m || !["system", "user"].includes(m.role) || typeof m.content !== "string") ||
        messages.reduce((sum, m) => sum + Buffer.byteLength(m.content, "utf8") + 512, 0) > cfg.input) {
        return pending("Teks berita melampaui batas masukan.")
      }
      const perAttempt = (cfg.input * cfg.inputPrice + cfg.output * cfg.outputPrice) / 1_000_000 * cfg.margin
      const id = randomUUID()
      try {
        const reservation = await deps.db.query(
          "SELECT news_budget_reserve($1::uuid, $2::numeric, $3::numeric, $4::text) AS accepted",
          [id, perAttempt * (cfg.retries + 1), cfg.fx, cfg.model],
        )
        if (reservation.rows[0]?.accepted !== true) return pending("Anggaran berita habis atau biaya sebelumnya belum terverifikasi.")
      } catch { return pending("Ledger anggaran berita tidak tersedia; analisis ditunda.") }
      let actual = 0
      let retained = 0
      let attempts = 0
      let overrun = false
      let actualModel: string | null = null
      let data: T | null = null
      let reason = "Layanan analisis berita belum tersedia."
      for (; attempts <= cfg.retries;) {
        attempts++
        try {
        const response = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(cfg.timeout),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}`,
          "HTTP-Referer": "https://mih.keuanganppn1.cloud" },
        body: JSON.stringify({ model: cfg.model, messages, temperature: 0.1, max_tokens: cfg.output,
          stream: false, response_format: { type: "json_object" }, usage: { include: true },
          provider: { zdr: true, data_collection: "deny", require_parameters: true,
            max_price: { prompt: cfg.inputPrice, completion: cfg.outputPrice } } }),
      })
        const payload = await response.json() as any
        const cost = payload?.usage?.cost
        const known = typeof cost === "number" && Number.isFinite(cost) && cost >= 0
        if (!known) {
          retained = perAttempt
          reason = "Biaya respons belum terverifikasi; reservasi tetap ditahan."
          break
        }
        actual += cost
        if (cost > perAttempt) { overrun = true; reason = "Biaya melebihi reservasi; analisis dihentikan."; break }
        if (!response.ok) {
          reason = `Provider berita menolak permintaan (HTTP ${response.status}).`
          if (response.status === 429 || response.status >= 500) continue
          break
        }
        try {
          const parsed: unknown = JSON.parse(payload?.choices?.[0]?.message?.content)
          if (validate(parsed) && typeof payload.model === "string" && payload.model.trim()) {
            data = parsed
            actualModel = payload.model
            break
          }
        } catch { /* JSON invalid: retry only when cost is known. */ }
        reason = "Respons analisis berita tidak valid."
        } catch {
          retained = perAttempt
          reason = "Permintaan berita gagal atau melewati batas waktu; biaya belum terverifikasi."
          break
        }
      }
      try {
        const settlement = await deps.db.query("SELECT news_budget_finish($1::uuid, $2::numeric, $3::numeric, $4::integer, $5::text, $6::boolean) AS settled",
          [id, actual, retained, attempts, actualModel, overrun])
        if (settlement.rows[0]?.settled !== true) return pending("Pencatatan biaya belum terverifikasi; reservasi tetap ditahan.")
      } catch { return pending("Ledger biaya tidak tersedia; reservasi tetap ditahan.") }
      if (data === null) return pending(reason)
      return { status: "ok", llm_used: true, source: "openrouter", model: actualModel,
        perlu_review_manual: false, reason: "Analisis dan biaya terverifikasi.", data }
    },
  }
}
