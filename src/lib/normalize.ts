// Vocab normalization (tag-writer, T2) — eng-review locked design:
//   1. synonym fast-path (PURE, deterministic, unit-tested) — known phrases skip the LLM
//   2. LLM-in-loop fallback — maps a novel/typo phrase to canonical tags, or flags it new
//   3. cache-back — on confirm, the resolved mapping is written into the synonym table so the
//      same phrase is never LLM-normalized twice (THIS is what makes the SQL filter deterministic)
//
// The confirm-loop must echo the CANONICAL result (not the user's raw text) so a
// misclassification is catchable (a silent false-negative is the worst failure here).

import { callLLMJson } from "./llm";
import { CANONICAL_VERTICALS } from "./taxonomy";
import { z } from "zod";

export interface NormalizeResult {
  /** canonical tags (a SET — "B2B AI SaaS" → ["ai","b2b-saas"]) */
  tags: string[];
  /** the raw input, lowercased + trimmed (the cache-back key) */
  key: string;
  /** true when the LLM proposed a tag not in the canonical list (needs a "new vertical?" confirm) */
  proposedNew: string[];
  /** "synonym" = deterministic hit, "llm" = model fallback */
  via: "synonym" | "llm";
}

export function normKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** PURE fast-path. Returns canonical tags if the phrase is known, else null (→ LLM). */
export function synonymLookup(
  raw: string,
  synonyms: Record<string, string[]>,
): string[] | null {
  const key = normKey(raw);
  if (key in synonyms) return synonyms[key];
  return null;
}

const LlmNormalizeSchema = z.object({
  tags: z.array(z.string()),
});

/**
 * Normalize one free-text vertical phrase to canonical tags.
 * `synonyms` is the current (DB-backed) fast-path table; on a miss we call the LLM.
 * Returns the result; the CALLER persists it via cache-back on confirm.
 */
export async function normalizeVertical(
  raw: string,
  synonyms: Record<string, string[]>,
): Promise<NormalizeResult> {
  const key = normKey(raw);
  const hit = synonymLookup(raw, synonyms);
  if (hit) {
    return { tags: hit, key, proposedNew: [], via: "synonym" };
  }

  const system =
    "Map a free-text startup/VC sector phrase to a SET of canonical tags from this list: " +
    CANONICAL_VERTICALS.join(", ") +
    ". A phrase can map to multiple tags (e.g. 'B2B AI SaaS' -> ['ai','b2b-saas']). " +
    "Fix obvious typos ('Healttech' -> 'healthtech'). If a concept genuinely has no fitting " +
    "canonical tag, return it as a new kebab-case tag. Return strict JSON: {\"tags\": [...]}.";

  const result = await callLLMJson({
    purpose: "normalize",
    system,
    user: raw,
    schema: LlmNormalizeSchema,
  });

  const canonical = new Set<string>(CANONICAL_VERTICALS);
  const tags = result.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const proposedNew = tags.filter((t) => !canonical.has(t));

  return { tags, key, proposedNew, via: "llm" };
}
