# Blokaz — Technical Architecture

## A Block Blast–Style Puzzle Game as a Celo Farcaster MiniApp

**Version 2.0 — USDC Native Economy**

---

## 1. Product Overview

Blokaz is a competitive block-placement puzzle game running as a **Farcaster MiniApp** on the **Celo blockchain**. Players drag and drop geometric pieces onto a 9×9 grid, clear rows and columns, chain combos, and compete for high scores. Blockchain integration enables verifiable scores, USDC-staked tournaments, on-chain leaderboards, and direct USDC prize payouts — all while keeping the core gameplay loop fast, fluid, and 100% client-side.

### 1.1 Design Principles

| Principle | Implication |
|-----------|-------------|
| **Game-first** | All game logic runs in the browser. Zero latency for piece placement, line clears, and combos. The chain is never in the critical rendering path. |
| **Prove, don't trust** | Final scores are committed with a deterministic replay proof so the contract can verify legitimacy without simulating the game on-chain. |
| **MiniApp-native** | Built on the Farcaster MiniApp SDK with Wagmi + Celo. Wallet connection, transactions, and haptic feedback use the SDK's native primitives. |
| **USDC standard** | All economic activity (tournament fees, prizes, rewards) flows through USDC — Celo's dollar-pegged stablecoin. No custom token, no speculation, no regulatory friction. |
| **MVP velocity** | Single smart contract, single frontend bundle, no backend server required for core play. A thin optional API only for relay/indexing. |

### 1.2 Why USDC Only (No Custom Token)

Custom game tokens create three problems that slow down an MVP: they require liquidity bootstrapping, they invite speculative behavior that distracts from gameplay, and they add regulatory surface area. By using USDC exclusively, Blokaz achieves real-money prize pools from day one, zero token management overhead, stable and predictable economics for players, and instant familiarity for anyone in the Celo ecosystem. The game monetizes through protocol fees on tournament prize pools (5%), not through token inflation or sales.

---

## 2. High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   FARCASTER CLIENT                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │              BLOKAZ MINIAPP (React)                │  │
│  │                                                    │  │
│  │  ┌──────────┐  ┌────────────┐  ┌───────────────┐  │  │
│  │  │  Game    │  │  Blockchain│  │   MiniApp     │  │  │
│  │  │  Engine  │  │  Layer     │  │   SDK Layer   │  │  │
│  │  │          │  │            │  │               │  │  │
│  │  │ • Grid   │  │ • Wagmi    │  │ • sdk.ready() │  │  │
│  │  │ • Pieces │  │ • Contract │  │ • QuickAuth   │  │  │
│  │  │ • Score  │  │   Hooks    │  │ • Haptics     │  │  │
│  │  │ • Combos │  │ • Tx Batch │  │ • Share       │  │  │
│  │  │ • RNG    │  │            │  │               │  │  │
│  │  └────┬─────┘  └─────┬──────┘  └───────┬───────┘  │  │
│  │       │              │                  │          │  │
│  │       └──────────────┼──────────────────┘          │  │
│  │                      │                             │  │
│  └──────────────────────┼─────────────────────────────┘  │
│                         │                                │
└─────────────────────────┼────────────────────────────────┘
                          │  EIP-1193 Provider
                          ▼
              ┌───────────────────────┐
              │    CELO BLOCKCHAIN    │
              │                       │
              │  ┌─────────────────┐  │
              │  │  BlokzGame.sol  │  │
              │  │                 │  │
              │  │ • Game Registry │  │
              │  │ • Leaderboard   │  │
              │  │ • Tournaments   │  │
              │  │ • Score Verify  │  │
              │  │ • USDC Vault    │  │
              │  └─────────────────┘  │
              │                       │
              │  ┌─────────────────┐  │
              │  │  USDC (ERC-20)  │  │
              │  │  0xcebA9300...  │  │
              │  └─────────────────┘  │
              └───────────────────────┘
```

---

## 3. Game Engine (Client-Side)

The game engine is a **pure TypeScript module** with zero blockchain dependencies. It is deterministic: given the same seed, it produces the same sequence of pieces and the same score for the same moves.

### 3.1 Grid Model

```
GRID: 9 columns × 9 rows = 81 cells
Coordinate system: (row, col) where (0,0) is top-left

Internal representation:
  grid: uint8[9][9]
    0 = empty
    1–8 = color ID (for rendering only; gameplay is color-blind)
