// Shared LLM wrapper — the SINGLE place LLM calls happen (DRY; used by normalize/matcher/draft).
//
// F1 error contract (eng-review locked): every call
//   - validates the model output against a Zod schema
//   - retries ONCE on malformed/empty/refusal
//   - on persistent failure THROWS LLMError (callers surface an explicit error state — a failure
//     must never masquerade as an empty result; "no matches" and "the matcher errored" are
//     different things the user must be able to tell apart)
//   - logs full context (purpose, attempt, token usage, truncated payload) for debuggability

import Anthropic from "@anthropic-ai/sdk";
import type { ZodSchema } from "zod";

export type LLMPurpose = "normalize" | "match" | "draft";

const MODELS: Record<LLMPurpose, string> = {
  normalize: process.env.LLM_MODEL_NORMALIZE ?? "claude-haiku-4-5-20251001",
  match: process.env.LLM_MODEL_MATCH ?? "claude-sonnet-4-6",
  draft: process.env.LLM_MODEL_DRAFT ?? "claude-sonnet-4-6",
};

const MAX_TOKENS: Record<LLMPurpose, number> = {
  normalize: 256,
  match: 1500,
  draft: 1200,
};

export class LLMError extends Error {
  constructor(
    message: string,
    readonly purpose: LLMPurpose,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LLMError("ANTHROPIC_API_KEY is not set", "match");
  _client = new Anthropic({ apiKey });
  return _client;
}

/** Pull the first JSON object/array out of a model response, tolerating ```json fences and prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error("no JSON found in model output");
  // Walk to the matching close bracket so trailing prose is ignored.
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === open) depth++;
    else if (body[i] === close) {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error("unbalanced JSON in model output");
}

interface CallArgs<T> {
  purpose: LLMPurpose;
  system: string;
  user: string;
  schema: ZodSchema<T>;
}

/**
 * Call the model and return a schema-validated object. Retries once, then throws LLMError.
 * Callers MUST let LLMError propagate to a user-visible error state — do not swallow it.
 */
export async function callLLMJson<T>({ purpose, system, user, schema }: CallArgs<T>): Promise<T> {
  const model = MODELS[purpose];
  let lastErr: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await client().messages.create({
        model,
        max_tokens: MAX_TOKENS[purpose],
        system,
        messages: [{ role: "user", content: user }],
      });

      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      if (!text.trim()) throw new Error("empty model response (possible refusal)");

      const parsed = extractJson(text);
      const validated = schema.parse(parsed);

      log(purpose, attempt, "ok", {
        model,
        in_tokens: resp.usage?.input_tokens,
        out_tokens: resp.usage?.output_tokens,
      });
      return validated;
    } catch (err) {
      lastErr = err;
      log(purpose, attempt, "error", {
        model,
        error: err instanceof Error ? err.message : String(err),
        user_preview: user.slice(0, 200),
      });
    }
  }

  throw new LLMError(`LLM ${purpose} failed after 2 attempts`, purpose, lastErr);
}

function log(purpose: LLMPurpose, attempt: number, status: string, ctx: Record<string, unknown>) {
  // Structured, greppable. State transition + enough context to debug from logs alone.
  console.log(
    JSON.stringify({ at: "llm", purpose, attempt, status, ...ctx, ts: new Date().toISOString() }),
  );
}
