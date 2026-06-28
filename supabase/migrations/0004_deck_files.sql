-- Deck file attachments for deals (stored in the private "decks" Storage bucket).
alter table deals add column if not exists deck_url text;       -- storage object path
alter table deals add column if not exists deck_filename text;  -- original filename for display
