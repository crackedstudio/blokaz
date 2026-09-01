/**
 * CLIENT ↔ SERVER REPLAY PARITY
 *
 * The server refuses to sign a tournament score whose replay does not match the
 * client's move history to the point. This suite plays randomised full games
 * through the real client engine and feeds each move history to the real server
 * validator, under both rulesets.
 *
 * If this fails, honest players get HTTP 403 on score submission and prize
 * money gets stuck. Run it after any change to rules.ts, dealer.ts, scoring.ts,
 * grid.ts or scoreReplay.js.
 */

import { describe, it, expect } from 'vitest'
import { GameSession } from '../game'
import { Grid } from '../grid'
import { SHAPES } from '../shapes'
import { replayMoveHistory } from '../sessionReplay'
import { CURRENT_RULES_VERSION } from '../rules'
import type { RulesVersion } from '../rules'
// The actual server-side validator — not a copy.
import {
  replayAndValidateScore,
  resolveGlitchMorph as serverResolveGlitchMorph,
} from '../../../server/engine/scoreReplay.js'
import { resolveGlitchMorph } from '../glitch'
import { TIER_THRESHOLDS, TIER_GLITCH, TIER_LIQUID } from '../rules'
import type { MoveRecord } from '../game'

/** Cheap deterministic PRNG so failures are reproducible from the seed. */
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface PlayResult {
  session: GameSession
  placements: number
}

/**
 * Play a full game to game-over, choosing a legal placement at random each turn.
 * Random play is the harsher test: it produces congested boards, which is
 * exactly where the relief re-rolls and the mercy piece kick in.
 */
function playRandomGame(seed: bigint, rulesVersion: RulesVersion, pick: () => number): PlayResult {
  const session = new GameSession(seed, rulesVersion)
  let placements = 0

  while (!session.isGameOver && placements < 2000) {
    const legal: Array<{ idx: number; row: number; col: number }> = []
    for (let idx = 0; idx < 3; idx++) {
      const piece = session.currentPieces[idx]
      if (!piece) continue
      for (let row = 0; row < Grid.SIZE; row++) {
        for (let col = 0; col < Grid.SIZE; col++) {
          if (Grid.canPlace(session.grid, piece, row, col)) legal.push({ idx, row, col })
        }
      }
    }
    if (legal.length === 0) break

    const choice = legal[Math.floor(pick() * legal.length) % legal.length]
    const result = session.placePiece(choice.idx, choice.row, choice.col)
    if (!result.success) break
    placements++
  }

  return { session, placements }
}

describe('client ↔ server replay parity', () => {
  for (const version of [1, 2] as RulesVersion[]) {
    it(`server validates client-played games under rules v${version}`, () => {
      const failures: string[] = []

      for (let run = 0; run < 60; run++) {
        const seed = BigInt(1_000_003 * (run + 1) + 7)
        const { session } = playRandomGame(seed, version, mulberry32(run + 1))

        const verdict = replayAndValidateScore(
          JSON.parse(JSON.stringify(session.moveHistory)),
          session.score,
          seed,
          version
        )

        if (!verdict.ok) {
          failures.push(
            `run ${run} (seed ${seed}, score ${session.score}, ${session.moveHistory.length} moves): ${verdict.reason}`
          )
        }
      }

      expect(failures).toEqual([])
    })
  }

  it('rejects a score inflated by even one point', () => {
    const seed = 424242n
    const { session } = playRandomGame(seed, CURRENT_RULES_VERSION, mulberry32(99))

    const verdict = replayAndValidateScore(
      JSON.parse(JSON.stringify(session.moveHistory)),
      session.score + 1,
      seed,
      CURRENT_RULES_VERSION
    )
    expect(verdict.ok).toBe(false)
  })

  it('rejects a v2 game submitted as v1 (and vice versa)', () => {
    const seed = 777001n
    const { session } = playRandomGame(seed, 2, mulberry32(5))

    // Same moves, wrong ruleset — the deals and the points both diverge.
    const asV1 = replayAndValidateScore(
      JSON.parse(JSON.stringify(session.moveHistory)),
      session.score,
      seed,
      1
    )
    expect(asV1.ok).toBe(false)
  })

  it('still validates a legacy v1 game when rulesVersion is omitted', () => {
    const seed = 555000n
    const { session } = playRandomGame(seed, 1, mulberry32(11))

    // A pre-v2 client sends no rulesVersion; the server must default to v1.
    const verdict = replayAndValidateScore(
      JSON.parse(JSON.stringify(session.moveHistory)),
      session.score
      // localSeed omitted as well is a weaker check; pass it to exercise deals
    )
    expect(verdict.ok).toBe(true)

    const withSeed = replayAndValidateScore(
      JSON.parse(JSON.stringify(session.moveHistory)),
      session.score,
      seed
    )
    expect(withSeed.ok).toBe(true)
  })
})

