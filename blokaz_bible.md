# BLOKAZ BIBLE
### The Definitive Product Reference

---

## 1. THE IDEA IN ONE PARAGRAPH

Blokaz is an onchain block puzzle game. Players drop tetromino-style pieces onto a 9×9 grid, clear lines to score, and compete on weekly global leaderboards or paid tournaments. Every game session is cryptographically committed to the blockchain before it starts — the player's move sequence and final score are verifiable without trusting the client. Prizes are distributed automatically in USDC. There is no native token, no speculation, and no fluff. The product is built to live natively inside Farcaster as a MiniApp and runs on Celo.

---

## 2. PRODUCT PILLARS

| Pillar | What it means |
|--------|---------------|
| **Skill, not luck** | Piece sequence is deterministic from a seed — your score reflects how well you play, not a dice roll |
| **Verifiable on-chain** | Moves are committed, spot-checked, and scored on Celo — no trusted game server |
| **USDC-native** | All money in and out is dollar-pegged; no token required, no swap needed |
| **Farcaster-first** | Runs as a Farcaster MiniApp via MiniPay; social sharing is native |
| **Zero-wait gameplay** | All game logic runs locally; blockchain calls only happen at session start and end |

---

## 3. THE GAME

### Board
- 9×9 grid (81 cells)
- Cells are empty or occupied by a color (1–8)
- Stored internally as `Uint8Array(81)` for efficiency

### Pieces
- 22 distinct shapes, fixed orientation (no rotation by the player)
- Families: single, domino, straight lines, squares, L-shapes, big-L, T-shapes, zigzags
- Cell counts range from 1 (single) to 6 (large shapes)
- Each shape has a spawn weight; total weight pool = 148

**Spawn Weight Distribution:**
```
Singles & Dominoes   21 / 148  (14%)
Straight Lines       44 / 148  (30%)
Squares              10 / 148  (7%)
L-shapes             34 / 148  (23%)
Big L-shapes         10 / 148  (7%)
T-shapes             16 / 148  (11%)
Zigzags              12 / 148  (8%)
```

### Piece Delivery
- 3 pieces are dealt to the player at a time
- When all 3 are placed, 3 new pieces are dealt
- Piece sequence is determined entirely by the session seed (deterministic RNG)

### Placement Rules
- A piece must fit within grid bounds — no overflow
- A piece cannot overlap any occupied cell
- No rotation — each piece has one fixed orientation

### Clearing Lines
- A complete row OR complete column is cleared instantly after each placement
- Multiple lines can clear simultaneously
- Clearing triggers the combo system

### Game Over
- Game ends when none of the 3 current pieces can be legally placed anywhere on the board

---

## 4. SCORING SYSTEM

```
Score per move = Base Points + Line Points + Combo Bonus

Base Points  = number of cells in the placed piece (1–6)
Line Points  = lines cleared × 90
Combo Bonus  = lines cleared × current combo streak × 50
```

**Combo Streak:**
- Increments by 1 each time you clear at least one line
- Resets to 0 on any move that clears no lines

**Example — placing a 4-cell piece that clears 2 lines with a combo streak of 3:**
```
Base    =   4
Lines   =   2 × 90 = 180
Combo   =   2 × 3  × 50 = 300
Total   = 484 points
New streak = 4
```

High scores require sustained combos. A player who clears a line every move will dramatically outperform one who places optimally but breaks their streak.

---

## 5. DETERMINISTIC RNG

The game uses **xorshift64+**, a fast, non-cryptographic PRNG seeded by a 32-byte value the player generates client-side.

- Same seed → identical piece sequence → identical score for identical move sequence
- This is the foundation of the on-chain verification model
- The contract never needs to replay the entire game; it only spot-checks 3 random moves

---

## 6. CORE GAME LOOP (UX)

```
Connect Wallet
      ↓
[Classic Mode]                    [Tournament Mode]
      ↓                                 ↓
Client generates 32-byte seed    Browse active tournaments
      ↓                                 ↓
Compute seedHash on client        Approve USDC → Join Tournament
      ↓                                 ↓
Call startGame(seedHash)          Call startTournamentGame(tid, seedHash)
      ↓                                 ↓
Play entirely offline (no RPC)   Play entirely offline (no RPC)
      ↓                                 ↓
Game Over modal                   Game Over modal
      ↓                                 ↓
Pack moves into proof             Submit tournament score
      ↓                                 ↓
Call submitScore(proof)           Wait for tournament end
      ↓                                 ↓
Leaderboard updates on-chain      Owner finalizes → USDC distributed
```

