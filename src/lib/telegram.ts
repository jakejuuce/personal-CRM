// Telegram bot helpers + the person-parsing LLM call for the tag-writer.
// F2: only allow-listed chat IDs may write (the write-path trust boundary).

import { callLLMJson } from "./llm";
import { z } from "zod";

const API = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export function allowedChatIds(): Set<string> {
  return new Set(
    (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isAllowed(chatId: string | number): boolean {
  return allowedChatIds().has(String(chatId));
}

interface InlineButton { text: string; callback_data: string }

export async function tgSend(chatId: string | number, text: string, buttons?: InlineButton[][]) {
  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    }),
  });
}

export async function tgAnswerCallback(callbackId: string, text?: string) {
  await fetch(API("answerCallbackQuery"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

export async function tgEdit(chatId: string | number, messageId: number, text: string) {
  await fetch(API("editMessageText"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  });
}

// LLM parse of a free-text add, e.g. "add Maya at Adonis, raising AI infra seed, strong".
// Verticals come back RAW (the route normalizes them to canonical tags + caches back).
const ParseSchema = z.object({
  type: z.enum(["founder", "vc", "other"]),
  name: z.string(),
  company: z.string().nullable(),
  kind: z.enum(["raising", "investing"]).nullable(),
  stages: z.array(z.string()), // raw stage phrases
  verticals_raw: z.array(z.string()), // raw sector phrases (normalized downstream)
  exclusions_raw: z.array(z.string()), // VC "No X" sectors, raw
  wildcard: z.boolean(),
  amount_low: z.number().nullable(),
  amount_high: z.number().nullable(),
  caliber: z.number().min(1).max(5).nullable(),
  notes: z.string().nullable(),
});
export type ParsedPerson = z.infer<typeof ParseSchema>;

export async function parsePersonFromText(text: string): Promise<ParsedPerson> {
  const system =
    "Parse a terse note about a founder or VC into structured fields. 'raising' => founder, " +
    "'invests/writes checks' => VC. Pull stage phrases, sector phrases (verticals_raw), any 'No X' " +
    "sector exclusions (VC), generalist/all => wildcard:true, dollar amounts (amount_low/high in " +
    "raw dollars), and a 1-5 caliber if the note implies quality ('strong','impressive'). Leave " +
    "fields null/empty when not stated. Return strict JSON matching the schema.";
  return callLLMJson({ purpose: "normalize", system, user: text, schema: ParseSchema });
}
