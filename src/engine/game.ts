import { Grid } from './grid'
import type { ShapeDefinition } from './shapes'
import { DeterministicRNG } from './rng'
import { dealThreeSmart } from './dealer'
import { calculateScore, MILESTONE_BONUS } from './scoring'
import type { ScoreEvent } from './scoring'
import { resolveGlitchMorph } from './glitch'
import {
  CURRENT_RULES_VERSION,
  comboMultiplierFor,
  diagonalsEnabledFor,
  glitchEnabledFor,
  linePointsFor,
  liquidEnabledFor,
  multiLineFactorFor,
  rulesFor,
} from './rules'
import type { RuleSet, RulesVersion } from './rules'

export interface MoveRecord {
  pieceIndex: number
  shapeId: string
  row: number
  col: number
  scoreEvent: ScoreEvent
  rotations?: number        // 0-3 CW quarter-turns applied before placement
  bomb?: { row: number; col: number }
  revive?: true             // marks a revival point — replay calls session.revive()
  shield?: true             // revival came from a shield — replay must clear shieldCols first
  shieldCols?: number[]     // columns cleared by shieldRevive(), recorded for deterministic replay
  lotteryBonus?: number     // flat score bonus awarded by lottery — replay adds to session.score
  lotteryMultiplierStart?: true  // lottery ×2 multiplier activated — replay sets lotteryMultiplierMovesLeft=3
  /**
   * Whether Score Boost was active for THIS placement.
   *
   * Score Boost can be switched on mid-run, so a single session-level flag
   * cannot describe a run where some moves were boosted and some were not —
   * replaying such a run with one flag drifts the score. That drift used to be
   * cosmetic (the final score was recomputed from the record anyway), but the
   * score now gates board-changing mechanics, so a drifted restore would
   * rebuild a DIFFERENT board and every later move would fail server
   * validation. Recording it per move makes the restore exact.
   *
   * The server ignores this field — it already accepts either the boosted or
   * unboosted value, so a client cannot use it to claim points.
   */
  boosted?: true
  /**
   * GLITCH tier: the shape this placement actually became. Informational only —
   * recorded for the UI and for debugging. The server recomputes the morph from
   * the seed and ignores this field, so it can never be used to claim a
   * different piece than the one that was dealt.
   */
  glitchedTo?: string
}

export interface PlaceResult {
  success: boolean
  error?: string
  scoreEvent?: ScoreEvent
  linesCleared?: { rows: number[]; cols: number[] }
  isGameOver: boolean
}

// Rotate a ShapeDefinition 90° clockwise
export function rotatePieceShape(piece: ShapeDefinition): ShapeDefinition {
  const cells = piece.cells as [number, number][]
  const maxR = Math.max(...cells.map(([r]) => r))
  const rotated: [number, number][] = cells.map(([r, c]) => [c, maxR - r])
  const minR = Math.min(...rotated.map(([r]) => r))
  const minC = Math.min(...rotated.map(([, c]) => c))
  const normalized = rotated.map(([r, c]) => [r - minR, c - minC] as [number, number])
  const newWidth = Math.max(...normalized.map(([, c]) => c)) + 1
  const newHeight = Math.max(...normalized.map(([r]) => r)) + 1
  return {
    ...piece,
    cells: normalized,
    width: newWidth,
    height: newHeight,
    rotations: ((piece.rotations ?? 0) + 1) % 4,
  }
}

export class GameSession {
  grid: Uint8Array
  score: number = 0
  comboStreak: number = 0
  currentPieces: (ShapeDefinition | null)[] = [null, null, null]
  piecesPlaced: number = 0
  moveHistory: MoveRecord[] = []
  isGameOver: boolean = false
  dealCount: number = 0
  seed: bigint
  scoreBoostActive: boolean = false
  // Lottery ×2 multiplier — counts down from 3 to 0 as pieces are placed.
  // Replay restores this via a lotteryMultiplierStart record in moveHistory.
  lotteryMultiplierMovesLeft: number = 0
  /** True once the single combo-grace placement has been spent this streak. */
  graceUsed: boolean = false
  /**
   * Successful placements this session, never reset. Seeds the GLITCH morph
   * hash — see src/engine/glitch.ts for why this and not moveHistory.length.
   */
  totalPlacements: number = 0
  /** Ruleset this session is played under; stamped into the submit payload. */
  readonly rulesVersion: RulesVersion
  readonly rules: RuleSet

  private rng: DeterministicRNG

  constructor(seed: bigint, rulesVersion: RulesVersion = CURRENT_RULES_VERSION) {
    this.seed = seed
    this.rulesVersion = rulesVersion
    this.rules = rulesFor(rulesVersion)
    this.rng = new DeterministicRNG(seed)
    this.grid = Grid.createGrid()
    this.deal()
  }

