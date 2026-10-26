/**
 * highlight.ts — modul highlight keyword PKPN & Makropembangunan (service analisis).
 *
 * Data keyword: `shared/keywords.ts` ; inti mesin: `shared/highlight-core.ts`.
 */

import { createHighlight, type KeywordEntry } from "../../../../../shared/highlight-core";
import { BASE_KEYWORDS } from "../../../../../shared/keywords";

export type {
  ClusterResult,
  KeywordEntry,
  MatchResult,
  Matcher,
} from "../../../../../shared/highlight-core";

const KEYWORDS: KeywordEntry[] = BASE_KEYWORDS;

const core = createHighlight(KEYWORDS);

export const detectClusters = core.detectClusters;
export const relevanceFloor = core.relevanceFloor;
export const applyFloor = core.applyFloor;
export const validateLLMKeywords = core.validateLLMKeywords;
