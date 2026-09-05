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

describe('the funding rule', () => {
  // A milestone pays twice what the climb to it costs at the shop's $0.10 unit
  // price, so the purchases between one milestone and the next must come to
  // exactly half the payout. These numbers are the economics, not a difficulty
  // dial — an edit that breaks them has the game paying out more than it takes
  // in, and nothing else in the codebase would notice.
  const UNIT_PRICE = 0.10

  const buysBetween = (from: number, to: number) => {
    let total = 0
    for (let n = from; n <= to; n++) total += SERVER_LEVELS[n].targets.purchases
    return total
  }

  it.each([
    { stretch: 'levels 1–4', from: 1, to: 4, payout: 2 },
    { stretch: 'levels 5–8', from: 5, to: 8, payout: 6 },
    { stretch: 'levels 9–12', from: 9, to: 12, payout: 12 },
  ])('$stretch force exactly half of their $$payout payout', ({ from, to, payout }) => {
    expect(buysBetween(from, to) * UNIT_PRICE).toBeCloseTo(payout / 2, 10)
  })

  it('costs a full climb half of everything the ladder pays out', () => {
    const paid = 2 + 6 + 12
    expect(buysBetween(1, MAX_LEVEL) * UNIT_PRICE).toBeCloseTo(paid / 2, 10)
  })

  it('never asks for fewer purchases at a higher level', () => {
    // The stretch totals are what the funding depends on, but a level that
    // asked for less than the one below it would still read as a mistake.
    for (let n = 2; n <= MAX_LEVEL; n++) {
      expect(
        SERVER_LEVELS[n].targets.purchases,
        `level ${n} asks for fewer purchases than level ${n - 1}`
      ).toBeGreaterThanOrEqual(SERVER_LEVELS[n - 1].targets.purchases)
    }
  })
})

