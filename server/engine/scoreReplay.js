/**
 * Server-side score replay validator.
 *
 * Fully re-simulates a client-submitted move history with the same rules as
 * the client engine (src/engine/game.ts + scoring.ts + rules.ts + dealer.ts):
 *
 *   - Deterministic piece deals from the game seed (RNG + weighted catalog,
 *     plus the v2 board-aware dealer)
 *   - Piece placements incl. Rotate Pass rotations
 *   - Line clears (rows, columns, and COSMIC-tier diagonals), combo streaks
 *     with grace, milestone bonuses
 *   - Bomb (full row + column cross, combo-feeding, boost ×3 cell points)
 *   - Shield revives (clears the recorded columns, restores the combo streak)
 *   - Plain revives (fresh trio, board untouched)
 *   - Lottery markers (flat +500 bonus, ×2 multiplier for 3 placements)
 *
 * Per-move points are recomputed server-side. The only client-trusted degree of
 * freedom is whether Score Boost was active for a given move (base points ×2),
 * since boost activation is client-side state — each move's totalPoints must
 * match either the boosted or unboosted expected value exactly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  MIRROR CONTRACT
 *
 * The "Rules" and "Dealer" sections below are hand-ported from
 * src/engine/rules.ts and src/engine/dealer.ts. If those change and these do
 * not, honest tournament submissions start failing with HTTP 403 and prize
 * money gets stuck. src/engine/__tests__/replayParity.test.ts plays randomised
 * games through both engines and asserts they agree — run it after any edit.
 *
 * RULES VERSIONING: a game commits its seed on-chain at startGame and submits
 * minutes later, so at any deploy there are games in flight that were played
 * under the previous ruleset. The client stamps `rulesVersion` into the submit
 * payload and we validate against that ruleset. Payloads without the field are
 * pre-v2 clients and validate as v1. v1 numbers are frozen forever.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SHAPES, TOTAL_WEIGHT, SHAPE_MAP } from './shapesCatalog.js'

const GRID_SIZE = 9
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE
const MILESTONE_BONUS = { 3: 300, 5: 750, 10: 2000 }
const MAX_MOVES = 5000
const LOTTERY_BONUS_POINTS = 500
const MAX_LOTTERY_MARKERS = 5 // per kind; lottery is classic-only today, keep tournament abuse bounded

// ── Rules — port of src/engine/rules.ts ───────────────────────────────────────

const TIER_THRESHOLDS = [0, 500, 1500, 4000, 9000, 20000, 45000, 100000]
const TIER_STICKER = 1
const TIER_PIXEL = 3
const TIER_NEON = 4
const TIER_COSMIC = 5
const TIER_LIQUID = 6
const TIER_GLITCH = 7

export const RULES = {
  1: {
    placementSquared: true,
    placementPerCell: 0,
    multiLine: [1.0, 1.5, 2.5],
    comboGrace: false,
    boardAwareDealer: false,
    tierMechanics: false,
  },
  2: {
    placementSquared: false,
    placementPerCell: 2,
    multiLine: [1.0, 2.0, 4.0],
    comboGrace: true,
    boardAwareDealer: true,
    tierMechanics: true,
  },
}

function rulesFor(version) {
  return RULES[version] ?? RULES[1]
}

function tierIndexForScore(score) {
  let idx = 0
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (score >= TIER_THRESHOLDS[i]) { idx = i; break }
  }
  return idx
}

function basePointsFor(cellCount, rules) {
  return rules.placementSquared ? cellCount * cellCount : cellCount * rules.placementPerCell
}

function multiLineFactorFor(linesCleared, rules) {
  if (linesCleared >= 3) return rules.multiLine[2]
  if (linesCleared === 2) return rules.multiLine[1]
  return rules.multiLine[0]
}

function linePointsFor(linesCleared, rules) {
  return Math.round(linesCleared * 100 * multiLineFactorFor(linesCleared, rules))
}

function comboMultiplierFor(streak, scoreBefore, rules) {
  let mult
  if (streak >= 10) mult = 4.0
  else if (streak >= 7) mult = 3.0
  else if (streak >= 5) mult = 2.5
  else if (streak >= 3) mult = 2.0
  else if (streak >= 2) mult = 1.5
  else if (streak >= 1) mult = 1.25
  else mult = 1.0

  if (rules.tierMechanics && mult > 1.0 && tierIndexForScore(scoreBefore) >= TIER_NEON) {
    mult += 0.5
  }
  return mult
}

function pixelBaseFactorFor(scoreBefore, linesCleared, rules) {
  if (!rules.tierMechanics) return 1
  if (linesCleared <= 0) return 1
  return tierIndexForScore(scoreBefore) >= TIER_PIXEL ? 2 : 1
}

function diagonalsEnabledFor(scoreBefore, rules) {
  return rules.tierMechanics && tierIndexForScore(scoreBefore) >= TIER_COSMIC
}

function liquidEnabledFor(scoreBefore, rules) {
  return rules.tierMechanics && tierIndexForScore(scoreBefore) >= TIER_LIQUID
}

function glitchEnabledFor(scoreBefore, rules) {
  return rules.tierMechanics && tierIndexForScore(scoreBefore) >= TIER_GLITCH
}

/** Returns { streak, graceUsed }. Port of nextComboState(). */
function nextComboState(current, linesCleared, scoreBefore, rules) {
  if (linesCleared > 0) return { streak: current.streak + 1, graceUsed: false }
  const graceAvailable =
    rules.comboGrace &&
    current.streak > 0 &&
    !current.graceUsed &&
    tierIndexForScore(scoreBefore) >= TIER_STICKER
  if (graceAvailable) return { streak: current.streak, graceUsed: true }
  return { streak: 0, graceUsed: false }
}

