# Port prompt — public ladder standings

Paste everything below the line into the second game's session. It assumes the
ladder rework from `ladder-cash-rewards-port.md` is already in.

Reference implementation: Blokaz (`crackedstudio/blokaz`, `master`) —
`server/routes/levels.js`, `server/db/levels.sql`,
`src/components/LadderStandings.tsx`, `src/components/Leaderboard.tsx`.

---

Make the ladder public: let players see who is on which rung. Right now each
player sees their own position and eleven abstractions, and a rung nobody
appears to be standing on reads as a wall rather than as somewhere to get to.

## 1. What to build

Two facts, from one endpoint:

- **The standings** — the players furthest up the ladder, with name and rung.
- **The occupancy** — how many players are standing on each rung right now.

The second is the cheaper and, I'd argue, the more useful of the two. A player
weighing up whether the next rung is worth a week is asking a question about
other people, and "14 HERE" on a rung answers it without a single name.

## 2. Database

Count the distribution **in the database**, not by paging the player table back:

```sql
create or replace function level_distribution()
returns table (level integer, players integer) language sql stable as $$
  select level, count(*)::integer
    from player_levels
   group by level
   order by level;
$$;
```

Two reasons this is not optional. PostgREST caps rows (1000 by default), so a
client-side count silently goes wrong exactly when the game gets popular. And
the count is over *current* level, not highest ever reached — this answers "who
is up there now", which is what makes a rung look worth climbing to.

The standings list itself is a plain query; make sure the ladder table has an
index on `(level desc, highest_level desc)`. Blokaz already had one, unused,
from when the table was designed.

## 3. Endpoint

```
GET /levels/leaderboard?limit=25
→ { standings: [{ rank, address, level, name, highestLevel }], distribution: { "1": 28, "2": 1 }, players: 29 }
```

- Clamp `limit` (1–100). It is a public endpoint.
- Order by `level desc, highest_level desc, level_started_at asc`. **The third
  key matters:** without it the order shuffles between requests for everyone
  tied on a rung, which looks broken to a player who is not moving. Ties go to
  whoever got there first.
- Return addresses only. Names are resolved client-side (see below).
- **Register this route before any `/:address` route on the same router**, or the
  parameterised one swallows it and you get a confusing 400 about an invalid
  address.

## 4. Names

In Blokaz the username registry is on-chain, read per address with a contract
call, and the score leaderboard already did this. If this game stores names
somewhere else, use that instead — the rule is only that **a player is called
the same thing on every board**. Extract whatever the existing leaderboard uses
into a shared component rather than writing a second one; two name renderers
drift, and a player noticing they are "0xfd1a…006b" on one screen and "sam" on
another will report it.

One read per row means keeping the list bounded. 25 rows is fine; 500 is not.

## 5. Placement — the part I got wrong, twice

First attempt put the standings inside the ladder view, which is two taps deep
(progress sheet → "all 12 levels"). The owner could not find it and reported the
feature as not working. **Put it on whatever screen players already open to look
at other players** — in Blokaz that is the rankings drawer.

Second attempt stacked it above the existing score list in that drawer, where it
read as a preamble to the scores. It needs to be **its own board**:

- A two-tab switch at the top of the panel: `WEEK SCORES` | `THE LADDER`.
- The panel title follows the tab.
- **Any week/epoch navigation hides on the ladder tab.** A score belongs to a
  week; a rung is where a player stands now. Leaving the `‹ WEEK #12 ›` control
  above the standings implies they reset weekly, which they do not.
- The footer note follows the tab too — that is free space to explain the rule
  players just met ("every level starts you from zero"), read at the exact
  moment they are looking at who is ahead of them.
- Default to the older board. The rank on the lobby card that opens the panel
  refers to scores, so opening on the ladder would contradict it.

Also keep a **compact strip** at the top of the ladder view itself — same
component, smaller variant. It costs nothing and it is the natural place to look
once a player is already staring at the rungs.

Build the list as one component with `compact` and `full` variants, and let the
caller own the fetch. Two variants of one component cannot drift; two components
will.

## 6. What this does and does not expose

Nothing new. The addresses and names are already public on any score
leaderboard, and the level is derived from games the player chose to play. No
balances, no purchase history, no session data. If this game's ladder table
holds anything else, select only the columns above — do not `select('*')` into a
public endpoint.

## 7. Verify

```bash
curl -s "$SERVER/levels/leaderboard?limit=5"
```

Check three things:
1. `distribution` sums to `players`. They come from different queries, so
   agreement means the RPC and the list see the same table.
2. The top row's level is the highest level in `distribution`.
3. Calling it twice returns the same order.

Then in the UI: the tab exists, week navigation is gone on it, your own row is
highlighted, and a rung with players on it shows its count.

## 8. If a screen "doesn't show the change"

Before debugging the feature, confirm the code is actually running. This cost
real time on Blokaz:

- **The API process is long-lived.** Node does not hot-reload — a dev server
  started before the route existed will 404 it forever. Check what is holding
  the port (`lsof -nP -iTCP:3001 -sTCP:LISTEN`) and its start time, and kill it
  rather than starting a second one that cannot bind.
- **The frontend and the API deploy separately.** Blokaz's client is on Vercel
  and its server on Render, and several client-only changes sat undeployed for
  days while every `curl` against the API looked correct. Fetch the deployed
  bundle and grep it for a string from the new code — that answers the question
  in one command.
- **Check where the client is pointed.** A local frontend with a production
  `VITE_SIGNER_URL` is talking to the deployed API, not the one you just
  restarted.
