/**
 * BLOKAZ SCORING RULES — versioned.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  MIRROR CONTRACT
 *
 * Every value and every function in this file is duplicated verbatim in
 * `server/engine/scoreReplay.js` (section "Rules — port of src/engine/rules.ts").
 * The server replays tournament games with these rules and refuses to sign a
 * score that does not match to the point. If the two drift, tournament score
 * submissions start failing with HTTP 403 and real prize money gets stuck.
 *
 * If you touch anything here, change the server file in the same commit and
 * run `npx vitest run src/engine/__tests__/replayParity.test.ts`, which plays
 * thousands of randomised games through both engines and asserts they agree.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY VERSIONED
 *
 * A game commits its seed on-chain at `startGame` and submits its score minutes
 * (or hours) later. At deploy time there are always games in flight that were
 * played under the previous ruleset. Bumping the rules without versioning would
 * make every one of those submissions fail replay validation — the player
 * played fairly and would be told their score was invalid.
 *
 * So: the client stamps the ruleset it played under into the submit payload,
 * and the server validates against that ruleset. v1 games keep validating
 * forever. Nothing in flight breaks.
 */

export type RulesVersion = 1 | 2

/** The ruleset new games are played under. */
export const CURRENT_RULES_VERSION: RulesVersion = 2

/**
 * Score at which each tier begins. Index = tier id (0 PAPER … 7 GLITCH).
 * Lives here rather than in scoring.ts because the rules functions gate
 * mechanics on tier and scoring.ts must not be imported by the dealer.
 */
export const TIER_THRESHOLDS = [0, 500, 1500, 4000, 9000, 20000, 45000, 100000] as const

/** Tier ids at which each gated mechanic switches on. */
export const TIER_STICKER = 1 // combo grace
export const TIER_STRIPED = 2 // near-complete line preview (visual only)
export const TIER_PIXEL = 3 // 2× base points on a clearing placement
export const TIER_NEON = 4 // +0.5 combo multiplier
export const TIER_COSMIC = 5 // diagonals become clearable lines
export const TIER_LIQUID = 6 // placed cells settle one row into gaps below
export const TIER_GLITCH = 7 // a placed piece may morph into another shape

export function tierIndexForScore(score: number): number {
  let idx = 0
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (score >= TIER_THRESHOLDS[i]) {
      idx = i
      break
    }
  }
  return idx
}

export interface RuleSet {
  /** v1 scored placements as cellCount²; v2 pays a flat rate per cell. */
  placementSquared: boolean
  placementPerCell: number
  /** Score multiplier for [1 line, 2 lines, 3+ lines] cleared at once. */
  multiLine: readonly [number, number, number]
  /** One no-clear placement holds the combo streak instead of resetting it. */
  comboGrace: boolean
  /** Piece dealing considers the current board instead of pure weighted RNG. */
  boardAwareDealer: boolean
  /** Tier-gated mechanics (PIXEL/NEON/COSMIC) affect scoring and clears. */
  tierMechanics: boolean
}

export const RULES: Record<RulesVersion, RuleSet> = {
  // ── v1 — the original ruleset. Frozen. Only in-flight and historical games
  //         are validated against it; never change these numbers.
  1: {
    placementSquared: true,
    placementPerCell: 0,
    multiLine: [1.0, 1.5, 2.5],
    comboGrace: false,
    boardAwareDealer: false,
    tierMechanics: false,
  },
  // ── v2 — current. Placement points flattened so line clears and combos carry
  //         the scoring weight; combo grace makes the upper multiplier rungs
  //         actually reachable; the dealer reads the board; tiers do something.
  2: {
    placementSquared: false,
    placementPerCell: 2,
    multiLine: [1.0, 2.0, 4.0],
    comboGrace: true,
    boardAwareDealer: true,
    tierMechanics: true,
  },
}

export function rulesFor(version: RulesVersion): RuleSet {
  return RULES[version] ?? RULES[1]
}

// ── Scoring primitives ───────────────────────────────────────────────────────

/**
 * Points for simply putting a piece on the board, before any line clear.
 *
 * v1 paid cellCount², which meant the 3×3 square was worth 81 points for
 * existing while a single cell was worth 1 — drawing the big piece scored
 * about as much as engineering a clear, and drawing is not a skill. v2 pays a
 * flat 2/cell (max 18) so placement is a rounding error and clears are the game.
 */
