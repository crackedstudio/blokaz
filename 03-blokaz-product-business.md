# Blokaz — Product & Business Overview

## The Block Puzzle Game That Pays You to Play

---

## What Is Blokaz?

Blokaz is a block-placement puzzle game — think Block Blast, but built on the blockchain. Players drag and drop geometric shapes onto a 9×9 grid, trying to fill complete rows and columns to clear them. Every clear earns points. Consecutive clears chain into combos that multiply your score. The game ends when no remaining piece fits anywhere on the board.

What makes Blokaz different from the dozens of block puzzle games already on app stores is where it lives and what happens with your score. Blokaz runs as a **MiniApp inside Farcaster** (the decentralized social network) on the **Celo blockchain**. Your scores are cryptographically verified and posted on-chain. You can enter tournaments with USDC (a dollar-pegged stablecoin), compete against other players, and win real money — all without leaving the Farcaster app, without downloading anything, and without managing complex crypto wallets.

The core promise: **the simplicity of a casual mobile game, with the stakes of competitive gaming, powered by blockchain transparency.**

---

## How It Works for the Player

### Step 1 — Open and Play

A player taps the Blokaz MiniApp inside Warpcast (the Farcaster client). The game loads instantly — no sign-up, no wallet setup. Farcaster handles authentication and wallet connection behind the scenes. The player sees a clean 9×9 grid and three colorful puzzle pieces waiting to be placed.

### Step 2 — Place Pieces, Clear Lines

Each round presents three random shapes. The player drags each piece onto the grid. When an entire row or column is completely filled, it vanishes — clearing space and earning points. If the player clears lines on consecutive placements, a combo multiplier kicks in, dramatically increasing the score. Strategic players keep the board balanced, leave room for large pieces, and set up chain reactions.

The pieces cannot be rotated. This is the core challenge. You must work with what you're given, plan ahead, and make every placement count.

### Step 3 — Game Over and Score Submission

The game ends when no remaining piece can fit anywhere on the grid. The player sees their final score and has two choices: play again for fun, or **submit the score to the blockchain**. Submitting costs a tiny gas fee on Celo (fractions of a cent) and permanently records the score on the weekly leaderboard.

### Step 4 — Compete in Tournaments

Beyond free play, players can enter tournaments. A tournament has a USDC entry fee (e.g., $1, $5, $10), a time window, and a player cap. Everyone plays with the same rules. At the end, the prize pool is distributed: 50% to first place, 25% to second, 15% to third, with 5% going to the protocol as revenue. Entry fees and prizes are paid in USDC — real dollar value, no volatile tokens.

### Step 5 — Share and Flex

After a great game, players can share their score as a Farcaster cast — a social post that shows their score, max combo streak, and a link to play. This creates an organic viral loop: people see scores in their feed, tap to play, and submit their own scores.

---

## The 22 Game Pieces

Blokaz includes 22 unique shapes organized into 7 families, each with different strategic properties:

**Singles & Dominoes** (3 pieces) — The smallest shapes. A single square, a horizontal pair, and a vertical pair. These are lifesavers for filling isolated gaps but appear less frequently than you'd hope.

**Straight Lines** (6 pieces) — Horizontal and vertical lines in lengths of 3, 4, and 5. The 5-long lines are the rarest and most powerful — placing one at the right moment can clear an entire row instantly.

**Squares** (3 pieces) — The 2×2, 3×3, and 2×3 blocks. The 3×3 square is the most feared piece in the game. It's massive, hard to place, and will end your run if you haven't kept a large open area on the board.

**Small L-Shapes** (4 pieces) — Three-cell corner pieces in all four orientations. Versatile and common. Good players use these to build structures that set up multi-line clears.

**Large L-Shapes** (4 pieces) — Five-cell L-shapes that span 3 rows or columns. These demand careful positioning but reward strategic placement with multiple line clears.

**T-Shape** (1 piece) — A classic T made of four cells. Useful for bridging gaps between partial rows and columns.

**Zigzag S/Z** (2 pieces) — Four-cell shapes that step diagonally. Tricky to place without creating annoying one-cell gaps, but skilled players use them to interlock with other shapes efficiently.

Each piece has a weighted probability of appearing. Common shapes (3-cell L-shapes, 2×2 squares) appear frequently. Dangerous shapes (3×3 square, 5-long lines) are rare — but when they show up, you'd better have room.

---

## How Blockchain Makes This Better

### The Problem with Traditional Leaderboards

In every mobile puzzle game, leaderboards are meaningless. Scores are self-reported, trivially hackable, and stored on a company's server that can be shut down, wiped, or manipulated. Players with modded APKs routinely top global rankings. There's no way to prove a score is legitimate, and there's no way to attach real stakes to competition.

### How Blokaz Solves This

**Verifiable scores.** Before each game, the player commits a cryptographic seed to the blockchain. This seed determines the entire sequence of pieces they'll receive. After the game, the player submits a compact proof — a record of every move they made. The smart contract spot-checks this proof against the committed seed to verify the game was played legitimately. Cheating would require predicting which moves the contract will check, which is computationally infeasible.

