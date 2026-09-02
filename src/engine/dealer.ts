/**
 * BOARD-AWARE DEALER
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  MIRROR CONTRACT — see the header of src/engine/rules.ts.
 *     Duplicated verbatim in server/engine/scoreReplay.js. The server replays
 *     the deal sequence to verify a submitted piece actually came from the
 *     seed, so any divergence here rejects honest tournament scores.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * v1 dealt three shapes from static spawn weights with no knowledge of the
 * board. Weights on move 1 were identical to weights on move 500. Two failures
 * came out of that:
 *
 *   1. Unfair deaths. The dealer could hand you three 3×3 squares onto a
 *      half-full board and end the run through no fault of yours. A death the
 *      player attributes to the game is the one kind that does not produce a
 *      retry — which makes it the most expensive moment in the product.
 *   2. No difficulty curve. Nothing about the deal responded to how well you
 *      were doing, so sessions had no arc. They just stopped.
 *
 * v2 keeps the weighted catalog as the base distribution and layers three
 * board-sensitive corrections on top:
 *
 *   • Relief re-rolls — once the board is congested, a piece that cannot be
 *     placed at all (or a heavy piece on an almost-full board) is re-drawn, up
 *     to a bounded number of times.
 *   • Late-game pressure — past NEON tier the re-roll budget drops, so the
 *     game tightens exactly when the player is strong. This is the curve.
 *   • The mercy piece — a deal is never opened with three pieces that all have
 *     nowhere to go. Its effect is deliberately bounded: it buys exactly one
 *     more placement, so the run still ends, but the player gets to make a
 *     final move instead of being killed by a draw they could not answer.
 *
 * Everything is driven off the same deterministic RNG stream and the current
 * grid, both of which the server reproduces exactly, so replay verification is
 * unaffected.
 */

import { SHAPES } from './shapes'
import type { ShapeDefinition } from './shapes'
import { DeterministicRNG, selectShape } from './rng'
import type { RuleSet } from './rules'

const GRID_SIZE = 9
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE

/**
 * Board fill at which the dealer starts protecting the player.
 *
 * Tuned against simulation, not taste: across 400 greedy-played games the mean
 * board fill at death is ~61%, so a threshold above that would leave the relief
 * logic dormant in exactly the situations it exists for. It has to sit well
 * below the death band to do anything.
 */
export const RELIEF_FILL_RATIO = 0.45
/** Board fill above which heavy pieces are treated as bad draws. */
export const HEAVY_FILL_RATIO = 0.6
/** A piece this size or larger is "heavy" (O23, O32, O3). */
export const HEAVY_PIECE_CELLS = 6
/** Score at which the dealer stops being generous. NEON tier. */
export const LATE_GAME_SCORE = 9000
/** Re-roll budget per piece, before and after the late-game threshold. */
export const MAX_REROLLS_EARLY = 3
export const MAX_REROLLS_LATE = 1

function countFilled(grid: Uint8Array): number {
  let n = 0
  for (let i = 0; i < grid.length; i++) if (grid[i] !== 0) n++
  return n
}

/** Can this shape be placed anywhere on the current board, in its dealt orientation? */
function fitsAnywhere(grid: Uint8Array, shape: ShapeDefinition): boolean {
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      let ok = true
      for (const [dr, dc] of shape.cells) {
        const r = row + dr
        const c = col + dc
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

/** A draw worth spending a re-roll on. */
function isBadDraw(grid: Uint8Array, shape: ShapeDefinition, fillRatio: number): boolean {
  if (!fitsAnywhere(grid, shape)) return true
  if (fillRatio >= HEAVY_FILL_RATIO && shape.cellCount >= HEAVY_PIECE_CELLS) return true
  return false
}

/**
 * Smallest shape in catalog order that fits the current board, or null when
 * the board is completely full. Catalog order breaks ties, so this is stable
 * across client and server.
 */
function smallestFittingShape(grid: Uint8Array): ShapeDefinition | null {
  let best: ShapeDefinition | null = null
  for (const shape of SHAPES) {
    if (!fitsAnywhere(grid, shape)) continue
    if (best === null || shape.cellCount < best.cellCount) best = shape
  }
  return best
}

/**
 * Deal the next trio.
 *
 * Under v1 rules this consumes exactly three RNG draws in the original order,
 * making it bit-identical to the old `dealThree` — legacy replays are unaffected.
 */
export function dealThreeSmart(
  rng: DeterministicRNG,
  grid: Uint8Array,
  score: number,
  rules: RuleSet
): [ShapeDefinition, ShapeDefinition, ShapeDefinition] {
  if (!rules.boardAwareDealer) {
    return [selectShape(rng, SHAPES), selectShape(rng, SHAPES), selectShape(rng, SHAPES)]
  }

  const fillRatio = countFilled(grid) / TOTAL_CELLS
  const reliefActive = fillRatio >= RELIEF_FILL_RATIO
  const rerollBudget = score >= LATE_GAME_SCORE ? MAX_REROLLS_LATE : MAX_REROLLS_EARLY

  const trio: ShapeDefinition[] = []
  for (let i = 0; i < 3; i++) {
    let pick = selectShape(rng, SHAPES)
    if (reliefActive) {
      let rerolls = rerollBudget
      while (rerolls > 0 && isBadDraw(grid, pick, fillRatio)) {
        pick = selectShape(rng, SHAPES)
        rerolls--
      }
    }
    trio.push(pick)
  }

  // Mercy piece — never open a deal that is already a dead end.
  if (!trio.some((shape) => fitsAnywhere(grid, shape))) {
    const rescue = smallestFittingShape(grid)
    if (rescue) trio[2] = rescue
  }

  return trio as [ShapeDefinition, ShapeDefinition, ShapeDefinition]
}
