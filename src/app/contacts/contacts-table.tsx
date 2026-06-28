"use client";
import { useState } from "react";
import type { MatchCandidate } from "@/lib/types";
import { Suggestions } from "../suggestions";

export interface ContactRow {
  id: string;
  name: string;
  type: string;
  company: string | null;
  caliber: number | null;
  links: string | null;
  notes: string | null;
  intentKind: string | null;
  stages: string[];
  verticals: string[];
  exclusions: string[];
  wildcard: boolean;
  thesis: string | null;
  tie_strength: number | null;
  last_touch: string | null;
}

const inputStyle = { padding: 6, border: "1px solid #ccc", borderRadius: 5, fontSize: 13, width: "100%" } as const;
const cell = { padding: "6px 8px", borderBottom: "1px solid #eee", verticalAlign: "top" as const, fontSize: 13 };

export function ContactsTable({ initial }: { initial: ContactRow[] }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const filtered = rows.filter((r) => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (!q) return true;
    const hay = `${r.name} ${r.company ?? ""} ${r.verticals.join(" ")} ${r.notes ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, width: 220 }} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: 130 }}>
          <option value="all">All types</option>
          <option value="founder">Founders</option>
          <option value="vc">VCs</option>
          <option value="other">Other</option>
        </select>
        <button onClick={() => setAdding((v) => !v)} style={btn}>{adding ? "Close" : "+ Add contact"}</button>
        <span style={{ flex: 1 }} />
        <a href="/api/export?format=csv" style={btnLink}>Download CSV</a>
        <a href="/api/export?format=json" style={btnLink}>JSON</a>
      </div>

      {adding && <AddForm onAdded={(r) => setRows((prev) => [r, ...prev])} onClose={() => setAdding(false)} />}

      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden" }}>
        <thead>
          <tr style={{ textAlign: "left", background: "#f4f4f4", fontSize: 12, color: "#555" }}>
            <th style={cell}>Name</th><th style={cell}>Type</th><th style={cell}>Company</th>
            <th style={cell}>Caliber</th><th style={cell}>Verticals</th><th style={cell}>Stages</th>
            <th style={cell}>LinkedIn</th><th style={cell}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) =>
            editing === r.id ? (
              <EditRow key={r.id} row={r} onSaved={(u) => { setRows((p) => p.map((x) => (x.id === u.id ? u : x))); setEditing(null); }} onCancel={() => setEditing(null)} />
            ) : (
              <tr key={r.id}>
                <td style={cell}><strong>{r.name}</strong></td>
                <td style={cell}>{r.type}</td>
                <td style={cell}>{r.company ?? ""}</td>
                <td style={cell}>{r.caliber ?? "—"}</td>
                <td style={cell}>{r.verticals.join(", ")}{r.exclusions.length ? <span style={{ color: "#b00" }}> · no {r.exclusions.join(",")}</span> : null}{r.wildcard ? " · generalist" : ""}</td>
                <td style={cell}>{r.stages.join(", ")}</td>
                <td style={cell}>{r.links ? <a href={r.links} target="_blank" rel="noreferrer">link</a> : "—"}</td>
                <td style={cell}><button onClick={() => setEditing(r.id)} style={btnSmall}>edit</button></td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function EditRow({ row, onSaved, onCancel }: { row: ContactRow; onSaved: (r: ContactRow) => void; onCancel: () => void }) {
  const [name, setName] = useState(row.name);
  const [company, setCompany] = useState(row.company ?? "");
  const [caliber, setCaliber] = useState(row.caliber?.toString() ?? "");
  const [links, setLinks] = useState(row.links ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const patch = { name, company: company || null, caliber: caliber ? Number(caliber) : null, links: links || null };
    const res = await fetch(`/api/contacts/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(false);
    if (res.ok) onSaved({ ...row, ...patch });
  }

  return (
    <tr style={{ background: "#fffdf0" }}>
      <td style={cell}><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></td>
      <td style={cell}>{row.type}</td>
      <td style={cell}><input value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} /></td>
      <td style={cell}><input value={caliber} onChange={(e) => setCaliber(e.target.value)} placeholder="1-5" style={{ ...inputStyle, width: 50 }} /></td>
      <td style={cell}>{row.verticals.join(", ")}</td>
      <td style={cell}>{row.stages.join(", ")}</td>
      <td style={cell}><input value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://linkedin.com/in/…" style={inputStyle} /></td>
      <td style={cell}>
        <button onClick={save} disabled={busy} style={btnSmall}>{busy ? "…" : "save"}</button>
        <button onClick={onCancel} style={{ ...btnSmall, marginLeft: 4 }}>x</button>
      </td>
    </tr>
  );
}

