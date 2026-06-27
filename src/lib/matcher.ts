// Matcher — the single shared module (web pull, deck-paste, and later the E2 cron all call this).
//
// v1 semantics (eng-review locked, F5 + outside-voice):
//   1. Hard filter (PURE, deterministic, unit-tested below in test/matcher.test.ts):
//        - founder must have a fresh raise (kind=raising, as_of within 90d, or no date)
//        - vertical: founder.vertical ∈ vc.verticals  AND  founder.vertical ∉ vc.exclusions
//        - wildcard VC bypasses the vertical IN-check, but exclusions STILL apply
//        - stage: founder.stage ∩ vc.stage non-empty
//        - amount: ranges overlap (NULL on either side = no amount constraint)
//        - NULL on a VC CORE field (stage/vertical, and not wildcard) = "unknown" → never a
//          confident match (it does NOT match-everything — that was the noise bug)
//   2. caliber is a re-rank WEIGHT, not a gate (NULL = neutral). No founder is filtered on quality.
//   3. cap 20 candidates → LLM re-rank for fit + one-line why (impure; see rankCandidates).
//   4. empty confident set → near-miss (vertical aligns, stage relaxed), shown separately.

import type {
  FounderForMatch,
  VcForMatch,
  MatchCandidate,
  CanonicalStage,
  CanonicalVertical,
} from "./types";

export const RAISE_DECAY_DAYS = 90;
const MAX_CANDIDATES = 20;

// ----------------------------------------------------------------------------
// Pure helpers (deterministic — these are what the unit tests pin)
// ----------------------------------------------------------------------------

export function isRaiseStale(
  asOf: string | null,
  now: Date,
  windowDays = RAISE_DECAY_DAYS,
): boolean {
  if (!asOf) return false; // no date = unknown freshness, not stale
  const then = new Date(asOf).getTime();
  if (Number.isNaN(then)) return false;
  const ageDays = (now.getTime() - then) / 86_400_000;
  return ageDays > windowDays;
}

/** Ranges overlap. NULL on either side means "no constraint" → always overlaps. */
export function amountOverlaps(
  fLow: number | null,
  fHigh: number | null,
  vLow: number | null,
  vHigh: number | null,
): boolean {
  if (fLow == null && fHigh == null) return true;
  if (vLow == null && vHigh == null) return true;
  const a0 = fLow ?? -Infinity;
  const a1 = fHigh ?? Infinity;
  const b0 = vLow ?? -Infinity;
  const b1 = vHigh ?? Infinity;
  return a0 <= b1 && b0 <= a1;
}

