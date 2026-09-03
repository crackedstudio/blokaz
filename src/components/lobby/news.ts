/**
 * News & updates — the copy that drives the lobby's news tile, the ticker and
 * the nudge modal.
 *
 * Lifted out of LobbyScreen so the tiles can read it without importing the
 * screen that renders them. LobbyScreen re-exports these names, so existing
 * import paths keep working.
 */

export interface NewsItem {
  id: string
  tag: 'UPDATE' | 'CAMPAIGN' | 'TOURNAMENT' | 'COMMUNITY' | 'NEW'
  date: string // e.g. "22 MAY 2026"
  headline: string
  body: string
  link?: string
  /** Epoch ms before which this item stays hidden everywhere. Omit to show immediately. */
  publishAt?: number
  /** If true, the nudge modal keeps re-showing on a cooldown instead of once ever. */
  recurring?: boolean
}

// Tournaments go live at 16:00 GMT+1 (== 15:00 UTC). Change this to reschedule.
export const TOURNAMENT_LAUNCH_MS = Date.parse('2026-07-09T16:00:00+01:00')

// ✏️  Edit this array to publish new news items — newest first
export const NEWS_ITEMS: NewsItem[] = [
  {
    id: 'ladder-fresh-start',
    tag: 'UPDATE',
    date: '3 SEP 2026',
    headline: 'The ladder changed — every level now starts you from zero',
    body:
      'Levels no longer inherit what you did on the level below. Clear a level and all four counters — games, tournament runs, shop purchases and points — restart on the next card, so every rung is its own piece of work and each one asks for its own shop purchase. One level at a time, too: a huge week no longer skips you past rungs you never played. Clearing a level still credits power-ups the first time you reach it, and levels 4, 8 and 12 also pay a stablecoin cash reward — which you can now claim straight from the level that paid it, in PROGRESS or on the rung itself in the ladder.',
  },
  {
    id: 'tournaments-live',
    tag: 'TOURNAMENT',
    date: '9 JUL 2026',
    headline: 'Tournaments are LIVE — head to the Tournament section and compete now!',
    body: 'Blokaz tournaments are officially open. Open the Tournament section, join a tournament, and stack your best score to compete for the prize pool. Good luck!',
    publishAt: TOURNAMENT_LAUNCH_MS,
    recurring: true,
  },
]

/** Only items whose publish time has passed — use this everywhere news renders. */
export function getLiveNewsItems(now: number = Date.now()): NewsItem[] {
  return NEWS_ITEMS.filter((n) => n.publishAt == null || now >= n.publishAt)
}

export const TAG_COLORS: Record<NewsItem['tag'], { bg: string; color: string }> = {
  NEW: { bg: 'var(--accent-yellow)', color: 'var(--ink-fixed)' },
  UPDATE: { bg: 'var(--accent-lime)', color: 'var(--ink-fixed)' },
  TOURNAMENT: { bg: 'var(--accent-orange)', color: '#ffffff' },
  CAMPAIGN: { bg: 'var(--accent-purple)', color: '#ffffff' },
  COMMUNITY: { bg: 'var(--accent-cyan)', color: 'var(--ink-fixed)' },
}
