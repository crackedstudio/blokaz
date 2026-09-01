/**
 * The 12-level progression ladder — client mirror.
 *
 * ⚠️  MIRROR CONTRACT
 * Hand-mirrored from server/config/levels.js, which is authoritative: the
 * server derives every counter from the session and purchase tables and decides
 * advancement, demotion and payouts. This copy exists only so the challenge
 * board can render targets, badges and reward previews without a round trip.
 * Change one, change the other. __tests__/levels.test.ts guards the invariants
 * that keep the ladder coherent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * The rules, in one place
 *
 *  · Four objectives per level: games played, tournament games played, shop
 *    items bought, and points scored. ALL four must be met to clear a level.
 *  · Counters are weekly (Monday 00:00 UTC) and thresholds are cumulative, so
 *    clearing a level mid-week rolls your banked progress straight into the
 *    next card — a strong week can carry several levels.
 *  · Gain no level in a week and you drop one at the rollover, floored at 1.
 *    Any advance at all protects you. Level 12 has nowhere to climb, so
 *    clearing its card holds the rank instead.
 *  · Every level pays power-ups the FIRST time you clear it. Levels 4, 8 and 12
 *    also pay a stablecoin cash link. Re-clearing a level after a demotion pays
 *    nothing — the reward is for reaching it, not for standing on it.
 */

export type ObjectiveKey = 'games' | 'tournaments' | 'purchases' | 'points'

export interface LevelTargets {
  games: number
  tournaments: number
  purchases: number
  points: number
}

export interface LevelSpec {
  level: number
  /** Badge title, shown in the lobby and beside the player's name. */
  name: string
  accent: string
  targets: LevelTargets
  /** Player-facing summary of the first-clear payout. */
  reward: string
  /** True for the levels that also pay a stablecoin cash link. */
  cashMilestone: boolean
}

export const MAX_LEVEL = 12

export const OBJECTIVE_KEYS: ObjectiveKey[] = [
  'games',
  'tournaments',
  'purchases',
  'points',
]

export const OBJECTIVE_LABELS: Record<ObjectiveKey, string> = {
  games: 'Games played',
  tournaments: 'Tournament games',
  purchases: 'Shop items bought',
  points: 'Points scored',
}

/**
 * Indexed by level — LEVELS[1] is level 1. Index 0 is a placeholder so the
 * array reads the same way on both sides of the mirror.
 */
// The ladder is a balance table: aligned rows make the difficulty curve
// readable at a glance and keep tuning diffs to one line per level.
// prettier-ignore
export const LEVELS: readonly LevelSpec[] = [
  { level: 0,  name: '',                 accent: '#000000', targets: { games: 0,    tournaments: 0,   purchases: 0,   points: 0      }, reward: '', cashMilestone: false },
  { level: 1,   name: 'PAPER CADET',      accent: '#ffd51f', targets: { games: 10,  tournaments: 10, purchases: 0,  points: 1_000  }, reward: '1× Revival Bundle', cashMilestone: false },
  { level: 2,   name: 'STICKER SCOUT',    accent: '#ff3bbd', targets: { games: 15,  tournaments: 12, purchases: 0,  points: 3_000  }, reward: '1× Score Boost', cashMilestone: false },
  { level: 3,   name: 'STRIPED RUNNER',   accent: '#ff7a1a', targets: { games: 21,  tournaments: 15, purchases: 1,  points: 6_500  }, reward: '1× Shield · 1× Bomb', cashMilestone: false },
  { level: 4,   name: 'PIXEL BREAKER',    accent: '#b7ff3b', targets: { games: 28,  tournaments: 18, purchases: 2,  points: 12_000 }, reward: '2× Revival Bundle + cash reward', cashMilestone: true },
  { level: 5,   name: 'NEON RIDER',       accent: '#29e6e6', targets: { games: 36,  tournaments: 21, purchases: 3,  points: 20_000 }, reward: '2× Score Boost · 1× Rotate Pass', cashMilestone: false },
  { level: 6,   name: 'COSMIC DRIFTER',   accent: '#8a3dff', targets: { games: 45,  tournaments: 25, purchases: 4,  points: 32_000 }, reward: '2× Shield · 2× Bomb', cashMilestone: false },
  { level: 7,   name: 'LIQUID SURGE',     accent: '#29e6e6', targets: { games: 55,  tournaments: 29, purchases: 6,  points: 48_000 }, reward: '3× Revival Bundle · 1× Rotate Pass', cashMilestone: false },
  { level: 8,   name: 'GLITCH WALKER',    accent: '#ff3bbd', targets: { games: 66,  tournaments: 33, purchases: 8,  points: 70_000 }, reward: '3× Score Boost · 3× Shield + cash reward', cashMilestone: true },
  { level: 9,   name: 'VOID ARCHITECT',   accent: '#b7ff3b', targets: { games: 78,  tournaments: 38, purchases: 10, points: 100_000}, reward: '3× Bomb · 3× Rotate Pass', cashMilestone: false },
  { level: 10,  name: 'PRISM WARDEN',     accent: '#ff7a1a', targets: { games: 91,  tournaments: 43, purchases: 12, points: 140_000}, reward: '5× Revival Bundle · 3× Score Boost', cashMilestone: false },
  { level: 11,  name: 'OBSIDIAN ORACLE',  accent: '#8a3dff', targets: { games: 105, tournaments: 48, purchases: 15, points: 190_000}, reward: '5× Shield · 5× Bomb · 3× Rotate Pass', cashMilestone: false },
  { level: 12,  name: 'BLOKAZ SOVEREIGN', accent: '#ffd51f', targets: { games: 120, tournaments: 54, purchases: 18, points: 260_000}, reward: '5× of every power-up + top cash reward', cashMilestone: true },
]

export function levelSpec(level: number): LevelSpec {
  return LEVELS[Math.min(Math.max(level, 1), MAX_LEVEL)]
}

/** 0–1 completion of one objective, clamped. A zero target is already met. */
export function objectiveRatio(current: number, target: number): number {
  if (target <= 0) return 1
  return Math.min(1, current / target)
}

/**
 * Overall completion of a level's card, averaged across the four objectives.
 * Objectives with a zero target still count as a full quarter — otherwise the
 * early levels, which don't require tournaments or purchases, would look
 * permanently unfinished.
 */
export function levelCompletion(
  progress: LevelTargets,
  targets: LevelTargets
): number {
  const total = OBJECTIVE_KEYS.reduce(
    (sum, key) => sum + objectiveRatio(progress[key] ?? 0, targets[key]),
    0
  )
  return total / OBJECTIVE_KEYS.length
}

export function meetsTargets(
  progress: LevelTargets,
  targets: LevelTargets
): boolean {
  return OBJECTIVE_KEYS.every((key) => (progress[key] ?? 0) >= targets[key])
}

export function formatTarget(key: ObjectiveKey, value: number): string {
  return key === 'points' ? value.toLocaleString() : String(value)
}
