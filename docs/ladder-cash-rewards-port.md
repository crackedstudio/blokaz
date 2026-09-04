# Port prompt — ladder fresh start, cash links, and the claim flow

Paste everything below the line into the second game's coding session. It assumes
that game **already has a level ladder** and describes the changes to make to it.

The reference implementation is the Blokaz repo (`crackedstudio/blokaz`, `master`).
Where a file is named, that is where the working version lives — read it rather
than guessing at the shape.

---

You are working on a game that already has a weekly level ladder. I want it to
behave exactly like Blokaz's, which was reworked over the last two days. Implement
the following. Read the named reference files in the Blokaz repo where you need the
exact shape; do not invent a different design.

## 0. Vocabulary, so nothing is ambiguous

- **Ladder / rung / weekly level** — the server-derived progression (Blokaz: 12
  levels). This is what the whole document is about.
- **Career level** — a separate local XP ladder, if the game has one. Never let the
  two share the word "LEVEL" in the UI; see §7.
- **Card** — the set of objectives shown for the level a player is currently on.
- **Cash link** — a pre-funded stablecoin claim URL, loaded by an admin in advance.
  The game never mints money; it hands out links that already exist.

## 1. Every level starts from zero

**The problem being fixed:** counters were measured from the start of the week, so
a level inherited everything banked on the level below. Clearing level 1 with a shop
purchase left level 2 needing one more rather than its own two, and the points that
cleared level 1 counted again toward level 2. The ladder read as one long week
rather than N separate pieces of work.

**Implement:**

1. Add `level_started_at timestamptz not null default now()` to the player ladder
   table. Ship a backfill for existing rows:

   ```sql
   alter table player_levels
     add column if not exists level_started_at timestamptz not null default now();
   ```

   Backfilling with `now()` puts every existing player at the start of their current
   card, which is the same fresh start a newly entered level gets.

2. The progress window becomes the **latest** of: the week start, the player's join
   date, the moment they entered their current level, and any global re-baseline.
   Reference: `progressWindowStart` in `server/config/levels.js`. Keeping the week
   start in the maximum matters — it means counters also reset every Monday even if
   the player never changes level, which is what keeps the weekly demotion rule
   meaningful.

3. Stamp `level_started_at = now()` on **every** way a player arrives at a level:
   advancing and being demoted. Reference: `server/routes/levels.js` in the refresh
   route — one stamp after the rollover applies a demotion, one after a level is
   gained.

4. `climb()` must clear **at most one level per refresh**. This is forced by the
   design: the window resets on the way through, so the progress snapshot that
   cleared level N says nothing about N+1. A huge week must no longer skip a player
   past rungs they never played. Reference: `climb` in `server/config/levels.js`.

5. After an advance, return the new card's counters as **zeros** rather than
   re-reading them. The window opens at that instant, so nothing can yet fall inside
   it — a second round trip would only confirm that. Note the consequence and accept
   it: the run in progress was started before the stamp, so it does not count toward
   the new level.

6. Decide targets deliberately. Blokaz kept its existing numbers and now reads them
   as absolute per level (level 12 = 120 games played *while sitting on level 12*),
   which makes the whole ladder far harder than the cumulative version. The
   alternative was rescaling each level to the gap it used to represent, keeping
   total effort identical. Ask the owner which they want before changing numbers.

**Test it properly.** The pure functions are testable without a database: model the
counter the way the SQL does (a row counts when recorded at or after the window
opens) and walk a player from level 1 to the top, asserting at every rung that the
card reads its own targets and that the next card starts empty. Also cover demotion
and the week boundary. Reference: `src/constants/__tests__/levels.test.ts`,
`describe('a full climb with per-level windows')`. Verify the tests actually fail if
you put the carry-over back — I did, and they catch it.

## 2. Cash milestones, funded in advance

The shape, if the second game does not already have it:

- `level_grants` — one row per `(address, level)`, with a **unique index** on that
  pair. This is what makes payouts safe under demotion: a player who drops and
  climbs back through a level is paid once, not twice. Carries `powerups jsonb` and
  `cash_pending boolean`.
- `level_cashlink_pool` — pre-funded links an admin loads ahead of time:
  `level, cash_link_url, amount, token, assigned_to, assigned_at`.
- `claim_level_cashlink(p_address, p_level)` RPC — hands out one unassigned link
  atomically, using `for update skip locked` so two players clearing the same
  milestone at the same instant take different links instead of colliding.

