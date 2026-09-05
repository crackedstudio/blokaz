# Port prompt — the cash reward funding model

Paste everything below the line into the second game's session. It is the
economics half of `ladder-cash-rewards-port.md`: that document covers *how* cash
links reach players, this one covers *how much* and *who pays for it*.

Reference implementation: Blokaz (`crackedstudio/blokaz`, `master`) —
`server/config/levels.js`, `server/routes/inventory.js`,
`src/constants/__tests__/levels.test.ts`.

---

Set up the cash reward economics for this game's ladder, using the model below.
Do not copy Blokaz's numbers — derive this game's from its own shop prices and
milestone levels. Do copy the rule and the safeguards exactly.

## 1. The rule

**A milestone pays twice what the climb to it costs in the shop.** Put the other
way round: to receive $2, a player must have been required to spend $1 in the
shop along the way.

The ladder is what forces the spend. Each level's card carries a *purchases*
objective, so the purchases required between one milestone and the next are the
price of that milestone's reward — deliberately, not incidentally.

```
purchases required between milestone N-1 and milestone N
  = (payout at milestone N ÷ 2) ÷ shop unit price
```

**Charge the stretch, not the cumulative total.** If a milestone paid 2× of
everything spent so far, a player who climbs the whole ladder would collect 3×,
not 2×, because the earlier milestones already paid for that ground. Each
milestone pays only for the distance since the previous one.

### Worked example (Blokaz)

Shop unit price $0.10, milestones at levels 4, 8 and 12:

| Stretch | Payout | Half of it | Purchases required |
|---|---|---|---|
| levels 1–4 | $2 | $1.00 | 10 |
| levels 5–8 | $6 | $3.00 | 30 |
| levels 9–12 | $12 | $6.00 | 60 |

The per-level `purchases` targets are then chosen to sum to 10, 30 and 60 across
their stretches while never decreasing:

```
1, 2, 3, 4  |  5, 7, 8, 10  |  12, 14, 16, 18
```

A full climb costs the player $10 and pays them $20 — exactly half, end to end.

## 2. Funding: a fixed-slot race, funded once per season

Do **not** promise every player who reaches a milestone a reward. Fund a set
number of links per milestone and hand them out in the order players clear the
level. Fewer slots higher up, more money each:

| Milestone | Slots | Payout each | Cost |
|---|---|---|---|
| first | 10 | $2 | $20 |
| second | 5 | $6 | $30 |
| third | 3 | $12 | $36 |
| | | | **$86** |

Reload the same shape **every season** (a month works), rather than once ever. A
player who joins after the links are gone opens a ladder whose prizes are all
claimed, which is worse than never having offered them — a visible closed door.
Same budget shape each season, and every cohort gets a live race.

## 3. Profitability

Target: the house nets at least $1 per participating player.

```
budget ≤ N × (average shop spend per player − $1)
```

For the $86 budget above: 86 players at $2 average spend, or 43 at $3. Note the
average is across *everyone who plays*, including the many who never reach a
milestone — and anyone who reaches the first milestone has already been forced
to buy 10 items, so a $2 cohort average is a low bar.

Sanity-check where your revenue actually comes from before relying on it. In
Blokaz, tournament entry fees go **entirely into the prize pool**
(`t.prizePool += t.entryFee`, no fee recipient in the contract), so tournaments
are redistribution and the shop is the only income. Confirm the equivalent for
this game rather than assuming a cut exists.

## 4. Safeguards the model depends on

These are not optional. Each one, if missing, silently breaks the rule.

### a. The payment check must charge for quantity

**This is the one that matters most.** Blokaz's purchase route accepted a
`quantity` up to 100 and wrote it to both inventory and the purchase log, while
the payment verifier priced a *single* unit and asserted the transfer was at
least that. A $0.10 transaction could therefore claim a hundred power-ups and a
hundred purchase credits — enough to clear every purchase objective on the
ladder for ten cents, and the funding rule with it.

```js
const expected = (BigInt(priceCents) * BigInt(units) * 10n ** BigInt(decimals)) / 100n
```

Where a bundle is one fixed price whatever it contains, pass `units = 1` for
bundles and the real quantity for everything else. Audit this before funding
anything.

### b. The purchase counter must read verified on-chain payments only

The objective counts rows in a purchase log that is written **after** a
successful on-chain transfer to the treasury is confirmed, with the tx hash
uniquely indexed so the same payment cannot be counted twice. A client-reported
counter makes every number in this document fiction.

### c. An exhausted pool must not create a debt

When the funded links run out, the player who arrives next gets **nothing** —
the links were the whole offer. Do not write a pending grant an admin is
expected to settle by hand; that is a promise nobody made, and it turns a
fixed budget into an open one.

Keep "pending" for the cases that are genuine debts: the rewards store being
unreachable, or a link drawn from the pool but never delivered to the player. In
those, something was owed and failed to arrive.

### d. One payout per player per milestone, forever

A unique index on `(address, milestone_level)` in the grants table. This is what
caps lifetime liability per player at the sum of the milestone payouts, no
matter how many times they are demoted and climb back. Without it, a weekly
demotion rule turns into an unbounded payout loop.

### e. Cheapest path is the binding constraint

Work the arithmetic from the **lowest** price at which a player can obtain one
purchase credit. In Blokaz, bundles cost $0.20–$0.35 but log as a single credit,
so the $0.10 single is the cheapest route and sets the floor. Players who buy
bundles spend more per credit, so the real multiple lands below 2×. Treat the
rule as a ceiling on generosity, not a target.

## 5. Lock the numbers with a test

The purchase targets are economics, not a difficulty dial, and nothing else in a
codebase notices when someone edits one. Assert the invariant directly:

```ts
it.each([
  { from: 1,  to: 4,  payout: 2  },
  { from: 5,  to: 8,  payout: 6  },
  { from: 9,  to: 12, payout: 12 },
])('$stretch forces exactly half of its payout', ({ from, to, payout }) => {
  expect(buysBetween(from, to) * UNIT_PRICE).toBeCloseTo(payout / 2, 10)
})
```

Then **verify the test fails** by putting an old target back. One that cannot
fail is worse than none, because it reads as protection.

Also assert the targets never decrease as levels rise — a stretch can total
correctly while containing a level that asks for less than the one below it.

## 6. Decisions to make deliberately

- **Do you show players how many slots are left?** Visible scarcity ("6 of 10
  left") is the strongest single lever for getting a level finished this week.
  Blokaz chose **not** to show it. Either is defensible; decide it rather than
  inheriting it.
- **What is the terminal prize worth, and is it reachable?** A top prize only
  motivates if players believe they can get there. After three or four weeks,
  count distinct addresses per level in the grants table. If the top levels are
  empty, rescale the targets — do not raise the prize.
- **Does the game have a second, local XP ladder?** If so, never let both use
  the word LEVEL unqualified in the UI. Players read the wrong number as their
  rung and report it as a bug.

## 7. Before funding — a checklist

1. Payment verification charges price × quantity, and bundles are one price.
2. Purchase log writes only after on-chain confirmation, tx hash unique.
3. Grants table has a unique index on `(address, level)`.
4. An exhausted pool records no entitlement and tells the player the rewards are
   claimed.
5. The invariant test exists and has been seen to fail on a drifted target.
6. `available` per milestone is visible to an admin so the pool can be topped up
   before it runs dry.
7. Then load the links — smallest milestone first, since it is the only one
   anyone can reach in the first week.
