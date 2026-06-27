// Data access — the only module that talks to Supabase tables. Keeps SQL in one place.

import { supabaseAdmin } from "./supabase";
import type {
  FounderForMatch,
  VcForMatch,
  Person,
  Intent,
  MatchCandidate,
} from "./types";

interface PersonRow extends Person {
  intent: Intent[] | null;
}

function splitPersonIntent(row: PersonRow): { person: Person; intent: Intent | null } {
  const { intent, ...person } = row;
  const first = intent && intent.length > 0 ? intent[0] : null;
  return { person: person as Person, intent: first };
}

export async function loadFounder(id: string): Promise<FounderForMatch | null> {
  const { data, error } = await supabaseAdmin()
    .from("people")
    .select("*, intent(*)")
    .eq("id", id)
    .eq("type", "founder")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return splitPersonIntent(data as PersonRow);
}

export async function loadAllVcs(): Promise<VcForMatch[]> {
  const { data, error } = await supabaseAdmin()
    .from("people")
    .select("*, intent(*)")
    .eq("type", "vc");
  if (error) throw error;
  return (data as PersonRow[]).map(splitPersonIntent);
}

export async function loadFounders(): Promise<Person[]> {
  const { data, error } = await supabaseAdmin()
    .from("people")
    .select("id, type, name, company, caliber, links, notes, created_at")
    .eq("type", "founder")
    .order("name");
  if (error) throw error;
  return data as Person[];
}

/** The synonym fast-path table (raw key → canonical tags), loaded for the tag-writer. */
export async function loadVerticalSynonyms(): Promise<Record<string, string[]>> {
  const { data, error } = await supabaseAdmin().from("vertical_synonyms").select("key, tags");
  if (error) throw error;
  const map: Record<string, string[]> = {};
  for (const row of data as { key: string; tags: string[] }[]) map[row.key] = row.tags;
  return map;
}

/** Cache-back: persist a resolved mapping so the phrase is never LLM-normalized twice. */
export async function cacheVerticalSynonym(key: string, tags: string[]): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("vertical_synonyms")
    .upsert({ key, tags }, { onConflict: "key" });
  if (error) throw error;
}

// --- tag-writer confirm-loop -------------------------------------------------

export interface ProposedWrite {
  person: {
    type: "founder" | "vc" | "other";
    name: string;
    company: string | null;
    caliber: number | null;
    notes: string | null;
  };
  intent: {
    kind: "raising" | "investing";
    stages: string[];
    verticals: string[];
    exclusions: string[];
    wildcard: boolean;
    amount_low: number | null;
    amount_high: number | null;
    thesis_text: string | null;
    as_of: string | null;
  } | null;
  /** raw phrase → canonical tags, to write into the synonym fast-path on confirm (cache-back). */
  synonymCacheBacks: { key: string; tags: string[] }[];
}

export async function createPendingWrite(chatId: string, proposed: ProposedWrite): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("pending_writes")
    .insert({ chat_id: chatId, proposed_json: proposed })
    .select("pending_id")
    .single();
  if (error) throw error;
  return (data as { pending_id: string }).pending_id;
}

export async function getPendingWrite(
  pendingId: string,
  chatId: string,
): Promise<ProposedWrite | null> {
  const { data, error } = await supabaseAdmin()
    .from("pending_writes")
    .select("proposed_json, expires_at")
    .eq("pending_id", pendingId)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date((data as { expires_at: string }).expires_at) < new Date()) return null; // expired
  return (data as { proposed_json: ProposedWrite }).proposed_json;
}

export async function deletePendingWrite(pendingId: string): Promise<void> {
  await supabaseAdmin().from("pending_writes").delete().eq("pending_id", pendingId);
}

/** Commit a confirmed proposal: person (+dedup) → intent → relationship, then cache-back synonyms. */
export async function commitProposed(p: ProposedWrite): Promise<{ created: boolean; id: string }> {
  const db = supabaseAdmin();

  // dedup: same name + company is treated as the same person (avoids import+chat duplicates)
  const { data: existing } = await db
    .from("people")
    .select("id")
    .eq("name", p.person.name)
    .eq("company", p.person.company ?? "")
    .maybeSingle();

  let id: string;
  let created = false;
  if (existing) {
    id = (existing as { id: string }).id;
  } else {
    const { data, error } = await db.from("people").insert(p.person).select("id").single();
    if (error) throw error;
    id = (data as { id: string }).id;
    created = true;
  }

  if (p.intent) {
    await db.from("intent").insert({ person_id: id, ...p.intent });
  }

  for (const cb of p.synonymCacheBacks) {
    await db.from("vertical_synonyms").upsert({ key: cb.key, tags: cb.tags }, { onConflict: "key" });
  }

  return { created, id };
}

/** Insert a matches row on "draft intro" (status=drafted). Ephemeral-compute means this is the
 *  ONLY write path to `matches` in v1 — no persist-on-compute, no upsert churn. */
export async function insertDraftMatch(c: MatchCandidate): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("matches")
    .insert({
      founder_id: c.founder_id,
      vc_id: c.vc_id,
      score: c.score,
      why: c.why,
      status: "drafted",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}
