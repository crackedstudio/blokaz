# Blokaz — Implementation Plan

## Phased Build Guide for AI-Assisted Development

---

## How to Use This Document

This plan is structured so you can hand **each phase** (or even each task within a phase) to an AI code editor (Cursor, Claude Code, Copilot Workspace, etc.) as a self-contained prompt. Each task includes the exact files to create, the acceptance criteria, and the dependencies from prior tasks. Work through them in order — every phase builds on the previous one's outputs.

---

## Phase 0 — Project Scaffold

**Goal**: A running Vite + React + TypeScript project with Tailwind, ready for development. Nothing game-specific yet.

**Duration**: 30 minutes

### Task 0.1 — Initialize the project

```
Prompt to AI editor:

Create a new Vite project with React and TypeScript using pnpm.
- Use Vite 5, React 18, TypeScript 5.4 (strict mode)
- Add Tailwind CSS 3 with PostCSS
- Add Zustand for state management
- Add Vitest for unit testing
- Configure path aliases: "@/" maps to "src/"
- Set up the following folder structure:
    src/
    ├── engine/
    ├── canvas/
    ├── components/
    ├── chain/
    ├── miniapp/
    ├── stores/
    ├── App.tsx
    └── main.tsx
- The app should render "Blokaz" centered on screen when started.
- ESLint + Prettier configured.
```

**Acceptance**: `pnpm dev` opens a page showing "Blokaz". `pnpm test` runs with zero failures.

---

## Phase 1 — Game Engine (Pure Logic, No UI)

**Goal**: A fully tested, deterministic game engine that runs entirely in memory. Zero React, zero Canvas, zero blockchain. Just TypeScript logic with 100% unit test coverage on critical paths.

**Duration**: 3–4 days

### Task 1.1 — Shape Catalog

```
Prompt to AI editor:

Create src/engine/shapes.ts

Define an interface ShapeDefinition with these fields:
  id: string
  family: "single" | "line" | "square" | "L" | "bigL" | "T" | "zigzag"
  cells: [number, number][]   — row/col offsets from origin (0,0)
  width: number               — bounding box width
  height: number              — bounding box height
  cellCount: number           — total filled cells
  spawnWeight: number         — probability weight for RNG selection

Export a const SHAPES array containing all 22 shapes defined below.
Also export a SHAPE_MAP: Record<string, ShapeDefinition> for O(1) lookup by ID.
Also export TOTAL_WEIGHT: number (sum of all spawnWeights).

Shapes to define:

Singles & Dominoes:
  S1:   cells:[[0,0]]                                                  w:1 h:1 count:1  weight:5
  D1:   cells:[[0,0],[0,1]]                                            w:2 h:1 count:2  weight:8
  D2:   cells:[[0,0],[1,0]]                                            w:1 h:2 count:2  weight:8

Straight Lines:
  I3H:  cells:[[0,0],[0,1],[0,2]]                                      w:3 h:1 count:3  weight:10
  I3V:  cells:[[0,0],[1,0],[2,0]]                                      w:1 h:3 count:3  weight:10
  I4H:  cells:[[0,0],[0,1],[0,2],[0,3]]                                w:4 h:1 count:4  weight:8
  I4V:  cells:[[0,0],[1,0],[2,0],[3,0]]                                w:1 h:4 count:4  weight:8
  I5H:  cells:[[0,0],[0,1],[0,2],[0,3],[0,4]]                          w:5 h:1 count:5  weight:4
  I5V:  cells:[[0,0],[1,0],[2,0],[3,0],[4,0]]                          w:1 h:5 count:5  weight:4

Squares:
  O2:   cells:[[0,0],[0,1],[1,0],[1,1]]                                w:2 h:2 count:4  weight:10
  O3:   cells:[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]  w:3 h:3 count:9  weight:3
  O23:  cells:[[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]]                    w:2 h:3 count:6  weight:6

Small L-shapes:
  L2A:  cells:[[0,0],[1,0],[1,1]]                                      w:2 h:2 count:3  weight:8
  L2B:  cells:[[0,0],[0,1],[1,0]]                                      w:2 h:2 count:3  weight:8
  L2C:  cells:[[0,1],[1,0],[1,1]]                                      w:2 h:2 count:3  weight:8
  L2D:  cells:[[0,0],[0,1],[1,1]]                                      w:2 h:2 count:3  weight:8

Large L-shapes:
  L3A:  cells:[[0,0],[1,0],[2,0],[2,1],[2,2]]                          w:3 h:3 count:5  weight:5
  L3B:  cells:[[0,0],[0,1],[0,2],[1,2]]                                w:3 h:2 count:4  weight:5
  L3C:  cells:[[0,0],[0,1],[0,2],[1,0]]                                w:3 h:2 count:4  weight:5
  L3D:  cells:[[0,2],[1,2],[2,0],[2,1],[2,2]]                          w:3 h:3 count:5  weight:5

T-shape:
  T1:   cells:[[0,0],[0,1],[0,2],[1,1]]                                w:3 h:2 count:4  weight:6

Zigzag:
  S1Z:  cells:[[0,1],[0,2],[1,0],[1,1]]                                w:3 h:2 count:4  weight:6
  Z1Z:  cells:[[0,0],[0,1],[1,1],[1,2]]                                w:3 h:2 count:4  weight:6

Write unit tests in src/engine/__tests__/shapes.test.ts:
  - All 22 shapes exist
  - cellCount matches cells.length for each shape
  - width and height match the actual bounding box of the cells
  - TOTAL_WEIGHT equals the sum of all spawnWeights
  - No duplicate IDs
```