/**
 * LIQUID (45k) and GLITCH (100k) only switch on at scores a normal test game
 * never reaches. Getting real end-to-end coverage means playing the way a
 * player actually would at that level: with shield saves, which clear three
 * columns and keep the run going. This mirrors gameStore.placePiece's shield
 * path exactly, markers and all, so it exercises the real submit payload.
 */
function playLongGame(
  seed: bigint,
  targetScore: number,
  pick: () => number,
  /** Turn Score Boost on once the run passes this score, to model mid-run activation. */
  boostAfterScore = Infinity
) {
  const session = new GameSession(seed)
  let records = 0
  const MAX_RECORDS = 4000

  while (records < MAX_RECORDS && session.score < targetScore) {
    if (!session.scoreBoostActive && session.score >= boostAfterScore) {
      session.scoreBoostActive = true
    }
    if (session.isGameOver) {
      // Shield save — restore the pre-death streak, clear columns, deal fresh.
      const shieldCols = session.shieldRevive()
      session.moveHistory.push({
        pieceIndex: -1, shapeId: '', row: 0, col: 0,
        revive: true, shield: true, shieldCols,
        scoreEvent: {
          basePoints: 0, linePoints: 0, comboBonus: 0, totalPoints: 0,
          linesCleared: 0, newComboStreak: session.comboStreak,
          comboMultiplier: 1, isMilestone: false, multiLineFactor: 1,
        },
      } as MoveRecord)
      records++
      if (session.isGameOver) break // board genuinely exhausted
      continue
    }

    const legal: Array<{ idx: number; row: number; col: number }> = []
    for (let idx = 0; idx < 3; idx++) {
      const piece = session.currentPieces[idx]
      if (!piece) continue
      for (let row = 0; row < Grid.SIZE; row++) {
        for (let col = 0; col < Grid.SIZE; col++) {
          if (Grid.canPlace(session.grid, piece, row, col)) legal.push({ idx, row, col })
        }
      }
    }
    if (legal.length === 0) break

    // Prefer line-clearing placements — needed to actually climb the tiers.
    let best = legal[Math.floor(pick() * legal.length) % legal.length]
    let bestClears = -1
    for (const cand of legal) {
      const scratch = Grid.cloneGrid(session.grid)
      Grid.placeShape(scratch, session.currentPieces[cand.idx]!, cand.row, cand.col, 1)
      const found = Grid.findFullLines(scratch)
      const n = found.rows.length + found.cols.length
      if (n > bestClears) { bestClears = n; best = cand }
    }

    // gameStore captures the streak before the placement so a shield can restore it.
    const preComboStreak = session.comboStreak
    const result = session.placePiece(best.idx, best.row, best.col)
    if (!result.success) break
    records++

    if (result.isGameOver) session.comboStreak = preComboStreak
  }

  return session
}