// ── Deterministic RNG (port of src/engine/rng.ts) ─────────────────────────────

const MASK64 = 0xffffffffffffffffn

class DeterministicRNG {
  constructor(seed) {
    this.s0 = seed & MASK64
    this.s1 = (seed ^ 0xdeadbeefcafen) & MASK64
    if (this.s0 === 0n && this.s1 === 0n) this.s1 = 0xdeadbeefcafen
  }

  next() {
    let s1 = this.s0
    const s0 = this.s1
    this.s0 = s0
    s1 ^= (s1 << 23n) & MASK64
    s1 ^= (s1 >> 17n) & MASK64
    s1 ^= s0
    s1 ^= (s0 >> 26n) & MASK64
    this.s1 = s1 & MASK64
    const sum = (this.s0 + this.s1) & 0xffffffffn
    return Number(sum) / 0x100000000
  }
}

function selectShape(rng) {
  const threshold = rng.next() * TOTAL_WEIGHT
  let accumulator = 0
  for (const shape of SHAPES) {
    accumulator += shape.spawnWeight
    if (threshold < accumulator) return shape
  }
  return SHAPES[SHAPES.length - 1]
}

// ── Dealer — port of src/engine/dealer.ts ─────────────────────────────────────

const RELIEF_FILL_RATIO = 0.45
const HEAVY_FILL_RATIO = 0.6
const HEAVY_PIECE_CELLS = 6
const LATE_GAME_SCORE = 9000
const MAX_REROLLS_EARLY = 3
const MAX_REROLLS_LATE = 1

function countFilled(grid) {
  let n = 0
  for (let i = 0; i < grid.length; i++) if (grid[i] !== 0) n++
  return n
}

function fitsAnywhere(grid, shape) {
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      let ok = true
      for (const [dr, dc] of shape.cells) {
        const r = row + dr, c = col + dc
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE || grid[r * GRID_SIZE + c] !== 0) {
          ok = false
          break
        }
      }
      if (ok) return true
    }
  }
  return false
}