**Permissionless tournaments.** Anyone can create a tournament by setting an entry fee, a time window, and a player cap. The smart contract holds all entry fees in escrow and distributes prizes automatically when the tournament ends. No tournament organizer can run off with the money. No middleman takes a hidden cut. The rules are public code.

**Stable-value prizes.** All economic activity uses USDC — Celo's dollar-pegged stablecoin. Players know exactly what they're winning. There's no token speculation, no "your prize dropped 40% while you were sleeping." A $10 entry fee means a $10 entry fee.

**Permanent records.** Every submitted score lives on the Celo blockchain forever. A player's gaming history is their own — portable, verifiable, and independent of any company's continued existence.

---

## Business Model

Blokaz generates revenue through a single, transparent mechanism: a **5% protocol fee on tournament prize pools**.

### Revenue Math

When a player pays a $5 tournament entry fee, here's where that money goes:

```
$5.00  Entry fee
─────────────────────────
$2.50  → 1st place prize (50%)
$1.25  → 2nd place prize (25%)
$0.75  → 3rd place prize (15%)
$0.25  → Protocol revenue (5%)
$0.25  → Weekly leaderboard reward pool (5%)
```

The protocol earns $0.25 per entry. In a 20-player tournament with $5 entry, the total pool is $100 and protocol revenue is $5.

### Revenue Projections (Conservative)

| Metric | Month 1 | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|---------|----------|
| Daily Active Players | 200 | 1,000 | 5,000 | 15,000 |
| Tournament Entries / Day | 50 | 300 | 2,000 | 8,000 |
| Avg Entry Fee | $2 | $3 | $3 | $5 |
| Daily Tournament Volume | $100 | $900 | $6,000 | $40,000 |
| Daily Protocol Revenue (5%) | $5 | $45 | $300 | $2,000 |
| Monthly Protocol Revenue | $150 | $1,350 | $9,000 | $60,000 |

These numbers assume organic growth through Farcaster's social graph with no paid marketing. The Farcaster ecosystem currently has hundreds of thousands of active users, and MiniApps with gaming mechanics (like Farcaster Frames games) have historically seen strong viral adoption.

### Why No Custom Token

Many crypto games launch a token. Blokaz deliberately does not, for several reasons:

**Regulatory clarity.** A game that accepts and pays out stablecoins is far simpler from a regulatory perspective than one that issues its own token. There's no security classification question, no need for legal opinions, and no risk of the token being treated as an unregistered security.

**Player trust.** Players understand dollars. They don't understand "BLKZ tokens that might be worth something later." By using USDC, Blokaz eliminates the speculation layer entirely. The value proposition is simple: "Put up $5, win up to $50."

**Faster MVP.** Token launches require liquidity bootstrapping, exchange listings, tokenomics design, and ongoing market-making. None of that is necessary for a game. It's engineering effort that doesn't make the game more fun.

**Future optionality.** If Blokaz reaches a scale where a governance or utility token makes sense (e.g., for community-driven game parameter voting), it can be introduced later. Starting without one preserves that option without committing to it prematurely.

---

## Target Audience

### Primary: Farcaster-Native Crypto Users

These are people who already have a Warpcast account and a Celo-compatible wallet. They're familiar with stablecoins and comfortable with small on-chain transactions. They're looking for fun things to do inside the Farcaster ecosystem. This audience requires zero onboarding — they can start playing immediately.

### Secondary: Casual Puzzle Gamers

Block Blast has over 100 million downloads across app stores. The gameplay mechanic is proven and widely loved. Blokaz targets the subset of these players who are curious about crypto gaming but haven't found an entry point that's simple enough. The MiniApp format means no app download, no wallet setup tutorial, and no seed phrase management.

### Tertiary: Competitive Micro-Stakers