export function basePointsFor(cellCount: number, rules: RuleSet): number {
  return rules.placementSquared
    ? cellCount * cellCount
    : cellCount * rules.placementPerCell
}

export function multiLineFactorFor(linesCleared: number, rules: RuleSet): number {
  if (linesCleared >= 3) return rules.multiLine[2]
  if (linesCleared === 2) return rules.multiLine[1]
  return rules.multiLine[0]
}

export function linePointsFor(linesCleared: number, rules: RuleSet): number {
  return Math.round(linesCleared * 100 * multiLineFactorFor(linesCleared, rules))
}

/**
 * Combo multiplier for a streak. NEON tier (9k+) adds +0.5 on top — the tier's
 * advertised "combo bonus" mechanic, finally wired up.
 */
export function comboMultiplierFor(streak: number, scoreBefore: number, rules: RuleSet): number {
  let mult: number
  if (streak >= 10) mult = 4.0
  else if (streak >= 7) mult = 3.0
  else if (streak >= 5) mult = 2.5
  else if (streak >= 3) mult = 2.0
  else if (streak >= 2) mult = 1.5
  else if (streak >= 1) mult = 1.25
  else mult = 1.0

  if (rules.tierMechanics && mult > 1.0 && tierIndexForScore(scoreBefore) >= TIER_NEON) {
    mult += 0.5
  }
  return mult
}

/**
 * PIXEL tier (4k+) doubles base points on any placement that clears a line.
 * Returns the factor to apply to base points (1 or 2).
 */
export function pixelBaseFactorFor(scoreBefore: number, linesCleared: number, rules: RuleSet): number {
  if (!rules.tierMechanics) return 1
  if (linesCleared <= 0) return 1
  return tierIndexForScore(scoreBefore) >= TIER_PIXEL ? 2 : 1
}

/** COSMIC tier (20k+) makes the two main diagonals clearable lines. */
export function diagonalsEnabledFor(scoreBefore: number, rules: RuleSet): boolean {
  return rules.tierMechanics && tierIndexForScore(scoreBefore) >= TIER_COSMIC
}

/** STRIPED tier (1.5k+) previews near-complete lines. Purely visual. */
export function linePreviewEnabledFor(scoreBefore: number, rules: RuleSet): boolean {
  return rules.tierMechanics && tierIndexForScore(scoreBefore) >= TIER_STRIPED
}

/** LIQUID tier (45k+): placed cells slide one row down into gaps beneath them. */
export function liquidEnabledFor(scoreBefore: number, rules: RuleSet): boolean {
  return rules.tierMechanics && tierIndexForScore(scoreBefore) >= TIER_LIQUID
}

/** GLITCH tier (100k+): a placed piece may morph into a different shape. */
export function glitchEnabledFor(scoreBefore: number, rules: RuleSet): boolean {
  return rules.tierMechanics && tierIndexForScore(scoreBefore) >= TIER_GLITCH
}

// ── Combo streak state machine ───────────────────────────────────────────────

export interface ComboState {
  streak: number
  /** True when the one allowed no-clear placement has already been spent. */
  graceUsed: boolean
}

/**
 * Advance the combo streak for one placement.
 *
 * v1: any placement that cleared nothing reset the streak to 0. Because a 9×9
 * board with ~4-cell pieces clears roughly once every 2-3 placements, streak 7
 * (3.0×) and streak 10 (4.0× + the 2000 milestone) were unreachable in real
 * play — the top half of the reward ladder was dead content.
 *
 * v2: from STICKER tier up, the first no-clear placement holds the streak; a
 * second one breaks it. The grace resets every time you clear. This is the
 * mechanic STICKER always claimed to have ("+1 combo grace — one no-clear move
 * keeps your streak alive") and never implemented.
 */
export function nextComboState(
  current: ComboState,
  linesCleared: number,
  scoreBefore: number,
  rules: RuleSet
): ComboState {
  if (linesCleared > 0) {
    return { streak: current.streak + 1, graceUsed: false }
  }
  const graceAvailable =
    rules.comboGrace &&
    current.streak > 0 &&
    !current.graceUsed &&
    tierIndexForScore(scoreBefore) >= TIER_STICKER

  if (graceAvailable) {
    return { streak: current.streak, graceUsed: true }
  }
  return { streak: 0, graceUsed: false }
}
