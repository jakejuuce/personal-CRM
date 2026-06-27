// POST /api/draft  { founderId, vcId }  → draft a double-opt-in intro and persist a matches row.
//
// This is the ONLY write path to `matches` in v1 (ephemeral-compute everywhere else). The row is
// created by an explicit user action, so status starts unambiguously at 'drafted'.

import { NextResponse } from "next/server";
import { z } from "zod";
import { loadFounder, loadAllVcs, insertDraftMatch } from "@/lib/data";
import { draftIntro } from "@/lib/intro-draft";
import { rankCandidates, filterVcsForFounder } from "@/lib/matcher";
import { LLMError } from "@/lib/llm";

const Body = z.object({ founderId: z.string(), vcId: z.string() });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "founderId and vcId required" }, { status: 400 });
  }

  try {
    const founder = await loadFounder(body.founderId);
    if (!founder) return NextResponse.json({ error: "founder not found" }, { status: 404 });

    const vcs = await loadAllVcs();
    const vc = vcs.find((v) => v.person.id === body.vcId);
    if (!vc) return NextResponse.json({ error: "vc not found" }, { status: 404 });

    // Re-score this specific pair so the persisted row carries a real score + why.
    const { hits } = filterVcsForFounder(founder, [vc]);
    const ranked = hits.length ? await rankCandidates(founder, hits) : [];
    const candidate = ranked.find((c) => c.vc_id === vc.person.id) ?? {
      founder_id: founder.person.id,
      vc_id: vc.person.id,
      founder_name: founder.person.name,
      vc_name: vc.person.name,
      vc_firm: vc.person.company,
      score: 0,
      why: "manual draft (no automatic match)",
      via_wildcard: false,
      near_miss: false,
    };

    const draft = await draftIntro(founder, vc);
    const matchId = await insertDraftMatch(candidate);

    // Double-opt-in: founder_ask goes first; vc_blurb is held until the founder agrees in the UI.
    return NextResponse.json({ matchId, founderAsk: draft.founderAsk, vcBlurb: draft.vcBlurb });
  } catch (err) {
    if (err instanceof LLMError) {
      return NextResponse.json({ error: "draft model errored — try again" }, { status: 502 });
    }
    console.error(JSON.stringify({ at: "api/draft", error: String(err) }));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