**Acceptance**: `pnpm test shapes` passes all tests.

---

### Task 1.2 — Grid Model

```
Prompt to AI editor:

Create src/engine/grid.ts

Export a Grid class (or functional module) for a 9×9 grid:
  - Internal storage: Uint8Array(81). Index = row * 9 + col.
  - 0 = empty, 1-8 = color IDs.

Functions to export:
  createGrid(): Uint8Array           — returns a zeroed 81-byte array
  getCell(grid, row, col): number    — returns cell value
  setCell(grid, row, col, val): void — sets cell value
  cloneGrid(grid): Uint8Array        — returns a copy

  canPlace(grid, shape, row, col): boolean
    — returns true if ALL cells of the shape fit within 0-8 bounds
      AND all target cells are empty (0)

  placeShape(grid, shape, row, col, colorId): void
    — writes colorId into each cell. Does NOT check validity
      (caller must check canPlace first).

  findFullLines(grid): { rows: number[], cols: number[] }
    — returns indices of all completely filled rows and columns

  clearLines(grid, rows, cols): { cellsCleared: number }
    — sets all cells in the given rows/cols to 0
    — returns the count of unique cells cleared
      (cells at row/col intersections count once)

  canPlaceAny(grid, shapes: ShapeDefinition[]): boolean
    — returns true if at least one shape can be placed
      somewhere on the grid. Used for game-over detection.

  gridHash(grid): string
    — returns a hex string of keccak256(grid bytes).
    — Use a simple hash for now (can swap to keccak later).

Write unit tests in src/engine/__tests__/grid.test.ts:
  - Place a shape and verify cells are filled
  - canPlace returns false for out-of-bounds
  - canPlace returns false for overlapping pieces
  - Fill an entire row, verify findFullLines detects it
  - Fill an entire column, verify findFullLines detects it
  - Fill a row AND column, clearLines removes all and counts correctly
  - canPlaceAny returns false on a full grid
  - canPlaceAny returns true on an empty grid
```

**Acceptance**: All grid tests pass. `canPlace` + `clearLines` handle intersection overlap correctly.

---

### Task 1.3 — Deterministic RNG

```
Prompt to AI editor:

Create src/engine/rng.ts

Implement a deterministic xorshift128+ random number generator:

  class DeterministicRNG {
    constructor(seed: bigint)
    next(): number           — returns float in [0, 1)
    nextInt(max: number): number — returns integer in [0, max)
  }

Also export:
  selectShape(rng: DeterministicRNG, shapes: ShapeDefinition[]): ShapeDefinition
    — uses rng.next() to select a shape based on spawnWeight distribution
    — sum all weights, multiply rng.next() by total, walk the array
      accumulating weights until the threshold is reached

  dealThree(rng: DeterministicRNG, shapes: ShapeDefinition[]): [ShapeDefinition, ShapeDefinition, ShapeDefinition]
    — calls selectShape 3 times, returns the trio

Write unit tests in src/engine/__tests__/rng.test.ts:
  - Same seed produces identical sequence of 1000 numbers
  - Different seeds produce different sequences
  - next() output is always >= 0 and < 1
  - selectShape distribution roughly matches weights over 10000 samples
    (O3 with weight 3 should appear ~2% of the time,
     I3H with weight 10 should appear ~7%)
  - dealThree returns exactly 3 shapes
```

**Acceptance**: Determinism test is the critical one — same seed, same game, every time.

---

### Task 1.4 — Scoring System

```
Prompt to AI editor:

Create src/engine/scoring.ts

Export:
  interface ScoreEvent {
    basePoints: number;        // piece.cellCount
    linePoints: number;        // linesCleared × 90
    comboBonus: number;        // linesCleared × comboStreak × 50
    totalPoints: number;       // sum of above
    linesCleared: number;
    newComboStreak: number;    // updated streak value
  }

  calculateScore(
    piece: ShapeDefinition,
    linesCleared: number,
    currentComboStreak: number
  ): ScoreEvent

Rules:
  - BASE = piece.cellCount
  - LINE = linesCleared × 10 × 9   (90 per line)
  - If linesCleared > 0:
      newCombo = currentComboStreak + 1
      COMBO = linesCleared × newCombo × 50
    Else:
      newCombo = 0
      COMBO = 0
  - TOTAL = BASE + LINE + COMBO

Write unit tests:
  - Place a 5-cell piece, clear 0 lines → 5 points, combo resets to 0
  - Place a 4-cell piece, clear 1 line, combo was 0 → 4 + 90 + 50 = 144, combo = 1
  - Place a 3-cell piece, clear 2 lines, combo was 2 → 3 + 180 + 300 = 483, combo = 3
  - Place a 1-cell piece, clear 0 lines, combo was 5 → 1 point, combo = 0
```

**Acceptance**: All scoring edge cases pass.

---

### Task 1.5 — Game Session Orchestrator

