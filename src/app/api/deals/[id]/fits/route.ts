// POST /api/deals/[id]/fits  → who in your network is a fit for this deal?
// Reuses the matcher: the deal is treated like a founder raising, matched against your VCs.
import { NextResponse } from "next/server";
import { getDeal, loadAllVcs } from "@/lib/data";
import { findFitsForDeal } from "@/lib/deals";
import { LLMError } from "@/lib/llm";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const deal = await getDeal(id);
    if (!deal) return NextResponse.json({ error: "deal not found" }, { status: 404 });

    const vcs = await loadAllVcs();
    const fits = await findFitsForDeal(deal, vcs);
    return NextResponse.json({
      fits: fits.filter((f) => !f.near_miss),
      nearMiss: fits.filter((f) => f.near_miss),
    });
  } catch (err) {
    if (err instanceof LLMError) {
      return NextResponse.json({ error: "fit-ranking model errored — this is not 'no fits'" }, { status: 502 });
    }
    console.error(JSON.stringify({ at: "api/deals/fits", error: String(err) }));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