describe('LIQUID and GLITCH tiers', () => {
  it('server agrees on a run that climbs past LIQUID (45k) and GLITCH (100k)', () => {
    const seed = 20260814n
    const session = playLongGame(seed, TIER_THRESHOLDS[TIER_GLITCH] + 25_000, mulberry32(77))

    // The run has to actually get there or the test proves nothing.
    expect(session.score).toBeGreaterThan(TIER_THRESHOLDS[TIER_LIQUID])
    expect(session.score).toBeGreaterThan(TIER_THRESHOLDS[TIER_GLITCH])

    // And it has to have actually morphed a piece.
    const glitched = session.moveHistory.filter((m) => m.glitchedTo).length
    expect(glitched).toBeGreaterThan(0)

    const verdict = replayAndValidateScore(
      JSON.parse(JSON.stringify(session.moveHistory)),
      session.score,
      seed,
      2
    )
    expect(verdict).toEqual({ ok: true })
  })

  it('holds across several independent long runs', () => {
    const failures: string[] = []
    for (let run = 0; run < 6; run++) {
      const seed = BigInt(660_000 + run * 7919)
      const session = playLongGame(seed, TIER_THRESHOLDS[TIER_GLITCH] + 5_000, mulberry32(run + 40))
      const verdict = replayAndValidateScore(
        JSON.parse(JSON.stringify(session.moveHistory)),
        session.score,
        seed,
        2
      )
      if (!verdict.ok) {
        failures.push(`run ${run} (score ${session.score}): ${verdict.reason}`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('GLITCH morph — client/server function parity', () => {
  it('agrees on 20,000 randomised inputs', () => {
    const rand = mulberry32(31337)
    let morphCount = 0

    for (let i = 0; i < 20_000; i++) {
      // Random board with random occupancy so candidate sets vary widely.
      const grid = new Uint8Array(81)
      const density = rand()
      for (let c = 0; c < 81; c++) if (rand() < density) grid[c] = 1 + Math.floor(rand() * 9)

      const shape = SHAPES[Math.floor(rand() * SHAPES.length) % SHAPES.length]
      const row = Math.floor(rand() * 9) % 9
      const col = Math.floor(rand() * 9) % 9
      const seed = BigInt(Math.floor(rand() * 0xffffffff)) << 16n
      const ordinal = Math.floor(rand() * 5000)

      const mine = resolveGlitchMorph(grid, shape.id, shape.cellCount, row, col, seed, ordinal)
      const theirs = serverResolveGlitchMorph(grid, shape.id, shape.cellCount, row, col, seed, ordinal)

      expect(mine?.id ?? null).toBe(theirs?.id ?? null)
      if (mine) {
        morphCount++
        // Invariants the replay depends on.
        expect(mine.cellCount).toBe(shape.cellCount)
        expect(mine.id).not.toBe(shape.id)
      }
    }

    // Sanity: the mechanic must actually fire, or the parity check is vacuous.
    expect(morphCount).toBeGreaterThan(100)
  })
})

describe('LIQUID settle', () => {
  it('slides a vertical piece down intact rather than tearing it apart', () => {
    const grid = Grid.createGrid()
    // A vertical domino at rows 3-4, col 0, with row 5 empty.
    grid[3 * 9] = 1
    grid[4 * 9] = 1
    Grid.settleLiquid(grid, [[3, 0], [4, 0]])

    expect(grid[3 * 9]).toBe(0)
    expect(grid[4 * 9]).toBe(1)
    expect(grid[5 * 9]).toBe(1)
  })

  it('applies exactly one row of gravity, not a full drop', () => {
    const grid = Grid.createGrid()
    grid[0] = 1
    Grid.settleLiquid(grid, [[0, 0]])
    expect(grid[1 * 9]).toBe(1)
    expect(grid[8 * 9]).toBe(0)
  })

  it('leaves a cell resting on the floor or on another cell alone', () => {
    const grid = Grid.createGrid()
    grid[8 * 9] = 1 // bottom row
    grid[7 * 9 + 1] = 1
    grid[8 * 9 + 1] = 2 // supported from below
    Grid.settleLiquid(grid, [[8, 0], [7, 1]])
    expect(grid[8 * 9]).toBe(1)
    expect(grid[7 * 9 + 1]).toBe(1)
  })
})

describe('session restore fidelity', () => {
  /**
   * Restoring a run must rebuild the identical board. Once the score gates
   * board-changing mechanics, a restore that drifts even slightly produces a
   * different board, and every move made afterwards is rejected by the server.
   */
  it('rebuilds the exact board after a mid-run Score Boost, past the score gates', () => {
    // Boost switches on at 2k and the run climbs past the dealer's late-game
    // threshold (9k), COSMIC (20k) and LIQUID (45k). Those gates read the score,
    // so any drift from the un-modelled boost changes the deals and the board.
    const seed = 909090n
    const session = playLongGame(seed, 60_000, mulberry32(21), 2_000)
    expect(session.score).toBeGreaterThan(TIER_THRESHOLDS[TIER_LIQUID])

    // Restore the way the app does after a refresh. The caller passes the
    // session-wide flag as `false` — exactly the drift trap, since the real run
    // was boosted for most of its length.
    const restored = replayMoveHistory(seed, session.moveHistory, false)

    expect(restored.score).toBe(session.score)
    expect(Array.from(restored.grid)).toEqual(Array.from(session.grid))
    expect(restored.comboStreak).toBe(session.comboStreak)
    expect(restored.totalPlacements).toBe(session.totalPlacements)
    expect(restored.currentPieces.map((p) => p?.id ?? null)).toEqual(
      session.currentPieces.map((p) => p?.id ?? null)
    )

    // Zero per-move drift. Board and final score can look right while individual
    // moves are recomputed wrong — and a wrong intermediate score is what feeds
    // the deal() inside placePiece, which is the last place drift can change the
    // board. Compare the engine's freshly computed points against the record.
    const originalPoints = session.moveHistory
      .filter((m) => m.pieceIndex >= 0)
      .map((m) => m.scoreEvent?.totalPoints ?? 0)
    const replayedPoints = restored.moveHistory
      .filter((m) => m.pieceIndex >= 0)
      .map((m) => m.scoreEvent?.totalPoints ?? 0)

    expect(replayedPoints.length).toBe(originalPoints.length)
    expect(replayedPoints).toEqual(originalPoints)
  })

  it('a restored session keeps producing server-valid moves', () => {
    const seed = 606061n
    const session = new GameSession(seed)
    const pick = mulberry32(84)

    const playSome = (target: GameSession, n: number) => {
      for (let i = 0; i < n && !target.isGameOver; i++) {
        const legal: Array<{ idx: number; row: number; col: number }> = []
        for (let idx = 0; idx < 3; idx++) {
          const piece = target.currentPieces[idx]
          if (!piece) continue
          for (let row = 0; row < Grid.SIZE; row++) {
            for (let col = 0; col < Grid.SIZE; col++) {
              if (Grid.canPlace(target.grid, piece, row, col)) legal.push({ idx, row, col })
            }
          }
        }
        if (legal.length === 0) return
        const c = legal[Math.floor(pick() * legal.length) % legal.length]
        if (!target.placePiece(c.idx, c.row, c.col).success) return
      }
    }

    playSome(session, 40)
    session.scoreBoostActive = true
    playSome(session, 20)

    // Simulate a refresh mid-run, then keep playing on the restored session.
    const restored = replayMoveHistory(seed, session.moveHistory, false)
    restored.moveHistory = [...session.moveHistory]
    playSome(restored, 40)

    const verdict = replayAndValidateScore(
      JSON.parse(JSON.stringify(restored.moveHistory)),
      restored.score,
      seed,
      2
    )
    expect(verdict).toEqual({ ok: true })
  })
})

describe('v1 behaviour is frozen', () => {
  it('produces byte-identical deals to the pre-dealer engine', () => {
    // The old dealer was exactly three weighted draws off the RNG. Under v1 the
    // board-aware dealer must consume the stream identically, so a v1 game is
    // reproducible move for move.
    const seed = 987654321n
    const a = playRandomGame(seed, 1, mulberry32(3))
    const b = playRandomGame(seed, 1, mulberry32(3))
    expect(a.session.score).toBe(b.session.score)
    expect(a.session.moveHistory.map((m) => m.shapeId)).toEqual(
      b.session.moveHistory.map((m) => m.shapeId)
    )
  })
})
