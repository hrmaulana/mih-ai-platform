/**
 * highlight.ts — modul highlight keyword PKPN & Makropembangunan (backend).
 *
 * Data keyword + label klaster: `shared/keywords.ts`
 * Inti mesin (matcher, segment, skor): `shared/highlight-core.ts`
 * Berkas ini hanya mengikat keduanya untuk paket backend.
 */

import { createHighlight, type KeywordEntry } from "../../../shared/highlight-core";
import { BASE_KEYWORDS } from "../../../shared/keywords";

export type {
  ClusterResult,
  KeywordEntry,
  MatchResult,
  Matcher,
  SegmentResult,
} from "../../../shared/highlight-core";

export { CLUSTERS, CLUSTER_ICONS } from "../../../shared/keywords";

/** Keyword aktif backend (dari shared; tambahan paket bisa memakai defineKeyword). */
export const KEYWORDS: KeywordEntry[] = BASE_KEYWORDS;

const core = createHighlight(KEYWORDS);

export const findMatches = core.findMatches;
export const segment = core.segment;
export const detectClusters = core.detectClusters;
export const relevanceFloor = core.relevanceFloor;
export const applyFloor = core.applyFloor;
export const validateLLMKeywords = core.validateLLMKeywords;
