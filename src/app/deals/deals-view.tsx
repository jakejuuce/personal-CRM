"use client";
import { useState } from "react";
import type { MatchCandidate } from "@/lib/types";

export interface DealRow {
  id: string;
  name: string;
  kind: string;
  website: string | null;
  description: string | null;
  stages: string[];
  verticals: string[];
}

const input = { padding: 8, border: "1px solid #ccc", borderRadius: 6, fontSize: 14, width: "100%" } as const;
const btn = { padding: "8px 14px", borderRadius: 6, cursor: "pointer", border: "1px solid #ccc", background: "#fff" } as const;

export function DealsView({ initial }: { initial: DealRow[] }) {
  const [deals, setDeals] = useState(initial);
  const [adding, setAdding] = useState(initial.length === 0);

  return (
    <div>
      <button onClick={() => setAdding((v) => !v)} style={{ ...btn, margin: "12px 0" }}>
        {adding ? "Close" : "+ New deal"}
      </button>
      {adding && <AddDeal onAdded={(d) => { setDeals((p) => [d, ...p]); setAdding(false); }} />}
      {deals.length === 0 && !adding && <p style={{ color: "#666" }}>No deals yet.</p>}
      {deals.map((d) => <DealCard key={d.id} deal={d} />)}
    </div>
  );
}

function AddDeal({ onAdded }: { onAdded: (d: DealRow) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("referral");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [deck, setDeck] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, kind, website: website || null, description: description || null, deck_text: deck || null }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "failed"); return; }
    onAdded({ id: data.id, name, kind, website: website || null, description: description || null, stages: data.stages ?? [], verticals: data.verticals ?? [] });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8, background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #e3e3e3", marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input required placeholder="Deal / company name" value={name} onChange={(e) => setName(e.target.value)} style={input} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...input, width: 150 }}>
          <option value="referral">Referral</option><option value="affiliate">Affiliate</option><option value="other">Other</option>
        </select>
      </div>
      <input placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} style={input} />
      <textarea placeholder="Description / blurb" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={input} />
      <textarea placeholder="Deck text (paste the pitch deck content)" value={deck} onChange={(e) => setDeck(e.target.value)} rows={4} style={input} />
      <button type="submit" disabled={busy} style={btn}>{busy ? "Analyzing…" : "Save deal (extracts stage + vertical)"}</button>
      {err && <p style={{ color: "#b00" }}>{err}</p>}
    </form>
  );
}

function DealCard({ deal }: { deal: DealRow }) {
  const [fits, setFits] = useState<MatchCandidate[] | null>(null);
  const [nearMiss, setNearMiss] = useState<MatchCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function findFits() {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/deals/${deal.id}/fits`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "error"); return; }
    setFits(data.fits ?? []);
    setNearMiss(data.nearMiss ?? []);
  }

  return (
    <div style={{ border: "1px solid #e3e3e3", borderRadius: 8, padding: 16, marginBottom: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>{deal.name}</strong>
        <span style={{ fontSize: 12, color: "#888" }}>{deal.kind}</span>
      </div>
      {deal.website && <a href={deal.website} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{deal.website}</a>}
      <p style={{ fontSize: 13, color: "#555", margin: "6px 0" }}>
        {deal.verticals.length ? `verticals: ${deal.verticals.join(", ")}` : "no verticals extracted"}
        {deal.stages.length ? ` · stages: ${deal.stages.join(", ")}` : ""}
      </p>
      <button onClick={findFits} disabled={busy} style={btn}>{busy ? "Finding fits…" : "Who's a fit?"}</button>
      {err && <p style={{ color: "#b00" }}>{err}</p>}

      {fits && (
        <div style={{ marginTop: 10 }}>
          {fits.length === 0 && nearMiss.length === 0 && <p style={{ color: "#666" }}>No VC fits found.</p>}
          {fits.map((f) => (
            <div key={f.vc_id} style={{ borderTop: "1px solid #f0f0f0", padding: "8px 0" }}>
              <strong>{f.vc_name}</strong>{f.vc_firm ? ` · ${f.vc_firm}` : ""} <span style={{ color: "#888" }}>[{f.score}]</span>
              <div style={{ fontSize: 13, color: "#444" }}>{f.why}</div>
            </div>
          ))}
          {nearMiss.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ color: "#888", fontSize: 13, cursor: "pointer" }}>{nearMiss.length} near-miss(es)</summary>
              {nearMiss.map((f) => (
                <div key={f.vc_id} style={{ fontSize: 13, color: "#666", padding: "4px 0" }}>
                  {f.vc_name}{f.vc_firm ? ` · ${f.vc_firm}` : ""} [{f.score}] — {f.why}
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
