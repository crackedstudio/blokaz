/**
 * Career progress — the half of a player's stats the server cannot work out
 * for itself.
 *
 * Games played, total score and best score are already in game_sessions, so
 * they are read from there and never trusted to a client. XP, achievements,
 * missions, best combo and lines cleared are not: they come out of rules the
 * browser runs while a game is played, and no row records them. Those are
 * mirrored here so a player keeps them across devices instead of losing
 * everything to a cleared cache.
 *
 * Because they are client-reported, they are also client-forgeable. That is
 * acceptable for exactly as long as nothing pays out on them — the ladder's
 * cash rewards are derived server-side and owe nothing to this table. Anything
 * that later hangs money off career level must be derived too.
 *
 * ── Why the server merges rather than overwrites ─────────────────────────────
 * A player with the app open on a phone and a tablet has two devices holding
 * different halves of the same history, and whichever saved last would win.
 * Merging by "the better of the two" instead means neither device can erase the
 * other's progress: counters take the higher value, achievements take the
 * union, and a run recorded offline still lands whenever that device syncs.
 */

const EMPTY_LIFETIME = {
  gamesPlayed: 0,
  totalScore: 0,
  totalLines: 0,
  bestScore: 0,
  bestCombo: 0,
}

export function emptyProgress() {
  return {
    totalXp: 0,
    lifetime: { ...EMPTY_LIFETIME },
    unlockedAchievements: [],
    missionDay: '',
    missions: [],
  }
}

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const higher = (a, b) => Math.max(num(a), num(b))

/**
 * Merges two progress blobs into the one that loses nothing.
 *
 * Counters are monotonic — they only ever go up as games are played — so the
 * higher value is the more complete one. Missions are the exception: they are a
 * daily set, not a total, so the newer day wins outright and a stale day is
 * dropped rather than blended into today's three.
 */
export function mergeProgress(a, b) {
  const left = a ?? emptyProgress()
  const right = b ?? emptyProgress()

  const missionDay =
    (left.missionDay ?? '') >= (right.missionDay ?? '') ? left.missionDay : right.missionDay
  const missionsFrom = missionDay === left.missionDay ? left : right

  return {
    totalXp: higher(left.totalXp, right.totalXp),
    lifetime: {
      gamesPlayed: higher(left.lifetime?.gamesPlayed, right.lifetime?.gamesPlayed),
      totalScore: higher(left.lifetime?.totalScore, right.lifetime?.totalScore),
      totalLines: higher(left.lifetime?.totalLines, right.lifetime?.totalLines),
      bestScore: higher(left.lifetime?.bestScore, right.lifetime?.bestScore),
      bestCombo: higher(left.lifetime?.bestCombo, right.lifetime?.bestCombo),
    },
    // An achievement is unlocked forever, so the union is the only answer that
    // cannot take one back.
    unlockedAchievements: [
      ...new Set([
        ...(left.unlockedAchievements ?? []),
        ...(right.unlockedAchievements ?? []),
      ]),
    ],
    missionDay: missionDay ?? '',
    missions: Array.isArray(missionsFrom.missions) ? missionsFrom.missions : [],
  }
}

/**
 * The stats the sessions table can answer on its own, overlaid on the stored
 * blob.
 *
 * The derived numbers win: they are the count of runs actually played, so a
 * device reporting fewer games than the server has rows for is simply behind,
 * and one reporting more is wrong. The rest of the blob is passed through
 * untouched.
 */
export function withDerivedLifetime(progress, derived) {
  const base = progress ?? emptyProgress()
  if (!derived) return base

  return {
    ...base,
    lifetime: {
      ...base.lifetime,
      gamesPlayed: num(derived.gamesPlayed),
      totalScore: num(derived.totalScore),
      // Best score is a maximum over runs, so the server's own maximum is the
      // whole truth — not something to reconcile with a device's memory of it.
      bestScore: num(derived.bestScore),
    },
  }
}