A growing niche of players who enjoy low-stakes competitive wagering — think daily fantasy sports or poker microstakes. Blokaz tournaments with $1–$10 entry fees serve this audience perfectly. The skill component (it's a puzzle, not a slot machine) makes it feel like a fair competition rather than gambling.

---

## Competitive Landscape

### vs. Block Blast (Hungry Studio)

Block Blast is the direct gameplay inspiration. It's a free mobile app with ads and no real-money component. Blokaz differentiates on three axes: verifiable competition (on-chain scores), real-money stakes (USDC tournaments), and social integration (Farcaster native). Block Blast players who want to prove they're actually good — and get rewarded for it — are the ideal conversion target.

### vs. Existing Crypto Games (Axie, StepN, etc.)

Most crypto games require significant upfront investment, complex tokenomics understanding, and feel more like financial products than games. Blokaz is the opposite: zero upfront cost to play, optional USDC entry only for tournaments, and gameplay that stands on its own merit without any blockchain interaction. The blockchain is invisible infrastructure, not the selling point.

### vs. Farcaster Frame Games

Several simple games have been built as Farcaster Frames (static image-based mini-games). Blokaz is a full MiniApp — interactive, real-time, with Canvas rendering and touch controls. It's a generational leap in what's possible inside the Farcaster client.

---

## Growth Strategy

### Phase 1 — Farcaster Organic (Months 1–3)

Launch the MiniApp and let the social mechanics do the work. Every score shared as a cast becomes a playable link. The "can you beat my score?" mechanic is inherently viral within Farcaster's social graph. Focus on making the game fun and the sharing experience seamless.

### Phase 2 — Community Tournaments (Months 3–6)

Enable user-created tournaments. Farcaster community leaders (channel owners, influencers) create tournaments for their communities with custom entry fees. This creates a decentralized tournament ecosystem where Blokaz earns fees on every tournament without having to organize any of them.

### Phase 3 — Sponsored Tournaments (Months 6–12)

Partner with Celo ecosystem projects to sponsor tournaments. A DeFi protocol might fund a $1,000 prize pool tournament to get attention. Blokaz takes the 5% fee and the sponsor gets visibility. This creates a B2B revenue stream alongside the P2P tournament fees.

### Phase 4 — Expansion (Year 2+)

Potential expansion paths include daily challenge mode (same seed for all players, pure skill comparison), NFT skins for blocks (cosmetic, purchasable with USDC), multiplayer duels (two players, same pieces, real-time race), and integration with other MiniApp platforms beyond Farcaster.

---

## Technical Advantages

### Why Celo?

Celo was chosen for specific technical reasons that directly benefit a real-time game. Transaction finality on Celo is approximately 5 seconds, which means score submissions confirm quickly. Gas fees are extremely low — fractions of a cent per transaction — which means submitting a score is essentially free. And USDC is a first-class citizen on Celo, unlike on chains where stablecoins are third-party additions.

### Why Farcaster MiniApp?

The MiniApp format solves the distribution problem that kills most crypto games. Players don't need to find, download, and install an app. They don't need to create accounts or manage wallets. They tap a link in their social feed and they're playing. The Farcaster client handles wallet connection, transaction signing, and identity — all natively.

### Why Client-Side Game Logic?

The entire game engine runs in the player's browser. There's no game server, no WebSocket connection, no latency. Piece placement is instant. Line clears animate immediately. The blockchain is only involved at two moments: starting a game (committing the seed) and ending a game (submitting the score). Between those two points, it's just a fast, fun puzzle game.

---

## Team Requirements (MVP)

| Role | Scope | Duration |
|------|-------|----------|
| Frontend / Game Developer | TypeScript, Canvas, React, Wagmi | 4–5 weeks |
| Smart Contract Developer | Solidity, Foundry, Celo deployment | 2–3 weeks (can overlap) |
| Designer | Game UI, piece colors, animations, brand | 1–2 weeks |

A skilled full-stack developer with Solidity experience could build the entire MVP solo in 5–6 weeks. The architecture is deliberately designed for a small team or even a single builder.

---

## Key Metrics to Track

| Metric | What It Tells You |
|--------|-------------------|
| **Games Played / Day** | Core engagement — is the game fun? |
| **Score Submissions / Day** | Blockchain adoption — do players care about competing? |
| **Avg Score** | Difficulty tuning — is the game too easy or too hard? |
| **Combo Distribution** | Skill curve — are players learning to chain? |
| **Tournament Fill Rate** | Economic demand — are players willing to stake USDC? |
| **Tournament Creation Rate** | Community health — are users creating their own competitions? |
| **Protocol Revenue / Week** | Business viability — is the 5% fee generating meaningful revenue? |
| **Shares / Game** | Virality — are players bringing in new players? |
| **Retention (D1, D7, D30)** | Stickiness — do players come back? |
| **Avg USDC Staked / Player** | Monetization depth — how much are players willing to put up? |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Game isn't fun enough | Medium | Fatal | Extensive playtesting before launch. Scoring formula tuning. The Block Blast mechanic is proven — execution quality is the variable. |
| Farcaster MiniApp SDK limitations | Medium | High | Build browser fallback mode from day one. Game works outside Farcaster with standard wallet connect. |
| Low tournament participation | Medium | High | Start with very low entry fees ($0.50–$1). Seed initial tournaments with house funds. Make free play genuinely fun so tournament play is a natural escalation. |
| Smart contract vulnerability | Low | Critical | Foundry invariant testing. Formal audit before mainnet. UUPS upgrade path for emergency fixes. Start with low tournament caps. |
| Celo network issues | Low | Medium | Game is playable offline. Scores queue for submission. UX degrades gracefully. |
| Regulatory challenge on tournaments | Low | High | USDC-only (no custom token). Skill-based competition (not chance). Geographic restrictions if needed. Legal review before large-scale launch. |

---

## Summary

Blokaz takes a proven, beloved puzzle mechanic and adds three things that make it meaningfully better: verifiable competition, real-money stakes, and social virality. It does this without any of the complexity that typically makes crypto games unapproachable — no custom tokens, no complicated onboarding, no speculation.

The game is fun first. The blockchain is invisible infrastructure that makes the competition trustworthy and the rewards real. Players play because the puzzle is satisfying. They compete because the stakes are meaningful. They share because beating their friends is universal.

Build the game. Let people play. Take 5%.
