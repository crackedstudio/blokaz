/**
 * The 12-level progression ladder.
 *
 * ⚠️  MIRROR CONTRACT
 * Hand-mirrored in src/constants/levels.ts, which renders the challenge board.
 * The server is authoritative — the client copy exists only so the UI can draw
 * targets, badges and reward previews without a round trip. If you change a
 * target, a badge or a reward here, change it there too.
 * src/constants/__tests__/levels.test.ts asserts the shape stays sane.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * How the ladder works
 *
 * Every level is a FRESH START. A player sitting at level N sees
 * LEVELS[N].targets as their challenge card, and the four counters are measured
 * from the moment they entered that level — not from the start of the week and
 * not from where the previous level left off. Clearing the card advances them
 * to N+1 immediately, mid-week, and every counter goes back to zero under them:
 * the purchase that cleared level 1 does not count toward level 2, and neither
 * do its points, games or tournament runs.
 *
 * That is what makes each rung its own piece of work rather than a threshold
 * the previous rung has already half-paid. It also means only one level can be
 * cleared per refresh — the window resets on the way through, so there is no
 * banked progress left to carry into the next card.
 *
 * The counters are still bounded by the week: they never reach back past the
 * current Monday, so a level entered on Sunday gets the rest of Sunday, not a
 * full seven days.
 *
 * At the end of the week (Monday 00:00 UTC) a player who gained no level that
 * week drops one, floored at level 1. Level 12 has nowhere to advance to, so
 * meeting its targets counts as holding rank instead.
 *
 * Point targets are calibrated against the score tiers in src/engine/scoring.ts:
 * a casual session lands around 1–5k, a strong one 9–20k, and 45k+ is rare. So
 * level 1 is roughly two sessions and level 12 demands a week of sustained
 * high-tier play.
 */

/**
 * Targets that must ALL be met to clear the level, counted from the moment the
 * player entered it. Absolute per level, not cumulative across the ladder — a
 * level 12 card is 120 games played while sitting at level 12.
 *
 * ⚠️  The `purchases` column is the funding rule, not a difficulty dial.
 * A milestone pays twice what the climb to it costs, so the purchases between
 * one milestone and the next must come to exactly half that payout at the
 * shop's $0.10 unit price:
 *
 *   levels 1–4    10 buys = $1.00   → pays $2
 *   levels 5–8    30 buys = $3.00   → pays $6
 *   levels 9–12   60 buys = $6.00   → pays $12
 *
 * Change a purchases number and the stretch it belongs to must still total 10,
 * 30 or 60, or the game is paying out more than it takes in. The mirror in
 * src/constants/levels.ts carries the same numbers.
 */
export const LEVELS = [
  null, // 1-indexed — LEVELS[1] is level 1
  { level: 1,   name: 'PAPER CADET',      accent: '#ffd51f', targets: { games: 10,  tournaments: 10, purchases: 1,  points: 1_000  } },
  { level: 2,   name: 'STICKER SCOUT',    accent: '#ff3bbd', targets: { games: 15,  tournaments: 12, purchases: 2,  points: 3_000  } },
  { level: 3,   name: 'STRIPED RUNNER',   accent: '#ff7a1a', targets: { games: 21,  tournaments: 15, purchases: 3,  points: 6_500  } },
  { level: 4,   name: 'PIXEL BREAKER',    accent: '#b7ff3b', targets: { games: 28,  tournaments: 18, purchases: 4,  points: 12_000 } },
  { level: 5,   name: 'NEON RIDER',       accent: '#29e6e6', targets: { games: 36,  tournaments: 21, purchases: 5,  points: 20_000 } },
  { level: 6,   name: 'COSMIC DRIFTER',   accent: '#8a3dff', targets: { games: 45,  tournaments: 25, purchases: 7,  points: 32_000 } },
  { level: 7,   name: 'LIQUID SURGE',     accent: '#29e6e6', targets: { games: 55,  tournaments: 29, purchases: 8,  points: 48_000 } },
  { level: 8,   name: 'GLITCH WALKER',    accent: '#ff3bbd', targets: { games: 66,  tournaments: 33, purchases: 10,  points: 70_000 } },
  { level: 9,   name: 'VOID ARCHITECT',   accent: '#b7ff3b', targets: { games: 78,  tournaments: 38, purchases: 12, points: 100_000 } },
  { level: 10,  name: 'PRISM WARDEN',     accent: '#ff7a1a', targets: { games: 91,  tournaments: 43, purchases: 14, points: 140_000 } },
  { level: 11,  name: 'OBSIDIAN ORACLE',  accent: '#8a3dff', targets: { games: 105, tournaments: 48, purchases: 16, points: 190_000 } },
  { level: 12,  name: 'BLOKAZ SOVEREIGN', accent: '#ffd51f', targets: { games: 120, tournaments: 54, purchases: 18, points: 260_000 } },
]