```
Prompt to AI editor:

Create src/engine/game.ts

This is the master game class that ties grid, shapes, rng, and scoring together.

  class GameSession {
    constructor(seed: bigint)

    // State
    grid: Uint8Array
    score: number
    comboStreak: number
    currentPieces: [ShapeDefinition, ShapeDefinition, ShapeDefinition]
    piecesPlaced: number        // 0, 1, or 2 within current deal
    moveHistory: MoveRecord[]
    isGameOver: boolean
    dealCount: number           // how many sets of 3 have been dealt

    // Methods
    deal(): void
      — calls dealThree(rng, SHAPES) to get 3 new pieces
      — resets piecesPlaced to 0

    placePiece(pieceIndex: 0|1|2, row: number, col: number): PlaceResult
      — validates the piece hasn't been used this deal
      — validates canPlace
      — places shape on grid
      — runs findFullLines + clearLines
      — calculates score
      — records move in moveHistory
      — marks piece as used
      — if piecesPlaced === 3, auto-calls deal()
      — after deal or after placement, checks canPlaceAny
        for remaining/new pieces. If false → isGameOver = true
      — returns PlaceResult with score event, lines cleared, game over flag

    getReplayProof(): GameReplay
      — packs moveHistory into bit-packed format
      — returns seed, packed moves, final score, grid hash

    // Internal
    private rng: DeterministicRNG
    private usedThisDeal: [boolean, boolean, boolean]
  }

  interface MoveRecord {
    pieceIndex: 0|1|2;
    shapeId: string;
    row: number;
    col: number;
    scoreEvent: ScoreEvent;
  }

  interface PlaceResult {
    success: boolean;
    error?: string;
    scoreEvent?: ScoreEvent;
    linesCleared?: { rows: number[], cols: number[] };
    isGameOver: boolean;
  }

Write unit tests in src/engine/__tests__/game.test.ts:
  - New game starts with 3 pieces dealt, score 0, combo 0
  - Placing a piece returns success and updates score
  - Placing at an invalid position returns success:false
  - After placing all 3 pieces, new 3 are automatically dealt
  - Game over is detected when no pieces fit
  - Two games with the same seed produce identical piece sequences
  - Replay proof contains correct move count and final score
```

**Acceptance**: Full game can be played programmatically in a test. Determinism holds across runs.

---

### Task 1.6 — Replay Proof Builder

```
Prompt to AI editor:

Create src/engine/replay.ts

Export:
  packMoves(moves: MoveRecord[]): bigint[]
    — each move is encoded as 10 bits:
        pieceIndex: 2 bits (0-2)
        row: 4 bits (0-8)
        col: 4 bits (0-8)
    — pack 25 moves per bigint (250 bits, fits in uint256)
    — pad the last bigint with zeros

  unpackMoves(packed: bigint[], moveCount: number): { pieceIndex: number, row: number, col: number }[]
    — reverse of packMoves

  buildProof(session: GameSession): {
    seed: bigint;
    packedMoves: bigint[];
    moveCount: number;
    finalScore: number;
    gridHash: string;
  }

Write unit tests:
  - Pack and unpack 1, 10, 50, 200 moves — roundtrip is lossless
  - Edge case: move at (0,0) with pieceIndex 0
  - Edge case: move at (8,8) with pieceIndex 2
  - buildProof on a complete game matches the game's final state
```

**Acceptance**: Roundtrip packing works for all move counts. Proof matches game state.

---

## Phase 2 — Canvas UI & Gameplay

**Goal**: A fully playable game in the browser — touch-friendly, animated, responsive. No blockchain yet. Just a fun game.

**Duration**: 4–5 days

### Task 2.1 — Grid Renderer

```
Prompt to AI editor:

Create src/canvas/GridRenderer.ts

This class draws the 9×9 game grid onto an HTML5 Canvas.

Constructor takes:
  - canvas: HTMLCanvasElement
  - gridSize: number (pixel width/height of the entire grid)

Methods:
  draw(grid: Uint8Array, ghostCells?: { row: number, col: number, valid: boolean }[]): void
    — Clears the grid area
    — Draws grid background (dark, subtle rounded-rect container)
    — Draws gridlines (1px, semi-transparent)
    — For each non-zero cell, draws a filled rounded rectangle
      with the color from a COLOR_PALETTE[1-8] array
    — If ghostCells provided, draws semi-transparent preview cells
      (green tint if valid, red tint if invalid)

  getCellSize(): number — returns gridSize / 9

  screenToGrid(x: number, y: number): { row: number, col: number } | null
    — converts canvas-relative coordinates to grid row/col
    — returns null if outside the grid

COLOR_PALETTE should be 8 vibrant, high-contrast colors that look
good on a dark background. Think candy/neon puzzle game aesthetic.

The grid should have:
  - 2px rounded corners on each cell
  - 1px gap between cells
  - Subtle drop shadow on filled cells
```

**Acceptance**: Rendering a test grid shows colored cells in the correct positions. Ghost cells overlay correctly.

---

### Task 2.2 — Piece Renderer

