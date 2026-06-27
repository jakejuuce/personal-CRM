import { describe, it, expect } from "vitest";
import {
  filterVcsForFounder,
  isRaiseStale,
  amountOverlaps,
  RAISE_DECAY_DAYS,
} from "@/lib/matcher";
import type { FounderForMatch, VcForMatch, Person, Intent, CanonicalStage } from "@/lib/types";

const st = (s: string[]) => s as CanonicalStage[];

// --- fixture builders --------------------------------------------------------
function person(id: string, type: Person["type"], over: Partial<Person> = {}): Person {
  return { id, type, name: id, company: null, caliber: null, links: null, notes: null, created_at: "", ...over };
}
function founder(verticals: string[], stages: string[], over: Partial<Intent> = {}): FounderForMatch {
  return {
    person: person("f", "founder"),
    intent: {
      id: "fi", person_id: "f", kind: "raising", stages: st(stages), verticals, exclusions: [], wildcard: false,
      amount_low: null, amount_high: null, thesis_text: null, as_of: null, created_at: "", ...over,
    },
  };
}
function vc(id: string, verticals: string[], stages: string[], over: Partial<Intent> = {}): VcForMatch {
  return {
    person: person(id, "vc", { name: id }),
    intent: {
      id: id + "i", person_id: id, kind: "investing", stages: st(stages), verticals, exclusions: [], wildcard: false,
      amount_low: null, amount_high: null, thesis_text: null, as_of: null, created_at: "", ...over,
    },
  };
}

describe("isRaiseStale", () => {
  const now = new Date("2026-06-27");
  it("null as_of is never stale (unknown freshness)", () => {
    expect(isRaiseStale(null, now)).toBe(false);
  });
  it("inside the window is fresh", () => {
    expect(isRaiseStale("2026-05-01", now)).toBe(false);
  });
  it("older than the window is stale", () => {
    const old = new Date(now.getTime() - (RAISE_DECAY_DAYS + 5) * 86400000).toISOString().slice(0, 10);
    expect(isRaiseStale(old, now)).toBe(true);
  });
});

describe("amountOverlaps", () => {
  it("null on either side = no constraint, passes", () => {
    expect(amountOverlaps(null, null, 500, 1000)).toBe(true);
    expect(amountOverlaps(1000, 2000, null, null)).toBe(true);
  });
  it("overlapping ranges pass", () => {
    expect(amountOverlaps(500, 1500, 1000, 2000)).toBe(true);
  });
  it("disjoint ranges fail", () => {
    expect(amountOverlaps(100, 200, 1000, 2000)).toBe(false);
  });
});

describe("filterVcsForFounder — F5 semantics", () => {
  it("matches on vertical + stage (confident)", () => {
    const out = filterVcsForFounder(founder(["ai"], ["seed"]), [vc("v", ["ai"], ["seed"])]);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].near_miss).toBe(false);
    expect(out.hits[0].via_wildcard).toBe(false);
  });

  it("EXCLUDES an AI founder from a 'No AI' VC (hard drop, not near-miss)", () => {
    const noAiVc = vc("v", ["fintech"], ["seed"], { exclusions: ["ai"] });
    const out = filterVcsForFounder(founder(["ai"], ["seed"]), [noAiVc]);
    expect(out.hits).toHaveLength(0);
  });

  it("wildcard VC bypasses the vertical IN-check, flagged via_wildcard", () => {
    const generalist = vc("v", [], ["seed"], { wildcard: true });
    const out = filterVcsForFounder(founder(["ai"], ["seed"]), [generalist]);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].via_wildcard).toBe(true);
  });

  it("wildcard VC STILL respects exclusions", () => {
    const generalistNoAi = vc("v", [], ["seed"], { wildcard: true, exclusions: ["ai"] });
    const out = filterVcsForFounder(founder(["ai"], ["seed"]), [generalistNoAi]);
    expect(out.hits).toHaveLength(0);
  });

  it("NULL vc vertical (not wildcard) does NOT match-everything", () => {
    const unknownVc = vc("v", [], ["seed"]); // no verticals, not wildcard
    const out = filterVcsForFounder(founder(["ai"], ["seed"]), [unknownVc]);
    expect(out.hits).toHaveLength(0); // unknown != match-all
  });

  it("vertical aligns but stage mismatches → near-miss", () => {
    const out = filterVcsForFounder(founder(["ai"], ["series-a"]), [vc("v", ["ai"], ["seed"])]);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].near_miss).toBe(true);
  });

  it("NULL vc stage → near-miss (not confident)", () => {
    const out = filterVcsForFounder(founder(["ai"], ["seed"]), [vc("v", ["ai"], [])]);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].near_miss).toBe(true);
  });

  it("stale raise → no hits with a reason", () => {
    const out = filterVcsForFounder(
      founder(["ai"], ["seed"], { as_of: "2025-01-01" }),
      [vc("v", ["ai"], ["seed"])],
      new Date("2026-06-27"),
    );
    expect(out.hits).toHaveLength(0);
    expect(out.reason).toMatch(/stale/);
  });

  it("founder not raising → no hits", () => {
    const f = founder(["ai"], ["seed"]);
    f.intent = null;
    const out = filterVcsForFounder(f, [vc("v", ["ai"], ["seed"])]);
    expect(out.hits).toHaveLength(0);
    expect(out.reason).toMatch(/no active raise/);
  });

  it("multi-tag founder matches a VC sharing any one tag", () => {
    const out = filterVcsForFounder(founder(["ai", "b2b-saas"], ["seed"]), [vc("v", ["b2b-saas"], ["seed"])]);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].near_miss).toBe(false);
  });
});