```

The grid is stored as a flat `Uint8Array(81)` for performance and for cheap hashing when building the replay proof.

### 3.2 Complete Shape Catalog

Blokaz ships with **22 unique shape definitions** organized into 7 families. Each shape is an array of `[row, col]` offsets from a canonical origin `(0,0)`. Shapes are **never rotated** by the player (a core Block Blast rule), but the catalog includes all fixed orientations as separate shapes.

#### Family 1 — Single & Domino (3 shapes)

```
ID: S1       ID: D1       ID: D2
 ■            ■ ■          ■
                            ■
Cells: 1     Cells: 2     Cells: 2

S1: [[0,0]]
D1: [[0,0],[0,1]]            (horizontal domino)
D2: [[0,0],[1,0]]            (vertical domino)
```

#### Family 2 — Straight Lines (6 shapes)

```
ID: I3H      ID: I3V      ID: I4H
 ■ ■ ■        ■            ■ ■ ■ ■
               ■
               ■

ID: I4V      ID: I5H      ID: I5V
 ■            ■ ■ ■ ■ ■    ■
 ■                          ■
 ■                          ■
 ■                          ■
                            ■

I3H: [[0,0],[0,1],[0,2]]
I3V: [[0,0],[1,0],[2,0]]
I4H: [[0,0],[0,1],[0,2],[0,3]]
I4V: [[0,0],[1,0],[2,0],[3,0]]
I5H: [[0,0],[0,1],[0,2],[0,3],[0,4]]
I5V: [[0,0],[1,0],[2,0],[3,0],[4,0]]
```

#### Family 3 — Squares (3 shapes)

```
ID: O2       ID: O3       ID: O23
 ■ ■          ■ ■ ■        ■ ■
 ■ ■          ■ ■ ■        ■ ■
              ■ ■ ■        ■ ■

O2:  [[0,0],[0,1],[1,0],[1,1]]                          (2×2)
O3:  [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],
      [2,0],[2,1],[2,2]]                                 (3×3)
O23: [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]]               (2×3)
```

#### Family 4 — L-Shapes (4 shapes, all fixed orientations)

```
ID: L2A      ID: L2B      ID: L2C      ID: L2D
 ■            ■ ■            ■          ■ ■
 ■ ■          ■            ■ ■              ■

L2A: [[0,0],[1,0],[1,1]]       (bottom-right)
L2B: [[0,0],[0,1],[1,0]]       (top-right)
L2C: [[0,1],[1,0],[1,1]]       (top-left)
L2D: [[0,0],[0,1],[1,1]]       (top-right mirror)
```

#### Family 5 — Large L-Shapes (4 shapes)

```
ID: L3A           ID: L3B           ID: L3C           ID: L3D
 ■                ■ ■ ■             ■ ■ ■                 ■
 ■                    ■             ■                     ■
 ■ ■ ■                                                ■ ■ ■

L3A: [[0,0],[1,0],[2,0],[2,1],[2,2]]
L3B: [[0,0],[0,1],[0,2],[1,2]]
L3C: [[0,0],[0,1],[0,2],[1,0]]
L3D: [[0,2],[1,2],[2,0],[2,1],[2,2]]
```

#### Family 6 — T-Shape (1 shape)

```
ID: T1
 ■ ■ ■
   ■

T1: [[0,0],[0,1],[0,2],[1,1]]
```

#### Family 7 — S/Z Zigzag Shapes (2 shapes)

```
ID: S1Z          ID: Z1Z
   ■ ■           ■ ■
 ■ ■                ■ ■

S1Z: [[0,1],[0,2],[1,0],[1,1]]
Z1Z: [[0,0],[0,1],[1,1],[1,2]]
```

#### Shape Data Structure

```typescript
interface ShapeDefinition {
  id: string;                // unique key e.g. "L3A"
  family: string;            // "single"|"line"|"square"|"L"|"bigL"|"T"|"zigzag"
  cells: [number, number][]; // offsets from (0,0)
  width: number;             // bounding box
  height: number;            // bounding box
  cellCount: number;         // for scoring weight
  spawnWeight: number;       // RNG probability weight
}

