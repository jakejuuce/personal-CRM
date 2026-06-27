import { describe, it, expect } from "vitest";
import { synonymLookup, normKey } from "@/lib/normalize";
import { SEED_VERTICAL_SYNONYMS } from "@/lib/taxonomy";

describe("normKey", () => {
  it("lowercases, trims, collapses whitespace", () => {
    expect(normKey("  B2B   SAAS AI ")).toBe("b2b saas ai");
  });
});

describe("synonymLookup — deterministic fast-path", () => {
  it("maps a known multi-tag phrase to a SET", () => {
    expect(synonymLookup("B2B SAAS AI", SEED_VERTICAL_SYNONYMS)).toEqual(["ai", "b2b-saas"]);
  });

  it("maps B2C SaaS to consumer, not b2b-saas", () => {
    expect(synonymLookup("B2C SaaS", SEED_VERTICAL_SYNONYMS)).toEqual(["consumer"]);
  });

  it("is case-insensitive", () => {
    expect(synonymLookup("fintech", SEED_VERTICAL_SYNONYMS)).toEqual(["fintech"]);
    expect(synonymLookup("FinTech", SEED_VERTICAL_SYNONYMS)).toEqual(["fintech"]);
  });

  it("returns null on an unknown phrase (→ falls through to the LLM)", () => {
    expect(synonymLookup("Healttech", SEED_VERTICAL_SYNONYMS)).toBeNull();
    expect(synonymLookup("quantum widgets", SEED_VERTICAL_SYNONYMS)).toBeNull();
  });
});
