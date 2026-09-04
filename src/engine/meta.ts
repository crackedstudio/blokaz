/**
 * META-PROGRESSION — the layer that makes hour 10 different from hour 1.
 *
 * A run is a 4-minute score attack and cannot itself evolve, so the long-term
 * arc has to live outside the session. Three pieces:
 *
 *   • Player Level — lifetime XP, so every run adds to something permanent
 *     even when the run itself went badly. This is what makes a bad game still
 *     worth finishing.
 *   • Daily Missions — three per day, rerolled at local midnight. The standard
 *     retention workhorse: a reason to come back today specifically.
 *   • Achievements — one-time, permanent, and rare enough to be worth chasing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * This module is deliberately OFF the chain and OFF the score-replay path. It
 * reads a finished run's move history and writes to localStorage. It never
 * feeds back into scoring, deals, or anything the server validates, so it
 * cannot affect tournament submissions or leaderboard integrity.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { MoveRecord } from './game'
import { TIER_THRESHOLDS } from './rules'

// ── Run summary ──────────────────────────────────────────────────────────────

export interface RunSummary {
  score: number
  linesCleared: number
  bestCombo: number
  piecesPlaced: number
  /** Placements that cleared 2+ lines at once. */
  multiClears: number
  /** Highest tier index reached this run. */
  tierReached: number
}

/** Derive everything the meta layer needs from a finished run. */
export function summarizeRun(moveHistory: MoveRecord[], finalScore: number): RunSummary {
  let linesCleared = 0
  let bestCombo = 0
  let multiClears = 0
  let piecesPlaced = 0

  for (const move of moveHistory) {
    const ev = move.scoreEvent
    const lines = ev?.linesCleared ?? 0
    linesCleared += lines
    if (lines >= 2) multiClears++
    bestCombo = Math.max(bestCombo, ev?.newComboStreak ?? 0)
    if (move.pieceIndex >= 0) piecesPlaced++
  }

  let tierReached = 0
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (finalScore >= TIER_THRESHOLDS[i]) {
      tierReached = i
      break
    }
  }

  return { score: finalScore, linesCleared, bestCombo, piecesPlaced, multiClears, tierReached }
}

// ── Levels ───────────────────────────────────────────────────────────────────

/**
 * The last level with a title of its own. NOT a cap — the career ladder does
 * not end, and levels past this one keep costing more and keep counting. It
 * exists so the title table knows where its named run stops.
 */
export const TITLED_LEVEL = 60

/**
 * XP needed to go from `level` to `level + 1`.
 *
 * Deliberately shallow early (level 2 lands inside the first session or two,
 * so the system announces itself while the player is still deciding whether to
 * come back) and steepening after ~level 10, where the players who are still
 * around are the ones worth giving a long chase.
 *
 * The curve never stops. A player who reaches the end of the named titles has
 * a next level waiting, roughly 30k XP away and widening — which is the point
 * of an endless ladder: always another rung, never a cheap one.
 */
export function xpToNextLevel(level: number): number {
  return Math.round(120 * Math.pow(level, 1.35))
}

export function levelFromTotalXp(totalXp: number): { level: number; intoLevel: number; needed: number } {
  let level = 1
  let remaining = Math.max(0, Math.floor(totalXp))
  // Terminates for any finite XP: each level costs more than the last, so the
  // remainder falls short in a bounded number of steps — a few hundred even for
  // an XP total no player will reach.
  for (;;) {
    const needed = xpToNextLevel(level)
    if (remaining < needed) return { level, intoLevel: remaining, needed }
    remaining -= needed
    level++
  }
}

/**
 * XP for a finished run. Score is the dominant term, but lines and combos are
 * paid separately so that a disciplined low-scoring run still progresses —
 * otherwise the meta layer would just be the score with extra steps.
 */
export function xpForRun(run: RunSummary): number {
  return Math.max(1, Math.floor(run.score / 10) + run.linesCleared * 2 + run.bestCombo * 5)
}