```
Prompt to AI editor:

Create src/canvas/PieceRenderer.ts

Renders the 3-piece tray below the grid and handles dragging pieces.

Constructor takes:
  - canvas: HTMLCanvasElement
  - trayY: number (y-offset where the tray starts)
  - cellSize: number (size of each block in the tray, slightly smaller than grid cells)

Methods:
  drawTray(pieces: (ShapeDefinition | null)[], activeIndex?: number): void
    — Draws 3 piece slots horizontally centered below the grid
    — Each piece is drawn at ~70% of grid cell size
    — null pieces (already placed) show an empty/dimmed slot
    — activeIndex piece is highlighted (being dragged)

  drawDragging(shape: ShapeDefinition, x: number, y: number, cellSize: number): void
    — Draws the shape centered on (x, y) at full grid cell size
    — Used while the player is dragging a piece
    — Should have a subtle glow/shadow to indicate it's lifted

  hitTestTray(x: number, y: number, pieces: (ShapeDefinition | null)[]): number | null
    — Returns the piece index (0,1,2) if the touch point is within
      a piece's bounding box. Returns null if no hit.

Each piece in the tray should use the same color the piece will have
when placed. Assign a random color from COLOR_PALETTE per piece.
```

**Acceptance**: Three pieces render below the grid. Hit testing correctly identifies which piece was touched.

---

### Task 2.3 — Touch Controller

```
Prompt to AI editor:

Create src/canvas/TouchController.ts

Handles all touch/mouse input for the game canvas.

Constructor takes:
  - canvas: HTMLCanvasElement
  - gridRenderer: GridRenderer
  - pieceRenderer: PieceRenderer
  - onPlace: (pieceIndex: number, row: number, col: number) => void

Behavior:
  touchstart / mousedown:
    — Hit test the piece tray
    — If a piece is hit, enter DRAGGING state
    — Record which piece (index) and the initial touch offset

  touchmove / mousemove:
    — If DRAGGING, update the drag position
    — Calculate the ghost position on the grid (snap to nearest cell)
    — Call back to the parent to get canPlace validation
    — Update ghost cells (valid/invalid)

  touchend / mouseup:
    — If the ghost position is valid, call onPlace(pieceIndex, row, col)
    — If invalid or outside grid, animate piece back to tray (spring)
    — Clear dragging state

  Important UX details:
    — The piece should render ABOVE the finger (offset Y by -40px)
      so the player can see what they're placing
    — On desktop, support mouse drag as well
    — Use requestAnimationFrame for smooth drag movement
    — Don't use any React — this is pure Canvas + DOM events
```

**Acceptance**: You can drag a piece from the tray and drop it on the grid. Invalid drops spring back.

---

### Task 2.4 — Animation Manager

```
Prompt to AI editor:

Create src/canvas/AnimationManager.ts

Manages non-blocking visual effects during gameplay.

Animations to support:

  1. LINE_CLEAR_FLASH
     — When lines are cleared, the affected cells flash white
       then fade out over 300ms
     — Staggered: rows flash first, then columns (or simultaneously)

  2. COMBO_POP
     — When a combo occurs, a text popup appears near the cleared area
     — Shows "COMBO x3!" (or whatever the streak is)
     — Text scales up from 0 to 1 then fades out over 500ms
     — Uses a bold, game-style font

  3. SCORE_FLY
     — "+485" flies up from the placement position and fades out
     — Duration: 400ms

  4. PIECE_SNAP
     — Brief scale-up pulse (1.0 → 1.1 → 1.0) when a piece locks in
     — Duration: 150ms

Methods:
  trigger(type: AnimationType, params: object): void
  update(deltaTime: number): void  — advance all active animations
  draw(ctx: CanvasRenderingContext2D): void — render all active animations

Use an array of active animation objects. Each has a progress (0→1),
duration, and a draw function. Remove completed animations.
```

**Acceptance**: Triggering each animation type renders the correct visual effect on the canvas.

---

### Task 2.5 — Game Screen Component

```
Prompt to AI editor:

Create src/components/GameScreen.tsx

This is the main React component that ties the game engine to the canvas.

Structure:
  - Full-screen mobile layout (dark background)
  - Top: ScoreBar component (score + combo streak)
  - Middle: Canvas element (grid + piece tray + animations)
  - The canvas should resize responsively:
      GRID_SIZE = min(window.innerWidth - 32, window.innerHeight * 0.55)

State management (use Zustand store at src/stores/gameStore.ts):
  - gameSession: GameSession | null
  - isPlaying: boolean
  - score: number
  - comboStreak: number
  - currentPieces: (ShapeDefinition | null)[]
  - isGameOver: boolean

On mount:
  1. Create a new GameSession with a random seed
  2. Initialize GridRenderer, PieceRenderer, TouchController, AnimationManager
  3. Start the render loop (requestAnimationFrame)

When a piece is placed (onPlace callback):
  1. Call gameSession.placePiece(index, row, col)
  2. If lines cleared, trigger LINE_CLEAR_FLASH and COMBO_POP animations
  3. Trigger SCORE_FLY animation
  4. Update Zustand store
  5. If game over, show GameOverModal

Also create src/components/ScoreBar.tsx:
  - Shows current score (large number, left-aligned)
  - Shows combo streak (e.g., "🔥 x3") if combo > 0
  - Animated number counter (count up to new score)

Also create src/components/GameOverModal.tsx:
  - Overlays the game with a dark semi-transparent background
  - Shows "GAME OVER" + final score
  - "Play Again" button (resets game with new seed)
  - "Submit Score" button (disabled for now, enabled in Phase 3)
  - "Share" button (disabled for now, enabled in Phase 4)

Make sure the canvas render loop does NOT cause React re-renders.
Only update Zustand when score/combo/pieces/gameOver actually change.
```

**Acceptance**: A fully playable game in the browser. Touch/mouse to drag and place. Lines clear with animations. Game over detected. Play Again works.

