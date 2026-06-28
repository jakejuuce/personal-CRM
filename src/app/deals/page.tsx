import { loadDeals } from "@/lib/data";
import { Nav } from "../nav";
import { DealsView, type DealRow } from "./deals-view";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  let deals: DealRow[] = [];
  let error: string | null = null;
  try {
    deals = (await loadDeals()).map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      website: d.website,
      description: d.description,
      stages: d.stages,
      verticals: d.verticals,
      deckFilename: d.deck_filename,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : "could not load deals";
  }

  return (
    <main>
      <Nav />
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Deals</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Referrals &amp; affiliates. Upload a description, website, or deck, then see who in your network is a fit.
      </p>
      {error ? <p style={{ color: "#b00" }}>{error}</p> : <DealsView initial={deals} />}
    </main>
  );
}
