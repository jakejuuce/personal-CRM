// Intro importer — loads "Intros Made" into the matches table as historical intros.
//
// Each CSV row (Name (VC), Name (Founder), Chatted, Data Added) becomes a matches row with
// status='intro_sent'. Names are resolved against existing people (by name, then VC firm).
// Unresolved names get a lightweight placeholder person so no intro is lost (flagged for
// enrichment). Run: pnpm intros   (needs .env.local; run AFTER 0002_intros.sql is applied)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SEED_DIR = process.env.CRM_SEED_DIR ?? join(process.cwd(), "supabase/seed/crm-seed");
const INTROS_CSV = process.env.INTROS_CSV ?? join(SEED_DIR, "intros.csv");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// minimal CSV parse (handles quoted fields + commas inside quotes)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function toIso(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw.replace(/(\d)(am|pm)/i, "$1 $2")); // "8:24pm" → "8:24 pm"
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function resolvePerson(name: string, type: "vc" | "founder"): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;
  // 1. exact-ish name match (case-insensitive)
  const byName = await db.from("people").select("id").eq("type", type).ilike("name", clean).limit(1);
  if (byName.data?.length) return byName.data[0].id;
  // 2. for VCs, the CSV name may be the firm
  if (type === "vc") {
    const byFirm = await db.from("people").select("id").eq("type", "vc").ilike("company", clean).limit(1);
    if (byFirm.data?.length) return byFirm.data[0].id;
  }
  return null;
}

async function getOrCreate(name: string, type: "vc" | "founder"): Promise<string> {
  const existing = await resolvePerson(name, type);
  if (existing) return existing;
  const { data, error } = await db
    .from("people")
    .insert({ type, name: name.trim(), notes: "imported from Intros Made — needs enrichment" })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

async function main() {
  const rows = parseCsv(readFileSync(INTROS_CSV, "utf-8"));
  const header = rows.shift()!.map((h) => h.replace(/^﻿/, "").trim());
  const col = (name: string) => header.findIndex((h) => h.toLowerCase().includes(name));
  const vcCol = col("vc"), fCol = col("founder"), chCol = col("chatted"), dCol = col("added");

  let imported = 0, createdPeople = 0, skipped = 0;
  for (const r of rows) {
    const vcName = r[vcCol]?.trim(), fName = r[fCol]?.trim();
    if (!vcName || !fName) { skipped++; continue; }
    const beforeVc = await resolvePerson(vcName, "vc");
    const beforeF = await resolvePerson(fName, "founder");
    const vcId = beforeVc ?? (createdPeople++, await getOrCreate(vcName, "vc"));
    const fId = beforeF ?? (createdPeople++, await getOrCreate(fName, "founder"));

    const chatted = (r[chCol] ?? "").trim().toLowerCase() === "checked";
    const created_at = toIso(r[dCol] ?? "") ?? undefined;
    const { error } = await db.from("matches").upsert(
      { founder_id: fId, vc_id: vcId, score: 0, why: "historical intro", status: "intro_sent", chatted, ...(created_at ? { created_at } : {}) },
      { onConflict: "founder_id,vc_id" },
    );
    if (error) { console.error("  upsert", vcName, "x", fName, error.message); skipped++; continue; }
    imported++;
  }
  console.log(`Intros imported: ${imported} | placeholder people created: ${createdPeople} | skipped: ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