---

### Task 2.6 — Haptic Feedback Stubs

```
Prompt to AI editor:

Create src/miniapp/haptics.ts

For now, create stub functions that will later connect to the Farcaster SDK.
Use console.log as placeholder.

  export function hapticSelection(): void   — piece pickup
  export function hapticImpact(): void      — piece placed successfully
  export function hapticNotification(): void — line cleared
  export function hapticError(): void       — invalid placement

Wire these into TouchController and GameScreen:
  - hapticSelection() when drag starts
  - hapticImpact() when piece is placed
  - hapticNotification() when any line is cleared
  - hapticError() when piece snaps back (invalid placement)
```

**Acceptance**: Console logs appear at the correct moments during gameplay.

---

## Phase 3 — Smart Contracts

**Goal**: A deployed, tested Solidity contract on Celo Alfajores testnet. Handles game registration, score submission with spot-check verification, weekly leaderboard, and USDC tournament management.

**Duration**: 5–6 days

### Task 3.1 — Foundry Project Setup

```
Prompt to AI editor:

Create a Foundry project in the contracts/ directory at the project root.

  contracts/
  ├── src/
  │   └── BlokzGame.sol
  ├── test/
  │   └── BlokzGame.t.sol
  ├── script/
  │   └── Deploy.s.sol
  ├── foundry.toml
  └── remappings.txt

foundry.toml should:
  - Set solc version to 0.8.24
  - Set optimizer to true with 200 runs
  - Set evm_version to "cancun"
  - Add OpenZeppelin contracts via forge install

Install dependencies:
  forge install OpenZeppelin/openzeppelin-contracts-upgradeable
  forge install OpenZeppelin/openzeppelin-contracts
```

**Acceptance**: `forge build` compiles with no errors.

---

### Task 3.2 — Core Contract: Game Registry + Score Submission

```
Prompt to AI editor:

Create contracts/src/BlokzGame.sol

Use UUPS upgradeable pattern. Import from OpenZeppelin:
  - UUPSUpgradeable
  - OwnableUpgradeable
  - ReentrancyGuardUpgradeable

Constants:
  address public constant CUSD = 0x01C5C0122039549AD1493B8220cABEdD739BC44E;
  uint256 public constant EPOCH_DURATION = 7 days;
  uint8 public constant LEADERBOARD_SIZE = 50;
  uint256 public constant PROTOCOL_FEE_BPS = 500;

State:
  - Game struct: player, seedHash, score, startedAt, submittedAt, status (enum: ACTIVE/SUBMITTED/REJECTED)
  - mapping(uint256 => Game) public games
  - uint256 public nextGameId
  - mapping(address => uint256) public activeGame (max 1 per player)

Functions:

  function startGame(bytes32 seedHash) external returns (uint256 gameId)
    — require activeGame[msg.sender] == 0 OR game is not ACTIVE
    — create new Game, set status to ACTIVE
    — set activeGame[msg.sender] = gameId
    — emit GameStarted(gameId, msg.sender)

  function submitScore(
    uint256 gameId,
    bytes32 seed,
    uint256[] calldata packedMoves,
    uint32 score,
    uint16 moveCount
  ) external
    — require games[gameId].player == msg.sender
    — require games[gameId].status == ACTIVE
    — require keccak256(abi.encodePacked(seed, msg.sender)) == games[gameId].seedHash
    — perform spot-check verification (see Task 3.3)
    — set score, status to SUBMITTED, submittedAt
    — update leaderboard (see Task 3.4)
    — clear activeGame[msg.sender]
    — emit ScoreSubmitted(gameId, msg.sender, score)

Write basic tests:
  - startGame creates a game with correct state
  - submitScore with valid seed updates the game
  - submitScore with wrong seed reverts
  - Cannot have two active games simultaneously
  - Only the game owner can submit
```

**Acceptance**: `forge test` passes all basic game registry tests.

---

### Task 3.3 — Score Verification (Spot-Check)

```
Prompt to AI editor:

Add score verification logic to BlokzGame.sol.

Internal function:
  function _spotCheckMoves(
    bytes32 seed,
    uint256[] calldata packedMoves,
    uint16 moveCount
  ) internal view returns (bool)

Logic:
  1. Derive 3 random check indices from:
       uint256 entropy = uint256(keccak256(abi.encodePacked(
         block.prevrandao, seed, msg.sender
       )));
       checkIndex[0] = entropy % moveCount;
       checkIndex[1] = (entropy >> 32) % moveCount;
       checkIndex[2] = (entropy >> 64) % moveCount;

  2. For each check index:
     a. Unpack the move at that index from packedMoves:
        Each move = 10 bits (2 bit pieceIndex + 4 bit row + 4 bit col)
        25 moves per uint256
     b. Calculate which "deal" this move belongs to:
        dealNumber = checkIndex / 3
        pieceIndexInDeal = checkIndex % 3
     c. Fast-forward the RNG (xorshift128+ in Solidity) from the seed
        by (dealNumber × 3 + pieceIndexInDeal) steps
     d. Verify the RNG output maps to a valid shape
     e. Verify row < 9 and col < 9
     f. Verify pieceIndex is 0, 1, or 2

  3. Return true if all checks pass.

Also implement the xorshift128+ RNG in Solidity:
  function _xorshift128plus(uint128 s0, uint128 s1)
    internal pure returns (uint128, uint128, uint64)
  — returns (newS0, newS1, output)

Note: Full placement validation (checking grid state) is NOT done on-chain.
We only verify that the move references a legitimate shape from the
correct deal and targets a valid grid position.

Write tests:
  - Valid replay passes spot-check
  - Replay with tampered move (wrong row) fails
  - Replay with impossible pieceIndex (3) fails
```

