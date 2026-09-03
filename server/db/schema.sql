-- Run this in your Supabase SQL editor.
-- Safe to re-run — all statements use IF NOT EXISTS / OR REPLACE.

-- ── game_sessions ─────────────────────────────────────────────────────────────

create table if not exists game_sessions (
  id               uuid primary key default gen_random_uuid(),
  address          text not null,
  seed             text not null,
  on_chain_game_id text,
  on_chain_seed    text,
  move_history     jsonb not null default '[]',
  score            integer not null default 0,
  score_boost_active boolean not null default false,
  is_game_over     boolean not null default false,
  revive_count     integer not null default 0,
  status           text not null default 'active',  -- active | submitted | abandoned
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Only one active session per (address, seed) — enables single-query upsert
create unique index if not exists idx_unique_active_session
  on game_sessions (address, seed)
  where status = 'active';

create index if not exists idx_game_sessions_address_status
  on game_sessions (address, status, updated_at desc);

-- ── player_inventory ──────────────────────────────────────────────────────────

create table if not exists player_inventory (
  id               uuid primary key default gen_random_uuid(),
  address          text not null unique,
  revival_bundle   integer not null default 0,
  score_boost      integer not null default 0,
  shield           integer not null default 0,
  bomb             integer not null default 0,
  rotate_pass      integer not null default 0,
  -- Free trial charges (3 per power-up to start)
  free_score_boost integer not null default 3,
  free_shield      integer not null default 3,
  free_bomb        integer not null default 3,
  free_rotate_pass integer not null default 3,
  updated_at       timestamptz not null default now()
);

create index if not exists idx_player_inventory_address
  on player_inventory (address);

-- ── purchase_log ──────────────────────────────────────────────────────────────

create table if not exists purchase_log (
  id           uuid primary key default gen_random_uuid(),
  address      text not null,
  item_id      text not null,   -- revivalBundle | scoreBoost | shield | bomb | rotatePass
  quantity     integer not null default 1,
  token_symbol text not null,   -- USDC | USDT | USDm
  tx_hash      text unique,     -- null if tx hash was unavailable; unique prevents double-processing
  created_at   timestamptz not null default now()
);

create index if not exists idx_purchase_log_address
  on purchase_log (address, created_at desc);

create unique index if not exists idx_purchase_log_tx_hash
  on purchase_log (tx_hash)
  where tx_hash is not null;

-- ── Delta-sync append RPC ────────────────────────────────────────────────────
-- Called by /session/sync (delta path). Atomically appends only the moves the
-- server hasn't seen yet, deduplicating any overlap from retried requests.
-- fromIndex is the position in the full history where p_new_moves begins;
-- if the DB already has moves past that point the overlap is skipped.

create or replace function append_session_moves(
  p_address            text,
  p_seed               text,
  p_new_moves          jsonb,
  p_from_index         integer,
  p_score              integer,
  p_score_boost_active boolean,
  p_is_game_over       boolean,
  p_revive_count       integer,
  p_on_chain_game_id   text    default null,
  p_on_chain_seed      text    default null
) returns void language plpgsql as $$
declare
  v_id            uuid;
  v_current_len   integer;
  v_skip          integer;
  v_to_append     jsonb;
begin
  -- FOR UPDATE locks the row so two concurrent syncs from the same player
  -- cannot both read the same v_current_len and then both append the same
  -- moves, which would corrupt the history with duplicates.
  select id, jsonb_array_length(move_history) into v_id, v_current_len
  from   game_sessions
  where  address = p_address and seed = p_seed and status = 'active'
  for update;

  if not found then
    -- No active session yet (race with /session/start) — insert one.
    insert into game_sessions (
      address, seed, move_history, score, score_boost_active,
      is_game_over, revive_count, on_chain_game_id, on_chain_seed, status
    ) values (
      p_address, p_seed, p_new_moves, p_score, p_score_boost_active,
      p_is_game_over, p_revive_count, p_on_chain_game_id, p_on_chain_seed, 'active'
    ) on conflict do nothing;
    return;
  end if;

  -- How many of p_new_moves does the DB already contain?
  v_skip := v_current_len - p_from_index;
  if v_skip < 0 then v_skip := 0; end if;

  if v_skip >= jsonb_array_length(p_new_moves) then
    -- Nothing new — just refresh the metadata (score, isGameOver, etc.)
    v_to_append := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(elem order by idx), '[]'::jsonb)
    into   v_to_append
    from   jsonb_array_elements(p_new_moves) with ordinality t(elem, idx)
    where  idx > v_skip;
  end if;

  -- Use id (captured under the lock) for the UPDATE so Postgres doesn't
  -- need to re-evaluate the address+seed+status predicate after the lock.
  update game_sessions set
    move_history       = case when jsonb_array_length(v_to_append) > 0
                              then move_history || v_to_append
                              else move_history end,
    -- GREATEST prevents an out-of-order delayed sync from reducing the score.
    -- Syncs can arrive at the server out of order when the network is flaky;
    -- moves are safely deduplicated above but without GREATEST the lower
    -- score from the older sync would silently overwrite the higher score
    -- that a newer sync already committed.
    score              = GREATEST(score, p_score),
    score_boost_active = p_score_boost_active,
    is_game_over       = p_is_game_over,
    revive_count       = p_revive_count,
    on_chain_game_id   = coalesce(nullif(p_on_chain_game_id, ''), on_chain_game_id),
    on_chain_seed      = coalesce(p_on_chain_seed, on_chain_seed)
  where id = v_id;
