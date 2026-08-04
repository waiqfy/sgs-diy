# 国战录 — Card Catalog & Game Log

A static web app (no build step) for browsing your ~240 cards, logging games, and
uploading new cards straight from the browser.

## 1. One-time Supabase setup

Go to your project's **SQL Editor** and run this once:

```sql
-- Cards table
create table if not exists cards (
  id serial primary key,
  faction text not null,        -- WEI / SHU / WU / QUN
  card_id text not null unique, -- e.g. WEI044
  name text not null,           -- 程昱
  nickname text,                -- 素玄
  image_url text not null
);

-- Game sessions
create table if not exists game_sessions (
  id serial primary key,
  played_at timestamptz default now(),
  notes text
);

-- Cards used in a given session
create table if not exists session_cards (
  id serial primary key,
  session_id int references game_sessions(id) on delete cascade,
  card_id text references cards(card_id)
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

-- Ratings: one row per vote, tallied client-side per card
create table if not exists card_ratings (
  id serial primary key,
  card_id text references cards(card_id) on delete cascade,
  rating text not null check (rating in ('超模','夯','一般','拉')),
  created_at timestamptz default now()
);
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

## 2. Config

`config.js` already has your project URL and **publishable** key filled in —
that key is meant to be public, so no extra setup needed there.

## 3. Run locally

Just open `index.html` in a browser, or serve the folder:

```
npx serve .
```

## 4. Deploy to Vercel

Push this folder to a GitHub repo, then "Import Project" in Vercel and pick it —
no framework/build settings needed, it's a static site.

## 5. New: catch-all faction + ratings

- Any uploaded filename that doesn't match the `国战UI.FACTION###.nickname.name`
  pattern now gets filed under a 5th faction, **其他 / OTHER**, instead of being
  skipped — using its best-guess name and a sanitized ID. Check the upload log
  for these (shown in yellow) so you can decide whether to rename and re-upload,
  or leave them as-is.
- Every card's full-view modal now has four rating buttons — 超模 / 夯 / 一般 / 拉 —
  each showing a running vote count. Anyone using the app can click one; it adds
  a vote (not a replace), so counts reflect total votes over time, not a single
  "current" rating per person.

## 6. Upload your 240 cards

Open the app → **录入 Upload** tab → drag in all your image files. Each one is
parsed from its filename (`国战UI.WEI044.素玄.程昱.png` → faction `WEI`, id `WEI044`,
name `程昱`), uploaded to Storage, and added to the `cards` table automatically.
Files that don't match the pattern are skipped and logged, not silently dropped.

## 7. Rotate your secret key

You pasted your database password and `service_role`/secret key into a chat
earlier in this project — neither is used anywhere in this app, but both should
still be rotated in Supabase (Settings → Database / Settings → API) since
they were exposed in plain text.
