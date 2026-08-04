# 国战录 — Card Catalog & Game Log

A static web app (no build step) for browsing your ~240 cards, logging games, and
uploading new cards straight from the browser.

## 1. One-time Supabase setup

Go to your project's **SQL Editor** and run this once:

```sql
-- Cards table
create table if not exists cards (
  id serial primary key,
  faction text not null,        -- WEI / SHU / WU / QUN / OTHER
  card_id text not null unique, -- e.g. WEI044
  name text not null,           -- 程昱
  nickname text,
  image_url text not null
);

-- Game sessions
create table if not exists game_sessions (
  id serial primary key,
  played_at timestamptz default now(),
  notes text
);

-- Cards used in a given session, tagged by which of the 8 players
-- had it and which of their 3 slots it occupied
create table if not exists session_cards (
  id serial primary key,
  session_id int references game_sessions(id) on delete cascade,
  card_id text references cards(card_id),
  player_number int,  -- 1 through 8
  slot_number int     -- 1 through 3
);

-- Ratings: one row per vote, tallied client-side per card
create table if not exists card_ratings (
  id serial primary key,
  card_id text references cards(card_id) on delete cascade,
  rating text not null check (rating in ('超模','夯','一般','拉')),
  created_at timestamptz default now()
);

-- Row Level Security: this app has no login, so we open read/write
-- to anyone with the publishable key. Fine for a small private app
-- shared only with friends — don't reuse this schema for a public app.
alter table cards enable row level security;
create policy "public read cards" on cards for select using (true);
create policy "public write cards" on cards for insert with check (true);
create policy "public update cards" on cards for update using (true);

alter table game_sessions enable row level security;
create policy "public all sessions" on game_sessions for all using (true) with check (true);

alter table session_cards enable row level security;
create policy "public all session_cards" on session_cards for all using (true) with check (true);

alter table card_ratings enable row level security;
create policy "public all card_ratings" on card_ratings for all using (true) with check (true);
```

Then go to **Storage** → create a bucket named `cards` → mark it **public**,
and add these two policies (Storage → Policies):

```sql
create policy "public read card images" on storage.objects
  for select using (bucket_id = 'cards');

create policy "public upload card images" on storage.objects
  for insert with check (bucket_id = 'cards');
```

**If you already had `session_cards` from an earlier version** of this app,
just add the two new columns instead of recreating the table:

```sql
alter table session_cards add column if not exists player_number int;
alter table session_cards add column if not exists slot_number int;
```

## 2. Config

`config.js` already has your project URL and **publishable** key filled in —
that key is meant to be public, so no extra setup needed there.

## 3. Run locally

Just open `index.html` in a browser (as a local server, not by double-clicking —
browsers block ES module imports over `file://`):

```
npx serve .
```

## 4. Deploy to Vercel

Push this folder to a GitHub repo, then "Import Project" in Vercel and pick it —
no framework/build settings needed, it's a static site.

## 5. Uploading cards

Open the **录入 Upload** tab. You must pick a **type** from the dropdown
(魏/蜀/吴/群/其他) before the drop zone activates — every file you drop in that
batch is tagged with that type. The card **name** is always read from the last
dot-separated segment of the filename before the extension, regardless of how
many segments the filename has, e.g.:

```
国战UI.WEI044.素玄.程昱.png        → name: 程昱
国战UI.G.Wei003.督师定淮.司马师.png → name: 司马师
```

If you need to fix a card's type later, edit the `faction` cell directly in
Supabase's Table Editor — no need to re-upload.

## 6. Logging a game

The **记录 Log Game** tab shows 8 player panels, each with 3 card slots.
Click any empty (or filled) slot to open a search-by-name picker; click a
card in the picker to drop it into that slot. Add optional notes, then
**保存本局 / Save Session** — this records exactly which card each player
had in which slot. Past sessions appear below, grouped by player.

## 7. Ratings

Open any card's full-size view (click its image anywhere in the app) to see
four rating buttons — 超模 / 夯 / 一般 / 拉 — each with a running vote count.
Clicking adds a vote; it doesn't overwrite previous votes, so the count
reflects everyone's votes over time.

## 8. Rotate your secret key

If you ever pasted your database password or `service_role`/secret key into a
chat, neither is used anywhere in this app, but both should still be rotated
in Supabase (Settings → Database / Settings → API) as a precaution.