end;
$$;

-- ── tournament_sessions ───────────────────────────────────────────────────────
-- Dedicated table for tournament game sessions — keeps tournament data
-- separate from classic sessions and enables tournament-specific queries
-- (e.g. leaderboard by tournament_id + score).

create table if not exists tournament_sessions (
  id               uuid primary key default gen_random_uuid(),
  address          text not null,
  tournament_id    text not null,
  seed             text not null,
  on_chain_game_id text,
  on_chain_seed    text,
  move_history     jsonb not null default '[]',
  score            integer not null default 0,
  score_boost_active boolean not null default false,
  is_game_over     boolean not null default false,
  revive_count     integer not null default 0,
  status           text not null default 'active',  -- active | submitted | abandoned
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One active session per player per tournament
create unique index if not exists idx_unique_active_tournament_session
  on tournament_sessions (address, tournament_id)
  where status = 'active';

-- Fast lookup for restore and leaderboard
create index if not exists idx_tournament_sessions_address_status
  on tournament_sessions (address, status, updated_at desc);

create index if not exists idx_tournament_sessions_leaderboard
  on tournament_sessions (tournament_id, score desc)
  where status in ('active', 'submitted');

-- ── Delta-sync append RPC for tournament sessions ─────────────────────────────

create or replace function append_tournament_moves(
  p_address            text,
  p_tournament_id      text,
  p_seed               text,
  p_new_moves          jsonb,
  p_from_index         integer,
  p_score              integer,
  p_score_boost_active boolean,
  p_is_game_over       boolean,
  p_revive_count       integer,
  p_on_chain_game_id   text    default null,
  p_on_chain_seed      text    default null
) returns void language plpgsql as $$
declare
  v_id            uuid;
  v_current_len   integer;
  v_skip          integer;
  v_to_append     jsonb;
begin
  select id, jsonb_array_length(move_history) into v_id, v_current_len
  from   tournament_sessions
  where  address = p_address and tournament_id = p_tournament_id and status = 'active'
  for update;

  if not found then
    insert into tournament_sessions (
      address, tournament_id, seed, move_history, score, score_boost_active,
      is_game_over, revive_count, on_chain_game_id, on_chain_seed, status
    ) values (
      p_address, p_tournament_id, p_seed, p_new_moves, p_score, p_score_boost_active,
      p_is_game_over, p_revive_count, p_on_chain_game_id, p_on_chain_seed, 'active'
    ) on conflict do nothing;
    return;
  end if;

  v_skip := v_current_len - p_from_index;
  if v_skip < 0 then v_skip := 0; end if;

  if v_skip >= jsonb_array_length(p_new_moves) then
    v_to_append := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(elem order by idx), '[]'::jsonb)
    into   v_to_append
    from   jsonb_array_elements(p_new_moves) with ordinality t(elem, idx)
    where  idx > v_skip;
  end if;

  update tournament_sessions set
    move_history       = case when jsonb_array_length(v_to_append) > 0
                              then move_history || v_to_append
                              else move_history end,
    score              = GREATEST(score, p_score),
    score_boost_active = p_score_boost_active,
    is_game_over       = p_is_game_over,
    revive_count       = p_revive_count,
    on_chain_game_id   = coalesce(nullif(p_on_chain_game_id, ''), on_chain_game_id),
    on_chain_seed      = coalesce(p_on_chain_seed, on_chain_seed)
  where id = v_id;
