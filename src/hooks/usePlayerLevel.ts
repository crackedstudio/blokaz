import { useCallback, useEffect, useRef, useState } from 'react'
import type { LevelTargets, ObjectiveKey } from '../constants/levels'

const SERVER_URL =
  (import.meta.env.VITE_SIGNER_URL as string | undefined) ??
  'http://localhost:3001'

/** A level the player cleared during this refresh. */
export interface LevelAdvance {
  level: number
  name: string
  powerups: Record<string, number>
  cash: { amount?: string; token?: string; pending?: boolean } | null
  /**
   * False when this level had been cleared before and is being climbed again
   * after a demotion — the climb still counts, but rewards are paid once only.
   */
  firstClear: boolean
}

export interface LevelState {
  level: number
  name: string
  accent: string
  highestLevel: number
  maxLevel: number
  /** Monday (UTC) the current counters belong to, as YYYY-MM-DD. */
  weekStart: string
  levelsGainedThisWeek: number
  /** No level gained yet this week — a rollover now would cost one. */
  atRisk: boolean
  progress: LevelTargets
  targets: LevelTargets
  complete: Record<ObjectiveKey, boolean>
  /** Levels cleared by this refresh, newest last. Empty on a plain read. */
  advanced: LevelAdvance[]
  /** Levels lost to the weekly rollover that this refresh applied. */
  demotedBy: number
  /** At level 12 and cleared the card — rank held rather than gained. */
  held: boolean
  maxed: boolean
  /**
   * Has ever cleared level 12's card. Unlike `held`, which is only true on the
   * refresh that clears it, this is derived from level_grants and survives
   * every later read — it is what SilverGod unlocks on.
   */
  sovereign: boolean
}

async function postRefresh(
  address: string,
  signal: AbortSignal
): Promise<LevelState | null> {
  const res = await fetch(`${SERVER_URL}/levels/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
    signal,
  })
  if (!res.ok) return null
  const data = await res.json()
  return (data?.state as LevelState) ?? null
}

/**
 * Reads — and advances — the player's position on the ladder.
 *
 * POST /levels/refresh is the authoritative call: it applies any pending weekly
 * rollover, climbs the player as far as this week's progress allows, and pays
 * out newly cleared levels. All of that is idempotent server-side, so calling
 * it again is safe and simply re-reports the same state.
 *
 * The lobby is where a player lands after every run, so mounting this hook
 * there is enough to keep the ladder current without threading a callback
 * through the game loop.
 */
export function usePlayerLevel(address?: string) {
  const [state, setState] = useState<LevelState | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Aborts the in-flight request when the address changes or the panel
  // unmounts, so a slow response can't land on a stale player.
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!address) {
      setState(null)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    try {
      const next = await postRefresh(address, controller.signal)
      if (!controller.signal.aborted && next) setState(next)
    } catch {
      // Offline or the server is cold — keep whatever we last showed rather
      // than blanking the panel.
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    refresh()
    return () => abortRef.current?.abort()
  }, [refresh])

  // Coming back to the tab is the other moment progress may have moved —
  // a tournament run finished elsewhere, or the week rolled over while idle.
  useEffect(() => {
    if (!address) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [address, refresh])

  return { state, isLoading, refresh }
}
