"use client";
import { useState } from "react";
import type { MatchCandidate } from "@/lib/types";

interface Founder {
  id: string;
  name: string;
  company: string | null;
}

export function MatchExplorer({ founders }: { founders: Founder[] }) {
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [nearMiss, setNearMiss] = useState<MatchCandidate[]>([]);
  const [reason, setReason] = useState<string | null>(null);

  async function run(founderId: string) {
    setSelected(founderId);
    setLoading(true);
    setError(null);
    setMatches([]);
    setNearMiss([]);
    setReason(null);
    try {
      const res = await fetch(`/api/matches?founderId=${founderId}`);
      const data = await res.json();
      if (!res.ok) {
        // F1: an errored matcher is shown as an error, never as "no matches".
        setError(data.error ?? "matcher error");
        return;
      }
      setMatches(data.matches ?? []);
      setNearMiss(data.nearMiss ?? []);
      setReason(data.reason ?? null);
    } catch {
      setError("network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <select
        value={selected}
        onChange={(e) => run(e.target.value)}
        style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc", width: "100%", maxWidth: 420 }}
      >
        <option value="">Select a founder…</option>
        {founders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
            {f.company ? ` — ${f.company}` : ""}
          </option>
        ))}
      </select>

      {loading && <p>Matching…</p>}
      {error && (
        <p style={{ color: "#b00", marginTop: 16 }}>
          {error}
        </p>
      )}

      {!loading && selected && !error && matches.length === 0 && (
        <p style={{ marginTop: 16, color: "#666" }}>
          No live intent-match{reason ? ` — ${reason}` : ""}.
          {nearMiss.length > 0 && " See near-misses below."}
        </p>
      )}

      {matches.map((m) => (
        <MatchCard key={m.vc_id} m={m} founderId={selected} />
      ))}

      {nearMiss.length > 0 && (
        <>
          <h3 style={{ marginTop: 24, color: "#888" }}>Near-misses (stage relaxed)</h3>
          {nearMiss.map((m) => (
            <MatchCard key={m.vc_id} m={m} founderId={selected} />
          ))}
        </>
      )}
    </div>
  );
}

function MatchCard({ m, founderId }: { m: MatchCandidate; founderId: string }) {
  const [draft, setDraft] = useState<{ founderAsk: string; vcBlurb: string } | null>(null);
  const [revealBlurb, setRevealBlurb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function makeDraft() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ founderId, vcId: m.vc_id }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data.error ?? "draft error");
      else setDraft({ founderAsk: data.founderAsk, vcBlurb: data.vcBlurb });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid #e3e3e3",
        borderRadius: 8,
        padding: 14,
        marginTop: 12,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>
          {m.vc_name}
          {m.vc_firm ? ` · ${m.vc_firm}` : ""}
        </strong>
        <span style={{ color: "#888", fontSize: 13 }}>
          {m.score}
          {m.via_wildcard ? " · generalist" : ""}
        </span>
      </div>
      <p style={{ margin: "6px 0 10px", color: "#444" }}>{m.why}</p>

      {!draft && (
        <button onClick={makeDraft} disabled={busy} style={{ padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}>
          {busy ? "Drafting…" : "Draft intro"}
        </button>
      )}
      {err && <p style={{ color: "#b00" }}>{err}</p>}

      {draft && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, color: "#666" }}>Ask the founder first:</div>
          <p style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 10, borderRadius: 6 }}>
            {draft.founderAsk}
          </p>
          {!revealBlurb ? (
            <button onClick={() => setRevealBlurb(true)} style={{ padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}>
              Founder agreed → reveal VC blurb
            </button>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#666" }}>Forwardable to the VC:</div>
              <p style={{ whiteSpace: "pre-wrap", background: "#f0f7f0", padding: 10, borderRadius: 6 }}>
                {draft.vcBlurb}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