function arraysIntersect<T>(a: T[], b: T[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

export interface FilterHit {
  vc: VcForMatch;
  via_wildcard: boolean;
  near_miss: boolean;
}

export interface FilterOutcome {
  hits: FilterHit[];
  /** Why zero hits, when applicable (e.g. founder not raising, raise stale). */
  reason: string | null;
}

/**
 * Pure hard-filter. Returns confident hits first, then near-misses (stage relaxed).
 * Excluded VCs ("No AI" vs an AI founder) are dropped entirely — never near-missed.
 */
export function filterVcsForFounder(
  founder: FounderForMatch,
  vcs: VcForMatch[],
  now: Date = new Date(),
): FilterOutcome {
  const fi = founder.intent;
  if (!fi || fi.kind !== "raising") {
    return { hits: [], reason: "founder has no active raise on file" };
  }
  if (isRaiseStale(fi.as_of, now)) {
    return { hits: [], reason: `raise is stale (>${RAISE_DECAY_DAYS}d) — re-confirm before matching` };
  }

  const fVerticals: CanonicalVertical[] = fi.verticals ?? [];
  const fStages: CanonicalStage[] = fi.stages ?? [];
  const founderStageKnown = fStages.length > 0;

  const confident: FilterHit[] = [];
  const nearMiss: FilterHit[] = [];

  for (const vc of vcs) {
    const vi = vc.intent;
    if (!vi || vi.kind !== "investing") continue;

    // Hard exclusion: a "No AI" VC vs an AI founder is dropped, even from near-miss.
    if (fVerticals.some((v) => vi.exclusions.includes(v))) continue;

    const vcVerticalKnown = vi.wildcard || vi.verticals.length > 0;
    const vertMatch = vi.wildcard || arraysIntersect(fVerticals, vi.verticals);
    const viaWildcard = vi.wildcard && !arraysIntersect(fVerticals, vi.verticals);

    if (!amountOverlaps(fi.amount_low, fi.amount_high, vi.amount_low, vi.amount_high)) {
      continue; // amount is a hard constraint when both sides are known
    }

    const vcStageKnown = vi.stages.length > 0;
    const stageMatch = arraysIntersect(fStages, vi.stages);

    if (!vertMatch || !vcVerticalKnown) {
      // vertical doesn't align (or VC vertical is unknown) → not even a near-miss
      continue;
    }

    if (stageMatch && vcStageKnown && founderStageKnown) {
      confident.push({ vc, via_wildcard: viaWildcard, near_miss: false });
    } else {
      // vertical aligns but stage mismatches or is unknown → near-miss (stage relaxed)
      nearMiss.push({ vc, via_wildcard: viaWildcard, near_miss: true });
    }
  }

  return { hits: [...confident, ...nearMiss], reason: confident.length || nearMiss.length ? null : "no vertical-aligned VCs" };
}

// ----------------------------------------------------------------------------
// Impure: LLM re-rank (fit + why). Caliber enters here as a weight.
// ----------------------------------------------------------------------------

import { callLLMJson } from "./llm";
import { z } from "zod";

// Tolerate either {ranked:[...]} or a bare [...] (models sometimes return the array directly).
const RerankSchema = z.preprocess(
  (v) => (Array.isArray(v) ? { ranked: v } : v),
  z.object({
    ranked: z.array(
      z.object({
        vc_id: z.string(),
        score: z.number().min(0).max(100),
        why: z.string(),
      }),
    ),
  }),
);

/**
 * Re-rank filtered candidates by fit, emitting a one-line "why" each.
 * Caliber is fed in as a weight (NULL → neutral); the LLM is told to judge FIT,
 * since the quality gate is intentionally soft in v1.
 */
export async function rankCandidates(
  founder: FounderForMatch,
  hits: FilterHit[],
): Promise<MatchCandidate[]> {
  if (hits.length === 0) return [];
  const capped = hits.slice(0, MAX_CANDIDATES);

  const payload = {
    founder: {
      name: founder.person.name,
      caliber: founder.person.caliber, // null = neutral
      raising: founder.intent
        ? {
            stages: founder.intent.stages,
            verticals: founder.intent.verticals,
            amount_low: founder.intent.amount_low,
            amount_high: founder.intent.amount_high,
          }
        : null,
      notes: founder.person.notes,
    },
    vcs: capped.map((h) => ({
      vc_id: h.vc.person.id,
      firm: h.vc.person.company,
      name: h.vc.person.name,
      thesis: h.vc.intent?.thesis_text ?? null,
      via_wildcard: h.via_wildcard,
      near_miss: h.near_miss,
    })),
  };

  const system =
    "You rank VCs for a founder who is raising. The hard constraints (stage, vertical, " +
    "exclusions, amount) already passed — judge FIT and write one concrete sentence on why " +
    "each VC is a good intro. Weight the founder's caliber (1-5; null = unknown, treat as " +
    "neutral) toward higher scores, but never invent quality you weren't given. Score 0-100. " +
    'Return strict JSON of exactly this shape: {"ranked":[{"vc_id":"<id>","score":<0-100>,"why":"<one sentence>"}]}.';

  const result = await callLLMJson<{ ranked: { vc_id: string; score: number; why: string }[] }>({
    purpose: "match",
    system,
    user: JSON.stringify(payload),
    schema: RerankSchema,
  });

  const byId = new Map(capped.map((h) => [h.vc.person.id, h]));
  return result.ranked
    .map((r) => {
      const hit = byId.get(r.vc_id);
      if (!hit) return null;
      return {
        founder_id: founder.person.id,
        vc_id: r.vc_id,
        founder_name: founder.person.name,
        vc_name: hit.vc.person.name,
        vc_firm: hit.vc.person.company,
        score: r.score,
        why: r.why,
        via_wildcard: hit.via_wildcard,
        near_miss: hit.near_miss,
      } satisfies MatchCandidate;
    })
    .filter((x): x is MatchCandidate => x !== null)
    .sort((a, b) => b.score - a.score);
}
