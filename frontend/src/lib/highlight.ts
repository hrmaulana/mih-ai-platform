/**
 * highlight.ts — modul highlight keyword PKPN & Makropembangunan (frontend React).
 *
 * Data keyword + label klaster: `shared/keywords.ts`
 * Inti mesin (matcher/segment/skor): `shared/highlight-core.ts`
 *
 * Cara pakai:
 *   import { segment } from "./lib/highlight";
 *   segment(text).map((s, i) => s.match
 *     ? <mark key={i} className={`hl hl-${s.match.cat}`}>{s.text}</mark>
 *     : s.text);
 */

import { createHighlight, type KeywordEntry } from "../../../shared/highlight-core";
import { BASE_KEYWORDS } from "../../../shared/keywords";

export { CLUSTERS, CLUSTER_ICONS } from "../../../shared/keywords";

const KEYWORDS: KeywordEntry[] = BASE_KEYWORDS;

const core = createHighlight(KEYWORDS);

export const segment = core.segment;
