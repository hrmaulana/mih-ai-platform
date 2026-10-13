import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { createNewsLLM } from "../src/lib/news-llm"

const env = {
  OPENROUTER_API_KEY: "fake-test-key", NEWS_OPENROUTER_MODEL: "vendor/news-model",
  NEWS_USD_IDR_RATE: "16000", NEWS_MAX_INPUT_TOKENS: "2048", NEWS_MAX_OUTPUT_TOKENS: "500",
  NEWS_INPUT_USD_PER_MILLION: "1", NEWS_OUTPUT_USD_PER_MILLION: "2",
  NEWS_COST_MARGIN: "1.2", NEWS_MAX_RETRIES: "2", NEWS_TIMEOUT_MS: "1000",
}
const valid = (v: unknown): v is { score: number } =>
  typeof v === "object" && v !== null && typeof (v as any).score === "number" &&
  Number.isFinite((v as any).score) && (v as any).score >= -1 && (v as any).score <= 1
function fakeDB(allow = true) {
  const calls: { sql: string; values: unknown[] }[] = []
  return { calls, query: async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values })
    return { rows: sql.includes("news_budget_reserve") ? [{ accepted: allow }] : [{ settled: true }] }
  } }
}
function reply(cost: unknown = 0.001, content = '{"score":0.5}', status = 200) {
  return new Response(JSON.stringify({ model: "vendor/actual-model", usage: { cost },
    choices: [{ message: { content } }] }), { status })
}

describe("news OpenRouter adapter", () => {
  test("migration uses durable tables and the same transaction lock for reserve/settlement", async () => {
    const sql = await readFile(new URL("../../db/migrations/005_news_budget.sql", import.meta.url), "utf8")
    expect(sql).toContain("CREATE TABLE news_budget_months")
    expect(sql).toContain("CREATE TABLE news_budget_calls")
    expect(sql.match(/pg_advisory_xact_lock\(250000, 5\)/g)).toHaveLength(2)
    expect(sql).toContain("250000")
    expect(sql).toContain("Asia/Jakarta")
    expect(sql).toContain("'unresolved', 'overrun'")
    expect(sql).toContain("FOR UPDATE")
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/i)
  })
  test("missing explicit FX fails closed without DB or HTTP", async () => {
    let calls = 0
    const adapter = createNewsLLM({
      env: {},
      db: { query: async () => { calls++; throw new Error("unexpected DB") } },
      fetch: async () => { calls++; throw new Error("unexpected HTTP") },
    })
    const result = await adapter.analyze([{ role: "user", content: "Berita" }], (v): v is { score: number } => !!v)
    expect(result.status).toBe("pending")
    expect(result.llm_used).toBe(false)
    expect(result.model).toBeNull()
    expect(result.perlu_review_manual).toBe(true)
    expect(calls).toBe(0)
  })
  test("reserves all attempts before a ZDR request and settles actual reported USD", async () => {
    const db = fakeDB()
    let request: RequestInit | undefined
    const adapter = createNewsLLM({ env, db, fetch: async (url, init) => {
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions")
      expect(db.calls).toHaveLength(1)
      request = init
      return reply()
    } })
    const result = await adapter.analyze([{ role: "user", content: "Berita" }], valid)
    expect(result.status).toBe("ok")
    expect(result.llm_used).toBe(true)
    expect(result.model).toBe("vendor/actual-model")
    expect(result.data).toEqual({ score: 0.5 })
    const body = JSON.parse(request!.body as string)
    expect(body.provider).toEqual({ zdr: true, data_collection: "deny", require_parameters: true,
      max_price: { prompt: 1, completion: 2 } })
    expect(body.max_tokens).toBe(500)
    expect(body.usage).toEqual({ include: true })
    expect(request!.signal).toBeInstanceOf(AbortSignal)
    expect(db.calls[0].values[1]).toBeCloseTo(0.0109728, 9)
    expect(db.calls[0].values[2]).toBe(16000)
    expect(db.calls[1].values[1]).toBe(0.001)
    expect(db.calls[1].values[2]).toBe(0)
  })
  test("missing usage cost retains attempted reservation, stops retries, and returns pending", async () => {
    const db = fakeDB()
    let count = 0
    const result = await createNewsLLM({ env, db, fetch: async () => { count++; return reply(null) } })
      .analyze([{ role: "user", content: "Berita" }], valid)
    expect(result.status).toBe("pending")
    expect(result.llm_used).toBe(false)
    expect(result.data).toBeNull()
    expect(count).toBe(1)
    expect(db.calls[1].values[1]).toBe(0)
    expect(db.calls[1].values[2]).toBeCloseTo((2048 + 1000) / 1e6 * 1.2, 9)
  })
  test("cost-confirmed 429 retries are bounded and every attempt is charged", async () => {
    const db = fakeDB()
    let count = 0
    const result = await createNewsLLM({ env, db, fetch: async () => { count++; return reply(0.001, "", 429) } })
      .analyze([{ role: "user", content: "Berita" }], valid)
    expect(result.status).toBe("pending")
    expect(count).toBe(3)
    expect(db.calls).toHaveLength(2)
    expect(db.calls[1].values[1]).toBeCloseTo(0.003, 9)
    expect(db.calls[1].values[3]).toBe(3)
  })
  test("timeout retains unknown cost and never throws into RSS ingestion", async () => {
    const db = fakeDB()
    let count = 0
    const result = await createNewsLLM({ env: { ...env, NEWS_TIMEOUT_MS: "10" }, db,
      fetch: async (_url, init) => {
        count++
        return new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(new Error("timeout")), { once: true })
        })
      },
    }).analyze([{ role: "user", content: "Berita" }], valid)
    expect(result.status).toBe("pending")
    expect(count).toBe(1)
    expect(db.calls[1].values[2]).toBeGreaterThan(0)
    expect(result.reason).not.toContain("fake-test-key")
  })
  test("failed settlement returns pending and does not falsely report successful analysis", async () => {
    const db = { query: async (sql: string) => {
      if (sql.includes("news_budget_reserve")) return { rows: [{ accepted: true }] }
      throw new Error("DB disconnected with private details")
    } }
    const result = await createNewsLLM({ env, db, fetch: async () => reply() })
      .analyze([{ role: "user", content: "Berita" }], valid)
    expect(result.status).toBe("pending")
    expect(result.llm_used).toBe(false)
    expect(result.model).toBeNull()
    expect(result.reason).not.toContain("private")
  })
})
