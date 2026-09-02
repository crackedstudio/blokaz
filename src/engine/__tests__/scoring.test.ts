import { describe, it, expect } from 'vitest'
import { calculateScore } from '../scoring'
import { RULES } from '../rules'
import { SHAPE_MAP } from '../shapes'

const V1 = RULES[1]
const V2 = RULES[2]

const fresh = (streak = 0, graceUsed = false) => ({ streak, graceUsed })

// ─────────────────────────────────────────────────────────────────────────────
// v1 — frozen legacy ruleset. These numbers must never change: in-flight and
// historical games are still validated against them by the server replay.
// ─────────────────────────────────────────────────────────────────────────────
describe('Scoring System — v1 (legacy, frozen)', () => {
  it('should calculate basic points with no lines cleared', () => {
    const shape = SHAPE_MAP['L3A'] // 5 cells
    const result = calculateScore(shape, 0, fresh(5), { scoreBefore: 0, rules: V1 })

    expect(result.basePoints).toBe(25) // 5^2
    expect(result.linePoints).toBe(0)
    expect(result.comboBonus).toBe(0)
    expect(result.totalPoints).toBe(25)
    expect(result.newComboStreak).toBe(0)
    expect(result.comboMultiplier).toBe(1.0)
    expect(result.isMilestone).toBe(false)
  })

  it('should calculate points for 1 line clear and first combo', () => {
    const shape = SHAPE_MAP['I4H'] // 4 cells
    const result = calculateScore(shape, 1, fresh(0), { scoreBefore: 0, rules: V1 })

    // BASE = 4^2 = 16, LINE = 1 * 100 * 1.0 = 100, RAW = 116
    // streak=1 → ×1.25, TOTAL = round(116 * 1.25) = 145
    expect(result.basePoints).toBe(16)
    expect(result.linePoints).toBe(100)
    expect(result.totalPoints).toBe(145)
    expect(result.newComboStreak).toBe(1)
    expect(result.comboMultiplier).toBe(1.25)
  })

  it('should calculate points for 2 lines and existing combo reaching milestone', () => {
    const shape = SHAPE_MAP['L2A'] // 3 cells
    const result = calculateScore(shape, 2, fresh(2), { scoreBefore: 0, rules: V1 })

    // BASE = 3^2 = 9, LINE = 2 * 100 * 1.5 = 300, RAW = 309
    // streak=3 → ×2.0, milestone +300, TOTAL = round(309 * 2.0) + 300 = 918
    expect(result.basePoints).toBe(9)
    expect(result.linePoints).toBe(300)
    expect(result.totalPoints).toBe(918)
    expect(result.newComboStreak).toBe(3)
    expect(result.isMilestone).toBe(true)
    expect(result.multiLineFactor).toBe(1.5)
  })

  it('should reset combo on no clear — v1 has no grace, even at a high score', () => {
    const shape = SHAPE_MAP['S1']
    const result = calculateScore(shape, 0, fresh(10), { scoreBefore: 50_000, rules: V1 })

    expect(result.basePoints).toBe(1)
    expect(result.newComboStreak).toBe(0)
  })

  it('should apply multi-line factor correctly', () => {
    const shape = SHAPE_MAP['L3A'] // 5 cells
    const result3 = calculateScore(shape, 3, fresh(0), { scoreBefore: 0, rules: V1 })
    // LINE = 3 * 100 * 2.5 = 750, BASE = 25, RAW = 775 → ×1.25 = 969
    expect(result3.multiLineFactor).toBe(2.5)
    expect(result3.linePoints).toBe(750)
    expect(result3.totalPoints).toBe(969)
  })

  it('ignores tier mechanics entirely', () => {
    const shape = SHAPE_MAP['I4H']
    // A score deep into NEON/PIXEL territory must change nothing under v1.
    const result = calculateScore(shape, 1, fresh(0), { scoreBefore: 25_000, rules: V1 })
    expect(result.basePoints).toBe(16)
    expect(result.comboMultiplier).toBe(1.25)
    expect(result.totalPoints).toBe(145)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// v2 — current ruleset.
// ─────────────────────────────────────────────────────────────────────────────
describe('Scoring System — v2 placement rebalance', () => {
  it('pays a flat rate per cell instead of cellCount squared', () => {
    // The 3×3 square used to be worth 81 points for merely existing.
    const big = calculateScore(SHAPE_MAP['O3'], 0, fresh(), { scoreBefore: 0, rules: V2 })
    expect(big.basePoints).toBe(18) // 9 cells × 2
    const single = calculateScore(SHAPE_MAP['S1'], 0, fresh(), { scoreBefore: 0, rules: V2 })
    expect(single.basePoints).toBe(2)
    // Placing the biggest piece is now worth less than a single line clear.
    expect(big.totalPoints).toBeLessThan(100)
  })

  it('weights multi-line clears far more heavily', () => {
    const shape = SHAPE_MAP['L3A'] // 5 cells → base 10
    const one = calculateScore(shape, 1, fresh(), { scoreBefore: 0, rules: V2 })
    const two = calculateScore(shape, 2, fresh(), { scoreBefore: 0, rules: V2 })
    const three = calculateScore(shape, 3, fresh(), { scoreBefore: 0, rules: V2 })

    expect(one.linePoints).toBe(100) // 1 × 100 × 1.0
    expect(two.linePoints).toBe(400) // 2 × 100 × 2.0
    expect(three.linePoints).toBe(1200) // 3 × 100 × 4.0
    expect(three.multiLineFactor).toBe(4.0)
  })

  it('scores a first single-line clear correctly', () => {
    const result = calculateScore(SHAPE_MAP['I4H'], 1, fresh(0), { scoreBefore: 0, rules: V2 })
    // BASE = 4 × 2 = 8, LINE = 100, RAW = 108, streak 1 → ×1.25 = 135
    expect(result.basePoints).toBe(8)
    expect(result.totalPoints).toBe(135)
  })

  it('still awards milestone bonuses', () => {
    const result = calculateScore(SHAPE_MAP['L2A'], 2, fresh(2), { scoreBefore: 0, rules: V2 })
    // BASE 6 + LINE 400 = 406, streak 3 → ×2.0 = 812, milestone +300 → 1112
    expect(result.totalPoints).toBe(1112)
    expect(result.isMilestone).toBe(true)
  })
})

describe('Scoring System — v2 combo grace', () => {
  it('does not grant grace below STICKER tier', () => {
    const result = calculateScore(SHAPE_MAP['S1'], 0, fresh(4), { scoreBefore: 499, rules: V2 })
    expect(result.newComboStreak).toBe(0)
    expect(result.graceHeld).toBe(false)
  })

  it('holds the streak through one no-clear placement from STICKER tier up', () => {
    const result = calculateScore(SHAPE_MAP['S1'], 0, fresh(4), { scoreBefore: 500, rules: V2 })
    expect(result.newComboStreak).toBe(4)
    expect(result.graceHeld).toBe(true)
    expect(result.graceUsed).toBe(true)
  })

  it('breaks the streak on a second consecutive no-clear placement', () => {
    const result = calculateScore(SHAPE_MAP['S1'], 0, fresh(4, true), { scoreBefore: 500, rules: V2 })
    expect(result.newComboStreak).toBe(0)
    expect(result.graceUsed).toBe(false)
  })

  it('refreshes the grace whenever a clear lands', () => {
    const result = calculateScore(SHAPE_MAP['I4H'], 1, fresh(4, true), { scoreBefore: 500, rules: V2 })
    expect(result.newComboStreak).toBe(5)
    expect(result.graceUsed).toBe(false)
  })

  it('never grants grace from a zero streak', () => {
    const result = calculateScore(SHAPE_MAP['S1'], 0, fresh(0), { scoreBefore: 5000, rules: V2 })
    expect(result.newComboStreak).toBe(0)
  })
})

describe('Scoring System — v2 tier mechanics', () => {
  it('PIXEL (4k+) doubles base points on a clearing placement only', () => {
    const clearing = calculateScore(SHAPE_MAP['I4H'], 1, fresh(0), { scoreBefore: 4000, rules: V2 })
    expect(clearing.basePoints).toBe(16) // 4 cells × 2 × 2

    const nonClearing = calculateScore(SHAPE_MAP['I4H'], 0, fresh(0), { scoreBefore: 4000, rules: V2 })
    expect(nonClearing.basePoints).toBe(8) // no clear → no PIXEL bonus
  })

  it('NEON (9k+) adds +0.5 to an active combo multiplier', () => {
    const below = calculateScore(SHAPE_MAP['I4H'], 1, fresh(0), { scoreBefore: 8999, rules: V2 })
    expect(below.comboMultiplier).toBe(1.25)

    const at = calculateScore(SHAPE_MAP['I4H'], 1, fresh(0), { scoreBefore: 9000, rules: V2 })
    expect(at.comboMultiplier).toBe(1.75)
    // BASE 16 (PIXEL) + LINE 100 = 116 → round(116 × 1.75) = 203
    expect(at.totalPoints).toBe(203)
  })

  it('NEON does not inflate a broken combo', () => {
    const result = calculateScore(SHAPE_MAP['S1'], 0, fresh(0), { scoreBefore: 50_000, rules: V2 })
    expect(result.comboMultiplier).toBe(1.0)
  })

  it('stacks Score Boost with the PIXEL bonus', () => {
    const result = calculateScore(SHAPE_MAP['I4H'], 1, fresh(0), {
      scoreBefore: 5000,
      scoreBoostActive: true,
      rules: V2,
    })
    expect(result.basePoints).toBe(32) // 4 × 2 (rate) × 2 (boost) × 2 (PIXEL)
  })
})
