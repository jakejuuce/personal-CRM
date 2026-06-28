// GET  /api/deals  → list deals
// POST /api/deals  → add a deal (referral/affiliate). Extracts + normalizes attributes from the
//                    description/deck so it can be matched against contacts.
import { NextResponse } from "next/server";
import { loadDeals, createDeal, loadVerticalSynonyms, cacheVerticalSynonym, uploadDeck } from "@/lib/data";
import { extractDealAttributes, extractDealFromDeck, type DealExtract } from "@/lib/deals";
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

const ACCEPTED = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]);
function inferType(file: File): string {
  if (file.type && ACCEPTED.has(file.type)) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

// Accepts multipart/form-data so an optional deck file can ride along with the fields.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form data" }, { status: 400 });
  }
  const name = String(form.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const kind = (String(form.get("kind") ?? "referral")) as "referral" | "affiliate" | "other";
  const description = (form.get("description") as string) || null;
  const website = (form.get("website") as string) || null;
  const deck_text = (form.get("deck_text") as string) || null;
  const file = form.get("deck");
  const deck = file instanceof File && file.size > 0 ? file : null;

  try {
    let deck_url: string | null = null;
    let deck_filename: string | null = null;
    let ex: DealExtract | null = null;

    if (deck) {
      const mediaType = inferType(deck);
      if (!ACCEPTED.has(mediaType)) {
        return NextResponse.json({ error: "deck must be a PDF or image" }, { status: 400 });
      }
      const bytes = new Uint8Array(await deck.arrayBuffer());
      deck_url = await uploadDeck(bytes, deck.name, mediaType);
      deck_filename = deck.name;
      // vision extraction straight from the file
      ex = await extractDealFromDeck(Buffer.from(bytes).toString("base64"), mediaType);
    } else {
      const text = [description, deck_text, website].filter(Boolean).join("\n");
      if (text.trim()) ex = await extractDealAttributes(text);
    }

    let stages: string[] = [];
    let verticals: string[] = [];
    let amount_low: number | null = null;
    let amount_high: number | null = null;
    if (ex) {
      amount_low = ex.amount_low;
      amount_high = ex.amount_high;
      stages = normalizeStages(ex.stages);
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
      name, kind, description, website, deck_text, deck_url, deck_filename,
      stages: stages as CanonicalStage[], verticals, amount_low, amount_high, notes: null,
    });
    return NextResponse.json({ id, stages, verticals, deckAttached: !!deck, deckFilename: deck_filename });
  } catch (err) {
    if (err instanceof LLMError) {
      return NextResponse.json({ error: "deck extraction model errored — try again" }, { status: 502 });
    }
    console.error(JSON.stringify({ at: "api/deals POST", error: String(err) }));
    return NextResponse.json({ error: "could not create deal" }, { status: 500 });
  }
}