  revive(): void {
    this.isGameOver = false
    this.graceUsed = false
    this.deal()
  }

  // Shield revive: clears the 3 most-filled columns to create space, then revives.
  // Returns the column indices that were cleared (for UI feedback).
  shieldRevive(): number[] {
    // Count filled cells per column
    const fillCounts = Array.from({ length: Grid.SIZE }, (_, col) => {
      let count = 0
      for (let r = 0; r < Grid.SIZE; r++) {
        if (this.grid[r * Grid.SIZE + col] !== 0) count++
      }
      return { col, count }
    })
    // Pick 3 most-filled columns
    const topThree = fillCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((x) => x.col)

    // Clear those columns
    for (const col of topThree) {
      for (let r = 0; r < Grid.SIZE; r++) {
        this.grid[r * Grid.SIZE + col] = 0
      }
    }

    this.revive()
    return topThree.sort((a, b) => a - b)
  }

  // Rotate piece at index 90° CW. Returns false if slot is empty.
  rotatePiece(pieceIndex: number): boolean {
    const piece = this.currentPieces[pieceIndex]
    if (!piece) return false
    this.currentPieces[pieceIndex] = rotatePieceShape(piece)
    return true
  }

  // Explode the full row and column through (centerRow, centerCol).
  // Treats the cross as 2 line clears — feeds combo streak and applies score boost.
  bombZone(centerRow: number, centerCol: number): ScoreEvent {
    let cellsCleared = 0
    for (let c = 0; c < Grid.SIZE; c++) {
      if (this.grid[centerRow * Grid.SIZE + c] !== 0) {
        this.grid[centerRow * Grid.SIZE + c] = 0
        cellsCleared++
      }
    }
    for (let r = 0; r < Grid.SIZE; r++) {
      if (this.grid[r * Grid.SIZE + centerCol] !== 0) {
        this.grid[r * Grid.SIZE + centerCol] = 0
        cellsCleared++
      }
    }

    // Cell pts: 3× when both boost and bomb are synergised, 2× for boost alone
    const basePoints   = Math.round(cellsCleared * 5 * (this.scoreBoostActive ? 3.0 : 1.0))
    // Row + column = 2 line clears → 2-line multi-factor
    const scoreBefore     = this.score
    const linesCleared    = 2
    const multiLineFactor = multiLineFactorFor(linesCleared, this.rules)
    const linePoints      = linePointsFor(linesCleared, this.rules)

    // Feed the combo streak — a bomb counts as a clear, so it also refreshes grace
    const newComboStreak  = this.comboStreak + 1
    const comboMultiplier = comboMultiplierFor(newComboStreak, scoreBefore, this.rules)
    const isMilestone     = newComboStreak in MILESTONE_BONUS
    const milestoneBonus  = MILESTONE_BONUS[newComboStreak] ?? 0

    const rawPoints  = basePoints + linePoints
    const totalPoints = Math.round(rawPoints * comboMultiplier) + milestoneBonus
    const comboBonus  = totalPoints - rawPoints

    this.comboStreak = newComboStreak
    this.graceUsed   = false
    this.score      += totalPoints

    return {
      basePoints, linePoints, comboBonus, totalPoints,
      linesCleared, newComboStreak, comboMultiplier, isMilestone, multiLineFactor,
    }
  }

  deal(): void {
    // Board-aware under v2: the dealer reads the grid and the running score so
    // it can protect a cornered player early and tighten up late. Under v1 it
    // degrades to exactly three weighted draws. See src/engine/dealer.ts.
    const trio = dealThreeSmart(this.rng, this.grid, this.score, this.rules)
    this.currentPieces = [...trio]
    this.piecesPlaced = 0
    this.dealCount++

    if (!Grid.canPlaceAny(this.grid, trio)) {
      this.isGameOver = true
    }
  }

  /**
   * Where a piece would actually end up if dropped at (row, col), accounting for
   * the GLITCH morph and the LIQUID settle. Non-mutating.
   *
   * The drag preview needs this: once those tiers are live, the naive ghost
   * (the raw piece outline at the cursor) is a lie — the piece can change shape
   * and can slide a row. Showing the true landing cells keeps the preview
   * trustworthy, and keeps the "this move clears a line" highlight correct.
   *
   * Returns null when the placement is illegal.
   */
  previewPlacement(pieceIndex: number, row: number, col: number): Array<[number, number]> | null {
    const piece = this.currentPieces[pieceIndex]
    if (!piece) return null
    if (!Grid.canPlace(this.grid, piece, row, col)) return null

    const scoreBefore = this.score

    let shape = piece
    if (glitchEnabledFor(scoreBefore, this.rules)) {
      const morph = resolveGlitchMorph(
        this.grid,
        piece.id,
        piece.cellCount,
        row,
        col,
        this.seed,
        this.totalPlacements
      )
      if (morph) shape = morph
    }

    const cells = shape.cells.map(([dr, dc]) => [row + dr, col + dc] as [number, number])
    if (!liquidEnabledFor(scoreBefore, this.rules)) return cells

    // Settle against a scratch copy so the live board is untouched.
    const scratch = Grid.cloneGrid(this.grid)
    Grid.placeShape(scratch, shape, row, col, shape.colorId)
    return Grid.settleLiquid(scratch, cells)
  }

