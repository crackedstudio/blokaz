import { GameSession } from './game'
import type { MoveRecord } from './game'
import { Grid } from './grid'
import { CURRENT_RULES_VERSION } from './rules'
import type { RulesVersion } from './rules'

// Clear full columns on a grid — used to re-apply a shield revival during replay.
function clearColumns(grid: Uint8Array, cols: number[]): void {
  for (const col of cols) {
    for (let r = 0; r < Grid.SIZE; r++) {
      grid[r * Grid.SIZE + col] = 0
    }
  }
}

// Fallback for legacy shield markers recorded without shieldCols: recompute the
// 3 most-filled columns with the same algorithm shieldRevive() uses.
function mostFilledColumns(grid: Uint8Array, n: number): number[] {
  const fillCounts = Array.from({ length: Grid.SIZE }, (_, col) => {
    let count = 0
    for (let r = 0; r < Grid.SIZE; r++) {
      if (grid[r * Grid.SIZE + col] !== 0) count++
    }
    return { col, count }
  })
  return fillCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((x) => x.col)
}

/**
 * Rebuilds a GameSession by replaying a recorded move history against a fresh
 * session seeded with the same seed. Used to restore a run after a crash,
 * refresh, or device switch — shared by classic and tournament modes.
 *
 * Marker records (pieceIndex -1) are applied via engine methods that do not
 * push to session.moveHistory; callers that need the markers preserved should
 * overwrite session.moveHistory with the original history afterwards.
 *
 * `rulesVersion` must be the ruleset the run was originally played under. A run
 * started before the v2 rules shipped has to be replayed as v1 or its deals and
 * per-move points come out different from what the player actually saw.
 */
export function replayMoveHistory(
  seed: bigint,
  history: MoveRecord[],
  scoreBoostActive = false,
  rulesVersion: RulesVersion = CURRENT_RULES_VERSION
): GameSession {
  const session = new GameSession(seed, rulesVersion)
  session.scoreBoostActive = scoreBoostActive
  // Combo streak before the most recent placement — a shield revival restores
  // it, matching the live-game behaviour in gameStore.placePiece.
  let prevComboStreak = 0

  // Running score from the RECORDED events, which are the authority. It is
  // stamped onto the session before every step so that anything reading the
  // score reads the true live value rather than a recomputed one.
  //
  // This matters because the score gates board-changing mechanics — the dealer's
  // late-game threshold, COSMIC diagonals, the LIQUID settle, GLITCH morphs. If
  // the replayed score drifted even slightly, the restored board would diverge
  // from the real one and every subsequent move would fail server validation.
  let running = 0

  for (const move of history) {
    const recorded = move.scoreEvent?.totalPoints ?? 0
    session.score = running

    if (move.revive) {
      if (move.shield) {
        clearColumns(session.grid, move.shieldCols ?? mostFilledColumns(session.grid, 3))
        session.comboStreak = prevComboStreak
      }
      session.revive()
      running += recorded
      continue
    }
    if (move.bomb) {
      // The grid effect of a bomb is the same whether or not Boost was on; only
      // its points differ, and those are taken from the record.
      session.bombZone(move.bomb.row, move.bomb.col)
      running += recorded
      continue
    }
    // Lottery ×2 multiplier activation — restore the counter so the next 3
    // placePiece calls inside the engine double their score, matching the live run.
    if (move.lotteryMultiplierStart) {
      session.lotteryMultiplierMovesLeft = 3
      running += recorded
      continue
    }
    // Lottery flat bonus — no piece placement, just the recorded points.
    if (move.lotteryBonus) {
      running += recorded
      session.score = running
      continue
    }
    if (move.rotations) {
      for (let i = 0; i < move.rotations; i++) session.rotatePiece(move.pieceIndex)
    }

    // Per-move Boost state. Runs recorded before this field existed fall back to
    // the caller's session-wide flag, preserving the old behaviour for them.
    if (move.boosted !== undefined) session.scoreBoostActive = move.boosted
    else session.scoreBoostActive = scoreBoostActive

    prevComboStreak = session.comboStreak
    session.placePiece(move.pieceIndex, move.row, move.col)
    running += recorded
  }

  // The recorded history is the authority on the final score too.
  session.score = running
  return session
}
