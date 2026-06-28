"use client";
import { useMemo, useRef, useState } from "react";
import type { MatchCandidate } from "@/lib/types";

interface Founder {
  id: string;
  name: string;
  company: string | null;
}

// The score is the protagonist — saturation + weight track the value so the column ranks at a glance.
function scoreStyle(score: number): React.CSSProperties {
  if (score >= 60) return { color: "var(--accent)", fontWeight: 800 };
  if (score >= 45) return { color: "var(--ink)", fontWeight: 700 };
  if (score >= 30) return { color: "var(--muted)", fontWeight: 600 };
  return { color: "var(--faint)", fontWeight: 600 };
}

export function MatchExplorer({ founders }: { founders: Founder[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [selected, setSelected] = useState<Founder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [nearMiss, setNearMiss] = useState<MatchCandidate[]>([]);
  const [introd, setIntrod] = useState<MatchCandidate[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? founders.filter((f) => `${f.name} ${f.company ?? ""}`.toLowerCase().includes(q))
      : founders;
    return base.slice(0, 8);
  }, [query, founders]);

  async function pick(f: Founder) {
    setSelected(f);
    setQuery("");
    setOpen(false);
    setLoading(true);
    setError(null);
    setMatches([]); setNearMiss([]); setIntrod([]); setReason(null);
    try {
      const res = await fetch(`/api/matches?founderId=${f.id}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "matcher error"); return; }
      setMatches(data.matches ?? []);
      setNearMiss(data.nearMiss ?? []);
      setIntrod(data.alreadyIntrod ?? []);
      setReason(data.reason ?? null);
    } catch { setError("network error"); }
    finally { setLoading(false); }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && filtered[hi]) { e.preventDefault(); pick(filtered[hi]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="match-grid">
      <aside className="match-rail">
        <div style={{ position: "relative" }}>
          <span className="search-glyph">⌕</span>
          <input
            ref={inputRef}
            className="input search-input"
            placeholder="Search founders…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setHi(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKey}
          />
          {open && filtered.length > 0 && (
            <ul className="popover">
              {filtered.map((f, i) => (
                <li
                  key={f.id}
                  className={i === hi ? "po-item hi" : "po-item"}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(f); }}
                >
                  <span style={{ fontWeight: 540 }}>{f.name}</span>
                  {f.company && <span className="muted"> · {f.company}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected ? (
          <div className="card founder-card">
            <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>Founder</div>
            <div style={{ fontWeight: 620, fontSize: 17, marginTop: 2 }}>{selected.name}</div>
            {selected.company && <div className="muted">{selected.company}</div>}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13, marginTop: 14, lineHeight: 1.6 }}>
            {founders.length} founders. Pick one to see which VCs to introduce them to — ranked by fit, with exclusions honored and people you've already introduced kept out of the way.
          </p>
        )}
      </aside>

      <section className="match-main">
        {!selected && (
          <div className="empty-pane">
            <div className="empty-mark">→</div>
            <div className="muted">Matched VCs will appear here.</div>
          </div>
        )}

        {loading && <div className="empty-pane"><div className="muted">Finding the right intros…</div></div>}

        {error && <div className="card" style={{ padding: 16, color: "var(--danger)" }}>{error}</div>}

        {selected && !loading && !error && matches.length === 0 && (
          <div className="empty-pane">
            <div className="muted">No live intent-match{reason ? ` — ${reason}` : ""}.</div>
          </div>
        )}

        {matches.map((m) => <MatchRow key={m.vc_id} m={m} founderId={selected!.id} />)}

        {nearMiss.length > 0 && (
          <>
            <div className="section-label">Near-misses · stage relaxed</div>
            {nearMiss.map((m) => <MatchRow key={m.vc_id} m={m} founderId={selected!.id} dim />)}
          </>
        )}

        {introd.length > 0 && (
          <>
            <div className="section-label">Already introduced · {introd.length}</div>
            {introd.map((m) => (
              <div key={m.vc_id} className="introd-row">
                {m.vc_name}{m.vc_firm ? ` · ${m.vc_firm}` : ""} <span className="muted">— intro already made</span>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}

function MatchRow({ m, founderId, dim }: { m: MatchCandidate; founderId: string; dim?: boolean }) {
  const [draft, setDraft] = useState<{ founderAsk: string; vcBlurb: string } | null>(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function makeDraft() {
    setBusy(true);
    const res = await fetch("/api/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ founderId, vcId: m.vc_id }) });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setDraft({ founderAsk: data.founderAsk, vcBlurb: data.vcBlurb });
  }

  return (
    <div className={dim ? "match-row dim" : "card match-row"}>
      <div className="score-anchor mono" style={scoreStyle(m.score)}>{m.score}</div>
      <div className="match-body">
        <div>
          <span style={{ fontWeight: 600 }}>{m.vc_name}</span>
          {m.vc_firm && <span className="muted"> · {m.vc_firm}</span>}
        </div>
        <p style={{ margin: "4px 0 0", color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.5 }}>{m.why}</p>
        <div style={{ marginTop: 10 }}>
        {!draft ? (
          <button onClick={makeDraft} disabled={busy} className="btn-quiet">{busy ? "Drafting…" : "Draft intro →"}</button>
        ) : (
          <div>
            <div className="draft-label">Ask the founder first</div>
            <p className="draft-box">{draft.founderAsk}</p>
            {!reveal ? (
              <button onClick={() => setReveal(true)} className="btn btn-sm btn-accent">Founder agreed → reveal VC blurb</button>
            ) : (
              <>
                <div className="draft-label">Forwardable to the VC</div>
                <p className="draft-box draft-box-go">{draft.vcBlurb}</p>
              </>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
