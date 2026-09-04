import { describe, it, expect } from 'vitest'
import {
  ACHIEVEMENTS,
  advanceMission,
  isMissionComplete,
  levelFromTotalXp,
  TITLED_LEVEL,
  rollDailyMissions,
  summarizeRun,
  titleForLevel,
  xpForRun,
  xpToNextLevel,
} from '../meta'
import type { ActiveMission, LifetimeStats, RunSummary } from '../meta'
import type { MoveRecord } from '../game'

function move(linesCleared: number, streak: number, pieceIndex = 0): MoveRecord {
  return {
    pieceIndex,
    shapeId: 'S1',
    row: 0,
    col: 0,
    scoreEvent: {
      basePoints: 2,
      linePoints: linesCleared * 100,
      comboBonus: 0,
      totalPoints: 2 + linesCleared * 100,
      linesCleared,
      newComboStreak: streak,
      comboMultiplier: 1,
      isMilestone: false,
      multiLineFactor: 1,
    },
  }
}

describe('summarizeRun', () => {
  it('aggregates lines, best combo, multi-clears and placements', () => {
    const history = [move(1, 1), move(0, 0), move(2, 1), move(3, 2), move(0, 0)]
    const run = summarizeRun(history, 5000)

    expect(run.score).toBe(5000)
    expect(run.linesCleared).toBe(6)
    expect(run.bestCombo).toBe(2)
    expect(run.multiClears).toBe(2) // the 2-line and the 3-line placements
    expect(run.piecesPlaced).toBe(5)
    expect(run.tierReached).toBe(3) // PIXEL — 4,000..9,000
  })

  it('does not count marker records as placements', () => {
    const history = [move(1, 1), { ...move(0, 0), pieceIndex: -1, revive: true as const }]
    expect(summarizeRun(history, 100).piecesPlaced).toBe(1)
  })

  it('handles an empty run', () => {
    const run = summarizeRun([], 0)
    expect(run).toMatchObject({ score: 0, linesCleared: 0, bestCombo: 0, tierReached: 0 })
  })
})

