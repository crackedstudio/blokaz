import { describe, it, expect } from 'vitest'
import {
  LEVELS,
  MAX_LEVEL,
  OBJECTIVE_KEYS,
  levelSpec,
  levelCompletion,
  meetsTargets,
  objectiveRatio,
  type LevelTargets,
} from '../levels'
// The server config is the authoritative ladder; importing it here is what
// makes the mirror contract a test rather than a comment.
import {
  LEVELS as SERVER_LEVELS,
  MAX_LEVEL as SERVER_MAX_LEVEL,
  LEVEL_POWERUPS,
  CASH_MILESTONES,
  meetsTargets as serverMeetsTargets,
  applyRollover,
  climb,
  progressWindowStart,
  weekStartOf,
  weeksBetween,
} from '../../../server/config/levels.js'

const INVENTORY_COLUMNS = [
  'revival_bundle',
  'score_boost',
  'shield',
  'bomb',
  'rotate_pass',
]

const progress = (p: Partial<LevelTargets>): LevelTargets => ({
  games: 0,
  tournaments: 0,
  purchases: 0,
  points: 0,
  ...p,
})

describe('level ladder shape', () => {
  it('has exactly 12 levels behind a 1-based index', () => {
    expect(MAX_LEVEL).toBe(12)
    expect(LEVELS).toHaveLength(13)
    for (let n = 1; n <= MAX_LEVEL; n++) expect(LEVELS[n].level).toBe(n)
  })

  it('gives every level a distinct badge name', () => {
    const names = LEVELS.slice(1).map((l) => l.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('marks exactly levels 4, 8 and 12 as cash milestones', () => {
    const milestones = LEVELS.slice(1)
      .filter((l) => l.cashMilestone)
      .map((l) => l.level)
    expect(milestones).toEqual([4, 8, 12])
  })
})

describe('difficulty curve', () => {
  // Cumulative carry-over is the whole reason a strong week can chain levels:
  // level N+1's targets must never sit below level N's, or clearing N could
  // leave a player already past N+1 with progress that reads as a regression.
  it('never lowers a target as the level rises', () => {
    for (let n = 2; n <= MAX_LEVEL; n++) {
      for (const key of OBJECTIVE_KEYS) {
        expect(LEVELS[n].targets[key]).toBeGreaterThanOrEqual(
          LEVELS[n - 1].targets[key]
        )
      }
    }
  })

  it('makes every level strictly harder than the last', () => {
    for (let n = 2; n <= MAX_LEVEL; n++) {
      const harder = OBJECTIVE_KEYS.some(
        (key) => LEVELS[n].targets[key] > LEVELS[n - 1].targets[key]
      )
      expect(harder, `level ${n} is not harder than level ${n - 1}`).toBe(true)
    }
  })

  it('opens on the agreed floor of 10 games and 10 tournament games', () => {
    expect(LEVELS[1].targets.games).toBe(10)
    expect(LEVELS[1].targets.tournaments).toBe(10)
  })

  it('requires a shop purchase at every level', () => {
    // A deliberate product decision: because all four objectives must be met,
    // this makes buying at least one item a condition of advancing anywhere,
    // level 1 included. A player who never spends is capped at level 1.
    for (let n = 1; n <= MAX_LEVEL; n++) {
      expect(LEVELS[n].targets.purchases, `level ${n} has no purchase target`).toBeGreaterThan(0)
    }
  })

  it('keeps the combined weekly game load inside a plausible ceiling', () => {
    // Classic and tournament runs live in separate tables, so the two targets
    // ADD UP rather than overlap — it is the sum that a player has to find time
    // for. Level 12 is meant to be punishing, not literally unreachable.
    const top = LEVELS[MAX_LEVEL].targets
    expect(top.games + top.tournaments).toBeLessThanOrEqual(200)
  })
})

describe('meetsTargets', () => {
  it('clears a level only when all four objectives are met', () => {
    const targets = LEVELS[3].targets
    expect(meetsTargets(targets, targets)).toBe(true)

    for (const key of OBJECTIVE_KEYS) {
      const oneShort = { ...targets, [key]: targets[key] - 1 }
      expect(
        meetsTargets(oneShort, targets),
        `${key} one short still cleared`
      ).toBe(false)
    }
  })

  it('treats a zero target as already met', () => {
    // No level currently sets a target to zero, but the comparison must still
    // hold if one is ever tuned back down — otherwise a level would become
    // permanently unclearable rather than trivially satisfied.
    const noPurchasesNeeded = { games: 2, tournaments: 0, purchases: 0, points: 100 }
    expect(meetsTargets(progress({ games: 2, points: 100 }), noPurchasesNeeded)).toBe(true)
    expect(objectiveRatio(0, 0)).toBe(1)
  })

  it('agrees with the server for every level', () => {
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const exact = LEVELS[n].targets
      const short = { ...exact, games: exact.games - 1 }
      expect(meetsTargets(exact, exact)).toBe(serverMeetsTargets(n, exact))
      expect(meetsTargets(short, exact)).toBe(serverMeetsTargets(n, short))
    }
  })
})

describe('completion maths', () => {
  it('reports a zero target as fully done rather than dividing by zero', () => {
    expect(objectiveRatio(0, 0)).toBe(1)
  })

  it('clamps overshoot so a huge score cannot mask an unmet objective', () => {
    const targets = LEVELS[5].targets
    const overshot = progress({ points: targets.points * 100 })
    expect(objectiveRatio(overshot.points, targets.points)).toBe(1)
    expect(levelCompletion(overshot, targets)).toBeLessThan(1)
  })

  it('reaches exactly 1 when the card is cleared', () => {
    expect(levelCompletion(LEVELS[7].targets, LEVELS[7].targets)).toBe(1)
  })
})

describe('levelSpec clamping', () => {
  it('clamps out-of-range levels to the ends of the ladder', () => {
    expect(levelSpec(0).level).toBe(1)
    expect(levelSpec(-5).level).toBe(1)
    expect(levelSpec(99).level).toBe(MAX_LEVEL)
  })
})

describe('mirror contract with server/config/levels.js', () => {
  it('matches the server level count', () => {
    expect(MAX_LEVEL).toBe(SERVER_MAX_LEVEL)
    expect(SERVER_LEVELS).toHaveLength(LEVELS.length)
  })

  it('matches every server target and badge name', () => {
    for (let n = 1; n <= MAX_LEVEL; n++) {
      expect(LEVELS[n].targets, `level ${n} targets drifted`).toEqual(
        SERVER_LEVELS[n].targets
      )
      expect(LEVELS[n].name, `level ${n} name drifted`).toBe(
        SERVER_LEVELS[n].name
      )
      expect(LEVELS[n].accent, `level ${n} accent drifted`).toBe(
        SERVER_LEVELS[n].accent
      )
    }
  })

  it('matches the server cash milestones', () => {
    for (let n = 1; n <= MAX_LEVEL; n++) {
      expect(LEVELS[n].cashMilestone, `level ${n} milestone drifted`).toBe(
        CASH_MILESTONES.has(n)
      )
    }
  })
})

describe('server reward table', () => {
  it('pays every level something', () => {
    for (let n = 1; n <= SERVER_MAX_LEVEL; n++) {
      expect(
        Object.keys(LEVEL_POWERUPS[n] ?? {}).length,
        `level ${n} pays nothing`
      ).toBeGreaterThan(0)
    }
  })

  it('only credits real player_inventory columns in positive whole amounts', () => {
    for (let n = 1; n <= SERVER_MAX_LEVEL; n++) {
      for (const [column, qty] of Object.entries(LEVEL_POWERUPS[n])) {
        expect(
          INVENTORY_COLUMNS,
          `level ${n} credits unknown column ${column}`
        ).toContain(column)
        expect(Number.isInteger(qty)).toBe(true)
        expect(qty as number).toBeGreaterThan(0)
      }
    }
  })
})

describe('weekly window', () => {
  it('anchors the week to Monday UTC', () => {
    // 2026-09-07 is a Monday.
    expect(weekStartOf(new Date('2026-09-07T00:00:00Z'))).toBe('2026-09-07')
    expect(weekStartOf(new Date('2026-09-07T23:59:59Z'))).toBe('2026-09-07')
    expect(weekStartOf(new Date('2026-09-10T12:00:00Z'))).toBe('2026-09-07')
  })

  it('keeps Sunday in the week that began the Monday before', () => {
    // The off-by-one that would silently reset every player's counters a day
    // early: getUTCDay() calls Sunday 0, so it must map back six days, not zero.
    expect(weekStartOf(new Date('2026-09-13T12:00:00Z'))).toBe('2026-09-07')
    expect(weekStartOf(new Date('2026-09-14T00:00:00Z'))).toBe('2026-09-14')
  })

  it('counts whole weeks between two Mondays', () => {
    expect(weeksBetween('2026-09-07', '2026-09-07')).toBe(0)
    expect(weeksBetween('2026-09-07', '2026-09-14')).toBe(1)
    expect(weeksBetween('2026-08-17', '2026-09-07')).toBe(3)
  })

  it('never reports negative weeks for a clock that went backwards', () => {
    expect(weeksBetween('2026-09-14', '2026-09-07')).toBe(0)
  })

  it('is unaffected by a DST shift in the local timezone', () => {
    // The window is UTC-anchored, so a local DST boundary must not move it.
    expect(weeksBetween('2026-03-23', '2026-03-30')).toBe(1)
    expect(weekStartOf(new Date('2026-03-29T12:00:00Z'))).toBe('2026-03-23')
  })
})

// ── Ladder mechanics (server-authoritative, pure) ────────────────────────────

describe('applyRollover', () => {
  const row = (level: number, weekStart: string, gained: number) => ({
    level,
    week_start: weekStart,
    levels_gained_this_week: gained,
  })

  it('does nothing while the week has not turned over', () => {
    const result = applyRollover(row(5, '2026-09-07', 0), '2026-09-07')
    expect(result).toEqual({
      level: 5,
      weekStart: '2026-09-07',
      levelsGained: 0,
      demotedBy: 0,
    })
  })

  it('drops one level when the week ended with no advance', () => {
    const result = applyRollover(row(5, '2026-08-31', 0), '2026-09-07')
    expect(result.level).toBe(4)
    expect(result.demotedBy).toBe(1)
  })

  it('protects a player who advanced at all that week', () => {
    // "Any form of advance counts" — one level gained is as good as five.
    expect(applyRollover(row(5, '2026-08-31', 1), '2026-09-07').level).toBe(5)
    expect(applyRollover(row(5, '2026-08-31', 4), '2026-09-07').level).toBe(5)
  })

  it('charges one level for every whole week skipped', () => {
    // Advanced during the last week they played, then vanished for three more.
    const result = applyRollover(row(9, '2026-08-17', 2), '2026-09-07')
    expect(result.demotedBy).toBe(2)
    expect(result.level).toBe(7)
  })

  it('resets the weekly counters onto the new week', () => {
    const result = applyRollover(row(6, '2026-08-31', 3), '2026-09-07')
    expect(result.weekStart).toBe('2026-09-07')
    expect(result.levelsGained).toBe(0)
  })

  it('floors at level 1 no matter how long the absence', () => {
    const result = applyRollover(row(3, '2025-01-06', 0), '2026-09-07')
    expect(result.level).toBe(1)
    // The reported demotion must match what was actually applied, not the
    // raw number of weeks missed — the UI shows this number to the player.
    expect(result.demotedBy).toBe(2)
  })

  it('leaves a level-1 player alone', () => {
    const result = applyRollover(row(1, '2026-08-31', 0), '2026-09-07')
    expect(result.level).toBe(1)
    expect(result.demotedBy).toBe(0)
  })
})

describe('climb', () => {
  it('stays put when the card is unfinished', () => {
    const result = climb(1, progress({ games: 1, points: 1_000 }))
    expect(result).toEqual({ level: 1, cleared: [], held: false })
  })

  it('advances one level on an exact clear', () => {
    const result = climb(1, LEVELS[1].targets)
    expect(result.level).toBe(2)
    expect(result.cleared).toEqual([1])
  })

  it('chains several levels in one pass because thresholds are cumulative', () => {
    // A strong week that satisfies level 3 outright should carry 1 → 4, paying
    // out every level on the way rather than skipping them.
    const result = climb(1, LEVELS[3].targets)
    expect(result.level).toBe(4)
    expect(result.cleared).toEqual([1, 2, 3])
  })

  it('holds rather than advances at the top of the ladder', () => {
    const result = climb(MAX_LEVEL, LEVELS[MAX_LEVEL].targets)
    expect(result.level).toBe(MAX_LEVEL)
    expect(result.held).toBe(true)
    // Level 12 is still reported as cleared so a first-time clear pays out.
    expect(result.cleared).toEqual([MAX_LEVEL])
  })

  it('does not hold at the top on an unfinished card', () => {
    const short = { ...LEVELS[MAX_LEVEL].targets, games: LEVELS[MAX_LEVEL].targets.games - 1 }
    const result = climb(MAX_LEVEL, short)
    expect(result.held).toBe(false)
    expect(result.cleared).toEqual([])
  })

  it('never climbs past level 12', () => {
    const huge = progress({
      games: 10_000,
      tournaments: 10_000,
      purchases: 10_000,
      points: 10_000_000,
    })
    const result = climb(1, huge)
    expect(result.level).toBe(MAX_LEVEL)
    expect(result.held).toBe(true)
    // Every level from 1 to 12 paid out exactly once.
    expect(result.cleared).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })
})

describe('progress window', () => {
  const JOINED = '2026-09-02T14:30:00Z'

  it('measures from the join date during the week a player starts', () => {
    // The counters read tables that have been recording for months, so without
    // this a player opening the updated app on Wednesday would be credited for
    // everything they did since Monday and find objectives already ticked.
    expect(progressWindowStart('2026-08-31', JOINED)).toBe('2026-09-02T14:30:00.000Z')
  })

  it('measures from the week start once that first week is over', () => {
    expect(progressWindowStart('2026-09-07', JOINED)).toBe('2026-09-07T00:00:00Z')
    expect(progressWindowStart('2026-09-14', JOINED)).toBe('2026-09-14T00:00:00Z')
  })

  it('falls back to the week start for a player with no join date', () => {
    expect(progressWindowStart('2026-09-07')).toBe('2026-09-07T00:00:00Z')
    expect(progressWindowStart('2026-09-07', null)).toBe('2026-09-07T00:00:00Z')
  })

  it('ignores an unparseable date instead of zeroing every counter', () => {
    // Date.parse returning NaN must not propagate into the query window, or
    // the RPC matches nothing and the player looks like they did nothing.
    expect(progressWindowStart('2026-09-07', 'garbage')).toBe('2026-09-07T00:00:00Z')
    expect(progressWindowStart('2026-09-07', null, 'garbage')).toBe('2026-09-07T00:00:00Z')
  })

  it('never rewinds the window before the current week', () => {
    // Whatever the join date, a player can never be credited for a previous
    // week's activity — the window only ever moves forward.
    for (const week of ['2026-09-07', '2026-09-14', '2026-10-05']) {
      const start = Date.parse(progressWindowStart(week, JOINED))
      expect(start).toBeGreaterThanOrEqual(Date.parse(`${week}T00:00:00Z`))
    }
  })

  it('lets a global re-baseline override a older join date', () => {
    // The escape hatch for redefining objectives: LADDER_EPOCH resets everyone.
    expect(progressWindowStart('2026-08-31', JOINED, '2026-09-04T00:00:00Z')).toBe(
      '2026-09-04T00:00:00.000Z'
    )
  })
})