function AddForm({ onAdded, onClose }: { onAdded: (r: ContactRow) => void; onClose: () => void }) {
  const [type, setType] = useState("founder");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [links, setLinks] = useState("");
  const [caliber, setCaliber] = useState("");
  const [verticals, setVerticals] = useState("");
  const [stages, setStages] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MatchCandidate[] | null>(null);
  const [sugLoading, setSugLoading] = useState(false);

  const list = (s: string) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

  function reset() {
    setName(""); setCompany(""); setLinks(""); setCaliber(""); setVerticals(""); setStages(""); setNotes("");
    setAdded(null); setSuggestions(null); setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const hasIntent = !!(verticals || stages);
    const body: Record<string, unknown> = {
      type, name, company: company || null, links: links || null,
      caliber: caliber ? Number(caliber) : null, notes: notes || null,
    };
    if (hasIntent) body.intent = { kind: type === "vc" ? "investing" : "raising", verticals: list(verticals), stages: list(stages) };

    const res = await fetch("/api/contacts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "failed"); return; }
    onAdded({
      id: data.id, name, type, company: company || null, caliber: caliber ? Number(caliber) : null,
      links: links || null, notes: notes || null, intentKind: type === "vc" ? "investing" : "raising",
      stages: list(stages), verticals: list(verticals), exclusions: [], wildcard: false, thesis: null,
      tie_strength: null, last_touch: null,
    });
    setAdded(name);

    // Auto-suggest who to connect a new founder with.
    if (type === "founder") {
      if (!hasIntent) { setSuggestions([]); return; }
      setSugLoading(true);
      try {
        const mr = await fetch(`/api/matches?founderId=${data.id}`);
        const md = await mr.json();
        const top = [...(md.matches ?? []), ...(md.nearMiss ?? [])].slice(0, 5);
        setSuggestions(top);
      } catch { setSuggestions([]); }
      finally { setSugLoading(false); }
    }
  }

  if (added) {
    return (
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>Added {added}.</div>
        {type === "founder" ? (
          <Suggestions
            title={`Who to connect ${added} with`}
            loading={sugLoading}
            candidates={suggestions}
            emptyHint="Add a vertical or stage to this contact to get intro suggestions."
          />
        ) : (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Suggestions run for founders who are raising.</p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={reset} className="btn btn-sm">+ Add another</button>
          <button onClick={onClose} className="btn btn-sm">Done</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: 16, marginBottom: 12 }}>
      <select value={type} onChange={(e) => setType(e.target.value)} className="input">
        <option value="founder">Founder</option><option value="vc">VC</option><option value="other">Other</option>
      </select>
      <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="input" />
      <input placeholder="Company / firm" value={company} onChange={(e) => setCompany(e.target.value)} className="input" />
      <input placeholder="LinkedIn URL" value={links} onChange={(e) => setLinks(e.target.value)} className="input" />
      <input placeholder="Caliber 1-5" value={caliber} onChange={(e) => setCaliber(e.target.value)} className="input" />
      <input placeholder="Verticals (comma)" value={verticals} onChange={(e) => setVerticals(e.target.value)} className="input" />
      <input placeholder="Stages (comma)" value={stages} onChange={(e) => setStages(e.target.value)} className="input" />
      <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="input" style={{ gridColumn: "span 2" }} />
      <button type="submit" disabled={busy} className="btn btn-primary" style={{ gridColumn: "span 3", justifyContent: "center" }}>{busy ? "Adding…" : "Add contact"}</button>
      {err && <p style={{ color: "var(--danger)", gridColumn: "span 3" }}>{err}</p>}
    </form>
  );
}

const btn = { padding: "7px 12px", borderRadius: 6, cursor: "pointer", border: "1px solid #ccc", background: "#fff" } as const;
const btnSmall = { padding: "3px 8px", borderRadius: 5, cursor: "pointer", border: "1px solid #ccc", background: "#fff", fontSize: 12 } as const;
const btnLink = { padding: "7px 12px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", textDecoration: "none", color: "#1a1a1a", fontSize: 13 } as const;
