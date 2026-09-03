import { useCallback, useEffect, useState } from 'react'

const SERVER_URL =
  (import.meta.env.VITE_SIGNER_URL as string | undefined) ??
  'http://localhost:3001'

export interface StreakDay {
  /** YYYY-MM-DD, UTC. */
  day: string
  played: boolean
}

export interface StreakState {
  /** Days in the run ending today or yesterday. 0 when the streak is broken. */
  current: number
  /** Longest run this player has ever put together. */
  longest: number
  /** Whether today already counts — false means the streak is at risk. */
  playedToday: boolean
  /** First day of the current run, or null. */
  startedOn: string | null
  /** The last seven days, oldest first. */
  week: StreakDay[]
  /** The server's idea of today, so the UI never disagrees with the count. */
  today: string
}

const EMPTY: StreakState = {
  current: 0,
  longest: 0,
  playedToday: false,
  startedOn: null,
  week: [],
  today: '',
}

/**
 * The player's daily streak, derived server-side from the runs they finished.
 *
 * Nothing is written: the streak is a reading of the sessions table, so it
 * cannot be forged by a client, cannot drift from the games behind it, and is
 * the same on every device the player signs in on. The previous lobby tile read
 * a `blokaz_streak` key that nothing ever wrote, so it said "No streak" to
 * everyone forever.
 *
 * Refetched when the player finishes a game — that is the only thing that can
 * move it — via the returned `refetch`.
 */
export function useDailyStreak(address?: string) {
  const [state, setState] = useState<StreakState>(EMPTY)
  const [isLoading, setIsLoading] = useState(false)

  const refetch = useCallback(async () => {
    if (!address) {
      setState(EMPTY)
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/session/streak/${address.toLowerCase()}`)
      if (!res.ok) return
      const data = await res.json()
      setState({
        current: data.current ?? 0,
        longest: data.longest ?? 0,
        playedToday: !!data.playedToday,
        startedOn: data.startedOn ?? null,
        week: Array.isArray(data.week) ? data.week : [],
        today: data.today ?? '',
      })
    } catch {
      // Offline or the server is cold — keep the last count rather than
      // telling a player on a 40-day streak that they have none.
    } finally {
      setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    refetch()
  }, [refetch])

  // Coming back to the tab is the other moment the count can have moved: a run
  // finished elsewhere, or midnight passed while the app sat open.
  useEffect(() => {
    if (!address) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [address, refetch])

  return { streak: state, isLoading, refetch }
}