/**
 * Cosmetic titles unlocked purely by level. Data-only — no new art needed.
 *
 * The named run ends at BLOKAZ; past it the title takes a numeral so an endless
 * ladder still says something about how far a player has come, rather than
 * freezing on one word forever.
 */
export const LEVEL_TITLES: Array<{ level: number; title: string }> = [
  { level: 1, title: 'ROOKIE' },
  { level: 3, title: 'STACKER' },
  { level: 6, title: 'CLEARER' },
  { level: 10, title: 'COMBO ARTIST' },
  { level: 15, title: 'GRIDMASTER' },
  { level: 22, title: 'TACTICIAN' },
  { level: 30, title: 'ARCHITECT' },
  { level: 40, title: 'LEGEND' },
  { level: 50, title: 'MYTHIC' },
  { level: 60, title: 'BLOKAZ' },
]

/** I, II, III… for the tiers beyond the last named title. */
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

function numeral(n: number): string {
  // Past the table, plain numbers: XI is already harder to read than 11, and a
  // player at level 400 is better served by a figure than by ceremony.
  return NUMERALS[n - 1] ?? String(n)
}

export function titleForLevel(level: number): string {
  let title = LEVEL_TITLES[0].title
  for (const entry of LEVEL_TITLES) {
    if (level >= entry.level) title = entry.title
  }

  // Beyond the last named level the title advances a tier every 10 levels:
  // BLOKAZ, then BLOKAZ II at 70, BLOKAZ III at 80, and on.
  const past = level - TITLED_LEVEL
  if (past > 0) {
    // The first ten levels past the table still wear the plain title — a
    // numeral appears only once a player has put a whole tier behind them.
    const tier = Math.floor(past / 10)
    if (tier > 0) return `${title} ${numeral(tier + 1)}`
  }
  return title
}

// ── Daily missions ───────────────────────────────────────────────────────────

export type MissionKind = 'score_run' | 'lines_total' | 'combo_run' | 'games_total' | 'multi_total'

export interface MissionDef {
  kind: MissionKind
  target: number
  xp: number
  label: string
}

/** The pool missions are drawn from. Targets stay achievable in 2-4 runs. */
const MISSION_POOL: MissionDef[] = [
  { kind: 'score_run', target: 1500, xp: 60, label: 'Score 1,500 in one run' },
  { kind: 'score_run', target: 3000, xp: 100, label: 'Score 3,000 in one run' },
  { kind: 'score_run', target: 6000, xp: 160, label: 'Score 6,000 in one run' },
  { kind: 'lines_total', target: 20, xp: 60, label: 'Clear 20 lines today' },
  { kind: 'lines_total', target: 40, xp: 100, label: 'Clear 40 lines today' },
  { kind: 'lines_total', target: 75, xp: 160, label: 'Clear 75 lines today' },
  { kind: 'combo_run', target: 3, xp: 60, label: 'Reach a 3× combo' },
  { kind: 'combo_run', target: 5, xp: 120, label: 'Reach a 5× combo' },
  { kind: 'combo_run', target: 7, xp: 220, label: 'Reach a 7× combo' },
  { kind: 'games_total', target: 3, xp: 50, label: 'Play 3 games today' },
  { kind: 'games_total', target: 6, xp: 110, label: 'Play 6 games today' },
  { kind: 'multi_total', target: 5, xp: 80, label: 'Clear 2+ lines at once, 5×' },
  { kind: 'multi_total', target: 12, xp: 150, label: 'Clear 2+ lines at once, 12×' },
]

export interface ActiveMission extends MissionDef {
  progress: number
  claimed: boolean
}

