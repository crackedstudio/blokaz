/**
 * GLITCH TIER MECHANIC (100k+) — "Rare GLITCH piece may morph into a different
 * shape on placement."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  MIRROR CONTRACT — see the header of src/engine/rules.ts.
 *     Duplicated verbatim in server/engine/scoreReplay.js.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS DOES NOT TOUCH THE RNG
 *
 * The obvious implementation is to draw from the session RNG at placement time.
 * That is exactly what makes this mechanic dangerous: the same RNG stream feeds
 * the deals, so if the client and the server ever disagree about whether a draw
 * happened — one extra or one missing — every deal from that point on diverges
 * and the player's honest score is rejected forever after.
 *
 * So the morph is derived instead from a pure hash of state both sides already
 * hold and already agree on:
 *
 *     (seed, placement ordinal, row, col, dealt shape id)
 *
 * There is no stream, no ordering hazard, and nothing to keep in sync. The
 * server recomputes the morph from the move history alone.
 *
 * The placement ordinal is a count of *successful placements*, not an index
 * into moveHistory, because marker records (revive / bomb / lottery) are pushed
 * to the history by callers rather than by the engine — and session restore
 * replays markers through engine methods that never re-push them. Counting
 * placements is the one measure all three paths agree on.
 *
 * TWO INVARIANTS keep the morph from destabilising anything downstream:
 *   1. The morph target must fit at the same origin, so a morphed placement is
 *      never illegal.
 *   2. The morph target has the same cellCount, so base points are unchanged
 *      and scoring cannot diverge on piece size.
 */

import { SHAPES } from './shapes'
import type { ShapeDefinition } from './shapes'

/** Probability a placement morphs, once GLITCH tier is active. */
export const GLITCH_CHANCE = 0.12

const GRID_SIZE = 9

/** FNV-1a over a string. Identical output in any JS engine. */
function hashShapeId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Integer avalanche mix. Deterministic and engine-independent. */
function mix32(salt: number, values: number[]): number {
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

/** Split a 64-bit seed into two 32-bit halves the same way on both sides. */
function seedParts(seed: bigint): [number, number] {
  return [Number(seed & 0xffffffffn), Number((seed >> 32n) & 0xffffffffn)]
}

function canPlaceCells(
  grid: Uint8Array,
  cells: readonly (readonly [number, number])[],
  row: number,
  col: number
): boolean {
  for (const [dr, dc] of cells) {
    const r = row + dr
    const c = col + dc
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false
    if (grid[r * GRID_SIZE + c] !== 0) return false
  }
  return true
}

/**
 * Decide whether a placement morphs, and into what.
 *
 * @param grid    board state BEFORE the piece is written
 * @param shapeId id of the shape as it was DEALT (not the rotated form — the
 *                server only knows the dealt id, so both sides must hash that)
 * @param cellCount cells in the dealt shape; the morph target matches it
 * @returns the replacement shape, or null to place the piece unchanged
 */
export function resolveGlitchMorph(
  grid: Uint8Array,
  shapeId: string,
  cellCount: number,
  row: number,
  col: number,
  seed: bigint,
  placementOrdinal: number
): ShapeDefinition | null {
  const [seedLo, seedHi] = seedParts(seed)
  const key = [seedLo, seedHi, placementOrdinal, row, col, hashShapeId(shapeId)]

  // Salt 1 decides whether it fires at all.
  if (mix32(0x9e3779b9, key) / 0x100000000 >= GLITCH_CHANCE) return null

  // Same size, different shape, and it must fit where the player aimed.
  const candidates: ShapeDefinition[] = []
  for (const shape of SHAPES) {
    if (shape.id === shapeId) continue
    if (shape.cellCount !== cellCount) continue
    if (!canPlaceCells(grid, shape.cells, row, col)) continue
    candidates.push(shape)
  }
  if (candidates.length === 0) return null

  // Salt 2 picks which one. Catalog order makes the index stable.
  return candidates[mix32(0x85ebca6b, key) % candidates.length]
}