---

## 7. ON-CHAIN VERIFICATION MODEL

### Why This Works Without a Server

Blokaz uses a **commit-reveal + spot-check** scheme:

1. **Commit phase:** Before gameplay, the player commits `keccak256(seed ++ playerAddress)` on-chain. The contract records only the hash. The seed stays secret until game end.

2. **Reveal phase:** On submission, the player reveals the raw seed. The contract re-hashes it and verifies it matches the stored commitment. If it doesn't, the game is rejected.

3. **Spot-check phase:** The contract uses `block.prevrandao` to deterministically pick 3 move indices. It re-runs the RNG from the revealed seed for each of those indices and verifies that the submitted piece choice, row, and column are consistent with what the deterministic RNG would have produced. If any check fails, the game is rejected.

### What This Prevents
- **Pre-computed fake seeds:** Seed is committed before play; you can't choose a seed to match a forged score
- **Move tampering:** 3 random moves are validated against the actual RNG output
- **Double-playing:** One active game per address at a time

### What This Doesn't Prevent (Known Trade-offs)
- A sophisticated attacker could enumerate seeds until finding one that produces a favorable piece sequence — mitigated by the randomness of the 32-byte seed space
- Spot-checking 3 moves is probabilistic; a perfect cheat (wrong moves, correct spot-check) is astronomically unlikely but not zero
- Tournament score submissions do not currently spot-check moves (known gap; marked for future parity)

### Move Packing Format
Each move is 10 bits: `[pieceIndex: 2-bit | row: 4-bit | col: 4-bit]`
25 moves fit into one `uint256` word. The submission is an array of `uint256` packed words plus a move count.

---

## 8. SMART CONTRACT ARCHITECTURE

**Contract:** `BlokzGame.sol`  
**Deployed:** `0x16C3A18FDcb6905f58311C5b8a6e91e447Fefe43`  
**Network:** Celo Mainnet (chain ID 42220)  
**USDC:** `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`  
**Security:** `Ownable` + `ReentrancyGuard` + `SafeERC20`  
**Standard:** Non-upgradeable (immutable after deploy)

### Constants
```
EPOCH_DURATION    = 7 days
LEADERBOARD_SIZE  = 50 entries per epoch
PROTOCOL_FEE_BPS  = 500 (5%)
TOTAL_WEIGHT      = 148 (sum of shape weights)
```

### Key Data Structures

```solidity
struct Game {
  address player
  bytes32 seedHash    // committed before play
  uint32  score
  uint64  startedAt
  uint64  submittedAt
  GameStatus status   // ACTIVE | SUBMITTED | REJECTED
}

struct Tournament {
  address creator
  uint256 entryFee    // in USDC (6 decimals)
  uint64  startTime
  uint64  endTime
  uint8   maxPlayers
  uint8   playerCount
  bool    finalized
  uint256 prizePool
}

struct LeaderboardEntry {
  address player
  uint32  score
  uint256 gameId
}
```

### State Mappings

```
games[gameId]                         → Game
activeGame[address]                   → gameId (0 = none)
gameTournament[gameId]                → tournamentId (0 = classic)
usernames[address]                    → string

tournaments[tournamentId]             → Tournament
tournamentScores[tid][address]        → uint32 (best score)
inTournament[tid][address]            → bool
_tournamentPlayers[tid]               → address[]

_leaderboards[epoch]                  → LeaderboardEntry[] (max 50)
_playerLeaderboardIndex[epoch][addr]  → uint256 (1-indexed)

protocolRevenue                       → uint256 (accumulated USDC)
weeklyRewardPool                      → uint256 (accumulated USDC)
```

### Function Reference

