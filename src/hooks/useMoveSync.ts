import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useGameStore } from '../stores/gameStore'

const SERVER_URL = import.meta.env.VITE_SIGNER_URL ?? 'http://localhost:3001'
const SYNC_DEBOUNCE_MS = 5_000

// Wraps fetch with an AbortController timeout.
// On a shaky mobile connection, fetch can hang indefinitely without this.
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8_000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Returns true when the server accepted the request (2xx), false on any
// network failure or non-2xx response. Callers use this to decide whether
// to advance their "last synced" cursor.
async function post(path: string, body: object): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${SERVER_URL}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      8_000,
    )
    return res.ok
  } catch {
    // Network failure or timeout — localStorage is the primary fallback
    return false
  }
}

// POST with up to `retries` attempts. Used for important receipts (purchases)
// where losing the server record has a real cost.
async function postWithRetry(path: string, body: object, retries = 3): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${SERVER_URL}${path}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        8_000,
      )
      if (res.ok || res.status === 409) return // 409 = already processed, not an error
    } catch {
      // Timeout or network error — wait before retrying
    }
    if (attempt < retries - 1) await new Promise(r => setTimeout(r, 1_500 * (attempt + 1)))
  }
}

export function useMoveSync() {
  const { address } = useAccount()
  const score = useGameStore((s) => s.score)
  const isGameOver = useGameStore((s) => s.isGameOver)
  const reviveCount = useGameStore((s) => s.reviveCount)
  const onChainGameId = useGameStore((s) => s.onChainGameId)
  const onChainSeed = useGameStore((s) => s.onChainSeed)

  // Subscribe to game seed so the effect re-fires when a new game starts.
  const gameSeed = useGameStore((s) => s.gameSession?.seed?.toString() ?? null)

  const registeredSeedRef = useRef<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks how many moves have been successfully acknowledged by the server.
  // Only advances on a confirmed 2xx response so retries always re-send
  // any moves that were lost in a failed sync.
  const lastSyncedMoveCountRef = useRef(0)
  // Preserved even after forceReset() sets gameSession to null, so the
  // unmount flush can still send the final state to the server.
  const lastKnownSessionRef = useRef(useGameStore.getState().gameSession)

  // /session/start — fires when a genuinely new game session appears.
  // Skipped for restored/continued sessions (moveHistory already populated) so
  // we don't abandon the existing server record and race with the first sync.
  useEffect(() => {
    if (!address || !gameSeed || gameSeed === '0') return
    if (registeredSeedRef.current === gameSeed) return
    registeredSeedRef.current = gameSeed
    lastSyncedMoveCountRef.current = 0

    // If the session already has moves it was restored via continueGame() —
    // the server record still exists and the next sync will update it.
    // Only fire /session/start for brand-new games (empty history).
    const session = useGameStore.getState().gameSession
    if (session && session.moveHistory.length > 0) return

    post('/session/start', {
      address,
      seed: gameSeed,
      onChainGameId: onChainGameId?.toString() ?? null,
      onChainSeed: onChainSeed ?? null,
    })
  }, [address, gameSeed, onChainGameId, onChainSeed])

  // Ref-based callback so the debounce closure always reads latest state.
  // Falls back to lastKnownSessionRef so the unmount flush still fires even
  // after forceReset() has set gameSession to null (e.g. back-to-lobby tap).
  const syncNowRef = useRef<() => void>(() => {})
  useEffect(() => {
    syncNowRef.current = () => {
      const storeState = useGameStore.getState()
      const session = storeState.gameSession ?? lastKnownSessionRef.current
      if (!session || !address) return
      lastKnownSessionRef.current = session

      // Delta sync: only send moves the server hasn't seen yet.
      // fromIndex tells the server where these moves start in the full history
      // so it can deduplicate if this request is a retry of a failed sync.
      const fromIndex = lastSyncedMoveCountRef.current
      const newMoves = session.moveHistory.slice(fromIndex)
      const targetCount = session.moveHistory.length

      post('/session/sync', {
        address,
        seed: session.seed.toString(),
        newMoves,
        fromIndex,
        score: session.score,
        scoreBoostActive: session.scoreBoostActive,
        isGameOver,
        reviveCount,
        onChainGameId: onChainGameId?.toString() ?? null,
        onChainSeed: onChainSeed ?? null,
      }).then(ok => {
        // Only advance the cursor on a confirmed success. If the sync failed,
        // the same moves will be included in the next attempt.
        if (ok) lastSyncedMoveCountRef.current = targetCount
      })
    }
  }, [address, isGameOver, reviveCount, onChainGameId, onChainSeed])

  // Keep lastKnownSessionRef up to date whenever gameSession changes
  useEffect(() => {
    const session = useGameStore.getState().gameSession
    if (session) lastKnownSessionRef.current = session
  }, [gameSeed, score])

  // Debounced sync after every score change
  useEffect(() => {
    if (!address || !score) return
    const { gameSession } = useGameStore.getState()
    if (!gameSession || !gameSession.moveHistory.length) return

    const currentMoveCount = gameSession.moveHistory.length
    if (currentMoveCount === lastSyncedMoveCountRef.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => syncNowRef.current(), SYNC_DEBOUNCE_MS)
  }, [score, address])

  // Flush pending sync immediately on unmount (navigation away mid-game).
  // Always fires — not gated on debounceRef — so a bomb or revival that
  // changed moveHistory but not yet scheduled a debounce still gets sent.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      syncNowRef.current()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When the network comes back, send the full history as a recovery sync.
  // fromIndex=0 means "start from the beginning" — the server will deduplicate
  // moves it already has, so this is safe even if the session is partially synced.
  useEffect(() => {
    const handleOnline = () => {
      const { gameSession, onChainGameId: gid, onChainSeed: gs } = useGameStore.getState()
      if (!address || !gameSession) return
      // Snapshot the length NOW — gameSession.moveHistory is a mutable array and
      // by the time .then() fires more moves may have been appended to it.
      // Using the live length in .then() would set the cursor too high and skip
      // those newer moves on the next debounced sync.
      const snapshotLen = gameSession.moveHistory.length
      lastSyncedMoveCountRef.current = 0
      post('/session/sync', {
        address,
        seed: gameSession.seed.toString(),
        newMoves: gameSession.moveHistory,
        fromIndex: 0,
        score: gameSession.score,
        scoreBoostActive: gameSession.scoreBoostActive,
        isGameOver: gameSession.isGameOver,
        reviveCount: useGameStore.getState().reviveCount,
        onChainGameId: gid?.toString() ?? null,
        onChainSeed: gs ?? null,
      }).then(ok => {
        if (ok) lastSyncedMoveCountRef.current = snapshotLen
      })
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [address])
}

/**
 * Fetches the latest active session from the server with a hard 5-second
 * timeout. If the server is down or the network is slow, returns null
 * immediately so continueGame() falls back to localStorage without hanging.
 */
export async function fetchServerSession(address: string): Promise<{
  seed: string
  onChainGameId: string | null
  onChainSeed: string | null
  moveHistory: any[]
  score: number
  scoreBoostActive: boolean
  isGameOver: boolean
  reviveCount: number
  updatedAt: string
} | null> {
  try {
    const res = await fetchWithTimeout(
      `${SERVER_URL}/session/restore/${address.toLowerCase()}`,
      {},
      5_000, // 5 s max — player should not wait longer than this to continue
    )
    if (!res.ok) return null
    const { session } = await res.json()
    return session ?? null
  } catch {
    return null
  }
}

/**
 * Marks the session as submitted after successful on-chain score submission.
 * Retries up to 3 times — losing this record means the session could be
 * offered for restore after it was already submitted.
 *
 * Both seeds go up. The row is keyed by the local session seed, but the caller
 * usually has the on-chain one to hand, and sending only that matched nothing:
 * the two live in different columns, so the session stayed active and came
 * back as a resumable run the player could submit a second time.
 */
export async function markSessionComplete(
  address: string,
  seed: string | null,
  onChainSeed?: string | null
): Promise<void> {
  await postWithRetry('/session/complete', { address, seed, onChainSeed }, 3)
}

/**
 * Syncs tournament game sessions to the dedicated tournament_sessions table.
 * Mirror of useMoveSync but uses /tournament-session/* endpoints and always
 * includes the tournamentId so sessions are scoped to a specific tournament.
 */
export function useTournamentMoveSync(tournamentId: bigint | null) {
  const { address } = useAccount()
  const score       = useGameStore((s) => s.score)
  const isGameOver  = useGameStore((s) => s.isGameOver)
  const reviveCount = useGameStore((s) => s.reviveCount)
  const onChainGameId = useGameStore((s) => s.onChainGameId)
  const onChainSeed   = useGameStore((s) => s.onChainSeed)
  const gameSeed      = useGameStore((s) => s.gameSession?.seed?.toString() ?? null)

  const registeredSeedRef        = useRef<string | null>(null)
  const debounceRef              = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedMoveCountRef   = useRef(0)
  const lastKnownSessionRef      = useRef(useGameStore.getState().gameSession)

  const tid = tournamentId?.toString() ?? null

  // /tournament-session/start — fires once per new seed
  useEffect(() => {
    if (!address || !gameSeed || gameSeed === '0' || !tid) return
    if (registeredSeedRef.current === gameSeed) return
    registeredSeedRef.current = gameSeed
    lastSyncedMoveCountRef.current = 0

    const session = useGameStore.getState().gameSession
    if (session && session.moveHistory.length > 0) return

    post('/tournament-session/start', {
      address,
      tournamentId: tid,
      seed: gameSeed,
      onChainGameId: onChainGameId?.toString() ?? null,
      onChainSeed: onChainSeed ?? null,
    })
  }, [address, gameSeed, tid, onChainGameId, onChainSeed])

  const syncNowRef = useRef<() => void>(() => {})
  useEffect(() => {
    syncNowRef.current = () => {
      const storeState = useGameStore.getState()
      const session = storeState.gameSession ?? lastKnownSessionRef.current
      if (!session || !address || !tid) return
      lastKnownSessionRef.current = session

      const fromIndex = lastSyncedMoveCountRef.current
      const newMoves  = session.moveHistory.slice(fromIndex)
      const targetCount = session.moveHistory.length

      post('/tournament-session/sync', {
        address,
        tournamentId: tid,
        seed: session.seed.toString(),
        newMoves,
        fromIndex,
        score: session.score,
        scoreBoostActive: session.scoreBoostActive,
        isGameOver,
        reviveCount,
        onChainGameId: onChainGameId?.toString() ?? null,
        onChainSeed: onChainSeed ?? null,
      }).then(ok => {
        if (ok) lastSyncedMoveCountRef.current = targetCount
      })
    }
  }, [address, tid, isGameOver, reviveCount, onChainGameId, onChainSeed])

  useEffect(() => {
    const session = useGameStore.getState().gameSession
    if (session) lastKnownSessionRef.current = session
  }, [gameSeed, score])

  // Debounced sync on every score change
  useEffect(() => {
    if (!address || !score || !tid) return
    const { gameSession } = useGameStore.getState()
    if (!gameSession || !gameSession.moveHistory.length) return

    const currentMoveCount = gameSession.moveHistory.length
    if (currentMoveCount === lastSyncedMoveCountRef.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => syncNowRef.current(), SYNC_DEBOUNCE_MS)
  }, [score, address, tid])

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      syncNowRef.current()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Network recovery — full resync
  useEffect(() => {
    const handleOnline = () => {
      const { gameSession, onChainGameId: gid, onChainSeed: gs } = useGameStore.getState()
      if (!address || !gameSession || !tid) return
      const snapshotLen = gameSession.moveHistory.length
      lastSyncedMoveCountRef.current = 0
      post('/tournament-session/sync', {
        address,
        tournamentId: tid,
        seed: gameSession.seed.toString(),
        newMoves: gameSession.moveHistory,
        fromIndex: 0,
        score: gameSession.score,
        scoreBoostActive: gameSession.scoreBoostActive,
        isGameOver: gameSession.isGameOver,
        reviveCount: useGameStore.getState().reviveCount,
        onChainGameId: gid?.toString() ?? null,
        onChainSeed: gs ?? null,
      }).then(ok => {
        if (ok) lastSyncedMoveCountRef.current = snapshotLen
      })
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [address, tid])
}

/**
 * Marks a tournament session as submitted after successful on-chain score submission.
 */
export async function markTournamentSessionComplete(
  address: string,
  tournamentId: string,
  seed: string | null,
  onChainSeed?: string | null,
): Promise<void> {
  await postWithRetry(
    '/tournament-session/complete',
    { address, tournamentId, seed, onChainSeed },
    3
  )
}

/**
 * Fetches the latest active tournament session from the server for session recovery.
 */
export async function fetchTournamentServerSession(
  address: string,
  tournamentId: string,
): Promise<{
  seed: string
  onChainGameId: string | null
  onChainSeed: string | null
  moveHistory: any[]
  score: number
  scoreBoostActive: boolean
  isGameOver: boolean
  reviveCount: number
  updatedAt: string
} | null> {
  try {
    const res = await fetchWithTimeout(
      `${SERVER_URL}/tournament-session/restore/${address.toLowerCase()}/${tournamentId}`,
      {},
      5_000,
    )
    if (!res.ok) return null
    const { session } = await res.json()
    return session ?? null
  } catch {
    return null
  }
}
