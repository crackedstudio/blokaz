import type { ShapeDefinition } from './shapes'
import {
  CURRENT_RULES_VERSION,
  TIER_THRESHOLDS,
  basePointsFor,
  comboMultiplierFor,
  linePointsFor,
  multiLineFactorFor,
  nextComboState,
  pixelBaseFactorFor,
  rulesFor,
  tierIndexForScore,
} from './rules'
import type { ComboState, RuleSet } from './rules'

export type { ComboState } from './rules'

// ─────────────────────────────────────────────────────────────
// SCORE TIER SYSTEM
// 8 tiers unlocked every 5,000 points, each with a distinct
// visual look and (eventually) a gameplay mechanic modifier.
// ─────────────────────────────────────────────────────────────

export interface TierInfo {
  /** 0-indexed tier id (0 = PAPER … 7 = GLITCH) */
  id: number
  name: string
  /** Point range string e.g. "0 – 5,000" */
  range: string
  /** Primary accent color for this tier */
  accent: string
  /** Flavour text shown on tier-up */
  flavor: string
  /** Optional gameplay mechanic description */
  mechanic: string | null
}

// ─────────────────────────────────────────────────────────────
// TIER THRESHOLDS — exponential spacing, psychology-first
//
// T1  0 – 500      First achievement arrives in <3 min (~3 clears or 1 combo).
//                  Keeps the default look familiar for new players.
//
// T2  500 – 1,500  Flow channel — widest visual window (1,000 pts) so players
//                  stay in STICKER without constant tier-up interruption.
//                  Csikszentmihalyi: don't break flow at peak engagement.
//
// T3  1,500 – 4,000  The critical "mastery" gate (×2.7 from T2 top).
//                  Requires consistent combo chaining, not just lucky clears.
//
// T4  4,000 – 9,000  Elite territory (×2.25). PIXEL faces signal you've earned
//                  your way into the top ~20% of sessions.
//
// T5  9,000 – 20,000  Dark shift — the most psychologically impactful moment.
//                  Light → NEON is a rupture. Most casual players never reach
//                  here, making it aspirational and elite-signalling.
//
// T6  20,000 – 45,000  COSMIC. Double-digit-thousand club. ~×2.25.
//
// T7  45,000 – 100,000  LIQUID. Near-impossible for most. ×2.2.
//
// T8  100,000+      GLITCH. Legendary. Seen by <1% of players.
// ─────────────────────────────────────────────────────────────

export const TIERS: TierInfo[] = [
  {
    id: 0,
    name: 'PAPER',
    range: '0 – 500',
    accent: '#ffd51f',
    flavor: 'The original. Flat ink, hard borders. Like the manual says.',
    mechanic: null,
  },
  {
    id: 1,
    name: 'STICKER',
    range: '500 – 1,500',
    accent: '#ff3bbd',
    flavor: 'Vinyl gloss. Looks like it should peel off the board.',
    mechanic: '+1 combo grace — one no-clear move keeps your streak alive',
  },
  {
    id: 2,
    name: 'STRIPED',
    range: '1,500 – 4,000',
    accent: '#ff7a1a',
    flavor: 'Loud diagonals. Reads at a glance even mid-combo.',
    mechanic: 'Near-complete rows glow — ghost-preview combo potential',
  },
  {
    id: 3,
    name: 'PIXEL',
    range: '4,000 – 9,000',
    accent: '#b7ff3b',
    flavor: '8-bit personalities. Each piece has a face. They have opinions.',
    mechanic: '2× base points on any line clear containing a PIXEL cell',
  },
  {
    id: 4,
    name: 'NEON',
    range: '9,000 – 20,000',
    accent: '#29e6e6',
    flavor: 'Late-night arcade. Pulses with whatever the soundtrack is doing.',
    mechanic: 'Combo bonus +50% while any NEON piece is on the board',
  },
  {
    id: 5,
    name: 'COSMIC',
    range: '20,000 – 45,000',
    accent: '#8a3dff',
    flavor: 'You broke 20k. Reality bends. The squares are stars now.',
    mechanic: 'COSMIC pieces clear DIAGONALS too — both directions',
  },
  {
    id: 6,
    name: 'LIQUID',
    range: '45,000 – 100,000',
    accent: '#29e6e6',
    flavor: "Pieces slosh. The board feels wet. Don't drop your phone.",
    mechanic: 'LIQUID pieces auto-settle one row down into any gap below them',
  },
  {
    id: 7,
    name: 'GLITCH',
    range: '100,000+',
    accent: '#ff3bbd',
    flavor: 'Reality stutters. RGB peels apart. Something is watching.',
    mechanic: 'Rare GLITCH piece may morph into a different shape on placement',
  },
]