| Function | Caller | Description |
|----------|--------|-------------|
| `startGame(seedHash)` | Player | Commits seed hash, returns gameId |
| `submitScore(gameId, seed, moves[], score, moveCount)` | Player | Reveals seed, spot-checks moves, updates leaderboard |
| `setUsername(name)` | Player | Registers 3–16 char on-chain identity |
| `createTournament(fee, start, end, max)` | Owner | Creates paid tournament |
| `joinTournament(tournamentId)` | Player | Pays USDC entry fee |
| `startTournamentGame(tid, seedHash)` | Player (member) | Starts game within tournament |
| `submitTournamentScore(tid, gameId, seed, moves[], score, moveCount)` | Player | Submits best score to tournament |
| `finalizeTournament(tournamentId)` | Anyone post-endTime | Sorts, distributes USDC prizes |
| `getLeaderboard(epoch)` | Anyone | Returns top 50 for epoch |
| `getCurrentEpoch()` | Anyone | `block.timestamp / 7 days` |
| `withdrawProtocolRevenue()` | Owner | Sends accumulated 5% fees to owner |
| `withdrawWeeklyRewardPool(to)` | Owner | Sends weekly pool to address |

### Events

```
GameStarted(gameId, player)
ScoreSubmitted(gameId, player, score)
TournamentCreated(tournamentId, creator, entryFee)
TournamentJoined(tournamentId, player)
TournamentGameStarted(tournamentId, gameId, player)
TournamentScoreSubmitted(tournamentId, player, score)
TournamentFinalized(tournamentId, winner, prize)
UsernameRegistered(player, username)
```

### Custom Errors (gas-efficient)

```
AlreadyHasActiveGame      GameNotActive          NotGameOwner
InvalidSeed               SpotCheckFailed
TournamentNotFound        TournamentFull         AlreadyInTournament
TournamentNotStarted      TournamentAlreadyEnded TournamentNotOver
TournamentAlreadyFinalized NotInTournament       InvalidTournamentParams
UsernameTooShort          UsernameTooLong
```

### Leaderboard Mechanics
- Maintained as a sorted array, max 50 entries per epoch
- Bubble-sort on insertion: new entry placed at bottom, bubbled up
- Player already on board: only update if new score is higher
- Board full (50 players): new entry only displaces last place if score is strictly higher
- `_playerLeaderboardIndex` uses 1-indexing (0 = "not on board")

---

## 9. FRONTEND ARCHITECTURE

**Stack:** React 18 + TypeScript + Vite 5 + Tailwind 3  
**Web3:** Wagmi 2 + Viem 2 + RainbowKit 2 + TanStack Query 5  
**State:** Zustand 4  
**Render:** Native HTML5 Canvas 2D with requestAnimationFrame

### Views

| Route (hash) | View |
|---|---|
| `#/classic` (default) | Free play + global leaderboard |
| `#/tournaments` | Tournament lobby |
| `#/tournaments/play` | Active tournament game |
| `#/admin` | Owner dashboard (create tournaments, withdraw revenue) |

### Component Map

```
App.tsx
├── Header (nav tabs, wallet status)
├── GameScreen (canvas game, classic mode)
│   ├── ScoreBar (live score + combo)
│   ├── ComboOverlay (animated burst)
│   └── GameOverModal (score submit + leaderboard teaser)
├── Leaderboard (on-chain top 50, username registration)
├── TournamentHall (browse tournaments)
│   └── TournamentSection (individual card, join button)
├── TournamentGameScreen (canvas game, tournament mode)
│   └── TournamentLeaderboard (standings for tournament)
└── AdminDashboard (owner only)
```

### Canvas Rendering
- `GridRenderer` — draws 9×9 board and placed pieces
- `PieceRenderer` — draws 3-piece queue and ghost preview on hover
- `TouchController` — mouse/touch drag-and-drop input
- `AnimationManager` — line-clear effects, combo burst, floating score text

### Wallet Strategy

```
Environment    Connector         Notes
MiniPay        injected()        Auto-connect via window.ethereum
Browser        RainbowKit        WalletConnect + injected options
```

Both connect to Celo Mainnet. WalletConnect projectId needs to be set before production.

### Zustand Game Store (Key Fields)

```typescript
gameSession: GameSession | null
score: number
comboStreak: number
currentPieces: (ShapeDefinition | null)[]
isGameOver: boolean
onChainGameId: bigint | null
onChainSeed: `0x${string}` | null
onChainStatus: 'none' | 'pending' | 'syncing' | 'registered' | 'failed'
tournamentId: bigint | null
```

