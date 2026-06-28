// Match view (server component): load the founder list, hand off to the client explorer.
import { loadFounders } from "@/lib/data";
import { MatchExplorer } from "./match-explorer";
import { Nav } from "./nav";

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
      <Nav />
      <h1>Who should I connect them with?</h1>
      <p className="sub">Pick a founder; see the VCs to introduce them to, ranked by fit.</p>
      {error ? (
        <p style={{ color: "var(--danger)" }}>{error}. Run the migration + seed, and set Supabase env vars.</p>
      ) : (
        <MatchExplorer founders={founders} />
      )}
    </main>
  );
}
