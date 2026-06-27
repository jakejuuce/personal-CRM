// Canonical vocabulary — derived from real seed data (crm-seed/canonical-taxonomy.json).
// The synonym map is the deterministic fast-path; anything not here goes to the LLM once,
// then gets cached back (see normalize.ts) so each distinct phrase is LLM-mapped at most once.

import type { CanonicalStage } from "./types";

export const CANONICAL_VERTICALS = [
  "ai",
  "b2b-saas",
  "consumer",
  "fintech",
  "healthtech",
  "crypto",
  "adtech",
  "commerce",
  "edtech",
  "supplychain",
  "sports",
  "deeptech",
  "communications",
] as const;

export const CANONICAL_STAGES: CanonicalStage[] = [
  "pre-seed",
  "seed",
  "series-a",
  "series-b",
  "series-c",
  "series-d+",
  "growth",
  "bootstrapped",
];

/**
 * Seed synonyms: lowercased raw phrase → canonical tag set.
 * Seeded with the variants observed in the real export so the common cases skip the LLM.
 * The tag-writer extends this table at runtime (cache-back).
 */
export const SEED_VERTICAL_SYNONYMS: Record<string, string[]> = {
  "ai": ["ai"],
  "vertical ai": ["ai"],
  "b2b saas": ["b2b-saas"],
  "b2b saas ai": ["ai", "b2b-saas"],
  "b2b ai saas": ["ai", "b2b-saas"],
  "b2c saas": ["consumer"],
  "consumer": ["consumer"],
  "fintech": ["fintech"],
  "payments": ["fintech"],
  "healthcare": ["healthtech"],
  "healthtech": ["healthtech"],
  "biotech": ["healthtech"],
  "crypto": ["crypto"],
  "adtech": ["adtech"],
  "commerce": ["commerce"],
  "edtech": ["edtech"],
  "sports": ["sports"],
};

export const SEED_STAGE_SYNONYMS: Record<string, CanonicalStage[]> = {
  "pre-seed": ["pre-seed"],
  "preseed": ["pre-seed"],
  "seed": ["seed"],
  "series a": ["series-a"],
  "series b": ["series-b"],
  "series c": ["series-c"],
  "series b/c": ["series-b", "series-c"],
  "growth": ["growth"],
  "bootstrapped": ["bootstrapped"],
};