const SHAPES: ShapeDefinition[] = [
  { id:"S1",   family:"single", cells:[[0,0]],                                         width:1, height:1, cellCount:1,  spawnWeight:5  },
  { id:"D1",   family:"single", cells:[[0,0],[0,1]],                                   width:2, height:1, cellCount:2,  spawnWeight:8  },
  { id:"D2",   family:"single", cells:[[0,0],[1,0]],                                   width:1, height:2, cellCount:2,  spawnWeight:8  },
  { id:"I3H",  family:"line",   cells:[[0,0],[0,1],[0,2]],                              width:3, height:1, cellCount:3,  spawnWeight:10 },
  { id:"I3V",  family:"line",   cells:[[0,0],[1,0],[2,0]],                              width:1, height:3, cellCount:3,  spawnWeight:10 },
  { id:"I4H",  family:"line",   cells:[[0,0],[0,1],[0,2],[0,3]],                        width:4, height:1, cellCount:4,  spawnWeight:8  },
  { id:"I4V",  family:"line",   cells:[[0,0],[1,0],[2,0],[3,0]],                        width:1, height:4, cellCount:4,  spawnWeight:8  },
  { id:"I5H",  family:"line",   cells:[[0,0],[0,1],[0,2],[0,3],[0,4]],                  width:5, height:1, cellCount:5,  spawnWeight:4  },
  { id:"I5V",  family:"line",   cells:[[0,0],[1,0],[2,0],[3,0],[4,0]],                  width:1, height:5, cellCount:5,  spawnWeight:4  },
  { id:"O2",   family:"square", cells:[[0,0],[0,1],[1,0],[1,1]],                        width:2, height:2, cellCount:4,  spawnWeight:10 },
  { id:"O3",   family:"square", cells:[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], width:3, height:3, cellCount:9,  spawnWeight:3 },
  { id:"O23",  family:"square", cells:[[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]],            width:2, height:3, cellCount:6,  spawnWeight:6  },
  { id:"L2A",  family:"L",      cells:[[0,0],[1,0],[1,1]],                              width:2, height:2, cellCount:3,  spawnWeight:8  },
  { id:"L2B",  family:"L",      cells:[[0,0],[0,1],[1,0]],                              width:2, height:2, cellCount:3,  spawnWeight:8  },
  { id:"L2C",  family:"L",      cells:[[0,1],[1,0],[1,1]],                              width:2, height:2, cellCount:3,  spawnWeight:8  },
  { id:"L2D",  family:"L",      cells:[[0,0],[0,1],[1,1]],                              width:2, height:2, cellCount:3,  spawnWeight:8  },
  { id:"L3A",  family:"bigL",   cells:[[0,0],[1,0],[2,0],[2,1],[2,2]],                  width:3, height:3, cellCount:5,  spawnWeight:5  },
  { id:"L3B",  family:"bigL",   cells:[[0,0],[0,1],[0,2],[1,2]],                        width:3, height:2, cellCount:4,  spawnWeight:5  },
  { id:"L3C",  family:"bigL",   cells:[[0,0],[0,1],[0,2],[1,0]],                        width:3, height:2, cellCount:4,  spawnWeight:5  },
  { id:"L3D",  family:"bigL",   cells:[[0,2],[1,2],[2,0],[2,1],[2,2]],                  width:3, height:3, cellCount:5,  spawnWeight:5  },
  { id:"T1",   family:"T",      cells:[[0,0],[0,1],[0,2],[1,1]],                        width:3, height:2, cellCount:4,  spawnWeight:6  },
  { id:"S1Z",  family:"zigzag", cells:[[0,1],[0,2],[1,0],[1,1]],                        width:3, height:2, cellCount:4,  spawnWeight:6  },
  { id:"Z1Z",  family:"zigzag", cells:[[0,0],[0,1],[1,1],[1,2]],                        width:3, height:2, cellCount:4,  spawnWeight:6  },
];
```

### 3.3 Core Gameplay Loop

```
┌─────────────────────────────────────────────────────────┐
│                     GAME LOOP                           │
│                                                         │
│  1. DEAL    → Draw 3 shapes from weighted RNG           │
│  2. PLACE   → Player drags a shape onto the grid        │
│  3. CLEAR   → Scan all 9 rows + 9 cols for full lines   │
│  4. SCORE   → Award points:                             │
│               • base = cellCount of placed piece        │
│               • line_clear = 10 × cells_in_line         │
│               • combo = cleared_lines × combo_mult      │
│  5. COMBO   → If lines cleared on this placement,       │
│               increment combo counter; else reset to 0  │
│  6. REPEAT  → If all 3 shapes placed, go to (1)         │
│  7. CHECK   → If any remaining shape cannot be placed   │
│               anywhere on the grid → GAME OVER          │
└─────────────────────────────────────────────────────────┘
```

#### Placement Validation

```typescript
function canPlace(grid: Uint8Array, shape: ShapeDefinition, row: number, col: number): boolean {
  for (const [dr, dc] of shape.cells) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= 9 || c < 0 || c >= 9) return false;
    if (grid[r * 9 + c] !== 0) return false;
  }
  return true;
}
```

#### Line Clearing

```typescript
function clearLines(grid: Uint8Array): { cleared: number; cellsCleared: number } {
  const rowsToClear: number[] = [];
  const colsToClear: number[] = [];

  for (let r = 0; r < 9; r++) {
    let full = true;
    for (let c = 0; c < 9; c++) if (grid[r * 9 + c] === 0) { full = false; break; }
    if (full) rowsToClear.push(r);
  }
  for (let c = 0; c < 9; c++) {
    let full = true;
    for (let r = 0; r < 9; r++) if (grid[r * 9 + c] === 0) { full = false; break; }
    if (full) colsToClear.push(c);
  }

  const toRemove = new Set<number>();
  for (const r of rowsToClear) for (let c = 0; c < 9; c++) toRemove.add(r * 9 + c);
  for (const c of colsToClear) for (let r = 0; r < 9; r++) toRemove.add(r * 9 + c);
  for (const idx of toRemove) grid[idx] = 0;

  return { cleared: rowsToClear.length + colsToClear.length, cellsCleared: toRemove.size };
}
```

#### Scoring Formula

```
BASE_POINTS     = piece.cellCount × 1
LINE_POINTS     = linesCleared × 10 × 9          (9 cells per line)
COMBO_BONUS     = linesCleared × comboStreak × 50
TOTAL           = BASE_POINTS + LINE_POINTS + COMBO_BONUS

