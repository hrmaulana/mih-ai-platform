/**
 * berita-scorer.ts — pembungkus paket BACKEND.
 *
 * Pipeline scoring 3-axis (relevansi/dampak/sentimen_teks) kini tinggal di
 * `shared/berita-scorer-core.ts` supaya tidak disalin dari service analisis.
 * Berkas ini hanya mengikat kredensial backend + highlight/lexicon backend.
 */

import { createHash } from "node:crypto";
import {
  createBeritaScorer,
  type LLMResponse,
  type ScoreResult,
} from "../../../shared/berita-scorer-core";
import { detectClusters, relevanceFloor, applyFloor, validateLLMKeywords } from "../lib/highlight";
import { calculateLexiconScore } from "../lib/lexicon";

export type { ScoreResult, LLMResponse };

/** Hitung SHA256 hash dari string */
export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const scorer = createBeritaScorer({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseUrl: "https://openrouter.ai/api/v1",
  lexiconScore: calculateLexiconScore,
  detectClusters,
  relevanceFloor,
  applyFloor,
  validateLLMKeywords,
});

export const scoreArticle = scorer.scoreArticle;