function isBadDraw(grid, shape, fillRatio) {
  if (!fitsAnywhere(grid, shape)) return true
  if (fillRatio >= HEAVY_FILL_RATIO && shape.cellCount >= HEAVY_PIECE_CELLS) return true
  return false
}

function smallestFittingShape(grid) {
  let best = null
  for (const shape of SHAPES) {
    if (!fitsAnywhere(grid, shape)) continue
    if (best === null || shape.cellCount < best.cellCount) best = shape
  }
  return best
}

function dealThreeSmart(rng, grid, score, rules) {
  if (!rules.boardAwareDealer) {
    return [selectShape(rng), selectShape(rng), selectShape(rng)]
  }

  const fillRatio = countFilled(grid) / TOTAL_CELLS
  const reliefActive = fillRatio >= RELIEF_FILL_RATIO
  const rerollBudget = score >= LATE_GAME_SCORE ? MAX_REROLLS_LATE : MAX_REROLLS_EARLY

  const trio = []
  for (let i = 0; i < 3; i++) {
    let pick = selectShape(rng)
    if (reliefActive) {
      let rerolls = rerollBudget
      while (rerolls > 0 && isBadDraw(grid, pick, fillRatio)) {
        pick = selectShape(rng)
        rerolls--
      }
    }
    trio.push(pick)
  }

  if (!trio.some((shape) => fitsAnywhere(grid, shape))) {
    const rescue = smallestFittingShape(grid)
    if (rescue) trio[2] = rescue
  }

  return trio
}

// ── GLITCH morph — port of src/engine/glitch.ts ───────────────────────────────
//
// Deliberately hash-driven rather than RNG-driven: the deal RNG must never be
// consumed here, or a single disagreement about whether a draw happened would
// desync every subsequent deal and reject the player's honest score.

export const GLITCH_CHANCE = 0.12