Reference: `server/db/levels.sql`.

**The order of operations matters.** Write the grant as `cash_pending = true` first,
then draw from the pool, then clear the flag once the reward row exists. If the
process dies in between, the entitlement is recorded as owed rather than silently
lost. If the reward write fails after a link was marked assigned, release the link
(`assigned_to = null`) so it returns to circulation instead of being burned.
Reference: `grantLevel` in `server/routes/levels.js`.

**Never create money on demand.** If the pool is empty, leave the grant pending and
let an admin settle it. If the rewards database is not configured, do not draw a
link you cannot deliver.

## 3. A test whitelist, so the flow can be exercised without grinding

Reaching level 4 to test a payout costs a week of play. Add an address-scoped
override:

```js
export const CASH_MILESTONES = new Set([4, 8, 12])   // pays everybody
export const TEST_CASH_LEVELS = new Set([1])         // pays only the whitelist
export const TEST_CASH_ADDRESSES = new Set(          // empty in normal operation
  (process.env.TEST_CASH_ADDRESSES ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
)

export function isCashMilestone(level, address) { /* real milestones, else whitelist */ }
export function poolLevels() { /* CASH_MILESTONES, plus test levels when armed */ }
```

Rules that make this safe:

- Keep it **separate from `CASH_MILESTONES`**. That set drives the public challenge
  board, and a test level must not promise every player money it will not pay.
- Every grant decision goes through `isCashMilestone(level, address)`, never a bare
  set lookup.
- The pool and the admin ledger are per level, not per player, so they widen to
  cover test levels via `poolLevels()` only while the whitelist is non-empty.
- Filter the admin ledger to grants that actually carry a cash entitlement.
  Otherwise every player's level-1 grant (which exists, because level 1 pays
  power-ups to everyone) floods the queue with rows no admin can act on.
- Env-driven with **no seeded address**, so unsetting the variable reverts
  everything — behaviour, pool levels and the admin portal — with no code change.

Reference: `server/config/levels.js`, `server/routes/levels.js`.

## 4. The admin portal

Endpoints, all gated on an `x-admin-address` header matched case-insensitively
against an `ADMIN_ADDRESSES` env var (comma separated):

- `POST /levels/admin/pool` — load funded links for a level. Validate the level
  against `poolLevels()`.
- `GET /levels/admin/pending` — returns `{ pending, paid, available, fundable }`.
  `pending` is oldest-first (the queue to work through), `paid` newest-first (the
  record of who was rewarded and when — it matters as much as the queue).
  `available` counts free links per level. `fundable` is the list of levels
  `POST /admin/pool` will accept.
- `POST /levels/admin/fulfil` — settle one pending grant by issuing a link.

**Two things that cost me time — do them from the start:**

1. `ADMIN_ADDRESSES` unset is not a permissive default. It makes the set empty and
   every admin call 401s, *including* from the wallet the portal renders for,
   because the client's admin gate is a separate constant that says nothing about
   the server. Document it in `.env.example`, and remember `.env` files are
   gitignored — the variable has to be set in the host's dashboard (Render, etc.),
   not just locally.
2. The portal must render the levels the **server** says it will accept (`fundable`),
   not a hardcoded array. A hardcoded list funds a level the server rejects the
   moment the whitelist changes under it.

Also allow the header through CORS, or the browser preflight blocks every admin
call: `allowedHeaders: ['Content-Type', 'x-admin-address']`.

Reference: `server/routes/levels.js`, `src/components/LevelMilestonesPanel.tsx`,
`src/hooks/useLevelMilestones.ts`.

## 5. Claiming — tag the reward to the level that paid it

**The problem being fixed:** a cash link was only reachable from a flat list in the
settings sheet. A player has usually climbed past the milestone by the time they
claim, so the reward appeared to belong to whatever level they were standing on.

**Implement:**

1. The server writes the reward label as **`Level N — NAME`** (em dash), in every
   place it issues one — the pool draw and the admin fulfil path. That is the only
   thing tying a reward row to a rung.
2. Client reads it back with a small parser, returning null for anything else
   (tournament prizes, one-off admin payouts) so they stay out of the ladder UI:

   ```ts
   export function levelFromRewardLabel(label: string): number | null {
     const match = /^\s*level\s+(\d+)\b/i.exec(label)
     ...clamp to 1..MAX_LEVEL
   }
   ```

