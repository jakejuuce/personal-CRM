-- Personal CRM — v1 schema (walking skeleton).
-- RLS DISABLED in v1: single-user app. Trust boundary = app-layer auth (magic-link) +
-- Telegram chat-ID allowlist + service-role-key secrecy. Do NOT expose the service key.

-- ---------------------------------------------------------------------------
-- canonical vocabularies (seeded from crm-seed/canonical-taxonomy.json)
-- ---------------------------------------------------------------------------
create table if not exists verticals (
  tag text primary key            -- e.g. 'ai', 'fintech', 'healthtech'
);

create table if not exists stages (
  tag text primary key            -- 'pre-seed', 'seed', 'series-a', ...
);

-- write-time normalization fast-path: raw phrase -> canonical tags. Extended via cache-back.
create table if not exists vertical_synonyms (
  key  text primary key,          -- normalized lowercased raw phrase
  tags text[] not null            -- canonical tags it maps to
);

-- ---------------------------------------------------------------------------
-- people: founders + VCs + others
-- ---------------------------------------------------------------------------
create table if not exists people (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('founder','vc','other')),
  name       text not null,
  company    text,                -- founder's startup OR VC firm
  caliber    int check (caliber between 1 and 5),  -- NULL = unknown. v1: a re-rank weight, NOT a gate.
  links      text,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists people_type_idx on people(type);

-- ---------------------------------------------------------------------------
-- intent: perishable raise/invest signal
-- ---------------------------------------------------------------------------
create table if not exists intent (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references people(id) on delete cascade,
  kind        text not null check (kind in ('raising','investing')),
  stages      text[] not null default '{}',   -- canonical stages
  verticals   text[] not null default '{}',   -- canonical verticals
  exclusions  text[] not null default '{}',   -- VC-only: sectors they will NOT invest in ("No AI")
  wildcard    boolean not null default false, -- VC-only: generalist; bypasses vertical IN-check
  amount_low  bigint,
  amount_high bigint,
  thesis_text text,
  as_of       date,                            -- raise freshness anchor (90-day decay)
  created_at  timestamptz not null default now()
);
create index if not exists intent_person_idx on intent(person_id);
create index if not exists intent_kind_idx on intent(kind);

-- ---------------------------------------------------------------------------
-- relationship: warmth + last touch (keep-warm; pull-first in v1)
-- ---------------------------------------------------------------------------
create table if not exists relationship (
  person_id      uuid primary key references people(id) on delete cascade,
  tie_strength   int check (tie_strength between 1 and 5),  -- closeness (distinct from caliber)
  last_touch     date,
  warm_path_note text,
  nudged_at      date                            -- E2-only forward-compat (unused in v1)
);

-- ---------------------------------------------------------------------------
-- matches: written ONLY on "draft intro" in v1 (ephemeral compute otherwise)
-- ---------------------------------------------------------------------------
create table if not exists matches (
  id           uuid primary key default gen_random_uuid(),
  founder_id   uuid not null references people(id) on delete cascade,
  vc_id        uuid not null references people(id) on delete cascade,
  score        int not null,
  why          text not null,
  status       text not null default 'drafted'
                 check (status in ('drafted','intro_sent','founder_declined','dismissed')),
  created_at   timestamptz not null default now(),
  -- forward-compat for E2/E3 (nullable now so picking them up needs no migration):
  pushed_at    timestamptz,
  snoozed_until timestamptz,
  warm_path    text,
  unique (founder_id, vc_id)        -- one match row per pair (E2 upsert key, harmless in v1)
);
create index if not exists matches_founder_idx on matches(founder_id);

-- ---------------------------------------------------------------------------
-- settings: single-row tunables
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id             int primary key default 1 check (id = 1),
  caliber_min    int not null default 3,    -- informational in v1 (caliber is a weight, not a gate)
  push_threshold int not null default 75,   -- E2 only
  push_muted     boolean not null default false  -- E2 only
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- pending_writes: confirm-loop buffer for the Telegram tag-writer (serverless-safe;
-- cannot be in-memory because the web app and the EC2 agent both run the tag-writer)
-- ---------------------------------------------------------------------------
create table if not exists pending_writes (
  pending_id    uuid primary key default gen_random_uuid(),
  chat_id       text not null,
  proposed_json jsonb not null,            -- the parsed person+intent awaiting confirm
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '1 hour'
);
create index if not exists pending_writes_chat_idx on pending_writes(chat_id);