describe('a full climb with per-level windows', () => {
  // The sequence POST /levels/refresh runs, driven by the same pure functions
  // the route uses: read the window, count what falls inside it, clear the card,
  // stamp the moment the next level was entered.
  //
  // The counter below mirrors level_progress in server/db/levels.sql — a row
  // counts when it was recorded at or after the window opens. That is the whole
  // mechanism behind the fresh start, so modelling it here is what lets this
  // file assert the behaviour for every rung rather than for the one that
  // happened to be tested by hand.
  const WEEK = '2026-08-31'
  const MONDAY = Date.parse(`${WEEK}T00:00:00Z`)
  const HOUR = 3_600_000
  const ZERO: LevelTargets = { games: 0, tournaments: 0, purchases: 0, points: 0 }

  interface Activity extends LevelTargets {
    at: number
  }

  const countedFrom = (log: Activity[], windowStart: string): LevelTargets => {
    const since = Date.parse(windowStart)
    return log
      .filter((entry) => entry.at >= since)
      .reduce(
        (total, entry) => ({
          games: total.games + entry.games,
          tournaments: total.tournaments + entry.tournaments,
          purchases: total.purchases + entry.purchases,
          points: total.points + entry.points,
        }),
        { ...ZERO }
      )
  }

  it('never counts a level toward the next one, all the way to 12', () => {
    const log: Activity[] = []
    let clock = MONDAY + HOUR
    let level = 1
    let levelStartedAt = new Date(clock).toISOString()

    while (level < MAX_LEVEL) {
      // Play exactly this level's card and nothing more.
      clock += HOUR
      log.push({ at: clock, ...LEVELS[level].targets })

      const banked = countedFrom(log, progressWindowStart(WEEK, null, levelStartedAt))
      // Everything from the levels below sits outside the window, so the card
      // reads its own numbers however much has been played before it.
      expect(banked, `level ${level} inherited progress`).toEqual(LEVELS[level].targets)

      const ascent = climb(level, banked)
      expect(ascent.cleared, `level ${level} did not clear`).toEqual([level])

      level = ascent.level
      clock += 1_000
      levelStartedAt = new Date(clock).toISOString()

      // The rung just reached starts empty — including the work that reached it.
      const fresh = countedFrom(log, progressWindowStart(WEEK, null, levelStartedAt))
      expect(fresh, `level ${level} started part-finished`).toEqual(ZERO)
      expect(climb(level, fresh)).toEqual({ level, cleared: [], held: false })
    }

    expect(level).toBe(MAX_LEVEL)
    // Twelve cards played, one entry each, none of it shared.
    expect(log).toHaveLength(MAX_LEVEL - 1)
  })

  it('starts the card from scratch after a demotion too', () => {
    // A player who cleared level 4 and then lost it on a Monday must earn it
    // again — the runs that took them through it the first time are behind the
    // stamp the route writes when the demotion is applied.
    const log: Activity[] = [{ at: MONDAY + HOUR, ...LEVELS[4].targets }]
    const demotedAt = new Date(MONDAY + 2 * HOUR).toISOString()

    const afterDemotion = countedFrom(log, progressWindowStart(WEEK, null, demotedAt))
    expect(afterDemotion).toEqual(ZERO)
    expect(climb(4, afterDemotion).cleared).toEqual([])
  })

  it('restarts the card at the week boundary even without moving level', () => {
    // Sitting still is not a way to bank a card across weeks: the window is the
    // later of the week start and the level entry, so Monday clears it.
    const enteredLastWeek = '2026-08-31T09:00:00Z'
    const log: Activity[] = [{ at: Date.parse('2026-09-02T10:00:00Z'), ...LEVELS[3].targets }]

    const thisWeek = countedFrom(log, progressWindowStart(WEEK, null, enteredLastWeek))
    expect(thisWeek).toEqual(LEVELS[3].targets)

    const nextWeek = countedFrom(log, progressWindowStart('2026-09-07', null, enteredLastWeek))
    expect(nextWeek).toEqual(ZERO)
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

  it('clears one level at a time however strong the card', () => {
    // Progress belongs to the level it was measured on. Satisfying level 3's
    // numbers while sitting at level 1 still only clears level 1: entering
    // level 2 restarts every counter, so level 2 has to be played for.
    const result = climb(1, LEVELS[3].targets)
    expect(result.level).toBe(2)
    expect(result.cleared).toEqual([1])
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
    const result = climb(MAX_LEVEL, huge)
    expect(result.level).toBe(MAX_LEVEL)
    expect(result.held).toBe(true)
    expect(result.cleared).toEqual([MAX_LEVEL])
  })

  it('pays no more than one level however far the numbers reach', () => {
    const huge = progress({
      games: 10_000,
      tournaments: 10_000,
      purchases: 10_000,
      points: 10_000_000,
    })
    for (let n = 1; n < MAX_LEVEL; n++) {
      const result = climb(n, huge)
      expect(result.level, `level ${n} skipped a rung`).toBe(n + 1)
      expect(result.cleared).toEqual([n])
    }
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
    expect(progressWindowStart('2026-09-07', null, null, 'garbage')).toBe(
      '2026-09-07T00:00:00Z'
    )
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
    expect(progressWindowStart('2026-08-31', JOINED, null, '2026-09-04T00:00:00Z')).toBe(
      '2026-09-04T00:00:00.000Z'
    )
  })

  it('measures from the level entry once a player advances', () => {
    // The point of the per-level window: the runs and purchases that cleared
    // the level below sit before this instant, so the new card reads zero.
    const entered = '2026-09-09T18:00:00Z'
    expect(progressWindowStart('2026-09-07', JOINED, entered)).toBe(
      '2026-09-09T18:00:00.000Z'
    )
  })

  it('never rewinds to a level entered before the current week', () => {
    // A player who has sat on the same level since last week is measured from
    // Monday, not from whenever they got there.
    expect(progressWindowStart('2026-09-14', JOINED, '2026-09-09T18:00:00Z')).toBe(
      '2026-09-14T00:00:00Z'
    )
  })
})
