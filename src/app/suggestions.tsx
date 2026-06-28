"use client";
import type { MatchCandidate } from "@/lib/types";

// Same score-as-protagonist scale as the Match view (kept in sync intentionally).
function scoreStyle(score: number): React.CSSProperties {
  if (score >= 60) return { color: "var(--accent)", fontWeight: 800 };
  if (score >= 45) return { color: "var(--ink)", fontWeight: 700 };
  if (score >= 30) return { color: "var(--muted)", fontWeight: 600 };
  return { color: "var(--faint)", fontWeight: 600 };
}

export function Suggestions({
  title,
  loading,
  candidates,
  emptyHint,
}: {
  title: string;
  loading?: boolean;
  candidates: MatchCandidate[] | null;
  emptyHint?: string;
}) {
  if (!loading && candidates === null) return null;
  return (
    <div className="suggest">
      <div className="section-label">{title}</div>
      {loading && <p className="muted" style={{ fontSize: 13 }}>Finding suggestions…</p>}
      {!loading && candidates && candidates.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>{emptyHint ?? "No suggestions yet."}</p>
      )}
      {!loading &&
        candidates?.map((c) => (
          <div key={c.vc_id} className="suggest-row">
            <div className="score-anchor mono" style={scoreStyle(c.score)}>{c.score}</div>
            <div className="match-body">
              <div>
                <span style={{ fontWeight: 600 }}>{c.vc_name}</span>
                {c.vc_firm && <span className="muted"> · {c.vc_firm}</span>}
                {c.near_miss && <span className="muted" style={{ fontSize: 12 }}> · near-miss</span>}
              </div>
              <p style={{ margin: "3px 0 0", color: "var(--ink-2)", fontSize: 13, lineHeight: 1.5, maxWidth: "62ch" }}>{c.why}</p>
            </div>
          </div>
        ))}
    </div>
  );
}