### Session Persistence
Game state is persisted to `localStorage` with separate keys for classic and tournament modes. Allows game recovery after accidental page refresh.

---

## 10. REVENUE MODEL

### Fee Structure

All revenue flows from paid tournaments. Classic play is free.

```
Tournament prize pool = sum of all entry fees

Distribution on finalize:
  ≥3 players:  1st 50% | 2nd 25% | 3rd 15% | Protocol 5% | Weekly 5%
   2 players:  1st 60% | 2nd 30%            | Protocol 5% | Weekly 5%
   1 player:   1st 90%                       | Protocol 5% | Weekly 5%
```

### Revenue Streams

| Stream | Mechanism | Owner Control |
|--------|-----------|---------------|
| **Protocol Revenue** | 5% of every tournament pool | `withdrawProtocolRevenue()` |
| **Weekly Reward Pool** | 5% of every tournament pool | `withdrawWeeklyRewardPool(to)` — can fund external incentives |

### Example Math

| Players | Entry Fee | Pool | Protocol | Weekly | Top Prizes |
|---------|-----------|------|----------|--------|------------|
| 10 | $1 | $10 | $0.50 | $0.50 | $9.00 |
| 50 | $5 | $250 | $12.50 | $12.50 | $225 |
| 100 | $10 | $1,000 | $50 | $50 | $900 |

### Why USDC Only

- No speculation mechanic — players understand exact dollar value
- No token liquidity to bootstrap or maintain
- Celo USDC is bridged and widely available
- Works natively with MiniPay (Farcaster default wallet)

### Weekly Reward Pool Use Cases
- Fund leaderboard prize rewards for top-N global players
- Sponsor community tournaments (create tournament, seed prize from this pool)
- Future: locked incentive programs, referral bonuses

---

## 11. COMPETITIVE STRUCTURE

### Classic Mode (Free)
- No entry fee, no prizes
- Scores compete on the global weekly leaderboard
- Resets every 7 days (on-chain epochs)
- Top 50 per epoch stored on-chain permanently
- Incentive: reputation, username on leaderboard, Farcaster social proof

### Tournament Mode (Paid)
- Owner creates tournament with: entry fee, start/end time, max players
- Players join by paying USDC (must approve USDC spend first)
- Each player can start one game within the tournament time window
- Best score per player is recorded; lower subsequent scores are ignored
- After end time, anyone can call `finalizeTournament()` to distribute prizes
- Max 50 players per tournament (governed by `maxPlayers` param, min 2)

### On-Chain Leaderboard Epoch Structure
```
Epoch 0: block 0 → day 7
Epoch 1: day 7 → day 14
...
Current epoch = block.timestamp / 604800 (seconds in 7 days)
```

Scores from different epochs never compete. A new epoch is a clean slate.

---

## 12. IDENTITY SYSTEM

Players can register a username (3–16 characters) stored on-chain:
- Unique per address (not globally unique — first write wins per address)
- Displayed on leaderboards
- Emits `UsernameRegistered` event (indexable for off-chain UIs)
- No cost beyond gas

---

## 13. TECHNOLOGY STACK SUMMARY

| Layer | Technology | Version |
|-------|-----------|---------|
| Blockchain | Celo Mainnet | chain ID 42220 |
| Smart Contract | Solidity + Foundry | 0.8.x |
| Frontend Framework | React + TypeScript | 18.2 / 5.x |
| Build Tool | Vite | 5.2 |
| Styling | Tailwind CSS | 3.4 |
| Web3 Abstraction | Wagmi + Viem | 2.14 / 2.21 |
| Wallet UI | RainbowKit | 2.2 |
| Data Fetching | TanStack Query | 5.99 |
| State Management | Zustand | 4.5 |
| Rendering | HTML5 Canvas 2D | Native |
| MiniApp Platform | Farcaster (MiniPay) | SDK v1 |
| RNG Algorithm | xorshift64+ | Custom impl |
| Contract Tests | Forge (Foundry) | Latest |
| Frontend Tests | Vitest | Latest |
| Stablecoin | USDC (Celo) | 6 decimals |

---

## 14. SECURITY MODEL SUMMARY