export const MAX_LEVEL = 12

/**
 * Power-ups credited to player_inventory the FIRST time a level is cleared.
 * Keys are player_inventory column names.
 */
export const LEVEL_POWERUPS = {
  1:  { revival_bundle: 1 },
  2:  { score_boost: 1 },
  3:  { shield: 1, bomb: 1 },
  4:  { revival_bundle: 2 },
  5:  { score_boost: 2, rotate_pass: 1 },
  6:  { shield: 2, bomb: 2 },
  7:  { revival_bundle: 3, rotate_pass: 1 },
  8:  { score_boost: 3, shield: 3 },
  9:  { bomb: 3, rotate_pass: 3 },
  10: { revival_bundle: 5, score_boost: 3 },
  11: { shield: 5, bomb: 5, rotate_pass: 3 },
  12: { revival_bundle: 5, score_boost: 5, shield: 5, bomb: 5, rotate_pass: 5 },
}

/**
 * Milestone levels that additionally pay a stablecoin cash link. Only these
 * three, and only ever once per player per level — clearing a level again
 * after a demotion pays nothing.
 *
 * The link itself is drawn from level_cashlink_pool, which an admin funds in
 * advance. Nothing here creates money on its own.
 */
export const CASH_MILESTONES = new Set([4, 8, 12])

/**
 * TEST-ONLY milestone whitelist. EMPTY in normal operation, which is what makes
 * the ladder behave for everyone: with no addresses listed, TEST_CASH_LEVELS
 * pays nobody, poolLevels() is CASH_MILESTONES exactly, and level 1 is an
 * ordinary power-up level again.
 *
 * Set TEST_CASH_ADDRESSES (comma separated) to arm it. Those addresses — and
 * only those — are then paid a cash link for clearing a test level, so the
 * claim flow (pool draw → rewards row → claim) can be exercised on level 1
 * instead of grinding to level 4. Unset it and the behaviour is gone; nothing
 * else has to change.
 *
 * Deliberately kept separate from CASH_MILESTONES: the client mirror in
 * src/constants/levels.ts advertises CASH_MILESTONES on the public challenge
 * board, and a test level must not promise every player money it will not pay.
 */
export const TEST_CASH_LEVELS = new Set([1])