Example: Place L3A (5 cells), clear 2 lines simultaneously, combo streak = 3
  BASE   = 5
  LINE   = 2 × 90 = 180
  COMBO  = 2 × 3 × 50 = 300
  TOTAL  = 485 points this placement
```

### 3.4 Deterministic RNG

The RNG is seeded from a value committed on-chain **before** the game starts, making the piece sequence reproducible for verification.

```typescript
class DeterministicRNG {
  private s0: bigint;
  private s1: bigint;

  constructor(seed: bigint) {
    this.s0 = seed;
    this.s1 = seed ^ 0xDEADBEEFCAFEn;
  }

  next(): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23n;
    s1 ^= s1 >> 17n;
    s1 ^= s0;
    s1 ^= s0 >> 26n;
    this.s1 = s1;
    return Number((this.s0 + this.s1) & 0xFFFFFFFFn) / 0xFFFFFFFF;
  }
}
```

**Piece Selection**: When dealing 3 shapes, call `rng.next()` three times. Each float maps to the weighted distribution of the 22 shapes via `spawnWeight`. The 3×3 square (weight 3) and the 1×5 lines (weight 4) are the rarest.

### 3.5 Replay Proof

Every game produces a compact proof the smart contract can verify:

```typescript
interface GameReplay {
  seed: bytes32;               // RNG seed (committed pre-game)
  moves: PackedMove[];         // each move: shapeIndex(2 bits) + row(4 bits) + col(4 bits) = 10 bits
  finalScore: uint32;
  gridHash: bytes32;           // keccak256 of final grid state
  moveCount: uint16;
}

// Moves are bit-packed: 3 moves per uint32 (10 bits × 3 = 30 bits)
// A 200-move game ≈ 67 uint32s ≈ 268 bytes calldata
```

---

## 4. Smart Contract Layer

### 4.1 Contract Architecture

A single upgradeable contract handles all on-chain state. No heavy computation happens on-chain — the contract stores results and spot-checks replays.

```
BlokzGame.sol (UUPS Upgradeable)
├── GameRegistry         — maps gameId → seed, player, status
├── Leaderboard          — top N scores per epoch (week)
├── TournamentManager    — USDC entry fees, prize pools, brackets
├── RewardVault          — holds and distributes USDC rewards
└── ScoreVerifier        — lightweight replay validation
```

### 4.2 Game Lifecycle On-Chain

```
      Player                          Contract                        Celo
        │                                │                              │
        │── startGame() ────────────────►│                              │
        │   (commit seed hash)           │── store seed hash ──────────►│
        │                                │                              │
        │   ... plays game offline ...   │                              │
        │                                │                              │
        │── submitScore(proof) ─────────►│                              │
        │   (replay + final score)       │── verify seed matches ──────►│
        │                                │── spot-check N random moves  │
        │                                │── update leaderboard ───────►│
        │                                │── emit ScoreSubmitted ──────►│
        │                                │                              │
        │◄── confirmation ──────────────│                              │