| Threat | Mitigation |
|--------|-----------|
| Fake score submission | Seed commit-reveal; seed hash stored before play |
| Tampered move sequence | Spot-check: 3 random moves re-derived from seed on-chain |
| Concurrent game abuse | `activeGame` mapping enforces one game per address |
| Reentrancy in prize distribution | `ReentrancyGuard` on `joinTournament`, `finalizeTournament` |
| ERC-20 transfer failure | `SafeERC20` wrapper on all USDC transfers |
| Unauthorized prize withdrawal | Only owner can withdraw protocol/weekly revenue |
| Tournament result manipulation | `finalized` flag prevents double-finalization |

---

## 15. KNOWN GAPS & FUTURE WORK

| Gap | Severity | Notes |
|-----|----------|-------|
| Tournament score submissions lack spot-check | Medium | Same seed-reveal flow exists; spot-check can be added in parity with classic |
| WalletConnect projectId placeholder | High (blocking prod) | Must replace before mainnet browser launch |
| Weekly reward pool payout logic is manual | Low | Owner decides distribution; could be automated via merkle drop |
| No off-chain indexer | Low | Events are emitted; a subgraph or custom indexer would enable richer leaderboard history |
| No username uniqueness guarantee | Low | First-write-wins per address; globally unique usernames would require a registry |
| Leaderboard capped at 50 | Accepted | By design; historical epochs are permanent so players can track past placement |
| `maxPlayers` param isn't enforced above 255 | Low | `uint8` limits max tournament size to 255 |

---

## 16. DEVELOPMENT STATUS

| Phase | Status | Scope |
|-------|--------|-------|
| 0 — Scaffold | Complete | Vite + React + TS + Tailwind + Foundry |
| 1 — Game Engine | Complete | RNG, grid, shapes, scoring, replay (33 tests passing) |
| 2 — Canvas UI | Complete | Rendering, animations, drag-drop |
| 3 — Smart Contracts | Complete | Full contract + 16 Forge tests |
| 4 — Chain Integration | In Progress | Wagmi hooks done; UI wiring partial |
| 5 — Farcaster Polish | Pending | MiniApp manifest, haptics, social sharing |
| 6 — QA & Hardening | Pending | Fuzz testing, edge cases, mainnet verification |

---

## 17. GO-TO-MARKET SUMMARY

**Primary distribution:** Farcaster MiniApp — zero install friction, wallet already embedded (MiniPay), native social sharing

**Target user:**
- Farcaster-native crypto user who already holds USDC on Celo
- Casual puzzle game player who wants a stake in the outcome
- Competitive leaderboard players motivated by on-chain reputation

**Growth mechanics:**
- Share score to Farcaster cast after each game (built-in CTA)
- Weekly leaderboard reset creates recurring engagement loop
- Tournament countdowns and prize pool displays create urgency
- Username system creates identity investment

**Monetization trigger:** Tournaments. Classic mode is the funnel; tournaments are the conversion.

**Revenue ceiling:** Proportional to tournament volume. No inflation, no dilution. Protocol earns exactly 5% of all tournament action.

---

## 18. KEY FILE REFERENCE

```
contracts/src/BlokzGame.sol          ← Single source of truth for all on-chain logic
src/engine/game.ts                   ← GameSession class (core game loop)
src/engine/shapes.ts                 ← All 22 piece definitions with weights
src/engine/rng.ts                    ← Deterministic xorshift64+ RNG
src/engine/scoring.ts                ← Score formula
src/engine/replay.ts                 ← Move packing + GameProof builder
src/hooks/useBlokzGame.ts            ← All Wagmi contract hooks (15+ functions)
src/stores/gameStore.ts              ← Zustand global state
src/components/GameScreen.tsx        ← Main game UI
src/components/TournamentHall.tsx    ← Tournament lobby
src/components/AdminDashboard.tsx    ← Owner controls
src/config/wagmi.ts                  ← Chain + wallet configuration
src/contract.json                    ← Deployed address reference
src/constants/abi.ts                 ← Contract ABI
```

---

## 19. DEPLOYED ADDRESSES

| Network | Contract | Address |
|---------|----------|---------|
| Celo Mainnet | BlokzGame | `0x16C3A18FDcb6905f58311C5b8a6e91e447Fefe43` |
| Celo Mainnet | USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |

---

*This document reflects the codebase as of April 2026. Update on each major contract deployment or game mechanics change.*