/** Stable 32-bit hash so a day's missions are identical across reloads/devices. */
function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function todayKey(now: Date = new Date()): string {
  // Local midnight, matching the lottery's daily reset.
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Three missions for the day, deterministic from (date, player) and always of
 * three different kinds so the set never reads as repetitive.
 */
export function rollDailyMissions(address: string, dayKey: string): ActiveMission[] {
  const seed = hashString(`${address.toLowerCase()}:${dayKey}`)
  const chosen: MissionDef[] = []
  const usedKinds = new Set<MissionKind>()

  for (let attempt = 0; attempt < MISSION_POOL.length * 4 && chosen.length < 3; attempt++) {
    const idx = (seed + attempt * 2654435761) % MISSION_POOL.length
    const candidate = MISSION_POOL[idx]
    if (usedKinds.has(candidate.kind)) continue
    usedKinds.add(candidate.kind)
    chosen.push(candidate)
  }

  // Pool is large enough that this never runs, but never ship a system that can
  // hand the player fewer than three missions.
  for (let i = 0; chosen.length < 3; i++) {
    const candidate = MISSION_POOL[(seed + i) % MISSION_POOL.length]
    if (!chosen.includes(candidate)) chosen.push(candidate)
  }

  return chosen.map((m) => ({ ...m, progress: 0, claimed: false }))
}

/** Apply a finished run to a mission's progress. Returns the new progress. */
export function advanceMission(mission: ActiveMission, run: RunSummary): number {
  switch (mission.kind) {
    // "In one run" missions take the best single run, not a sum.
    case 'score_run':
      return Math.max(mission.progress, run.score)
    case 'combo_run':
      return Math.max(mission.progress, run.bestCombo)
    // Cumulative missions add up across the day.
    case 'lines_total':
      return mission.progress + run.linesCleared
    case 'games_total':
      return mission.progress + 1
    case 'multi_total':
      return mission.progress + run.multiClears
    default:
      return mission.progress
  }
}

export function isMissionComplete(mission: ActiveMission): boolean {
  return mission.progress >= mission.target
}

// ── Achievements ─────────────────────────────────────────────────────────────

export interface AchievementDef {
  id: string
  name: string
  description: string
  xp: number
  /** Evaluated against a single run plus lifetime totals. */
  test: (run: RunSummary, lifetime: LifetimeStats) => boolean
}

export interface LifetimeStats {
  gamesPlayed: number
  totalScore: number
  totalLines: number
  bestScore: number
  bestCombo: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_clear',
    name: 'FIRST BLOOD',
    description: 'Clear your first line',
    xp: 25,
    test: (_r, l) => l.totalLines >= 1,
  },
  {
    id: 'score_1k',
    name: 'FOUR FIGURES',
    description: 'Score 1,000 in a single run',
    xp: 50,
    test: (_r, l) => l.bestScore >= 1000,
  },
  {
    id: 'score_10k',
    name: 'NEON NIGHTS',
    description: 'Reach NEON tier — 9,000 in one run',
    xp: 200,
    test: (_r, l) => l.bestScore >= 9000,
  },
  {
    id: 'score_20k',
    name: 'COSMIC',
    description: 'Reach COSMIC tier — 20,000 in one run',
    xp: 400,
    test: (_r, l) => l.bestScore >= 20000,
  },
  {
    id: 'combo_5',
    name: 'ON FIRE',
    description: 'Reach a 5× combo streak',
    xp: 100,
    test: (_r, l) => l.bestCombo >= 5,
  },
  {
    id: 'combo_10',
    name: 'LEGENDARY CHAIN',
    description: 'Reach a 10× combo streak',
    xp: 500,
    test: (_r, l) => l.bestCombo >= 10,
  },
  {
    id: 'triple_clear',
    name: 'TRIPLE THREAT',
    description: 'Clear 3 lines with a single piece',
    xp: 150,
    test: (r) => r.multiClears > 0 && r.linesCleared >= 3,
  },
  {
    id: 'games_25',
    name: 'REGULAR',
    description: 'Play 25 games',
    xp: 100,
    test: (_r, l) => l.gamesPlayed >= 25,
  },
  {
    id: 'games_100',
    name: 'DEDICATED',
    description: 'Play 100 games',
    xp: 300,
    test: (_r, l) => l.gamesPlayed >= 100,
  },
  {
    id: 'lines_1000',
    name: 'DEMOLITION',
    description: 'Clear 1,000 lines lifetime',
    xp: 400,
    test: (_r, l) => l.totalLines >= 1000,
  },
]