```

### 4.3 Core Contract Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBlokzGame {

    // ── Game Sessions ──────────────────────────────────────

    /// @notice Start a new game. Player commits a seed hash.
    /// @param seedHash keccak256(abi.encodePacked(seed, playerAddress))
    function startGame(bytes32 seedHash) external returns (uint256 gameId);

    /// @notice Submit final score with compact replay proof.
    function submitScore(
        uint256 gameId,
        bytes32 seed,
        uint256[] calldata moves,
        uint32 score
    ) external;

    // ── Leaderboard ────────────────────────────────────────

    /// @notice Current epoch's top scores.
    function getLeaderboard(uint256 epoch)
        external view returns (LeaderboardEntry[] memory);

    /// @notice Claim USDC reward if player is in top N of a past epoch.
    function claimReward(uint256 epoch) external;

    // ── Tournaments (USDC Entry) ───────────────────────────

    /// @notice Create a tournament with a USDC entry fee.
    function createTournament(
        uint256 entryFeeCUSD,     // in USDC (6 decimals)
        uint256 startTime,
        uint256 endTime,
        uint8 maxPlayers
    ) external returns (uint256 tournamentId);

    /// @notice Join a tournament (must have approved USDC first).
    function joinTournament(uint256 tournamentId) external;

    /// @notice Submit a tournament game score.
    function submitTournamentScore(
        uint256 tournamentId,
        uint256 gameId,
        bytes32 seed,
        uint256[] calldata moves,
        uint32 score
    ) external;

    /// @notice End tournament and distribute USDC prizes.
    function finalizeTournament(uint256 tournamentId) external;

    // ── Structs ────────────────────────────────────────────

    struct LeaderboardEntry {
        address player;
        uint32 score;
        uint256 gameId;
        uint64 timestamp;
    }
}
```

### 4.4 Score Verification Strategy

Full replay verification on-chain would cost too much gas. Blokaz uses a **probabilistic spot-check** model:

```
1. Contract re-derives the RNG from the revealed seed.
2. Picks 3 random move indices (using block.prevrandao as entropy).
3. For each picked move:
   a. Fast-forward the RNG to that move's deal.
   b. Verify the shape placed matches the shape dealt.
   c. Verify the placement coordinates are within bounds.
4. If all checks pass → score accepted.
5. If any check fails → score rejected, player flagged.
```

This gives a strong deterrent against cheating with ~80k gas per submission.

### 4.5 USDC Reward Distribution

```
WEEKLY EPOCH REWARDS (funded by tournament protocol fees)
├── Prize Pool = accumulated 5% protocol fee from all tournaments that week
├── Distribution among weekly leaderboard top 10:
│   ├── 1st place  → 35% of pool
│   ├── 2nd place  → 20%
│   ├── 3rd place  → 15%
│   ├── 4th–10th   → 25% (split equally)
│   └── Protocol   → 5% (operational reserve)
└── Paid in USDC

TOURNAMENT PRIZE DISTRIBUTION
├── Prize Pool = (entryFee × playerCount)
├── Distribution:
│   ├── 1st place  → 50% of pool
│   ├── 2nd place  → 25%
│   ├── 3rd place  → 15%
│   ├── Protocol   → 5% (revenue)
│   └── Weekly Pool → 5% (feeds weekly leaderboard rewards)
└── Paid in USDC directly to winner wallets
```

### 4.6 Storage Layout

```solidity
contract BlokzGame is UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {

    // ── Constants ──
    address public constant CUSD = 0x01C5C0122039549AD1493B8220cABEdD739BC44E; // USDC on Celo testnet
    uint256 public constant EPOCH_DURATION = 7 days;
    uint8 public constant LEADERBOARD_SIZE = 50;
    uint256 public constant PROTOCOL_FEE_BPS = 500; // 5% = 500 basis points

    // ── Game Registry ──
    struct Game {
        address player;
        bytes32 seedHash;
        uint32 score;
        uint64 startedAt;
        uint64 submittedAt;
        GameStatus status; // ACTIVE, SUBMITTED, VERIFIED, REJECTED
    }
    mapping(uint256 => Game) public games;
    uint256 public nextGameId;

    // ── Leaderboard ──
    struct LeaderboardEntry {
        address player;
        uint32 score;
        uint256 gameId;
    }
    mapping(uint256 => LeaderboardEntry[]) internal _leaderboards;
    mapping(uint256 => mapping(address => bool)) public hasClaimedReward;

    // ── Tournaments ──
    struct Tournament {
        address creator;
        uint256 entryFee;          // USDC amount (6 decimals)
        uint64 startTime;
        uint64 endTime;
        uint8 maxPlayers;
        uint8 playerCount;
        bool finalized;
        uint256 prizePool;         // accumulated USDC
    }
    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => mapping(address => uint32)) public tournamentScores;
    mapping(uint256 => address[]) public tournamentPlayers;
    uint256 public nextTournamentId;

    // ── Revenue ──
    uint256 public protocolRevenue;      // accumulated USDC protocol fees
    uint256 public weeklyRewardPool;     // USDC earmarked for weekly leaderboard
}
```

