# Blokz Signing Server

This server handles session signing and score verification for Blokz Tournaments.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment — copy the example and fill in your signer key:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and set `SIGNER_PRIVATE_KEY` to the key that owns the signer role on the contract.

3. Apply the database schema — run `db/schema.sql` and then `db/levels.sql` in the
   Supabase SQL editor. Both are safe to re-run. `levels.sql` depends on the tables
   and the `set_updated_at()` trigger function defined in `schema.sql`, so run it second.

### Two Supabase projects

Sessions, inventory, purchases and the progression ladder live in the **main** project
(`SUPABASE_URL`). The `rewards` table lives in a **separate** project
(`REWARDS_SUPABASE_URL`), which the frontend also reads directly via
`VITE_REWARDS_SUPABASE_URL`.

Run `db/schema.sql` and `db/levels.sql` against the **main** project only — the ladder
derives its counters from the session tables, which is where they live.

The server keeps one client per project: `db/supabase.js` and `db/rewardsDb.js`. Cash-link
payouts are the only place the ladder crosses over — the link is drawn from
`level_cashlink_pool` in the main project and written to `rewards` in the rewards project.
If `REWARDS_SUPABASE_SERVICE_ROLE_KEY` is missing the server logs a warning at boot, no
link is drawn, and milestones are recorded as pending for `POST /levels/admin/fulfil`.

## Running

```bash
# Standard
node index.js

# Using the npm script
npm run dev
```

## API Endpoints

- `POST /sign-start`: Generates a game seed and signature to begin a tournament match.
- `POST /sign-submit`: Validates the final score and returns a signature for on-chain submission.

### Progression ladder

- `POST /levels/refresh` — `{ address }`. The authoritative call: applies any pending
  weekly rollover, climbs the player as far as this week's progress allows, pays out
  newly cleared levels, and returns the resulting state. Idempotent — calling it again
  re-reports the same state without paying twice.
- `GET /levels/:address` — read-only snapshot. No rollover, no advancement, no payouts.
  Use this for display surfaces that must not mutate progression.
- `POST /levels/admin/pool` — `{ level, links: [{ cashLinkUrl, amount, token }] }`.
  Loads pre-funded cash links for a milestone level (4, 8 or 12).
- `GET /levels/admin/pending` — milestones earned while the pool was empty, plus the
  number of free links left per milestone level.
- `POST /levels/admin/fulfil` — `{ grantId, cashLinkUrl, amount, token }`. Settles one
  pending milestone.

Admin routes require an `x-admin-address` header matching an entry in `ADMIN_ADDRESSES`.

## How the ladder works

Twelve levels. Each one is a card of four objectives — games played, tournament games
played, shop items bought, and points scored — and all four must be met to clear it.
The targets rise at every level; the full table lives in `config/levels.js`.

Counters are **weekly**, resetting Monday 00:00 UTC, and thresholds are **cumulative**,
so clearing a level mid-week rolls the banked progress straight into the next card and
a strong week can chain several levels.

Gain no level in a week and you drop one at the rollover, floored at level 1; any
advance at all protects you, and each additional week of absence costs another level.
Level 12 has nowhere to climb, so clearing its card holds the rank instead.

Every level pays power-ups into `player_inventory` the **first** time it is cleared.
Levels 4, 8 and 12 additionally pay a stablecoin cash link drawn from
`level_cashlink_pool`, delivered through the existing `rewards` table so the normal
claim flow handles it. Re-clearing a level after a demotion pays nothing — the unique
index on `level_grants (address, level)` is what enforces that.

### Cash links are per player, not a shared prize

Each player who reaches a milestone takes their **own** link out of the pool, so the
pool must hold one link per player per milestone — 100 players reaching level 4 needs
100 level-4 links. Cost scales linearly with players; this is not a single prize that
the first finisher wins.

Concurrency is handled in `claim_level_cashlink`: the `SELECT … LIMIT 1 FOR UPDATE
SKIP LOCKED` means two players clearing the same milestone in the same instant lock
**different** rows rather than blocking or colliding, and the `UPDATE … SET
assigned_to` makes a link unassignable once taken. Links go out oldest-funded first.

Amounts are **not** set in code — each pool row carries its own `amount` and `token`,
so a milestone pays whatever you funded it with. Nothing validates that level 12 pays
more than level 4; that is on whoever loads the pool.

A milestone grant is written with `cash_pending = true` and only cleared once the
reward row exists. That ordering matters: the unique index means the grant is inserted
once and a retry returns early, so a crash between the insert and the pool draw would
otherwise strand the entitlement silently. Pending-by-default makes the worst case a
milestone an admin settles from `GET /levels/admin/pending`, never one the player
loses. If the pool is dry, or the reward insert fails, the grant simply stays pending
— and in the latter case the drawn link is released back into the pool.

**Progress is never written by the client.** All four counters are derived on read from
`game_sessions`, `tournament_sessions` and `purchase_log` via the `level_progress` RPC,
so the only way to move them is to actually finish a run or pay for an item on-chain.

The ladder table is mirrored in `src/constants/levels.ts` for rendering; that copy is
not authoritative, and `src/constants/__tests__/levels.test.ts` fails if the two drift.
