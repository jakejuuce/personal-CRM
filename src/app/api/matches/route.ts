// GET /api/matches?founderId=...  → ranked VC matches for a founder (ephemeral; nothing persisted).
//
// F1: an LLM failure surfaces as an explicit 502 "matcher errored", NOT an empty list — the user
// must be able to tell "no matches" from "the matcher broke."

import { NextResponse } from "next/server";
import { loadFounder, loadAllVcs, loadIntroducedVcIds } from "@/lib/data";
import { filterVcsForFounder, rankCandidates } from "@/lib/matcher";
import { LLMError } from "@/lib/llm";

export async function GET(req: Request) {
  const founderId = new URL(req.url).searchParams.get("founderId");
  if (!founderId) {
    return NextResponse.json({ error: "founderId required" }, { status: 400 });
  }

  try {
    const founder = await loadFounder(founderId);
    if (!founder) {
      return NextResponse.json({ error: "founder not found" }, { status: 404 });
    }

    const vcs = await loadAllVcs();
    const { hits, reason } = filterVcsForFounder(founder, vcs);

    if (hits.length === 0) {
      return NextResponse.json({ matches: [], nearMiss: [], reason });
    }

    const ranked = await rankCandidates(founder, hits);

    // Flag VCs this founder was already introduced to (don't re-suggest as fresh).
    const introd = await loadIntroducedVcIds(founderId);
    for (const m of ranked) m.already_introd = introd.has(m.vc_id);

    return NextResponse.json({
      matches: ranked.filter((m) => !m.near_miss && !m.already_introd),
      nearMiss: ranked.filter((m) => m.near_miss && !m.already_introd),
      alreadyIntrod: ranked.filter((m) => m.already_introd),
      reason: null,
    });
  } catch (err) {
    if (err instanceof LLMError) {
      // Explicit error state — never let this read as "zero matches" (F1).
      return NextResponse.json(
        { error: "matcher errored — the ranking model failed, this is not 'no matches'" },
        { status: 502 },
      );
    }
    console.error(JSON.stringify({ at: "api/matches", error: String(err) }));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