### 4.7 Gas Optimization

| Technique | Savings |
|-----------|---------|
| Bit-packed moves (10 bits each, 3 per uint256 word) | ~70% calldata vs. naive encoding |
| Leaderboard uses insertion sort (max 50 entries) | Bounded gas, no unbounded loops |
| Score verification is probabilistic (3 spot-checks) | ~80k gas vs. ~2M+ for full replay |
| EIP-5792 batching for approve+join | One user confirmation instead of two |
| `bytes32` seed instead of `uint256[]` entropy | Single storage slot |
| USDC transfers via IERC20 (no native value) | Standard, predictable gas costs |

---

## 5. Frontend Architecture

### 5.1 Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 18 + TypeScript | Farcaster MiniApp SDK is React-first |
| State | Zustand | Lightweight, works with React 18 concurrent features |
| Rendering | HTML5 Canvas (2D) | 60 fps grid rendering, touch-optimized |
| Chain | Wagmi v2 + Viem | Recommended by Celo docs for Farcaster MiniApps |
| Styling | Tailwind CSS | Rapid iteration, small bundle |
| Build | Vite | Fast HMR, optimized production builds |
| Animations | Framer Motion | Smooth piece drag, line-clear effects |

### 5.2 Application Structure

```
src/
├── main.tsx                     # Entry point, SDK init
├── App.tsx                      # Root component, routing
│
├── engine/                      # Pure game logic (zero UI deps)
│   ├── shapes.ts                # Shape catalog (§3.2)
│   ├── grid.ts                  # Grid model, placement, clearing
│   ├── scoring.ts               # Score + combo calculations
│   ├── rng.ts                   # Deterministic xorshift128+
│   ├── game.ts                  # Game session orchestrator
│   ├── replay.ts                # Move recorder + proof builder
│   └── __tests__/               # Determinism unit tests
│
├── canvas/                      # Rendering layer
│   ├── GridRenderer.ts          # Draw 9×9 grid, filled cells
│   ├── PieceRenderer.ts         # Draw draggable pieces
│   ├── AnimationManager.ts      # Line-clear flash, combo pop
│   └── TouchController.ts       # Drag-and-drop, snap-to-grid
│
├── components/                  # React UI components
│   ├── GameScreen.tsx           # Main gameplay view
│   ├── PieceTray.tsx            # 3-piece selection area
│   ├── ScoreBar.tsx             # Score + combo streak display
│   ├── GameOverModal.tsx        # Final score, submit/share
│   ├── LeaderboardView.tsx      # On-chain leaderboard
│   ├── TournamentLobby.tsx      # Browse/join tournaments
│   ├── WalletStatus.tsx         # Connection badge
│   └── HapticButton.tsx         # Button with SDK haptics
│
├── chain/                       # Blockchain integration
│   ├── config.ts                # Wagmi config (Celo + connector)
│   ├── contracts.ts             # ABI + addresses
│   ├── useStartGame.ts          # Hook: commit seed, get gameId
│   ├── useSubmitScore.ts        # Hook: submit proof
│   ├── useLeaderboard.ts        # Hook: read leaderboard
│   ├── useTournament.ts         # Hook: tournament CRUD
│   └── useBatchTx.ts            # EIP-5792 batch (approve+join)
│
├── miniapp/                     # Farcaster MiniApp SDK wrappers
│   ├── init.ts                  # sdk.actions.ready(), QuickAuth
│   ├── haptics.ts               # Haptic feedback helpers
│   ├── share.ts                 # Cast sharing (score cards)
│   └── env.ts                   # isInMiniApp() detection
│
└── stores/                      # Zustand state stores
    ├── gameStore.ts             # Current game state
    ├── walletStore.ts           # Wallet + auth state
    └── uiStore.ts               # Modals, navigation
```

### 5.3 MiniApp SDK Integration

```typescript
// src/miniapp/init.ts
import { sdk } from "@farcaster/miniapp-sdk";

export async function initMiniApp() {
  await sdk.actions.ready();
  const token = await sdk.quickAuth.getToken();
  return { token, context: sdk.context };
}
```

