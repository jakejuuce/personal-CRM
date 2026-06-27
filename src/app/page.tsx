// Match view (server component): load the founder list, hand off to the client explorer.
import { loadFounders } from "@/lib/data";
import { MatchExplorer } from "./match-explorer";

export const dynamic = "force-dynamic";

export default async function Home() {
  let founders: { id: string; name: string; company: string | null }[] = [];
  let error: string | null = null;
  try {
    founders = (await loadFounders()).map((f) => ({
      id: f.id,
      name: f.name,
      company: f.company,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : "could not load founders";
  }

  return (
    <main>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Who should I connect them with?</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Pick a founder. The matcher finds VCs whose stage + vertical fit, honoring exclusions.
      </p>
      {error ? (
        <p style={{ color: "#b00" }}>
          {error}. Run the migration + seed, and set Supabase env vars.
        </p>
      ) : (
        <MatchExplorer founders={founders} />
      )}
    </main>
  );
}