**Acceptance**: Spot-check catches obviously tampered replays while staying under 100k gas.

---

### Task 3.4 — Leaderboard

```
Prompt to AI editor:

Add leaderboard functionality to BlokzGame.sol.

State:
  struct LeaderboardEntry {
    address player;
    uint32 score;
    uint256 gameId;
  }
  mapping(uint256 => LeaderboardEntry[]) internal _leaderboards;

Internal function called by submitScore:
  function _updateLeaderboard(uint256 epoch, address player, uint32 score, uint256 gameId) internal
    — epoch = block.timestamp / EPOCH_DURATION
    — If leaderboard has < LEADERBOARD_SIZE entries, push
    — Else if score > lowest entry's score, replace lowest
    — Keep array sorted (insertion sort — bounded by LEADERBOARD_SIZE = 50)

View function:
  function getLeaderboard(uint256 epoch) external view returns (LeaderboardEntry[] memory)
  function getCurrentEpoch() external view returns (uint256)

Write tests:
  - Submit 3 scores, leaderboard is sorted descending
  - Submit 51 scores to a full leaderboard, lowest gets replaced
  - Different epochs have independent leaderboards
```

**Acceptance**: Leaderboard correctly maintains top 50 per epoch, sorted by score.

---

### Task 3.5 — Tournament Manager (USDC)

```
Prompt to AI editor:

Add tournament functionality to BlokzGame.sol.

State:
  struct Tournament {
    address creator;
    uint256 entryFee;       // USDC amount
    uint64 startTime;
    uint64 endTime;
    uint8 maxPlayers;
    uint8 playerCount;
    bool finalized;
    uint256 prizePool;
  }
  mapping(uint256 => Tournament) public tournaments;
  mapping(uint256 => mapping(address => uint32)) public tournamentScores;
  mapping(uint256 => mapping(address => bool)) public inTournament;
  mapping(uint256 => address[]) internal _tournamentPlayers;
  uint256 public nextTournamentId;
  uint256 public protocolRevenue;
  uint256 public weeklyRewardPool;

Functions:

  function createTournament(uint256 entryFee, uint64 startTime, uint64 endTime, uint8 maxPlayers)
    external returns (uint256)
    — require startTime > block.timestamp
    — require endTime > startTime
    — require maxPlayers >= 2 && maxPlayers <= 64

  function joinTournament(uint256 tournamentId) external
    — require tournament not started yet OR is in progress
    — require playerCount < maxPlayers
    — require !inTournament[id][msg.sender]
    — transferFrom USDC entry fee from player to contract
    — increment prizePool and playerCount

  function submitTournamentScore(uint256 tournamentId, uint256 gameId, ...) external
    — same validation as submitScore
    — require inTournament[tournamentId][msg.sender]
    — store the player's best score (keep highest)

  function finalizeTournament(uint256 tournamentId) external
    — require block.timestamp > endTime
    — require !finalized
    — sort players by score (bounded by maxPlayers <= 64)
    — distribute USDC:
        1st: 50% of prizePool
        2nd: 25%
        3rd: 15%
        protocol: 5% → protocolRevenue
        weekly pool: 5% → weeklyRewardPool
    — If < 3 players, adjust distribution accordingly
    — Mark finalized

  function withdrawProtocolRevenue() external onlyOwner
    — transfers accumulated protocolRevenue in USDC to owner

Use IERC20(CUSD).transfer() and transferFrom() for all USDC movement.
Use ReentrancyGuard on all functions that move USDC.

Write tests (use a mock ERC20 for USDC in tests):
  - Create tournament, 4 players join, submit scores, finalize
  - Verify prize distribution amounts
  - Cannot join after max players reached
  - Cannot finalize before end time
  - Cannot join without sufficient USDC approval
  - Protocol revenue accumulates correctly
```

**Acceptance**: Full tournament lifecycle works in Forge tests with mock USDC.

---

### Task 3.6 — Deploy Script & Testnet Deployment

```
Prompt to AI editor:

Create contracts/script/Deploy.s.sol

  - Deploy BlokzGame as a UUPS proxy
  - Set the deployer as owner
  - Verify on CeloScan (Alfajores)

Create a .env.example with:
  PRIVATE_KEY=
  ALFAJORES_RPC=https://alfajores-forno.celo-testnet.org
  CELOSCAN_API_KEY=

Add a Makefile or npm scripts:
  deploy-testnet: forge script ... --rpc-url $ALFAJORES_RPC --broadcast --verify
  test: forge test -vvv

Document the deployed testnet address in contracts/DEPLOYMENTS.md
```

**Acceptance**: Contract is deployed to Alfajores. Verified on CeloScan. Address documented.

---

## Phase 4 — Frontend ↔ Chain Integration

**Goal**: Connect the playable game UI to the deployed smart contract. Seed commit, score submit, leaderboard display, tournament flow — all wired end-to-end.

**Duration**: 4–5 days

### Task 4.1 — Wagmi + Farcaster Connector Setup

