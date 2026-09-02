/**
 * SILVERGOD — the level-12 prestige unlock.
 *
 * Earned by clearing level 12's card: 120 games, 54 tournament games, 18 shop
 * purchases and 260,000 points inside one week, on top of the eleven levels it
 * takes to arrive there. It grants the silver theme, which the player can then
 * switch on and off like any other.
 *
 * ── Why there is no local grant ─────────────────────────────────────────────
 * This deliberately does NOT persist anything. An earlier version cached the
 * unlock in localStorage so the theme would survive the ladder API being
 * unreachable — but a localStorage key is a one-line self-grant, which made
 * the hardest achievement in the game free to anyone who opened a console.
 *
 * The only source of truth is `sovereign` on the live level state, which the
 * server derives from the level_grants row for level 12. The cost is that
 * silver is unavailable while the ladder API is down; that is the right trade
 * for something meant to signal an achievement.
 */

import type { LevelState } from '../hooks/usePlayerLevel'

/**
 * Whether this player has cleared level 12's card.
 *
 * `sovereign` is the durable server answer. `held` is the transient one — true
 * only on the refresh that actually clears the card — and is accepted as a
 * fallback for a server build that predates the flag.
 */
export function isSovereign(levelState: LevelState | null): boolean {
  if (!levelState) return false
  return Boolean(
    levelState.sovereign || (levelState.held && levelState.level >= 12)
  )
}
