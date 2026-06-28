"use client";
import { useState, useEffect } from "react";
import type { MatchCandidate } from "@/lib/types";
import { Suggestions } from "../suggestions";

export interface DealRow {
  id: string;
  name: string;
  kind: string;
  website: string | null;
  description: string | null;
  stages: string[];
  verticals: string[];
  deckFilename: string | null;
}

const input = { padding: 8, border: "1px solid #ccc", borderRadius: 6, fontSize: 14, width: "100%" } as const;
const btn = { padding: "8px 14px", borderRadius: 6, cursor: "pointer", border: "1px solid #ccc", background: "#fff" } as const;

export function DealsView({ initial }: { initial: DealRow[] }) {
  const [deals, setDeals] = useState(initial);
  const [adding, setAdding] = useState(initial.length === 0);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  return (
    <div>
      <button onClick={() => setAdding((v) => !v)} className="btn" style={{ margin: "12px 0" }}>
        {adding ? "Close" : "+ New deal"}
      </button>
      {adding && (
        <AddDeal onAdded={(d) => { setDeals((p) => [d, ...p]); setJustAdded(d.id); setAdding(false); }} />
      )}
      {deals.length === 0 && !adding && <p className="muted">No deals yet.</p>}
      {deals.map((d) => <DealCard key={d.id} deal={d} autoRun={d.id === justAdded} />)}
    </div>
  );
}

function AddDeal({ onAdded }: { onAdded: (d: DealRow) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("referral");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [deck, setDeck] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.set("name", name); fd.set("kind", kind);
    if (website) fd.set("website", website);
    if (description) fd.set("description", description);
    if (deck) fd.set("deck_text", deck);
    if (file) fd.set("deck", file);
    const res = await fetch("/api/deals", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "failed"); return; }
    onAdded({
      id: data.id, name, kind, website: website || null, description: description || null,
      stages: data.stages ?? [], verticals: data.verticals ?? [], deckFilename: data.deckFilename ?? null,
    });
  }

  return (
    <form onSubmit={submit} className="card" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input required placeholder="Deal / company name" value={name} onChange={(e) => setName(e.target.value)} className="input" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="input" style={{ width: 150 }}>
          <option value="referral">Referral</option><option value="affiliate">Affiliate</option><option value="other">Other</option>
        </select>
      </div>
      <input placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} className="input" />
      <textarea placeholder="Description / blurb (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input" />

      <label className="deck-drop">
        <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
        <span className="muted">{file ? `📎 ${file.name}` : "Upload a pitch deck (PDF or image) — read by vision"}</span>
      </label>

      <details>
        <summary className="muted" style={{ fontSize: 13, cursor: "pointer" }}>or paste deck text instead</summary>
        <textarea placeholder="Deck text" value={deck} onChange={(e) => setDeck(e.target.value)} rows={4} className="input" style={{ marginTop: 6 }} />
      </details>

      <button type="submit" disabled={busy} className="btn btn-primary" style={{ justifyContent: "center" }}>
        {busy ? (file ? "Reading deck…" : "Analyzing…") : "Save deal & find fits"}
      </button>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
    </form>
  );
}

function DealCard({ deal, autoRun }: { deal: DealRow; autoRun?: boolean }) {
  const [fits, setFits] = useState<MatchCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  async function findFits() {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/deals/${deal.id}/fits`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "error"); return; }
    // confident fits first, then near-misses — one ranked list
    setFits([...(data.fits ?? []), ...(data.nearMiss ?? [])]);
    setRan(true);
  }

  // Auto-suggest fits the moment a deal is uploaded.
  useEffect(() => { if (autoRun && !ran) findFits(); /* eslint-disable-next-line */ }, [autoRun]);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>{deal.name}</strong>
        <span className="chip">{deal.kind}</span>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 13, marginTop: 2 }}>
        {deal.website && <a href={deal.website} target="_blank" rel="noreferrer">{deal.website}</a>}
        {deal.deckFilename && <a href={`/api/deals/${deal.id}/deck`} target="_blank" rel="noreferrer">📎 {deal.deckFilename}</a>}
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "6px 0" }}>
        {deal.verticals.length ? `verticals: ${deal.verticals.join(", ")}` : "no verticals extracted"}
        {deal.stages.length ? ` · stages: ${deal.stages.join(", ")}` : ""}
      </p>
      {!ran && (
        <button onClick={findFits} disabled={busy} className="btn btn-sm">{busy ? "Finding fits…" : "Who's a fit?"}</button>
      )}
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      {(busy || fits) && (
        <Suggestions title="Who's a fit" loading={busy} candidates={fits} emptyHint="No VC fits found for this deal." />
      )}
    </div>
  );
}
