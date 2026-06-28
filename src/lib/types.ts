// Domain types — mirror the Supabase schema (supabase/migrations/0001_init.sql).
//
// Data model (eng-review locked):
//   people      — founders + VCs + others; `caliber` is a re-rank WEIGHT, not a gate (NULL = neutral)
//   intent      — perishable raise/invest signal; `as_of` drives 90-day decay
//   relationship— tie_strength + last_touch (manually bumped)
//   matches     — written ONLY on "draft intro" in v1 (ephemeral compute otherwise)
//   verticals   — canonical sector vocabulary (seeded from crm-seed taxonomy)
//   pending_writes — confirm-loop buffer for the Telegram tag-writer (serverless-safe)

export type PersonType = "founder" | "vc" | "other";

/** Canonical sector tag, e.g. "ai", "fintech", "healthtech". Normalized at write-time. */
export type CanonicalVertical = string;

/** Canonical funding stage. */
export type CanonicalStage =
  | "pre-seed"
  | "seed"
  | "series-a"
  | "series-b"
  | "series-c"
  | "series-d+"
  | "growth"
  | "bootstrapped";

export interface Person {
  id: string;
  type: PersonType;
  name: string;
  company: string | null;
  /** 1-5 quality read. NULL = unknown. v1: a re-rank weight, NOT a hard filter. */
  caliber: number | null;
  links: string | null;
  notes: string | null;
  created_at: string;
}

export interface Intent {
  id: string;
  person_id: string;
  kind: "raising" | "investing";
  stages: CanonicalStage[];
  verticals: CanonicalVertical[];
  /** VC-only: sectors the VC explicitly will NOT invest in (e.g. "No AI"). */
  exclusions: CanonicalVertical[];
  /** VC-only: invests broadly / generalist — bypasses the vertical gate. */
  wildcard: boolean;
  amount_low: number | null;
  amount_high: number | null;
  thesis_text: string | null;
  /** Perishability anchor. A raise older than the decay window is excluded unless re-confirmed. */
  as_of: string | null;
  created_at: string;
}

export interface Relationship {
  person_id: string;
  /** 1-5 closeness. Distinct from caliber (which is quality). */
  tie_strength: number | null;
  last_touch: string | null;
  warm_path_note: string | null;
}

export type MatchStatus =
  | "drafted"
  | "intro_sent"
  | "founder_declined"
  | "dismissed";

export interface MatchRow {
  id: string;
  founder_id: string;
  vc_id: string;
  score: number;
  why: string;
  status: MatchStatus;
  created_at: string;
  // Nullable forward-compat columns (E2/E3 — unused in v1):
  pushed_at: string | null;
  snoozed_until: string | null;
  warm_path: string | null;
}

/** A computed (ephemeral) match candidate — not yet persisted. */
export interface MatchCandidate {
  founder_id: string;
  vc_id: string;
  founder_name: string;
  vc_name: string;
  vc_firm: string | null;
  score: number;
  why: string;
  /** true when the founder's vertical matched only because the VC is a wildcard/generalist. */
  via_wildcard: boolean;
  /** true when this is a relaxed near-miss (stage dropped), not a hard match. */
  near_miss: boolean;
  /** true when you've ALREADY introduced this founder to this VC (don't re-suggest). */
  already_introd?: boolean;
}

export interface Settings {
  id: number;
  /** v1: caliber is a weight, so caliber_min is informational only until the hard gate returns. */
  caliber_min: number;
  push_threshold: number; // E2 only
  push_muted: boolean; // E2 only
}

export interface PendingWrite {
  pending_id: string;
  chat_id: string;
  proposed_json: string;
  created_at: string;
  expires_at: string;
}

/** Joined founder view the matcher operates on. */
export interface FounderForMatch {
  person: Person;
  intent: Intent | null;
}

/** Joined VC view the matcher operates on. */
export interface VcForMatch {
  person: Person;
  intent: Intent | null;
}

/** A contact with everything attached — the row shape for the contacts directory. */
export interface ContactFull {
  person: Person;
  intent: Intent | null;
  relationship: Relationship | null;
}

export type DealKind = "referral" | "affiliate" | "other";

export interface Deal {
  id: string;
  name: string;
  kind: DealKind;
  description: string | null;
  website: string | null;
  deck_text: string | null;
  stages: CanonicalStage[];
  verticals: CanonicalVertical[];
  amount_low: number | null;
  amount_high: number | null;
  notes: string | null;
  created_at: string;
}
