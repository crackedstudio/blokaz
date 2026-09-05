# Design prompt — how the cash rewards work

Paste into Claude Design. Self-contained; no need to open the other briefs.

Before you paste, settle one thing — see **Decide first** at the bottom.

---

Design an explainer for **Blokaz**, a block-puzzle mini app on Celo that runs
inside MiniPay. It answers one player question: **how do I get the cash reward,
and what do I do when I have one?**

The audience is a player mid-game on a phone, not a crypto reader. Assume they
know what a level is and nothing else. Every line must survive being read in
three seconds while someone is standing at a bus stop.

### Brand — follow exactly, this is an existing product

Neo-brutalist. Thick black borders, hard offset drop shadows (solid, never
blurred), flat fills, slight rotations on chips and badges, no gradients, no soft
edges, no glow.

```
Paper (background)   #f5efe3        Ink (borders, text)  #0c0c10
Yellow               #ffd51f        Pink                 #ff3bbd
Lime                 #b7ff3b        Cyan                 #29e6e6
Orange               #ff7a1a        Purple               #8a3dff

Display type   Archivo Black — uppercase, tight tracking (-0.03em)
Body type      Space Grotesk — 600 weight
Borders        3–4px solid ink        Shadows  4–6px offset, solid ink, no blur
```

Accents are flat fills behind black text. One accent per element, never more
than three in one panel.

### Format

A **three-panel carousel at 1080×1080**, readable in order but each panel
standing on its own. Also export the three stacked as one **1080×1920** story.

Number the panels visibly (1 / 2 / 3) in a small ink chip, top right.

---

### Panel 1 — which levels pay

**Eyebrow chip** (yellow, rotated ~-2°): `CASH REWARDS`

**Headline:** `THREE LEVELS PAY REAL MONEY`

**The main visual, and the thing to get right:** a horizontal strip of 12 small
square badges numbered 1 to 12 — a ladder laid flat. Badges 1–3, 5–7, 9–11 are
plain paper with black borders and look ordinary. Badges **4, 8 and 12** are
larger, filled with accent colour (lime, pink, yellow), tilted slightly, and each
carries a small **`$` chip** clipped to its bottom-right corner — a yellow square
with a black `$`, black border, hard shadow.

That `$` chip is the exact motif the game already uses on those badges. A player
should recognise it instantly from the ladder screen.

**Under each of the three paying badges**, a small ink chip with yellow text
giving how many rewards that level has this season:

| Badge | Chip |
|---|---|
| 4 | `10 REWARDS` |
| 8 | `5 REWARDS` |
| 12 | `3 REWARDS` |

**Body line under the strip:**
`Clear level 4, 8 or 12 and you earn a stablecoin reward — paid straight to your
wallet.`

**Kicker line, smaller, beneath that:**
`18 rewards this season. First to clear the level takes them.`

The counts are the point of this panel as much as the levels are: three rewards
at level 12 says more about what reaching level 12 means than any adjective
would.

---

### Panel 2 — how you claim it

**Headline:** `CLAIM IT ON THE LEVEL THAT PAID IT`

Three numbered steps, each a bordered box with its own accent fill:

| # | Accent | Label | Line |
|---|---|---|---|
| 1 | Lime | CLEAR THE LEVEL | Hit all four targets on the card. |
| 2 | Cyan | OPEN PROGRESS | Your reward waits on the level that paid it — tap CLAIM. |
| 3 | Pink | TAKE THE MONEY | The link opens your wallet. Come back and confirm you got it. |

Draw a small **CLAIM button** in the style the app uses — a chip in the level's
accent colour, black border, hard shadow, with `$` and an amount slot — so the
player recognises the thing they are looking for.

---

### Panel 3 — the rules, stated once

**Headline:** `WORTH KNOWING`

Three short rules, as bordered rows on paper with a small accent square as a
bullet:

- **ONCE PER LEVEL, EVER.** Earn it the first time you reach the level. Climbing
  back after a drop pays nothing.
- **10, 5 AND 3.** That is how many rewards levels 4, 8 and 12 carry this
  season. Loaded before it starts; when they're taken, they're gone until the
  next one.
- **CLEAR IT PROPERLY.** Every level starts you from zero — games, tournaments,
  shop items and points all reset when you move up.

**Footer strip** (ink fill, yellow text): `blokaz.xyz · @playblokaz`

---

### Motifs

Blokaz is a block puzzle. Use **tetromino-style blocks** — squares and L-shapes
in accent colours, black borders, hard shadows — as scattered decoration in
corners or as a thin strip. Never draw a game board; it competes with the
content.

### Rules

- No stock photography, no 3D, no coins-and-charts crypto clip art. A `$` in a
  yellow square is the whole visual vocabulary for money here.
- Everything must read at thumbnail size. If a line needs more than about nine
  words, cut it.
- Do not invent mechanics. The three panels above are the complete truth of the
  system; nothing else should be implied.
- No dates, no version numbers.

---

## Decide first: do the amounts appear?

The prompt publishes **how many** rewards each level carries (10 / 5 / 3) but not
**what each is worth**. That is a deliberate split, and worth understanding
before you change it.

Publishing the counts is safe: they are the size of the season's offer, fixed
when you fund it, and scarcity is exactly what makes a player finish a level this
week. It is different from the live remaining-count inside the app, which stays
hidden — a public "3 left" tells everyone else not to bother.

Adding the amounts makes panel 1 much stronger — "10 rewards" invites the
question "of what?", and `$2 · $6 · $12` answers it. The cost is a graphic that
contradicts the app if you re-fund at different values, and a specific figure
advertised to players who arrive after a level's rewards are taken.

If you want them in, add to the prompt:

> Beside each count chip put the amount: badge 4 `10 REWARDS · $2 EACH`, badge 8
> `5 REWARDS · $6 EACH`, badge 12 `3 REWARDS · $12 EACH`. Add a line to panel 3:
> `AMOUNTS AND COUNTS CAN CHANGE EACH SEASON.`

That last line is what keeps the graphic honest when you re-fund at different
values.

---

## X post — to pair with the carousel

Post the three panels as one tweet with three images, in order.

### Option A — the mechanic, plainly (recommended)

```
how cash rewards work on blokaz 🧱

clear level 4, 8 or 12 and you earn a stablecoin reward — paid to your
wallet, claimed on the level that paid it.

18 up for grabs this season:
· 10 at level 4
· 5 at level 8
· 3 at level 12

once per level, ever. first to clear it takes it.

blokaz.xyz

#miniapps #minipay #playblokaz #celo
```

### Option B — short

```
three rungs on the blokaz ladder pay real money 💸

10 rewards at level 4
5 at level 8
3 at level 12

clear the level, claim it there. once per level, ever.

blokaz.xyz

#miniapps #minipay #playblokaz #celo
```

### Option C — urgency, if the pools are funded and you want them drained

```
cash rewards are loaded on blokaz 🧱

18 stablecoin rewards, funded and waiting:
10 at level 4 · 5 at level 8 · 3 at level 12

first players to clear the level take them. when they're gone, they're
gone until next season.

ladder's open: blokaz.xyz

#miniapps #minipay #playblokaz #celo
```

### As a two-tweet thread

Lead with A, then reply with:

```
the catch worth knowing: every level starts you from zero.

games, tournament runs, shop items and points all reset when you move up
— so each rung is its own week's work, and clearing one doesn't half-pay
for the next.
```

**Only post option C once the pools are actually funded.** "Limited, first come"
against three empty pools tells every player who clears level 4 that the rewards
are already gone.