function hashShapeId(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mix32(salt, values) {
  let h = (0x811c9dc5 ^ salt) >>> 0
  for (const v of values) {
    h = (h ^ (v | 0)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
    h = (h ^ (h >>> 15)) >>> 0
    h = Math.imul(h, 0x2545f491) >>> 0
    h = (h ^ (h >>> 13)) >>> 0
  }
  return h >>> 0
}

function seedParts(seed) {
  return [Number(seed & 0xffffffffn), Number((seed >> 32n) & 0xffffffffn)]
}

function canPlaceCells(grid, cells, row, col) {
  for (const [dr, dc] of cells) {
    const r = row + dr, c = col + dc
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false
    if (grid[r * GRID_SIZE + c] !== 0) return false
  }
  return true
}

export function resolveGlitchMorph(grid, shapeId, cellCount, row, col, seed, placementOrdinal) {
  const [seedLo, seedHi] = seedParts(seed)
  const key = [seedLo, seedHi, placementOrdinal, row, col, hashShapeId(shapeId)]

  if (mix32(0x9e3779b9, key) / 0x100000000 >= GLITCH_CHANCE) return null

  const candidates = []
  for (const shape of SHAPES) {
    if (shape.id === shapeId) continue
    if (shape.cellCount !== cellCount) continue
    if (!canPlaceCells(grid, shape.cells, row, col)) continue
    candidates.push(shape)
  }
  if (candidates.length === 0) return null

  return candidates[mix32(0x85ebca6b, key) % candidates.length]
}

// ── Grid utilities ────────────────────────────────────────────────────────────

function createGrid() {
  return new Uint8Array(TOTAL_CELLS)
}

// Mirrors rotatePieceShape() in src/engine/game.ts (90° CW + re-normalise)
function rotateCells(cells) {
  const maxR = Math.max(...cells.map(([r]) => r))
  const rotated = cells.map(([r, c]) => [c, maxR - r])
  const minR = Math.min(...rotated.map(([r]) => r))
  const minC = Math.min(...rotated.map(([, c]) => c))
  return rotated.map(([r, c]) => [r - minR, c - minC])
}

function canPlace(grid, cells, row, col) {
  for (const [dr, dc] of cells) {
    const r = row + dr, c = col + dc
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false
    if (grid[r * GRID_SIZE + c] !== 0) return false
  }
  return true
}

function placeShape(grid, cells, row, col, colorId) {
  for (const [dr, dc] of cells) {
    grid[(row + dr) * GRID_SIZE + (col + dc)] = colorId
  }
}

/** Mirrors Grid.findFullLines + Grid.clearLines. Returns the number of lines cleared. */
function findAndClearLines(grid, allowDiagonals) {
  const rows = [], cols = [], diags = []
  for (let r = 0; r < GRID_SIZE; r++) {
    let full = true
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r * GRID_SIZE + c] === 0) { full = false; break }
    }
    if (full) rows.push(r)
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    let full = true
    for (let r = 0; r < GRID_SIZE; r++) {
      if (grid[r * GRID_SIZE + c] === 0) { full = false; break }
    }
    if (full) cols.push(c)
  }
  if (allowDiagonals) {
    let mainFull = true, antiFull = true
    for (let i = 0; i < GRID_SIZE; i++) {
      if (grid[i * GRID_SIZE + i] === 0) mainFull = false
      if (grid[i * GRID_SIZE + (GRID_SIZE - 1 - i)] === 0) antiFull = false
    }
    if (mainFull) diags.push(0)
    if (antiFull) diags.push(1)
  }

  const toClear = new Set()
  for (const r of rows) for (let c = 0; c < GRID_SIZE; c++) toClear.add(r * GRID_SIZE + c)
  for (const c of cols) for (let r = 0; r < GRID_SIZE; r++) toClear.add(r * GRID_SIZE + c)
  for (const d of diags) {
    for (let i = 0; i < GRID_SIZE; i++) {
      toClear.add(d === 0 ? i * GRID_SIZE + i : i * GRID_SIZE + (GRID_SIZE - 1 - i))
    }
  }
  for (const idx of toClear) grid[idx] = 0
  return rows.length + cols.length + diags.length
}

/**
 * LIQUID settle — port of Grid.settleLiquid.
 * One gravity step, only the cells just placed, bottom row first so a vertical
 * piece slides intact instead of tearing apart.
 */
function settleLiquid(grid, cells) {
  const ordered = [...cells].sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]))
  for (const [r, c] of ordered) {
    const below = r + 1
    if (below < GRID_SIZE && grid[below * GRID_SIZE + c] === 0) {
      grid[below * GRID_SIZE + c] = grid[r * GRID_SIZE + c]
      grid[r * GRID_SIZE + c] = 0
    }
  }
}

function clearColumns(grid, cols) {
  for (const col of cols) {
    for (let r = 0; r < GRID_SIZE; r++) grid[r * GRID_SIZE + col] = 0
  }
}

// Mirrors shieldRevive()'s column selection (stable sort, count desc)
function mostFilledColumns(grid, n) {
  const fillCounts = Array.from({ length: GRID_SIZE }, (_, col) => {
    let count = 0
    for (let r = 0; r < GRID_SIZE; r++) {
      if (grid[r * GRID_SIZE + col] !== 0) count++
    }
    return { col, count }
  })
  return fillCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((x) => x.col)
}

// Expected totalPoints for a placement, matching calculateScore()
function expectedTotal(basePoints, linesCleared, newStreak, scoreBefore, rules) {
  const linePoints = linePointsFor(linesCleared, rules)
  let comboMultiplier = 1.0
  let milestoneBonus = 0
  if (linesCleared > 0) {
    comboMultiplier = comboMultiplierFor(newStreak, scoreBefore, rules)
    milestoneBonus = MILESTONE_BONUS[newStreak] ?? 0
  }
  return Math.round((basePoints + linePoints) * comboMultiplier) + milestoneBonus
}