export const TEST_CASH_ADDRESSES = new Set(
  (process.env.TEST_CASH_ADDRESSES ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
)

/**
 * Does clearing `level` pay `address` a cash link?
 *
 * The real milestones pay everybody; the test levels pay only the whitelist.
 * `address` is matched case-insensitively, so callers can pass either form.
 */
export function isCashMilestone(level, address) {
  const n = Number(level)
  if (CASH_MILESTONES.has(n)) return true
  return (
    TEST_CASH_LEVELS.has(n) &&
    TEST_CASH_ADDRESSES.has(String(address ?? '').toLowerCase())
  )
}

/**
 * Every level a cash-link pool can be funded for, ascending.
 *
 * The pool and the admin ledger are per level, not per player, so they cover
 * the test levels too whenever the whitelist is non-empty — an admin has to be
 * able to load level 1 links for the whitelisted tester to draw.
 */
export function poolLevels() {
  const levels = new Set(CASH_MILESTONES)
  if (TEST_CASH_ADDRESSES.size > 0) for (const l of TEST_CASH_LEVELS) levels.add(l)
  return [...levels].sort((a, b) => a - b)
}

export const TARGET_KEYS = ['games', 'tournaments', 'purchases', 'points']

/** True when every target for `level` is met by `progress`. */
export function meetsTargets(level, progress) {
  const spec = LEVELS[level]
  if (!spec) return false
  return TARGET_KEYS.every((key) => (progress[key] ?? 0) >= spec.targets[key])
}

/**
 * Optional global re-baseline, as an ISO 8601 timestamp. Unset by default.
 *
 * Nothing normally needs this — each player's own start date already keeps
 * pre-ladder activity out of their counters (see progressWindowStart). Set it
 * only to deliberately reset the ENTIRE player base from a chosen moment, for
 * instance if the objectives are redefined and old progress stops being
 * comparable.
 */
export const LADDER_EPOCH = process.env.LADDER_EPOCH ?? null

/**
 * The instant from which a player's counters are measured: the latest of the
 * week start, the moment that player joined the ladder, the moment they entered
 * their current level, and any global re-baseline.
 *
 * `levelStartedAt` is what makes every level a fresh start. Counters are
 * derived on read, so without it a card would be scored against everything the
 * player did since Monday — including the runs and purchases that cleared the
 * level below, which is exactly the carry-over the ladder is not supposed to
 * have. Anchoring to the moment the level was entered zeroes all four counters
 * the instant a player advances or is demoted.
 *
 * `joinedAt` is what makes the ladder safe to deploy at any moment. Counters
 * are derived from tables that have been recording for months, so measuring
 * from the plain week start would credit a player for everything they had
 * already done since Monday — objectives would appear part-finished, or ticked
 * outright, the first time they opened the updated app. Anchoring to the row's
 * own creation means every player begins at zero from their first visit after
 * the update ships, whenever that happens to be.
 *
 * Self-expiring: from the following Monday the week start is always the latest
 * of the four, so the join date stops applying on its own.
 */
export function progressWindowStart(
  weekStart,
  joinedAt = null,
  levelStartedAt = null,
  epoch = LADDER_EPOCH
) {
  const weekMs = Date.parse(`${weekStart}T00:00:00Z`)

  let latest = weekMs
  for (const candidate of [joinedAt, levelStartedAt, epoch]) {
    if (!candidate) continue
    const ms = Date.parse(candidate)
    // Ignore anything unparseable rather than collapsing the window to NaN,
    // which would make the RPC return no rows and zero every counter.
    if (!Number.isNaN(ms) && ms > latest) latest = ms
  }

  return latest === weekMs ? `${weekStart}T00:00:00Z` : new Date(latest).toISOString()
}

/** Monday 00:00 UTC of the week containing `date`, as a YYYY-MM-DD string. */
export function weekStartOf(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // getUTCDay(): 0 = Sunday, so Sunday belongs to the week that began 6 days ago.
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysSinceMonday)
  return d.toISOString().slice(0, 10)
}

/** Whole weeks between two YYYY-MM-DD Monday strings. */
export function weeksBetween(fromWeekStart, toWeekStart) {
  const from = Date.parse(`${fromWeekStart}T00:00:00Z`)
  const to = Date.parse(`${toWeekStart}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.round((to - from) / (7 * 24 * 60 * 60 * 1000)))
}

/**
 * Applies the weekly rollover to a player's ladder row.
 *
 * A player who gained no level in the week that just ended drops one, and every
 * whole week skipped since then costs another — a player away for a month comes
 * back several rungs down, which is what "fail to advance and you drop" means
 * once you allow for absences. Floored at level 1.
 *
 * Pure: returns the new row rather than mutating, so the route can test the
 * decision separately from the database round trip.
 */
export function applyRollover(row, currentWeek) {
  if (row.week_start >= currentWeek) {
    return { level: row.level, weekStart: row.week_start, levelsGained: row.levels_gained_this_week, demotedBy: 0 }
  }

  const weeksMissed = weeksBetween(row.week_start, currentWeek)
  const dropForLastWeek = row.levels_gained_this_week > 0 ? 0 : 1
  // Never drop below level 1, and never report a demotion larger than the one
  // actually applied.
  const demotedBy = Math.min(row.level - 1, dropForLastWeek + (weeksMissed - 1))

  return {
    level: Math.max(1, row.level - demotedBy),
    weekStart: currentWeek,
    levelsGained: 0,
    demotedBy,
  }
}

/**
 * Whether this level's progress clears the card, and where that leaves the
 * player.
 *
 * At most ONE level per call. Each level is measured from the moment it was
 * entered, so the progress passed in belongs to `level` alone — the next card
 * starts from zero and cannot be judged against a snapshot taken before the
 * advance. The caller resets the window and the player climbs the next rung on
 * a later refresh, having actually played it.
 *
 * Level 12 has nowhere to climb: clearing its card is reported as `held`, which
 * is what protects a maxed player from the end-of-week demotion.
 *
 * `cleared` is kept as an array — the caller pays out each entry, and the
 * shape is what the client renders in the level-up modal.
 */
export function climb(level, progress) {
  if (!meetsTargets(level, progress)) return { level, cleared: [], held: false }
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, cleared: [MAX_LEVEL], held: true }
  return { level: level + 1, cleared: [level], held: false }
}
