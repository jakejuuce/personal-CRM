-- Intro tracking: a historical intro is a matches row with status='intro_sent'.
-- Add a 'chatted' flag (did the two actually connect, vs just intro'd).
alter table matches add column if not exists chatted boolean not null default false;

-- Index to quickly find "who has this founder already been introduced to?"
create index if not exists matches_founder_status_idx on matches(founder_id, status);