// ── Main validator ─────────────────────────────────────────────────────────────

/**
 * Replays moves against a full engine simulation and verifies the claimed score.
 *
 * @param {Array}   moves        - moveHistory array from the client
 * @param {number}  claimedScore - the score the client submitted
 * @param {bigint=} localSeed    - engine seed derived from the on-chain seed
 *                                 (BigInt(keccak256(seed ‖ player).slice(0, 18))).
 *                                 When provided, dealt pieces are verified against
 *                                 the seed; without it only geometry/points are checked.
 * @param {number=} rulesVersion - ruleset the client played under. Absent means a
 *                                 pre-v2 client, which is v1.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function replayAndValidateScore(moves, claimedScore, localSeed, rulesVersion = 1) {
  if (!Array.isArray(moves)) return { ok: false, reason: 'moves is not an array' }
  if (moves.length > MAX_MOVES) return { ok: false, reason: `too many moves (${moves.length})` }
  if (!Number.isInteger(claimedScore) || claimedScore < 0 || claimedScore > 0xffffffff) {
    return { ok: false, reason: `claimed score out of range (${claimedScore})` }
  }
  if (rulesVersion !== 1 && rulesVersion !== 2) {
    return { ok: false, reason: `unknown rulesVersion ${rulesVersion}` }
  }
  const rules = rulesFor(rulesVersion)

  if (moves.length === 0) {
    return claimedScore === 0 ? { ok: true } : { ok: false, reason: 'non-zero score with no moves' }
  }

  // Grid must exist before the opening deal — under v2 the dealer reads it.
  const grid = createGrid()
  const rng = localSeed !== undefined ? new DeterministicRNG(localSeed) : null
  // Trio state mirrors GameSession: constructor deals immediately, score 0.
  let trio = rng ? dealThreeSmart(rng, grid, 0, rules) : null
  let piecesPlaced = 0

  let replayedScore = 0
  // Successful placements so far — seeds the GLITCH morph hash. Counts
  // placements only, never marker records; see src/engine/glitch.ts.
  let placementOrdinal = 0
  let combo = { streak: 0, graceUsed: false }
  // Combo streak before the most recent placement — a shield revival restores it.
  let prevComboStreak = 0
  let lotteryMovesLeft = 0
  let lotteryStartMarkers = 0
  let lotteryBonusMarkers = 0

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i]

    // ── Lottery ×2 multiplier activation marker ──────────────────────────────
    if (move.lotteryMultiplierStart === true) {
      if (++lotteryStartMarkers > MAX_LOTTERY_MARKERS) {
        return { ok: false, reason: 'too many lottery multiplier markers' }
      }
      lotteryMovesLeft = 3
      continue
    }

    // ── Marker moves (pieceIndex: -1) ────────────────────────────────────────
    if (move.pieceIndex === -1) {
      if (move.revive === true) {
        if (move.shield === true) {
          // Shield revival: re-clear the recorded columns and restore the
          // combo streak from before the fatal placement, exactly like the
          // live engine (gameStore.placePiece → shieldRevive()).
          const cols = Array.isArray(move.shieldCols) && move.shieldCols.length
            ? move.shieldCols
            : mostFilledColumns(grid, 3)
          if (cols.some((c) => !Number.isInteger(c) || c < 0 || c >= GRID_SIZE)) {
            return { ok: false, reason: `move ${i}: invalid shieldCols` }
          }
          clearColumns(grid, cols)
          combo = { streak: prevComboStreak, graceUsed: false }
        } else {
          // GameSession.revive() clears the grace flag without touching the streak.
          combo = { streak: combo.streak, graceUsed: false }
        }
        // Both revive kinds deal a fresh trio, discarding unplaced pieces.
        if (rng) {
          trio = dealThreeSmart(rng, grid, replayedScore, rules)
          piecesPlaced = 0
        }
        continue
      }

      if (typeof move.lotteryBonus === 'number') {
        if (move.lotteryBonus !== LOTTERY_BONUS_POINTS) {
          return { ok: false, reason: `move ${i}: lottery bonus ${move.lotteryBonus} ≠ ${LOTTERY_BONUS_POINTS}` }
        }
        if (++lotteryBonusMarkers > MAX_LOTTERY_MARKERS) {
          return { ok: false, reason: 'too many lottery bonus markers' }
        }
        replayedScore += LOTTERY_BONUS_POINTS
        continue
      }

      if (move.bomb) {
        // Mirrors GameSession.bombZone: full row + column cross, feeds combo,
        // counts as a 2-line clear, boost triples the per-cell points.
        const { row: br, col: bc } = move.bomb
        if (!Number.isInteger(br) || br < 0 || br >= GRID_SIZE ||
            !Number.isInteger(bc) || bc < 0 || bc >= GRID_SIZE) {
          return { ok: false, reason: `move ${i}: bomb target out of bounds` }
        }
        const scoreBefore = replayedScore
        let cellsCleared = 0
        for (let c = 0; c < GRID_SIZE; c++) {
          if (grid[br * GRID_SIZE + c] !== 0) { grid[br * GRID_SIZE + c] = 0; cellsCleared++ }
        }
        for (let r = 0; r < GRID_SIZE; r++) {
          if (grid[r * GRID_SIZE + bc] !== 0) { grid[r * GRID_SIZE + bc] = 0; cellsCleared++ }
        }

        const newStreak = combo.streak + 1
        const mult = comboMultiplierFor(newStreak, scoreBefore, rules)
        const milestone = MILESTONE_BONUS[newStreak] ?? 0
        const linePoints = linePointsFor(2, rules)
        const candidates = [
          Math.round((Math.round(cellsCleared * 5 * 1.0) + linePoints) * mult) + milestone,
          Math.round((Math.round(cellsCleared * 5 * 3.0) + linePoints) * mult) + milestone, // score boost
        ]
        const recorded = move.scoreEvent?.totalPoints
        if (!candidates.includes(recorded)) {
          return { ok: false, reason: `move ${i}: bomb points ${recorded} not in [${candidates}]` }
        }
        // A bomb counts as a clear, so it refreshes the combo grace.
        combo = { streak: newStreak, graceUsed: false }
        replayedScore += recorded
        continue
      }

      // Unknown marker type — reject rather than let it slip through unvalidated
      return { ok: false, reason: `move ${i}: unknown marker record` }
    }

    // ── Regular placement (pieceIndex: 0|1|2) ────────────────────────────────
    if (!Number.isInteger(move.pieceIndex) || move.pieceIndex < 0 || move.pieceIndex > 2) {
      return { ok: false, reason: `move ${i}: invalid pieceIndex ${move.pieceIndex}` }
    }
    if (!move.shapeId) return { ok: false, reason: `move ${i}: missing shapeId` }

    const shape = SHAPE_MAP[move.shapeId]
    if (!shape) return { ok: false, reason: `move ${i}: unknown shapeId ${move.shapeId}` }

    // Verify the piece actually came from the seed-determined deal
    if (trio) {
      const dealt = trio[move.pieceIndex]
      if (!dealt) return { ok: false, reason: `move ${i}: piece slot ${move.pieceIndex} already used` }
      if (dealt.id !== move.shapeId) {
        return { ok: false, reason: `move ${i}: shape ${move.shapeId} does not match dealt ${dealt.id}` }
      }
    }

    // Apply Rotate Pass rotations
    let cells = shape.cells
    const rotations = move.rotations ?? 0
    if (!Number.isInteger(rotations) || rotations < 0 || rotations > 3) {
      return { ok: false, reason: `move ${i}: invalid rotations ${move.rotations}` }
    }
    for (let r = 0; r < rotations; r++) cells = rotateCells(cells)

    if (!canPlace(grid, cells, move.row, move.col)) {
      return { ok: false, reason: `move ${i}: invalid placement ${move.shapeId} at ${move.row},${move.col}` }
    }

    // Tier mechanics resolve off the score BEFORE this placement, same as the
    // client (GameSession.placePiece captures scoreBefore up front).
    const scoreBefore = replayedScore

    // GLITCH (100k+) — recomputed here from the seed, never taken from the
    // client. move.glitchedTo is informational and deliberately ignored.
    let effectiveCells = cells
    let effectiveColorId = shape.colorId
    if (glitchEnabledFor(scoreBefore, rules) && localSeed !== undefined) {
      const morph = resolveGlitchMorph(
        grid,
        shape.id,
        shape.cellCount,
        move.row,
        move.col,
        localSeed,
        placementOrdinal
      )
      if (morph) {
        effectiveCells = morph.cells
        effectiveColorId = morph.colorId
      }
    }

    placeShape(grid, effectiveCells, move.row, move.col, effectiveColorId)

    // LIQUID (45k+) — placed cells slide one row down before lines are scored.
    if (liquidEnabledFor(scoreBefore, rules)) {
      settleLiquid(
        grid,
        effectiveCells.map(([dr, dc]) => [move.row + dr, move.col + dc])
      )
    }

    const linesCleared = findAndClearLines(grid, diagonalsEnabledFor(scoreBefore, rules))

    // Verify the reported line count matches the grid simulation
    if (move.scoreEvent?.linesCleared !== undefined && move.scoreEvent.linesCleared !== linesCleared) {
      return { ok: false, reason: `move ${i}: lines client=${move.scoreEvent.linesCleared} server=${linesCleared}` }
    }

    // Verify combo streak follows from actual line clears (incl. v2 grace)
    const nextCombo = nextComboState(combo, linesCleared, scoreBefore, rules)
    if (move.scoreEvent?.newComboStreak !== undefined && move.scoreEvent.newComboStreak !== nextCombo.streak) {
      return { ok: false, reason: `move ${i}: combo client=${move.scoreEvent.newComboStreak} server=${nextCombo.streak}` }
    }

    // Recompute points. Score Boost (client-side state) doubles base points, so
    // accept either the plain or boosted total; the active lottery multiplier
    // doubles the whole event for 3 placements.
    const rawBase = basePointsFor(shape.cellCount, rules)
    const pixelFactor = pixelBaseFactorFor(scoreBefore, linesCleared, rules)
    const baseCandidates = [
      Math.round(rawBase * 1.0 * pixelFactor),
      Math.round(rawBase * 2.0 * pixelFactor), // score boost
    ]
    let candidates = baseCandidates.map((b) =>
      expectedTotal(b, linesCleared, nextCombo.streak, scoreBefore, rules)
    )
    if (lotteryMovesLeft > 0) candidates = candidates.map((t) => t * 2)

    const recorded = move.scoreEvent?.totalPoints
    if (!candidates.includes(recorded)) {
      return { ok: false, reason: `move ${i}: points ${recorded} not in [${candidates}]` }
    }

    prevComboStreak = combo.streak
    combo = nextCombo
    replayedScore += recorded
    placementOrdinal++

    if (lotteryMovesLeft > 0) lotteryMovesLeft--

    // Consume the piece; a fresh trio is dealt as soon as all three are placed
    // (same point in the sequence as GameSession.placePiece → deal()).
    if (trio) {
      trio[move.pieceIndex] = null
      piecesPlaced++
      if (piecesPlaced === 3) {
        trio = dealThreeSmart(rng, grid, replayedScore, rules)
        piecesPlaced = 0
      }
    }
  }

  if (replayedScore !== claimedScore) {
    return { ok: false, reason: `score mismatch: replayed=${replayedScore} claimed=${claimedScore}` }
  }
  return { ok: true }
}
