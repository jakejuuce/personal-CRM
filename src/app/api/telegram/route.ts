// POST /api/telegram — bot webhook. The tag-writer confirm-loop.
//
// Flow: text "add Maya, raising AI infra seed, strong"
//   → parse (LLM) → normalize verticals to CANONICAL (synonym fast-path + LLM)
//   → store pending_write → reply echoing the CANONICAL tags + [Confirm | Cancel] inline buttons
//   → on Confirm (callback) → commit person+intent, cache-back synonyms.
//
// Security (F2): validates the webhook secret header AND the chat-ID allowlist before any write.

import { NextResponse } from "next/server";
import {
  isAllowed,
  tgSend,
  tgEdit,
  tgAnswerCallback,
  parsePersonFromText,
} from "@/lib/telegram";
import {
  createPendingWrite,
  getPendingWrite,
  deletePendingWrite,
  commitProposed,
  loadVerticalSynonyms,
  type ProposedWrite,
} from "@/lib/data";
import { normalizeVertical } from "@/lib/normalize";
import { SEED_STAGE_SYNONYMS } from "@/lib/taxonomy";
import { LLMError } from "@/lib/llm";

function normalizeStages(raw: string[]): string[] {
  const out = new Set<string>();
  for (const r of raw) {
    const key = r.trim().toLowerCase();
    const hit = SEED_STAGE_SYNONYMS[key];
    if (hit) hit.forEach((s) => out.add(s));
    else if (key) out.add(key); // keep unknown stage as-is rather than dropping
  }
  return [...out];
}

export async function POST(req: Request) {
  // webhook secret (Telegram sends it as this header)
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true });

  try {
    // --- callback (Confirm / Cancel) ---
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = String(cq.message?.chat?.id ?? "");
      if (!isAllowed(chatId)) return NextResponse.json({ ok: true });
      const [action, pendingId] = String(cq.data ?? "").split(":");

      if (action === "cancel") {
        await deletePendingWrite(pendingId);
        await tgAnswerCallback(cq.id, "cancelled");
        await tgEdit(chatId, cq.message.message_id, "Cancelled.");
        return NextResponse.json({ ok: true });
      }

      const proposed = await getPendingWrite(pendingId, chatId);
      if (!proposed) {
        await tgAnswerCallback(cq.id, "expired");
        await tgEdit(chatId, cq.message.message_id, "That add expired — send it again.");
        return NextResponse.json({ ok: true });
      }
      const { created } = await commitProposed(proposed);
      await deletePendingWrite(pendingId);
      await tgAnswerCallback(cq.id, "saved");
      await tgEdit(
        chatId,
        cq.message.message_id,
        `${created ? "Saved" : "Updated"}: ${proposed.person.name}`,
      );
      return NextResponse.json({ ok: true });
    }

    // --- new add (text message) ---
    const msg = update.message;
    if (!msg?.text) return NextResponse.json({ ok: true });
    const chatId = String(msg.chat.id);
    if (!isAllowed(chatId)) return NextResponse.json({ ok: true });

    const parsed = await parsePersonFromText(msg.text);
    const synonyms = await loadVerticalSynonyms();

    // normalize each raw vertical to canonical, collecting cache-backs + any "new vertical?" flags
    const tagSet = new Set<string>();
    const cacheBacks: { key: string; tags: string[] }[] = [];
    const newProposed: string[] = [];
    for (const raw of parsed.verticals_raw) {
      const r = await normalizeVertical(raw, synonyms);
      r.tags.forEach((t) => tagSet.add(t));
      if (r.via === "llm") cacheBacks.push({ key: r.key, tags: r.tags });
      r.proposedNew.forEach((t) => newProposed.push(t));
    }
    const exclusionSet = new Set<string>();
    for (const raw of parsed.exclusions_raw) {
      const r = await normalizeVertical(raw, synonyms);
      r.tags.forEach((t) => exclusionSet.add(t));
      if (r.via === "llm") cacheBacks.push({ key: r.key, tags: r.tags });
    }

    const proposed: ProposedWrite = {
      person: {
        type: parsed.type,
        name: parsed.name,
        company: parsed.company,
        caliber: parsed.caliber,
        notes: parsed.notes,
      },
      intent: parsed.kind
        ? {
            kind: parsed.kind,
            stages: normalizeStages(parsed.stages),
            verticals: [...tagSet],
            exclusions: [...exclusionSet],
            wildcard: parsed.wildcard,
            amount_low: parsed.amount_low,
            amount_high: parsed.amount_high,
            thesis_text: null,
            as_of: parsed.kind === "raising" ? new Date().toISOString().slice(0, 10) : null,
          }
        : null,
      synonymCacheBacks: cacheBacks,
    };

    const pendingId = await createPendingWrite(chatId, proposed);

    // Echo the CANONICAL result (not the raw text) so a misclassification is catchable.
    const lines = [
      `${parsed.type.toUpperCase()}: ${parsed.name}${parsed.company ? ` (${parsed.company})` : ""}`,
      proposed.intent
        ? `${proposed.intent.kind} · stages: ${proposed.intent.stages.join(", ") || "—"} · verticals: ${[...tagSet].join(", ") || "—"}`
        : "no intent",
      proposed.intent?.exclusions.length ? `excludes: ${[...exclusionSet].join(", ")}` : "",
      proposed.intent?.wildcard ? "wildcard/generalist" : "",
      parsed.caliber ? `caliber: ${parsed.caliber}` : "",
      newProposed.length ? `NEW vertical(s): ${newProposed.join(", ")} — confirm to add to taxonomy` : "",
    ].filter(Boolean);

    await tgSend(chatId, `Confirm?\n${lines.join("\n")}`, [
      [
        { text: "Confirm", callback_data: `confirm:${pendingId}` },
        { text: "Cancel", callback_data: `cancel:${pendingId}` },
      ],
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // F1: surface, do not swallow. Tell the user it errored (don't leave them guessing).
    const chatId = String(update.message?.chat?.id ?? update.callback_query?.message?.chat?.id ?? "");
    if (chatId && isAllowed(chatId)) {
      await tgSend(chatId, err instanceof LLMError ? "Parser errored — rephrase and resend." : "Something broke saving that.");
    }
    console.error(JSON.stringify({ at: "api/telegram", error: String(err) }));
    return NextResponse.json({ ok: true });
  }
}