3. A hook keys **unclaimed** rewards by the level that paid them
   (`useLevelRewards` → `Map<number, Reward>`), and two surfaces render a claim:
   the progress sheet (a block above the current card, labelled with the source
   level) and the rung itself inside the full ladder view.

Reference: `src/constants/levels.ts`, `src/hooks/useRewards.ts`,
`src/components/LevelCashClaim.tsx`, `src/components/LevelLadderModal.tsx`,
`src/components/lobby/ProgressSheet.tsx`.

## 6. Mark it claimed when the link is handed over — not on the player's return

**The bug this fixes, which we hit in testing:** claiming was recorded only if the
player came back and answered a "did you receive it?" prompt. Miss it — dismiss it,
close the app, never return to that screen — and the row stayed unclaimed, so the
reward kept offering a CLAIM button for money already taken.

**The reasoning that makes the fix safe:** the claimed flag was never what gated
access to the money. The *link* is, and it is saved to localStorage and listed in
the rewards sheet precisely so a claimed reward can be reopened. So:

1. One shared claim path used by every surface (`startRewardClaim`):
   fetch the link → **save the link locally first, before anything can fail** →
   mark the reward claimed in the database → write a pending record → navigate.
2. Keep the prompt on return, with answers that now mean something: **yes** repeats
   the write as an idempotent retry (covering a player who was offline as they
   claimed), **no** reopens the link rather than putting the reward back in a queue
   for them to hunt down again.
3. Do not let each surface roll its own copy of step one against hand-built storage
   keys. Blokaz had three, and they drifted.

Reference: `src/lib/rewardClaim.ts`, `src/components/PlayerRewardsPanel.tsx`.

## 7. Copy rules — small, and they caused real confusion

- **"Pays" belongs to cash.** A level that credits power-ups *gives*. Blokaz showed
  "CLEARING THIS LEVEL PAYS · 1× Score Boost" on a level with no money and players
  read it as a broken promise. Say what a level **gives**, and state cash as its own
  marked line shown only where there is some.
- Keep cash out of the power-up strings. Describe a level's money in one place — its
  milestone flag — rather than appending "+ cash reward" to a list where it reads as
  one more item.
- **Never let two ladders share the word LEVEL unqualified.** If the game has a
  career/XP ladder as well, label them ("CAREER LEVEL 15", "WEEKLY LADDER · LEVEL 2")
  and show both together, or a player on rung 2 seeing "LEVEL 15" will report it as
  a bug. Watch for fallbacks like `weekly?.level ?? careerLevel` — that puts one
  ladder's number under the other's label whenever a fetch is slow.
- A display surface must read the ladder through a **read-only** endpoint. The
  refresh endpoint advances the player and pays out levels; opening a stats sheet
  must never do that as a side effect.

## 8. Publish the change to players

Players will open the game, find their card empty and every rung asking for its own
purchase, and conclude it is broken. Put an entry in whatever news/updates list the
game has, explaining that levels no longer inherit progress, that only one level
clears at a time, and where a cash reward is claimed now.

## 9. Verification checklist

Run these against the deployed server, not just locally:

```bash
# The card resets on advance — all four counters zero against the new targets
curl -s "$SERVER/levels/$ADDRESS"

# Admin auth actually works (401 here means ADMIN_ADDRESSES is unset on the host)
curl -s -H "x-admin-address: $ADMIN" "$SERVER/levels/admin/pending"
```

Then, end to end: load a link into the test level's pool, clear that level from the
whitelisted wallet, confirm the reward appears tagged to the level in both the
progress sheet and the ladder, claim it, and confirm the CLAIM button is gone
afterwards — including after a full app reload.

**Re-testing a payout needs a reset**, because `level_grants` is unique per
`(address, level)` and a second clear pays nothing:

```sql
delete from level_grants where address = '0x…' and level = 1;
update player_levels set level = 1, level_started_at = now() where address = '0x…';
```

## 10. One unrelated bug worth checking for in the second game

If it shares Blokaz's session code, it likely has this defect. A session row is
keyed by the **local session seed**, while `on_chain_seed` sits in its own column.
The game-over modal was completing the session with the *on-chain* seed, so the
`update … where seed = …` matched zero rows, reported no error, and left the
session `active`. The restore endpoint returns exactly the active sessions, so a
submitted run came back as a resumable game — showing the player a banked score and
letting them register and submit it a second time.

Fix: match on either seed, return how many rows changed and warn when it is none,
send both seeds from the client, and have the device remember the runs it submitted
so the resume probe skips them even when the network write fails.