### 5.4 Wagmi Configuration

```typescript
// src/chain/config.ts
import { http, createConfig } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

export const wagmiConfig = createConfig({
  chains: [celo, celoAlfajores],
  transports: {
    [celo.id]: http(),
    [celoAlfajores.id]: http(),
  },
  connectors: [farcasterMiniApp()],
});
```

### 5.5 EIP-5792 Batch: USDC Approve + Tournament Join

```typescript
import { useSendCalls } from "wagmi";
import { encodeFunctionData, parseUnits } from "viem";
import { erc20Abi } from "viem";

const CUSD_ADDRESS = "0x01C5C0122039549AD1493B8220cABEdD739BC44E";

export function useJoinTournament(tournamentId: bigint, entryFee: bigint) {
  const { sendCalls } = useSendCalls();

  function join() {
    sendCalls({
      calls: [
        {
          to: CUSD_ADDRESS,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [BLOKZ_GAME_ADDRESS, entryFee],
          }),
        },
        {
          to: BLOKZ_GAME_ADDRESS,
          data: encodeFunctionData({
            abi: BlokzGameABI,
            functionName: "joinTournament",
            args: [tournamentId],
          }),
        },
      ],
    });
  }

  return { join };
}
```

---

## 6. Canvas Rendering Pipeline

### 6.1 Rendering Loop

```
requestAnimationFrame loop (60 fps target)
│
├── 1. Clear canvas
├── 2. Draw grid background (9×9 with subtle gridlines)
├── 3. Draw filled cells (color by ID, rounded corners)
├── 4. Draw ghost preview (if dragging, semi-transparent)
├── 5. Draw piece tray (3 pieces below grid)
├── 6. Draw animations (line-clear sparkle, combo text pop)
├── 7. Draw score/combo HUD overlay
└── 8. Trigger haptics if line cleared this frame
```

### 6.2 Touch/Drag System

```
TOUCH FLOW:
  touchstart on piece  → lift piece from tray, begin drag
  touchmove            → move piece with finger, show ghost on grid
  touchend over grid   → snap to nearest valid cell, attempt placement
  touchend outside     → return piece to tray (spring animation)

  • Piece lifts above finger (offset ~40px) so the player can see it
  • Grid cells highlight green/red for valid/invalid placement
  • Haptic "selection" feedback on drag start
  • Haptic "impact" feedback on successful placement
  • Haptic "notification" on line clear
```

### 6.3 Responsive Sizing

```
GRID_SIZE = min(screenWidth - 32px, screenHeight × 0.55)
CELL_SIZE = GRID_SIZE / 9
PIECE_TRAY_HEIGHT = screenHeight - GRID_SIZE - SCORE_BAR - 48px

Minimum supported: 320×480 (iPhone SE)
Optimal: 390×844 (iPhone 14 / most Android)
```

---

## 7. Data Flow & Synchronization

### 7.1 State Machine

```
                    ┌──────────┐
                    │   IDLE   │
                    └────┬─────┘
                         │ startGame()
                         ▼
                    ┌──────────┐
                    │ COMMITTING│  (seed hash tx pending)
                    └────┬─────┘
                         │ tx confirmed
                         ▼
                    ┌──────────┐
                    │ PLAYING  │  (game engine active, all client-side)
                    └────┬─────┘
                         │ no valid moves remain
                         ▼
                    ┌──────────┐
                    │ GAME_OVER│  (show score, offer submit)
                    └────┬─────┘
                    ┌────┴────┐
              submit()    discard()
                    │         │
                    ▼         ▼
              ┌──────────┐  ┌──────────┐
              │SUBMITTING│  │   IDLE   │
              └────┬─────┘  └──────────┘
                   │ tx confirmed
                   ▼
              ┌──────────┐
              │ SUBMITTED│ → auto → IDLE
              └──────────┘
```

### 7.2 Offline-First Design

