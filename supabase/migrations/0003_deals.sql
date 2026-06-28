-- Deals: referral / affiliate opportunities you can match against your contacts.
-- "Upload a deal (description, website, deck) → see who's a fit" = use-case #2, persisted.
create table if not exists deals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'referral' check (kind in ('referral','affiliate','other')),
  description text,
  website     text,
  deck_text   text,                 -- pasted deck / blurb (vision-PDF extraction is a later add)
  -- extracted, normalized attributes used to match against contacts:
  stages      text[] not null default '{}',
  verticals   text[] not null default '{}',
  amount_low  bigint,
  amount_high bigint,
  notes       text,
  created_at  timestamptz not null default now()
);
