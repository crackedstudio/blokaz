/**
 * The daily streak: consecutive days a player has finished at least one run.
 *
 * Derived, never stored. The days come from the sessions the player has already
 * played, so a streak cannot be written by a client, cannot drift out of step
 * with the games behind it, and follows the player to any device they sign in
 * on. Nothing has to run at midnight to break one — a streak that is not
 * extended simply stops being counted the next time it is read.
 *
 * ── Where the day boundary sits ──────────────────────────────────────────────
 * UTC, the same boundary the weekly ladder rolls over on. A local-time boundary
 * would mean the streak changes when the player travels, and would need a
 * timezone the server does not have.
 *
 * ── Why today's absence does not break it ────────────────────────────────────
 * A streak counted only up to today would read zero every morning until the
 * player's first game, which punishes them for opening the app before playing.
 * So a streak ending yesterday still stands: it is live until a whole day has
 * passed without a game, and `playedToday` says whether it has been extended.
 */

/** A day, as YYYY-MM-DD in UTC. */
export function utcDay(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10)
}

/** The day `n` days before `day` (a YYYY-MM-DD string). */
export function dayBefore(day, n = 1) {
  const ms = Date.parse(`${day}T00:00:00Z`)
  return new Date(ms - n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * The streak standing on `today`, given the days a player has played.
 *
 * `playDays` is any collection of YYYY-MM-DD strings — unordered and possibly
 * repeated; only the set of distinct days matters.
 *
 * Returns:
 *   current     — days in the run ending today or yesterday, else 0
 *   longest     — the longest run anywhere in the history given
 *   playedToday — whether today is already counted
 *   startedOn   — the first day of the current run, or null
 */
export function computeStreak(playDays, today = utcDay()) {
  const days = new Set(playDays.filter(Boolean).map((d) => String(d).slice(0, 10)))

  const playedToday = days.has(today)
  // Yesterday anchors the streak on a day the player has not played yet, so it
  // survives the morning. Two days of silence ends it.
  const anchor = playedToday ? today : days.has(dayBefore(today)) ? dayBefore(today) : null

  let current = 0
  if (anchor) {
    let day = anchor
    while (days.has(day)) {
      current += 1
      day = dayBefore(day)
    }
  }

  // The longest run in the whole history, which is what a personal best means —
  // walk the days in order and count each unbroken chain.
  const sorted = [...days].sort()
  let longest = 0
  let run = 0
  let previous = null
  for (const day of sorted) {
    run = previous && dayBefore(day) === previous ? run + 1 : 1
    if (run > longest) longest = run
    previous = day
  }

  return {
    current,
    longest,
    playedToday,
    startedOn: current > 0 ? dayBefore(anchor, current - 1) : null,
  }
}

/**
 * The last `count` days ending today, oldest first, each marked played or not.
 *
 * This is the strip the lobby and the game sidebar draw. It is built here
 * rather than in the UI so both surfaces show the same days — the panels used
 * to fill their bars from the current weekday, which drew a full week for a
 * player who had never played.
 */
export function recentDays(playDays, today = utcDay(), count = 7) {
  const days = new Set(playDays.filter(Boolean).map((d) => String(d).slice(0, 10)))
  return Array.from({ length: count }, (_, i) => {
    const day = dayBefore(today, count - 1 - i)
    return { day, played: days.has(day) }
  })
}
