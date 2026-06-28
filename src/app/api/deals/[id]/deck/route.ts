// GET /api/deals/[id]/deck → redirect to a short-lived signed URL for the stored deck.
import { NextResponse } from "next/server";
import { getDeal, signedDeckUrl } from "@/lib/data";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal?.deck_url) return NextResponse.json({ error: "no deck" }, { status: 404 });
  const url = await signedDeckUrl(deal.deck_url);
  if (!url) return NextResponse.json({ error: "could not sign deck url" }, { status: 500 });
  return NextResponse.redirect(url);
}
