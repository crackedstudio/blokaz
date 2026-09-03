/**
 * Types for the authoritative ladder in ./levels.js.
 *
 * The server itself is plain JS; this exists so the mirror test in
 * src/constants/__tests__/levels.test.ts — which imports both sides and
 * asserts they agree — type-checks under the app's tsconfig.
 */

export interface LevelTargets {
  games: number
  tournaments: number
  purchases: number
  points: number
}

export interface ServerLevelSpec {
  level: number
  name: string
  accent: string
  targets: LevelTargets
}

/** 1-indexed; index 0 is a null placeholder. */
export declare const LEVELS: readonly (ServerLevelSpec | null)[] &
  Record<number, ServerLevelSpec>

export declare const MAX_LEVEL: number

/** Level → player_inventory column → quantity credited on first clear. */
export declare const LEVEL_POWERUPS: Record<number, Record<string, number>>

/** Levels that additionally pay a stablecoin cash link. */
export declare const CASH_MILESTONES: Set<number>

/** TEST-ONLY: levels that pay a cash link to whitelisted addresses only. */
export declare const TEST_CASH_LEVELS: Set<number>

/** TEST-ONLY: lowercased addresses the test levels pay. */
export declare const TEST_CASH_ADDRESSES: Set<string>

/** Does clearing `level` pay `address` a cash link? */
export declare function isCashMilestone(level: number, address?: string | null): boolean

/** Every level a cash-link pool can be funded for, ascending. */
export declare function poolLevels(): number[]

export declare const TARGET_KEYS: readonly (keyof LevelTargets)[]

export declare function meetsTargets(level: number, progress: Partial<LevelTargets>): boolean

/** Monday 00:00 UTC of the week containing `date`, as YYYY-MM-DD. */
export declare function weekStartOf(date?: Date): string

/** Whole weeks between two YYYY-MM-DD Monday strings; never negative. */
export declare function weeksBetween(fromWeekStart: string, toWeekStart: string): number

export interface LadderRow {
  level: number
  week_start: string
  levels_gained_this_week: number
}

export interface RolloverResult {
  level: number
  weekStart: string
  levelsGained: number
  demotedBy: number
}

/** Applies the weekly demotion. Pure — returns a new row rather than mutating. */
export declare function applyRollover(row: LadderRow, currentWeek: string): RolloverResult

export interface ClimbResult {
  /** Level the player ends on. */
  level: number
  /** Levels cleared by this climb, in order. */
  cleared: number[]
  /** At level 12 and cleared its card — rank held rather than gained. */
  held: boolean
}

/** How far this week's progress carries a player from `level`. */
export declare function climb(level: number, progress: Partial<LevelTargets>): ClimbResult

/** Optional global re-baseline (ISO 8601). Unset by default. */
export declare const LADDER_EPOCH: string | null

/**
 * The latest of the week start, the player's join date, and any global
 * re-baseline, as an ISO timestamp.
 */
export declare function progressWindowStart(
  weekStart: string,
  joinedAt?: string | null,
  epoch?: string | null
): string