```
Prompt to AI editor:

Install dependencies:
  pnpm add wagmi viem @tanstack/react-query @farcaster/miniapp-sdk @farcaster/miniapp-wagmi-connector

Create src/chain/config.ts:
  - Configure Wagmi with celo and celoAlfajores chains
  - Use farcasterMiniApp() connector
  - HTTP transports for both chains

Create src/chain/contracts.ts:
  - Export BLOKZ_GAME_ADDRESS (from testnet deployment)
  - Export CUSD_ADDRESS (Celo mainnet: 0x01C5C0122039549AD1493B8220cABEdD739BC44E)
  - Export the contract ABI (copy from forge artifacts)

Wrap the App in WagmiProvider + QueryClientProvider in main.tsx.

Create src/components/WalletStatus.tsx:
  - Shows connected address (truncated) or "Connect" button
  - Uses useAccount() and useConnect() from wagmi
  - In MiniApp mode: auto-connects, hides the button
  - In browser mode: shows connect button
```

**Acceptance**: App connects to wallet inside Warpcast. Shows address in WalletStatus.

---

### Task 4.2 — Game Lifecycle Hooks

```
Prompt to AI editor:

Create src/chain/useStartGame.ts:
  Hook that:
  1. Generates a random 32-byte seed using crypto.getRandomValues()
  2. Computes seedHash = keccak256(abi.encodePacked(seed, playerAddress))
  3. Sends startGame(seedHash) transaction
  4. On confirmation, stores seed in gameStore and creates a new GameSession(seed)
  5. Returns { start, isPending, isSuccess, error }

Create src/chain/useSubmitScore.ts:
  Hook that:
  1. Gets the replay proof from GameSession.getReplayProof()
  2. Sends submitScore(gameId, seed, packedMoves, score, moveCount)
  3. On confirmation, updates UI to show "Score Submitted!"
  4. Returns { submit, isPending, isSuccess, error }

Update GameOverModal:
  - "Submit Score" button calls useSubmitScore
  - Shows loading spinner while tx is pending
  - Shows success message with score + tx hash on success
  - Shows error message on failure with retry option
```

**Acceptance**: Play a game → game over → submit score → see it on-chain in CeloScan.

---

### Task 4.3 — Leaderboard UI

```
Prompt to AI editor:

Create src/chain/useLeaderboard.ts:
  Hook that:
  1. Calls getLeaderboard(epoch) on the contract (read-only)
  2. Also calls getCurrentEpoch()
  3. Returns { entries, epoch, isLoading, error }
  4. Auto-refreshes every 30 seconds

Create src/components/LeaderboardView.tsx:
  - Shows current epoch's top 50 scores
  - Each row: rank, truncated address, score, time ago
  - Highlight the current player's entry (if present)
  - Tab to switch between "This Week" and previous epochs
  - Pull-to-refresh gesture
  - "Your Best" section at the top showing the player's highest score
```

**Acceptance**: After submitting a score, it appears on the leaderboard within one block confirmation.

---

### Task 4.4 — Tournament Flow

```
Prompt to AI editor:

Create src/chain/useTournament.ts:
  Hooks for:
  - useTournamentList(): reads active tournaments, returns array
  - useJoinTournament(id, entryFee): batches USDC approve + joinTournament
    using useSendCalls (EIP-5792)
  - useSubmitTournamentScore(tournamentId, gameId, ...): submits score
  - useTournamentResults(id): reads scores after finalization

Create src/components/TournamentLobby.tsx:
  - List of active tournaments (entry fee, players, time remaining)
  - "Join" button per tournament (triggers batch tx)
  - After joining, shows "Play Tournament Game" button
  - Tournament games use the same GameScreen but scores go to
    submitTournamentScore instead of submitScore

Create src/components/TournamentResults.tsx:
  - Shows final standings after tournament ends
  - Prize amounts per place
  - "Claim Prize" button if the player won (calls finalizeTournament
    if not yet finalized, then shows claim)
```

**Acceptance**: Create a tournament, have 2+ addresses join, play games, finalize, verify USDC distribution.

---

## Phase 5 — MiniApp Integration & Polish

**Goal**: Full Farcaster MiniApp experience — haptics, social sharing, manifest, environment detection, and production deployment.

**Duration**: 3–4 days

### Task 5.1 — Farcaster SDK Full Integration

```
Prompt to AI editor:

Update src/miniapp/init.ts:
  - Call sdk.actions.ready() after React app mounts and first render completes
  - Store QuickAuth token in walletStore
  - Handle the case where sdk is not available (browser mode)

Update src/miniapp/haptics.ts:
  - Replace console.log stubs with actual SDK calls:
    hapticSelection → sdk.haptics.selection()
    hapticImpact → sdk.haptics.impact()
    hapticNotification → sdk.haptics.notification()
  - Wrap each in try/catch with isInMiniApp() guard

Update src/miniapp/env.ts:
  - Export isInMiniApp() from the SDK
  - Export a useIsMiniApp() React hook

Update App.tsx:
  - If isInMiniApp(): use Farcaster connector, hide wallet UI
  - If not: show standard wallet connection (fallback for browser testing)
```

**Acceptance**: App loads without infinite splash screen in Warpcast. Haptics fire on piece placement and line clears.

---

### Task 5.2 — Social Sharing

