// GET  /api/deals  → list deals
// POST /api/deals  → add a deal (referral/affiliate). Extracts + normalizes attributes from the
//                    description/deck so it can be matched against contacts.
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadDeals, createDeal, loadVerticalSynonyms, cacheVerticalSynonym } from "@/lib/data";
import { extractDealAttributes } from "@/lib/deals";
import { normalizeVertical, normalizeStages } from "@/lib/normalize";
import { LLMError } from "@/lib/llm";
import type { CanonicalStage } from "@/lib/types";

export async function GET() {
  try {
    return NextResponse.json({ deals: await loadDeals() });
  } catch (err) {
    console.error(JSON.stringify({ at: "api/deals GET", error: String(err) }));
    return NextResponse.json({ error: "could not load deals" }, { status: 500 });
  }
}

const Body = z.object({
  name: z.string().min(1),
  kind: z.enum(["referral", "affiliate", "other"]).default("referral"),
  description: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  deck_text: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid deal", detail: String(e) }, { status: 400 });
  }

  try {
    const text = [body.description, body.deck_text, body.website].filter(Boolean).join("\n");
    let stages: string[] = [];
    let verticals: string[] = [];
    let amount_low: number | null = null;
    let amount_high: number | null = null;

    if (text.trim()) {
      const ex = await extractDealAttributes(text);
      amount_low = ex.amount_low;
      amount_high = ex.amount_high;
      stages = normalizeStages(ex.stages);
      // normalize each raw vertical to canonical tags (synonym fast-path + LLM + cache-back)
      const synonyms = await loadVerticalSynonyms();
      const tagSet = new Set<string>();
      for (const raw of ex.verticals_raw) {
        const r = await normalizeVertical(raw, synonyms);
        r.tags.forEach((t) => tagSet.add(t));
        if (r.via === "llm") await cacheVerticalSynonym(r.key, r.tags);
      }
      verticals = [...tagSet];
    }

    const id = await createDeal({
      name: body.name,
      kind: body.kind,
      description: body.description ?? null,
      website: body.website ?? null,
      deck_text: body.deck_text ?? null,
      stages: stages as CanonicalStage[],
      verticals,
      amount_low,
      amount_high,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ id, stages, verticals });
  } catch (err) {
    if (err instanceof LLMError) {
      return NextResponse.json({ error: "deal extraction model errored — try again" }, { status: 502 });
    }
    console.error(JSON.stringify({ at: "api/deals POST", error: String(err) }));
    return NextResponse.json({ error: "could not create deal" }, { status: 500 });
  }
}
