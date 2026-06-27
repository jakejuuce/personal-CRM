// Intro-draft (E1) — turn a chosen match into a sendable double-opt-in intro.
//
// Double-opt-in (eng-review locked): the FOUNDER-ask goes first. The forwardable VC blurb is
// only surfaced after the founder agrees (the matches row advances to intro_sent on a manual
// confirm in the UI). If the founder declines, the row goes to founder_declined and drops out.
// Nothing is ever auto-sent.

import { callLLMJson } from "./llm";
import type { FounderForMatch, VcForMatch } from "./types";
import { z } from "zod";

const DraftSchema = z.object({
  founder_ask: z.string(), // the message TO the founder asking if they want the intro
  vc_blurb: z.string(), // the forwardable description of the founder FOR the VC (revealed after opt-in)
});

export interface IntroDraft {
  founderAsk: string;
  vcBlurb: string;
}

export async function draftIntro(
  founder: FounderForMatch,
  vc: VcForMatch,
): Promise<IntroDraft> {
  const payload = {
    founder: {
      name: founder.person.name,
      company: founder.person.company,
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
    vc: {
      firm: vc.person.company,
      name: vc.person.name,
      thesis: vc.intent?.thesis_text ?? null,
    },
  };

  const system =
    "Draft a double-opt-in intro between a founder (raising) and a VC. Produce two messages: " +
    "(1) founder_ask: a short, warm message TO the founder asking if they'd like an intro to this " +
    "VC and why it's a fit; (2) vc_blurb: a tight, forwardable paragraph describing the founder and " +
    "their raise FOR the VC. Be specific, no hype, no em dashes. Return strict JSON " +
    "{\"founder_ask\": \"...\", \"vc_blurb\": \"...\"}.";

  const result = await callLLMJson({
    purpose: "draft",
    system,
    user: JSON.stringify(payload),
    schema: DraftSchema,
  });

  return { founderAsk: result.founder_ask, vcBlurb: result.vc_blurb };
}
