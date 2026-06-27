// Seed loader — maps the cleaned crm-seed/ export into Supabase.
//
// Reads from CRM_SEED_DIR (default ./supabase/seed/crm-seed, which is gitignored — your real
// founder/VC names must NOT be committed to a public repo). Copy your crm-seed/ output there:
//   cp ~/Downloads/crm-seed/*.json supabase/seed/crm-seed/
//
// Run: pnpm seed   (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { CANONICAL_VERTICALS, CANONICAL_STAGES, SEED_VERTICAL_SYNONYMS } from "../../src/lib/taxonomy";

const SEED_DIR = process.env.CRM_SEED_DIR ?? join(process.cwd(), "supabase/seed/crm-seed");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

interface FounderClean {
  name: string;
  company: string;
  stages: string[];
  sector_tags: string[];
  is_raising: boolean;
  warm_intro_strength: string;
  last_touch: string;
  why_interesting: string;
  notes: string;
}
interface VcClean {
  firm: string;
  partner: string;
  stages: string[];
  sector_tags: string[];
  exclusions: string[];
  wildcard: boolean;
  check_size: string;
  thesis: string;
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(SEED_DIR, name), "utf-8")) as T;
}

/** Map Warm IntroStrength (1-10) to tie_strength (1-5). NULL stays NULL. */
function tieStrength(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n / 2)));
}

function isoDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Seeding from ${SEED_DIR}`);

  // 1. vocabularies
  await db.from("verticals").upsert(CANONICAL_VERTICALS.map((tag) => ({ tag })));
  await db.from("stages").upsert(CANONICAL_STAGES.map((tag) => ({ tag })));
  await db
    .from("vertical_synonyms")
    .upsert(Object.entries(SEED_VERTICAL_SYNONYMS).map(([key, tags]) => ({ key, tags })));
  console.log(`  vocab: ${CANONICAL_VERTICALS.length} verticals, ${CANONICAL_STAGES.length} stages`);

  // 2. founders → people + raising intent + relationship
  const founders = readJson<FounderClean[]>("founders-clean.json");
  let fCount = 0;
  for (const f of founders) {
    const notes = [f.why_interesting, f.notes].filter(Boolean).join(" | ") || null;
    const { data: p, error } = await db
      .from("people")
      .insert({ type: "founder", name: f.name, company: f.company || null, caliber: null, notes })
      .select("id")
      .single();
    if (error) { console.error("  founder insert", f.name, error.message); continue; }
    const pid = (p as { id: string }).id;
    // All seed founders get a raising intent (they're raise candidates). as_of=null = unknown
    // freshness (not stale-excluded). is_raising is a stronger signal kept in notes.
    await db.from("intent").insert({
      person_id: pid,
      kind: "raising",
      stages: f.stages ?? [],
      verticals: f.sector_tags ?? [],
      as_of: null,
    });
    await db.from("relationship").insert({
      person_id: pid,
      tie_strength: tieStrength(f.warm_intro_strength),
      last_touch: isoDate(f.last_touch),
    });
    fCount++;
  }
  console.log(`  founders: ${fCount}`);

  // 3. VCs → people + investing intent
  const vcs = readJson<VcClean[]>("vcs-clean.json");
  let vCount = 0;
  for (const v of vcs) {
    const { data: p, error } = await db
      .from("people")
      .insert({ type: "vc", name: v.partner || v.firm, company: v.firm || null, caliber: null })
      .select("id")
      .single();
    if (error) { console.error("  vc insert", v.firm, error.message); continue; }
    const pid = (p as { id: string }).id;
    await db.from("intent").insert({
      person_id: pid,
      kind: "investing",
      stages: v.stages ?? [],
      verticals: v.sector_tags ?? [],
      exclusions: v.exclusions ?? [],
      wildcard: !!v.wildcard,
      thesis_text: v.thesis || null,
    });
    vCount++;
  }
  console.log(`  VCs: ${vCount}`);
  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