end;
$$;

-- ── RLS for tournament_sessions ───────────────────────────────────────────────

alter table tournament_sessions enable row level security;
create policy "service role only" on tournament_sessions as restrictive using (false) with check (false);

create or replace trigger tournament_sessions_updated_at
  before update on tournament_sessions
  for each row execute function set_updated_at();

-- ── Atomic inventory increment RPC ───────────────────────────────────────────
-- Called by /inventory/purchase to credit items without a read-modify-write race.

create or replace function increment_inventory(
  p_address text,
  p_column  text,
  p_qty     integer
) returns void language plpgsql as $$
begin
  if p_column not in ('revival_bundle','score_boost','shield','bomb','rotate_pass') then
    raise exception 'Invalid column: %', p_column;
  end if;

  insert into player_inventory (address)
    values (p_address)
    on conflict (address) do nothing;

  execute format(
    'update player_inventory set %I = %I + $1, updated_at = now() where address = $2',
    p_column, p_column
  ) using p_qty, p_address;
end;
$$;

-- ── Play days RPC ────────────────────────────────────────────────────────────
-- The UTC days on which a player finished at least one run, newest first, for
-- the daily streak. Both modes count: a day spent in tournaments is a day
-- played.
--
-- Distinct days rather than sessions, computed in the database: a heavy player
-- has thousands of runs behind a long streak, and paging those back to count
-- the days they fall on would truncate exactly the streaks worth showing.
--
-- A run counts once it is over or has been submitted, the same test level
-- progress uses — an abandoned mid-game session is not a game played.

create or replace function player_play_days(
  p_address text,
  p_since   timestamptz
) returns table (play_day date) language sql stable as $$
  select day from (
    select distinct (created_at at time zone 'UTC')::date as day
      from game_sessions
     where address = p_address and created_at >= p_since
       and (is_game_over or status = 'submitted')
    union
    select distinct (created_at at time zone 'UTC')::date as day
      from tournament_sessions
     where address = p_address and created_at >= p_since
       and (is_game_over or status = 'submitted')
  ) days
  order by day desc;
$$;

-- ── Auto-update updated_at ────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger game_sessions_updated_at
  before update on game_sessions
  for each row execute function set_updated_at();

create or replace trigger player_inventory_updated_at
  before update on player_inventory
  for each row execute function set_updated_at();

-- ── Row-level security ────────────────────────────────────────────────────────
-- All access goes through the server using the service role key.

alter table game_sessions enable row level security;
alter table player_inventory enable row level security;
alter table purchase_log enable row level security;

create policy "service role only" on game_sessions as restrictive using (false) with check (false);
create policy "service role only" on player_inventory as restrictive using (false) with check (false);
create policy "service role only" on purchase_log as restrictive using (false) with check (false);
