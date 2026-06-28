// GET /api/export?format=csv|json  → download the full contact list.
import { NextResponse } from "next/server";
import { loadAllContacts } from "@/lib/data";

function csvCell(v: unknown): string {
  const s = v == null ? "" : Array.isArray(v) ? v.join(";") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get("format") ?? "csv";
  const contacts = await loadAllContacts();

  const rows = contacts.map((c) => ({
    name: c.person.name,
    type: c.person.type,
    company: c.person.company,
    caliber: c.person.caliber,
    linkedin: c.person.links,
    intent: c.intent?.kind ?? "",
    stages: c.intent?.stages ?? [],
    verticals: c.intent?.verticals ?? [],
    exclusions: c.intent?.exclusions ?? [],
    wildcard: c.intent?.wildcard ?? "",
    thesis: c.intent?.thesis_text ?? "",
    tie_strength: c.relationship?.tie_strength ?? "",
    last_touch: c.relationship?.last_touch ?? "",
    notes: c.person.notes,
  }));

  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="crm-export.json"`,
      },
    });
  }

  const headers = Object.keys(rows[0] ?? { name: "" });
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvCell((r as Record<string, unknown>)[h])).join(",")),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="crm-export.csv"`,
    },
  });
}
