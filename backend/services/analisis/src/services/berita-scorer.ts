/**
 * berita-scorer.ts — pembungkus service ANALISIS.
 *
 * Pipeline scoring 3-axis kini tinggal di `shared/berita-scorer-core.ts`
 * (sebelumnya salinan identik dengan backend). Berkas ini hanya mengikat
 * konfigurasi service + highlight/lexicon milik service ini.
 */

import { config } from "../config";
import { createBeritaScorer, type ScoreResult } from "../../../../../shared/berita-scorer-core";
import { detectClusters, relevanceFloor, applyFloor, validateLLMKeywords } from "../lib/highlight";
import { calculateLexiconScore } from "../lib/lexicon";

export type { ScoreResult };

const scorer = createBeritaScorer({
  apiKey: config.openrouterApiKey,
  baseUrl: config.openrouterBaseUrl,
  lexiconScore: calculateLexiconScore,
  detectClusters,
  relevanceFloor,
  applyFloor,
  validateLLMKeywords,
});

export const scoreArticle = scorer.scoreArticle;