describe('levels', () => {
  it('starts at level 1 with no xp', () => {
    expect(levelFromTotalXp(0)).toMatchObject({ level: 1, intoLevel: 0 })
  })

  it('levels up exactly at the threshold', () => {
    const needed = xpToNextLevel(1)
    expect(levelFromTotalXp(needed - 1).level).toBe(1)
    expect(levelFromTotalXp(needed).level).toBe(2)
  })

  it('is monotonic and never stops climbing', () => {
    let last = 0
    for (const xp of [0, 500, 5_000, 50_000, 500_000, 50_000_000]) {
      const { level } = levelFromTotalXp(xp)
      expect(level).toBeGreaterThanOrEqual(last)
      last = level
    }
    // Past the last titled level there is still a level, and still a next one
    // to work toward — that is what makes the ladder endless rather than a bar
    // that fills once and stops.
    const beyond = levelFromTotalXp(1_000_000)
    expect(beyond.level).toBeGreaterThan(TITLED_LEVEL)
    expect(Number.isFinite(beyond.needed)).toBe(true)
    expect(beyond.needed).toBeGreaterThan(0)
  })

  it('terminates on an absurd xp total instead of spinning', () => {
    // No cap means the loop's only brake is the rising cost of each level.
    // A corrupted total must still land, and quickly.
    const started = Date.now()
    const { level } = levelFromTotalXp(Number.MAX_SAFE_INTEGER)
    expect(Number.isFinite(level)).toBe(true)
    expect(level).toBeGreaterThan(TITLED_LEVEL)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('gets steeper as levels climb', () => {
    expect(xpToNextLevel(2)).toBeGreaterThan(xpToNextLevel(1))
    expect(xpToNextLevel(20)).toBeGreaterThan(xpToNextLevel(10))
  })

  it('awards a title for every level', () => {
    for (let l = 1; l <= TITLED_LEVEL; l++) {
      expect(titleForLevel(l)).toBeTruthy()
    }
    expect(titleForLevel(1)).toBe('ROOKIE')
    expect(titleForLevel(TITLED_LEVEL)).toBe('BLOKAZ')
  })

  it('keeps naming levels past the last titled one', () => {
    // An endless ladder whose title froze on one word would stop saying
    // anything about how far a player had come.
    expect(titleForLevel(TITLED_LEVEL + 1)).toBe('BLOKAZ')
    expect(titleForLevel(TITLED_LEVEL + 9)).toBe('BLOKAZ')
    expect(titleForLevel(TITLED_LEVEL + 10)).toBe('BLOKAZ II')
    expect(titleForLevel(TITLED_LEVEL + 20)).toBe('BLOKAZ III')
    expect(titleForLevel(TITLED_LEVEL + 90)).toBe('BLOKAZ X')
    // Past the numerals, a plain figure — XI reads worse than 11 does.
    expect(titleForLevel(TITLED_LEVEL + 100)).toBe('BLOKAZ 11')
  })

  it('always pays at least 1 xp, even for a scoreless run', () => {
    const empty: RunSummary = {
      score: 0, linesCleared: 0, bestCombo: 0, piecesPlaced: 0, multiClears: 0, tierReached: 0,
    }
    expect(xpForRun(empty)).toBeGreaterThanOrEqual(1)
  })

  it('rewards lines and combos beyond raw score', () => {
    const base: RunSummary = {
      score: 3000, linesCleared: 0, bestCombo: 0, piecesPlaced: 40, multiClears: 0, tierReached: 2,
    }
    const skilled: RunSummary = { ...base, linesCleared: 30, bestCombo: 6 }
    expect(xpForRun(skilled)).toBeGreaterThan(xpForRun(base))
  })
})

describe('daily missions', () => {
  const ADDR = '0xAbC0000000000000000000000000000000000001'

  it('is deterministic for a given address and day', () => {
    const a = rollDailyMissions(ADDR, '2026-08-14')
    const b = rollDailyMissions(ADDR.toLowerCase(), '2026-08-14')
    expect(a.map((m) => `${m.kind}:${m.target}`)).toEqual(b.map((m) => `${m.kind}:${m.target}`))
  })

  it('changes from day to day', () => {
    const a = rollDailyMissions(ADDR, '2026-08-14').map((m) => `${m.kind}:${m.target}`)
    const b = rollDailyMissions(ADDR, '2026-08-15').map((m) => `${m.kind}:${m.target}`)
    expect(a).not.toEqual(b)
  })

  it('always issues three missions of distinct kinds', () => {
    for (let d = 1; d <= 40; d++) {
      const missions = rollDailyMissions(ADDR, `2026-09-${String(d).padStart(2, '0')}`)
      expect(missions).toHaveLength(3)
      expect(new Set(missions.map((m) => m.kind)).size).toBe(3)
    }
  })

  it('takes the best single run for per-run missions', () => {
    const mission: ActiveMission = {
      kind: 'score_run', target: 3000, xp: 100, label: '', progress: 5000, claimed: false,
    }
    const worse: RunSummary = {
      score: 900, linesCleared: 3, bestCombo: 1, piecesPlaced: 10, multiClears: 0, tierReached: 1,
    }
    // A weaker run must not erase a better one.
    expect(advanceMission(mission, worse)).toBe(5000)
  })

  it('accumulates for per-day missions', () => {
    const mission: ActiveMission = {
      kind: 'lines_total', target: 40, xp: 100, label: '', progress: 12, claimed: false,
    }
    const run: RunSummary = {
      score: 900, linesCleared: 7, bestCombo: 1, piecesPlaced: 10, multiClears: 0, tierReached: 1,
    }
    expect(advanceMission(mission, run)).toBe(19)
  })

  it('counts games for games_total', () => {
    const mission: ActiveMission = {
      kind: 'games_total', target: 3, xp: 50, label: '', progress: 2, claimed: false,
    }
    const run = summarizeRun([], 0)
    const progress = advanceMission(mission, run)
    expect(progress).toBe(3)
    expect(isMissionComplete({ ...mission, progress })).toBe(true)
  })
})

describe('achievements', () => {
  const lifetime = (over: Partial<LifetimeStats> = {}): LifetimeStats => ({
    gamesPlayed: 0, totalScore: 0, totalLines: 0, bestScore: 0, bestCombo: 0, ...over,
  })
  const run = (over: Partial<RunSummary> = {}): RunSummary => ({
    score: 0, linesCleared: 0, bestCombo: 0, piecesPlaced: 0, multiClears: 0, tierReached: 0, ...over,
  })

  it('has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
  })

  it('unlocks nothing on a blank slate', () => {
    const unlocked = ACHIEVEMENTS.filter((a) => a.test(run(), lifetime()))
    expect(unlocked).toEqual([])
  })

  it('unlocks tiered score achievements cumulatively', () => {
    const ids = ACHIEVEMENTS.filter((a) => a.test(run({ score: 20000 }), lifetime({ bestScore: 20000, totalLines: 1 })))
      .map((a) => a.id)
    expect(ids).toContain('score_1k')
    expect(ids).toContain('score_10k')
    expect(ids).toContain('score_20k')
  })

  it('gates the legendary chain behind a 10 combo', () => {
    const def = ACHIEVEMENTS.find((a) => a.id === 'combo_10')!
    expect(def.test(run(), lifetime({ bestCombo: 9 }))).toBe(false)
    expect(def.test(run(), lifetime({ bestCombo: 10 }))).toBe(true)
  })
})