/**
 * Tier for a score. Thresholds live in rules.ts because the scoring rules gate
 * mechanics on them; this stays the single lookup the UI uses.
 */
export function getScoreTier(score: number): TierInfo {
  return TIERS[tierIndexForScore(score)]
}

export { TIER_THRESHOLDS }

export interface ScoreEvent {
  basePoints: number
  linePoints: number
  comboBonus: number      // extra points from multiplier + milestone
  totalPoints: number
  linesCleared: number
  newComboStreak: number
  comboMultiplier: number // 1.0 | 1.25 | 1.5 | 2.0 | 2.5 | 3.0 | 4.0 (+0.5 at NEON)
  isMilestone: boolean    // true at streak 3, 5, 10
  multiLineFactor: number // v1: 1.0 | 1.5 | 2.5 — v2: 1.0 | 2.0 | 4.0
  /** True when this placement cleared nothing but combo grace held the streak. */
  graceHeld?: boolean
  /** Whether the one allowed grace has been spent, going into the next move. */
  graceUsed?: boolean
}

export const MILESTONE_BONUS: Record<number, number> = { 3: 300, 5: 750, 10: 2000 }

export function getComboMultiplier(streak: number): number {
  if (streak >= 10) return 4.0
  if (streak >= 7) return 3.0
  if (streak >= 5) return 2.5
  if (streak >= 3) return 2.0
  if (streak >= 2) return 1.5
  if (streak >= 1) return 1.25
  return 1.0
}

/**
 * UI-facing combo readout. `score` is optional so existing call sites keep
 * working; pass it to surface the NEON tier's +0.5 multiplier in the HUD.
 */
export function getComboTierInfo(
  streak: number,
  score = 0
): { pct: number; label: string; multiplier: number } {
  const multiplier = comboMultiplierFor(streak, score, rulesFor(CURRENT_RULES_VERSION))
  if (streak === 0) return { pct: 15, label: '', multiplier: 1.0 }
  if (streak >= 10) return { pct: 100, label: 'LEGENDARY', multiplier }
  if (streak >= 7) return { pct: 82 + (streak - 7) * 6, label: 'UNSTOPPABLE', multiplier }
  if (streak >= 5) return { pct: 65 + (streak - 5) * 8, label: 'ON FIRE', multiplier }
  if (streak >= 3) return { pct: 50 + (streak - 3) * 7, label: 'ON FIRE', multiplier }
  if (streak >= 2) return { pct: 40, label: 'COMBO', multiplier }
  return { pct: 25, label: 'COMBO', multiplier }
}

export interface ScoreOptions {
  /** Running score BEFORE this placement — gates the tier mechanics. */
  scoreBefore: number
  scoreBoostActive?: boolean
  /** Defaults to the current ruleset; pass v1 rules when replaying old games. */
  rules?: RuleSet
}

/**
 * Score a single placement.
 *
 * ⚠️ Mirrored in server/engine/scoreReplay.js. See src/engine/rules.ts for the
 * mirror contract and why the ruleset is versioned.
 */
export function calculateScore(
  piece: ShapeDefinition,
  linesCleared: number,
  combo: ComboState,
  options: ScoreOptions
): ScoreEvent {
  const rules = options.rules ?? rulesFor(CURRENT_RULES_VERSION)
  const scoreBefore = options.scoreBefore
  const boostFactor = options.scoreBoostActive ? 2.0 : 1.0

  // PIXEL tier doubles base points on a placement that clears something.
  const pixelFactor = pixelBaseFactorFor(scoreBefore, linesCleared, rules)
  const basePoints = Math.round(basePointsFor(piece.cellCount, rules) * boostFactor * pixelFactor)

  const multiLineFactor = multiLineFactorFor(linesCleared, rules)
  const linePoints = linePointsFor(linesCleared, rules)

  const next = nextComboState(combo, linesCleared, scoreBefore, rules)

  let comboMultiplier = 1.0
  let isMilestone = false
  let milestoneBonus = 0

  if (linesCleared > 0) {
    comboMultiplier = comboMultiplierFor(next.streak, scoreBefore, rules)
    isMilestone = next.streak in MILESTONE_BONUS
    milestoneBonus = MILESTONE_BONUS[next.streak] ?? 0
  }

  const rawPoints = basePoints + linePoints
  const totalPoints = Math.round(rawPoints * comboMultiplier) + milestoneBonus
  const comboBonus = totalPoints - rawPoints

  return {
    basePoints,
    linePoints,
    comboBonus,
    totalPoints,
    linesCleared,
    newComboStreak: next.streak,
    comboMultiplier,
    isMilestone,
    multiLineFactor,
    graceHeld: linesCleared === 0 && next.streak > 0,
    graceUsed: next.graceUsed,
  }
}
