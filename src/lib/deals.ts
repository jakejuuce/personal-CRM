// Deals: extract attributes from a pasted description/deck, and find which contacts are a fit.
// "Find fits" reuses the matcher — a deal is treated like a founder who is raising, matched
// against your VCs (stage/vertical/exclusions/amount), then LLM-ranked for fit.

import type Anthropic from "@anthropic-ai/sdk";
import { callLLMJson } from "./llm";
import { filterVcsForFounder, rankCandidates } from "./matcher";
import type { Deal, FounderForMatch, VcForMatch, MatchCandidate } from "./types";
import { z } from "zod";

const ExtractSchema = z.object({
  stages: z.array(z.string()),
  verticals_raw: z.array(z.string()),
  amount_low: z.number().nullable(),
  amount_high: z.number().nullable(),
});
export type DealExtract = z.infer<typeof ExtractSchema>;

const EXTRACT_SYSTEM =
  "From a company/deal (description or pitch deck), extract: funding stage phrases, sector/vertical " +
  "phrases (verticals_raw, raw text - they get normalized downstream), and any raise amount " +
  "(amount_low/high in raw dollars, null if absent). Return strict JSON " +
  '{"stages":[],"verticals_raw":[],"amount_low":null,"amount_high":null}.';

/** Pull stage/vertical/amount from a deal's free text (description + deck + website blurb). */
export async function extractDealAttributes(text: string): Promise<DealExtract> {
  return callLLMJson({ purpose: "match", system: EXTRACT_SYSTEM, user: text.slice(0, 6000), schema: ExtractSchema });
}

/** Pull the same attributes straight from an uploaded deck FILE using vision (PDF or image). */
export async function extractDealFromDeck(base64: string, mediaType: string): Promise<DealExtract> {
  const fileBlock =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
  const blocks = [
    fileBlock,
    { type: "text", text: "Read this pitch deck and extract the deal attributes as instructed." },
  ] as Anthropic.ContentBlockParam[];
  return callLLMJson({ purpose: "match", system: EXTRACT_SYSTEM, user: blocks, schema: ExtractSchema });
}

/** Adapt a deal into the FounderForMatch shape the matcher expects. */
export function dealToFounder(deal: Deal): FounderForMatch {
  return {
    person: {
      id: `deal:${deal.id}`,
      type: "founder",
      name: deal.name,
      company: deal.website,
      caliber: null,
      links: deal.website,
      notes: deal.description ?? deal.deck_text ?? null,
      created_at: deal.created_at,
    },
    intent: {
      id: `deal-intent:${deal.id}`,
      person_id: `deal:${deal.id}`,
      kind: "raising",
      stages: deal.stages,
      verticals: deal.verticals,
      exclusions: [],
      wildcard: false,
      amount_low: deal.amount_low,
      amount_high: deal.amount_high,
      thesis_text: deal.description,
      as_of: null,
      created_at: deal.created_at,
    },
  };
}

export async function findFitsForDeal(deal: Deal, vcs: VcForMatch[]): Promise<MatchCandidate[]> {
  const pseudo = dealToFounder(deal);
  const { hits } = filterVcsForFounder(pseudo, vcs);
  return rankCandidates(pseudo, hits);
}
