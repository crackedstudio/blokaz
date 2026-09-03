-- Progression ladder (levels 1–12) — run in the Supabase SQL editor.
-- Safe to re-run: tables, indexes and functions use IF NOT EXISTS / OR REPLACE,
-- and the RLS policies are dropped before being recreated.
--
-- Run db/schema.sql FIRST — this file reads game_sessions, tournament_sessions
-- and purchase_log, and attaches a trigger to set_updated_at(), all defined there.
--
-- Design notes
-- ────────────
-- Challenge progress is NEVER written by the client and never stored twice.
-- All four counters are derived on read from tables that already exist, over
-- the window that opens when the player enters their current level (never
-- reaching back past the current Monday):
--   games       → game_sessions        (finished runs on this level)
--   tournaments → tournament_sessions  (finished runs on this level)
--   purchases   → purchase_log         (items bought on this level)
--   points      → sum of both session tables' scores on this level
-- That means a level can't be inflated by a forged request — the only way to
-- move the counters is to actually finish a run or pay for an item on-chain.

-- ── player_levels ─────────────────────────────────────────────────────────────
-- One row per player. `week_start` is the Monday (UTC) the counters belong to;
-- rollover is evaluated lazily on read, so no cron job is required.

create table if not exists player_levels (
  address                 text    primary key,
  level                   integer not null default 1,
  -- Highest level ever reached. Demotion lowers `level` but never this, so the
  -- badge a player earned stays theirs.
  highest_level           integer not null default 1,
  week_start              date    not null,
  -- Any advance during the week protects against the end-of-week demotion.
  levels_gained_this_week integer not null default 0,
  -- When the player entered the level they are on. Every counter is measured
  -- from here, which is what makes each level a fresh start instead of
  -- inheriting the runs and purchases that cleared the level below.
  level_started_at        timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Existing deployments predate level_started_at. Backfilling with now() puts
-- every player at the start of their current card, which is the same fresh
-- start a newly entered level gets.
alter table player_levels
  add column if not exists level_started_at timestamptz not null default now();

create index if not exists idx_player_levels_level
  on player_levels (level desc, highest_level desc);

-- ── level_grants ──────────────────────────────────────────────────────────────
-- One row per (player, level) the first time that level is cleared. The unique
-- constraint is what makes rewards safe under the demotion rule: a player who
-- drops to level 8 and re-clears it cannot be paid for level 8 twice.

create table if not exists level_grants (
  id           uuid primary key default gen_random_uuid(),
  address      text    not null,
  level        integer not null,
  -- What was credited to player_inventory, e.g. {"shield": 2, "bomb": 2}
  powerups     jsonb   not null default '{}',
  -- Milestone levels only. Points at the row in `rewards` the player claims.
  cash_reward_id uuid,
  -- True when the milestone was earned but the cash-link pool was empty.
  -- Admin fulfils these later via POST /levels/admin/fulfil.
  cash_pending boolean not null default false,
  granted_at   timestamptz not null default now()
);

create unique index if not exists idx_level_grants_unique
  on level_grants (address, level);

create index if not exists idx_level_grants_pending
  on level_grants (cash_pending, granted_at)
  where cash_pending = true;

-- ── level_cashlink_pool ───────────────────────────────────────────────────────
-- Pre-funded cash links, loaded by an admin ahead of time. Milestone levels
-- draw from here rather than minting a payout on demand, so the game can never
-- promise money that hasn't already been funded.

create table if not exists level_cashlink_pool (
  id            uuid primary key default gen_random_uuid(),
  level         integer not null,
  cash_link_url text    not null,
  amount        text    not null,
  token         text    not null default 'USDT',
  assigned_to   text,
  assigned_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_level_cashlink_pool_free
  on level_cashlink_pool (level, created_at)
  where assigned_to is null;

-- ── level_progress RPC ────────────────────────────────────────────────────────
-- All four counters in one round trip. A run counts once it is over
-- (is_game_over) or has been submitted on-chain — an abandoned mid-game session
-- is not a played game.

create or replace function level_progress(
  p_address text,
  p_since   timestamptz
) returns table (
  games       integer,
  tournaments integer,
  purchases   integer,
  points      bigint
) language sql stable as $$
  select
    (select count(*)::integer from game_sessions
      where address = p_address and created_at >= p_since
        and (is_game_over or status = 'submitted')),
    (select count(*)::integer from tournament_sessions
      where address = p_address and created_at >= p_since
        and (is_game_over or status = 'submitted')),
    (select coalesce(sum(quantity), 0)::integer from purchase_log
      where address = p_address and created_at >= p_since),
    (select coalesce((
        select sum(score) from game_sessions
         where address = p_address and created_at >= p_since
           and (is_game_over or status = 'submitted')
      ), 0) + coalesce((
        select sum(score) from tournament_sessions
         where address = p_address and created_at >= p_since
           and (is_game_over or status = 'submitted')
      ), 0))::bigint;
$$;

-- ── claim_level_cashlink RPC ──────────────────────────────────────────────────
-- Atomically hands one unassigned link of the right level to a player.
-- SKIP LOCKED means two players clearing the same milestone at the same instant
-- take different links instead of blocking or colliding on one.

create or replace function claim_level_cashlink(
  p_address text,
  p_level   integer
) returns table (
  id            uuid,
  cash_link_url text,
  amount        text,
  token         text
) language plpgsql as $$
begin
  return query
  update level_cashlink_pool p
     set assigned_to = p_address, assigned_at = now()
   where p.id = (
     select c.id from level_cashlink_pool c
      where c.level = p_level and c.assigned_to is null
      order by c.created_at
      limit 1
      for update skip locked
   )
  returning p.id, p.cash_link_url, p.amount, p.token;
end;
$$;

-- ── Auto-update updated_at ────────────────────────────────────────────────────
-- set_updated_at() is defined in schema.sql.

create or replace trigger player_levels_updated_at
  before update on player_levels
  for each row execute function set_updated_at();

-- ── Row-level security ────────────────────────────────────────────────────────
-- All access goes through the server using the service role key.

alter table player_levels       enable row level security;
alter table level_grants        enable row level security;
alter table level_cashlink_pool enable row level security;

-- CREATE POLICY has no IF NOT EXISTS, so drop first to keep this file re-runnable.
drop policy if exists "service role only" on player_levels;
drop policy if exists "service role only" on level_grants;
drop policy if exists "service role only" on level_cashlink_pool;

create policy "service role only" on player_levels       as restrictive using (false) with check (false);
create policy "service role only" on level_grants        as restrictive using (false) with check (false);
create policy "service role only" on level_cashlink_pool as restrictive using (false) with check (false);