```
Prompt to AI editor:

Create src/miniapp/share.ts:

  function shareScore(score: number, comboMax: number, linesCleared: number): void
    — Composes a cast text:
      "🧱 I scored {score} in Blokaz! 🔥 Max combo: x{comboMax} | Lines: {linesCleared}
       Can you beat me? Play now 👇"
    — Uses the Farcaster share mechanism (or clipboard + toast as fallback)

Update GameOverModal:
  - "Share" button calls shareScore
  - In browser mode, copies text to clipboard with a toast notification
  - In MiniApp mode, opens the Farcaster cast composer
```

**Acceptance**: After game over, sharing produces a properly formatted score card.

---

### Task 5.3 — Production Build & Deployment

```
Prompt to AI editor:

1. Create the manifest.json in public/:
   {
     "name": "Blokaz",
     "description": "Block puzzle meets blockchain. Clear lines, chain combos, win USDC on Celo.",
     "iconUrl": "https://blokaz.xyz/icon-512.png",
     "splashImageUrl": "https://blokaz.xyz/splash-1920x1080.png",
     "splashBackgroundColor": "#0F172A",
     "url": "https://blokaz.xyz",
     "requiredChains": [42220],
     "requiredCapabilities": ["wallet_sendCalls"]
   }

2. Create placeholder icon (512×512) and splash (1920×1080) images.
   Use the game's dark theme with "BLOKAZ" text and a stylized grid.

3. Configure Vite for production build:
   - Output to dist/
   - Code splitting: vendor chunk for wagmi/viem
   - Asset hashing
   - Gzip compression

4. Set up Vercel deployment:
   - vercel.json with SPA rewrite rules
   - Environment variables for contract addresses
   - Preview deployments on PRs

5. Switch contract address to Celo mainnet when ready:
   - Deploy to mainnet via forge script
   - Update DEPLOYMENTS.md
   - Update chain/contracts.ts

6. Publish the MiniApp following the Farcaster publishing guide.
```

**Acceptance**: Game is live at a public URL, playable inside Warpcast, connected to Celo mainnet.

---

## Phase 6 — Testing, QA & Hardening

**Goal**: Comprehensive testing, edge case handling, and performance optimization before public launch.

**Duration**: 3–4 days

### Task 6.1 — Engine Fuzz Testing

```
Prompt to AI editor:

Create src/engine/__tests__/fuzz.test.ts:

  Run 1000 automated games with random seeds:
  1. Create GameSession with random seed
  2. On each deal, pick the first valid placement for each piece
     (iterate all positions, take the first where canPlace is true)
  3. Continue until game over
  4. Assert: score >= 0, moveCount > 0, no runtime errors
  5. Assert: replay proof packs/unpacks correctly for each game
  6. Assert: two runs with the same seed produce identical move histories

Also write a stress test:
  - Play 100 games and measure average game duration, score, move count
  - Log distribution of game lengths (to verify the difficulty curve)
```

**Acceptance**: 1000 games complete without crashes. Determinism holds for all.

---

### Task 6.2 — Contract Invariant Testing

```
Prompt to AI editor:

Create contracts/test/BlokzGame.invariant.t.sol:

Foundry invariant tests:
  - Total USDC in contract >= sum of all unfulfilled tournament prize pools
  - Leaderboard size never exceeds LEADERBOARD_SIZE
  - No player can have more than 1 active game
  - All finalized tournaments have distributed exactly the correct amounts
  - protocolRevenue + weeklyRewardPool + distributed = total USDC ever received

Also write fuzz tests for _spotCheckMoves:
  - Fuzz with random seeds and move counts
  - Verify it doesn't revert on valid inputs
  - Verify it reverts on obviously invalid inputs (row >= 9, pieceIndex >= 3)
```

**Acceptance**: `forge test --invariant` passes with 10000 runs.

---

### Task 6.3 — Performance Optimization

```
Prompt to AI editor:

Profile and optimize the canvas rendering:

1. Measure FPS during gameplay on a low-end Android device (or throttled Chrome)
2. Optimizations to apply:
   - Only redraw cells that changed (dirty rect tracking)
   - Use offscreen canvas for static grid background
   - Batch draw calls for filled cells (single path operation)
   - Limit animation updates to 30fps for non-critical effects
   - Use requestAnimationFrame correctly (no double-RAF)
3. Measure bundle size with `npx vite-bundle-visualizer`
4. Apply code splitting: lazy-load LeaderboardView and TournamentLobby
5. Target: < 200KB initial JS bundle (gzipped), 60fps on iPhone SE 2
```

**Acceptance**: Lighthouse performance score > 90 on mobile. No jank during gameplay.

---

## Summary of Phases

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 0. Scaffold | 0.5 day | Running Vite + React project |
| 1. Game Engine | 3–4 days | Fully tested deterministic engine |
| 2. Canvas UI | 4–5 days | Playable game in browser |
| 3. Smart Contracts | 5–6 days | Deployed + tested contracts on Alfajores |
| 4. Chain Integration | 4–5 days | Game connected to on-chain scoring + tournaments |
| 5. MiniApp Polish | 3–4 days | Live Farcaster MiniApp on Celo mainnet |
| 6. QA & Hardening | 3–4 days | Fuzz tested, performant, production-ready |
| **Total** | **~24–29 days** | **Production MVP** |

Each phase is independent enough to be parallelized where tasks don't depend on each other (e.g., Phase 3 contracts can be built while Phase 2 UI is in progress).