| Scenario | Behavior |
|----------|----------|
| Lost connection during play | Game continues locally. Score queued for submission on reconnect. |
| Tx fails during seed commit | Retry with backoff. Player can practice (score won't be on-chain). |
| Tx fails during score submit | Proof saved to sessionStorage. Re-submit from history screen. |
| App backgrounded mid-game | Game state persisted via Zustand + sessionStorage. Resumes on return. |

---

## 8. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| **Fake scores** | Seed commit-reveal + probabilistic replay verification. Cheating requires guessing which moves get spot-checked. |
| **Front-running seed** | Seed hash committed before game starts. Revealed only at submission. |
| **Replay attack** | Each gameId is unique and tied to `msg.sender`. Same proof can't be submitted twice. |
| **Bot play** | Rate-limit: max 1 active game per address. QuickAuth ties games to Farcaster identity. |
| **Contract upgrade abuse** | UUPS with timelock + multisig admin. Upgrade proposals require 48h delay. |
| **Prize pool drain** | ReentrancyGuard on all USDC transfers. Reward claims check `hasClaimedReward`. |
| **USDC approval exploit** | Batch tx approves exact amount per tournament. No infinite approvals. |

---

## 9. MiniApp Manifest & Publishing

```json
{
  "name": "Blokaz",
  "description": "Block puzzle meets blockchain. Place pieces, clear lines, chain combos, win USDC prizes on Celo.",
  "iconUrl": "https://blokaz.xyz/icon-512.png",
  "splashImageUrl": "https://blokaz.xyz/splash-1920x1080.png",
  "splashBackgroundColor": "#0F172A",
  "url": "https://blokaz.xyz",
  "requiredChains": [42220],
  "requiredCapabilities": ["wallet_sendCalls"]
}
```

---

## 10. Future Extensions (Post-MVP)

| Feature | Description |
|---------|-------------|
| **Daily Challenges** | Same seed for all players each day. Pure skill leaderboard. |
| **NFT Skins** | ERC-1155 block color themes purchasable with USDC. |
| **Multiplayer Duels** | Two players, same seed, real-time. First to game-over loses. USDC wager. |
| **On-chain Achievements** | SBTs (Soulbound Tokens) for milestones (100 combos, 10k score). |
| **Farcaster Frames** | Embed live score cards as Farcaster Frames for viral sharing. |
| **Season Passes** | Weekly USDC subscription for premium tournaments with larger pools. |

---

## Appendix A — Shape Visual Reference (All 22 Pieces)

```
┌────────────────────────────────────────────────────────────────┐
│  SINGLES & DOMINOES                                            │
│  S1: ■          D1: ■ ■        D2: ■                          │
│                                    ■                          │
├────────────────────────────────────────────────────────────────┤
│  STRAIGHT LINES                                                │
│  I3H: ■ ■ ■    I3V: ■     I4H: ■ ■ ■ ■    I4V: ■            │
│                      ■                           ■            │
│                      ■                           ■            │
│                                                  ■            │
│  I5H: ■ ■ ■ ■ ■              I5V: ■                           │
│                                    ■                           │
│                                    ■                           │
│                                    ■                           │
│                                    ■                           │
├────────────────────────────────────────────────────────────────┤
│  SQUARES                                                       │
│  O2: ■ ■     O3: ■ ■ ■     O23: ■ ■                          │
│      ■ ■         ■ ■ ■          ■ ■                          │
│                  ■ ■ ■          ■ ■                          │
├────────────────────────────────────────────────────────────────┤
│  SMALL L-SHAPES                                                │
│  L2A: ■       L2B: ■ ■     L2C:   ■     L2D: ■ ■             │
│       ■ ■          ■            ■ ■            ■             │
├────────────────────────────────────────────────────────────────┤
│  LARGE L-SHAPES                                                │
│  L3A: ■        L3B: ■ ■ ■   L3C: ■ ■ ■   L3D:     ■         │
│       ■                  ■        ■                 ■         │
│       ■ ■ ■                                    ■ ■ ■         │
├────────────────────────────────────────────────────────────────┤
│  T-SHAPE                                                       │
│  T1: ■ ■ ■                                                    │
│        ■                                                      │
├────────────────────────────────────────────────────────────────┤
│  ZIGZAG (S/Z)                                                  │
│  S1Z:   ■ ■     Z1Z: ■ ■                                     │
│       ■ ■            ■ ■                                     │
└────────────────────────────────────────────────────────────────┘
```

---

## Appendix B — Environment & Tooling

```
Runtime:        Node 20+ / Browser (ES2022+)
Package Mgr:    pnpm
Framework:      Vite 5 + React 18
Language:       TypeScript 5.4 strict
Smart Contract: Solidity 0.8.24, Foundry (forge)
Chain:          Celo Mainnet (42220) + Alfajores Testnet (44787)
Wallet:         Farcaster MiniApp SDK + Wagmi v2
Token:          USDC (0x01C5C0122039549AD1493B8220cABEdD739BC44E)
Testing:        Vitest (frontend), Forge (contracts)
CI/CD:          GitHub Actions → Vercel (frontend), Forge script (deploy)
```