  placePiece(pieceIndex: number, row: number, col: number): PlaceResult {
    if (this.isGameOver) {
      return { success: false, error: 'Game is over', isGameOver: true }
    }

    if (pieceIndex < 0 || pieceIndex > 2) {
      return { success: false, error: 'Invalid piece index', isGameOver: false }
    }

    const piece = this.currentPieces[pieceIndex]
    if (!piece) {
      return {
        success: false,
        error: 'Piece already placed',
        isGameOver: false,
      }
    }

    if (!Grid.canPlace(this.grid, piece, row, col)) {
      return { success: false, error: 'Invalid placement', isGameOver: false }
    }

    // Tier mechanics are gated on the score BEFORE this placement, so both the
    // client and the server replay resolve them from the same value.
    const scoreBefore = this.score

    // GLITCH (100k+) — the piece may become a different shape of the same size
    // as it lands. Derived from a hash, not the RNG, so the deal stream can
    // never drift out of sync with the server. See src/engine/glitch.ts.
    let effectiveShape = piece
    let glitched = false
    if (glitchEnabledFor(scoreBefore, this.rules)) {
      const morph = resolveGlitchMorph(
        this.grid,
        piece.id,
        piece.cellCount,
        row,
        col,
        this.seed,
        this.totalPlacements
      )
      if (morph) {
        effectiveShape = morph
        glitched = true
      }
    }

    // Assign the color ID defined in the shape definition
    const colorId = effectiveShape.colorId

    Grid.placeShape(this.grid, effectiveShape, row, col, colorId)

    // LIQUID (45k+) — the cells just placed slide one row down into any gap
    // beneath them, before lines are evaluated.
    if (liquidEnabledFor(scoreBefore, this.rules)) {
      Grid.settleLiquid(
        this.grid,
        effectiveShape.cells.map(([dr, dc]) => [row + dr, col + dc] as [number, number])
      )
    }

    const allowDiagonals = diagonalsEnabledFor(scoreBefore, this.rules)

    const fullLines = Grid.findFullLines(this.grid, allowDiagonals)
    const { cellsCleared } = Grid.clearLines(
      this.grid,
      fullLines.rows,
      fullLines.cols,
      fullLines.diags
    )

    const baseEvent = calculateScore(
      piece,
      fullLines.rows.length + fullLines.cols.length + fullLines.diags.length,
      { streak: this.comboStreak, graceUsed: this.graceUsed },
      { scoreBefore, scoreBoostActive: this.scoreBoostActive, rules: this.rules }
    )

    // Apply lottery ×2 multiplier if active — doubles total and base points,
    // then counts down. The modified event is what gets saved to moveHistory
    // so the recorded score matches what the player saw.
    let scoreEvent = baseEvent
    if (this.lotteryMultiplierMovesLeft > 0) {
      scoreEvent = {
        ...baseEvent,
        basePoints:  baseEvent.basePoints  * 2,
        totalPoints: baseEvent.totalPoints * 2,
      }
      this.lotteryMultiplierMovesLeft--
    }

    this.score += scoreEvent.totalPoints
    this.comboStreak = scoreEvent.newComboStreak
    this.graceUsed = scoreEvent.graceUsed ?? false
    this.currentPieces[pieceIndex] = null
    this.piecesPlaced++
    this.totalPlacements++

    this.moveHistory.push({
      pieceIndex,
      // Always the DEALT shape. The server verifies this against the seed and
      // recomputes any GLITCH morph itself, so the morph is never client-stated.
      shapeId: piece.id,
      row,
      col,
      scoreEvent,
      ...(piece.rotations ? { rotations: piece.rotations } : {}),
      ...(glitched ? { glitchedTo: effectiveShape.id } : {}),
      ...(this.scoreBoostActive ? { boosted: true } : {}),
    })

    // If all pieces placed, deal new ones
    if (this.piecesPlaced === 3) {
      this.deal()
    } else {
      // Check if any remaining pieces can be placed
      const remainingPieces = this.currentPieces.filter(
        (p): p is ShapeDefinition => p !== null
      )
      if (!Grid.canPlaceAny(this.grid, remainingPieces)) {
        this.isGameOver = true
      }
    }

    return {
      success: true,
      scoreEvent,
      linesCleared: fullLines,
      isGameOver: this.isGameOver,
    }
  }
}
