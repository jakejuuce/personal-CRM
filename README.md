# Personal CRM — intent-matching founders to VCs

A single-user relationship tool. Drop in a founder who's raising, see which VCs in your network to
connect them with, ranked and explained. Tag people by talking to a Telegram bot; the matcher does
the rest.

This is the **v1 walking skeleton** (the core loop). It was designed and reviewed via
`/office-hours` → `/plan-ceo-review` → `/plan-eng-review`; the locked plan lives in
`~/.gstack/projects/jaketaub/ceo-plans/2026-06-27-personal-relationship-crm.md`.

## How matching works

```
founder (raising)                         VC (investing)
  stage[], vertical[]  ──hard filter──▶    stage[], vertical[], exclusions[], wildcard
                                           amount range
  1. stage overlap
  2. vertical ∈ vc.verticals  AND  vertical ∉ vc.exclusions   ("No AI" excludes AI founders)
  3. wildcard VC bypasses the vertical check (but exclusions still apply)
  4. amount ranges overlap (NULL = no constraint)
  5. NULL on a VC core field = "unknown" → never a silent match-all
  6. caliber is a re-rank WEIGHT, not a gate (so day-one seed data still matches)
        │
        ▼
  cap 20 → LLM re-rank (fit + one-line "why")  →  ranked matches
        │
   empty? → near-miss (stage relaxed, exclusions still honored)
```

Matches are **ephemeral** — computed live, never persisted, until you click "Draft intro" (which
writes one `matches` row, status `drafted`). Proactive push + Happenstance warm-path are deferred
(E2/E3 fast-follow); the schema already has the nullable columns for them.

## Stack

Next.js (App Router) · Supabase (Postgres) · Anthropic (matcher / normalizer / intro-draft) ·
Telegram bot (tag-writer).

## Setup

```bash
pnpm install
cp .env.example .env.local        # fill in Supabase + Anthropic + Telegram
# apply supabase/migrations/0001_init.sql to your Supabase project
cp ~/Downloads/crm-seed/*.json supabase/seed/crm-seed/   # gitignored — real names stay local
pnpm seed                         # load founders + VCs + canonical taxonomy
pnpm dev
```

### Telegram tag-writer

Point your bot's webhook at `POST /api/telegram` with the secret header
`X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET`. Only chat IDs in
`TELEGRAM_ALLOWED_CHAT_IDS` may write. Send e.g.
`add Maya at Adonis, raising AI infra seed, strong` → the bot echoes the **canonical** parse and
asks you to Confirm/Cancel inline.

## Tests

```bash
pnpm test        # deterministic unit tests: the F5 filter + the normalization fast-path
pnpm typecheck
```

The LLM-driven matcher additionally needs an eval (~20 hand-labeled founder↔VC pairs from your
seed, scored on precision + exclusion correctness) — deferred to Phase 2 per the plan.

## Security / privacy

- **Single-user.** RLS is disabled; the web surface is gated by Supabase magic-link auth, the
  Telegram write-path by a chat-ID allowlist + webhook secret. The service-role key is the trust
  boundary — never expose it.
- **Never commit real data.** `crm-seed/`, `*-clean.{json,csv}`, and `.env*` are gitignored. This
  repo is public; your network/caliber data must stay out of it. Consider making the repo private
  before loading real data.

## Build phases

- **Phase 1 (this skeleton):** schema → tag-writer (normalize + cache-back) → matcher → LLM-error
  contract → auth → intro-draft → filter/normalize tests. Gate: are the matches trustworthy?
- **Phase 2 (satellites):** deck-paste (vision input), "going cold" view, eval harness, import grid.
- **Deferred (E2/E3):** proactive Telegram push agent, Happenstance warm-path.
