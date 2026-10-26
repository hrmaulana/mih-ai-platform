/**
 * highlight.ts — modul highlight keyword PKPN & Makropembangunan (service crawler).
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

export { CLUSTERS, CLUSTER_ICONS } from "../../../../../shared/keywords";

const KEYWORDS: KeywordEntry[] = BASE_KEYWORDS;

const core = createHighlight(KEYWORDS);

export const detectClusters = core.detectClusters;
export const relevanceFloor = core.relevanceFloor;
