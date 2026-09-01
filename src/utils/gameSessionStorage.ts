import type { MoveRecord } from '../engine/game'
import { CURRENT_RULES_VERSION } from '../engine/rules'
import type { RulesVersion } from '../engine/rules'

export const CLASSIC_SESSION_STORAGE_KEY = 'blokaz_classic_session'
export const TOURNAMENT_SESSION_STORAGE_KEY = 'blokaz_tournament_session'

export interface StoredGameSession {
  address: string
  seed: `0x${string}`
  hash?: `0x${string}`
  gameId: string | null
  contractAddress: `0x${string}`
  tournamentId?: string | null
  // Scoring ruleset this run was started under. Absent means the run was
  // written by a pre-v2 client, so it must be restored and submitted as v1 —
  // replaying it under current rules would change its deals and its score.
  rulesVersion?: RulesVersion
  // In-progress run backup, written on score change / revive / app-hide and
  // replayed by replayMoveHistory() to restore the session after a crash.
  snapshot?: { moveHistory: MoveRecord[]; scoreBoostActive?: boolean }
}

export function readStoredGameSession(
  storageKey: string,
  address?: `0x${string}`,
  contractAddress?: `0x${string}`
) {
  if (typeof window === 'undefined') return null

  const stored = localStorage.getItem(storageKey)
  if (!stored) return null

  try {
    const data = JSON.parse(stored) as StoredGameSession

    if (address && data.address.toLowerCase() !== address.toLowerCase()) {
      return null
    }

    if (contractAddress && data.contractAddress !== contractAddress) {
      return null
    }

    if (!data.seed) {
      return null
    }

    // A stored run with no ruleset was written by a pre-v2 client and must be
    // restored and submitted as v1.
    return { ...data, rulesVersion: data.rulesVersion ?? 1 } as StoredGameSession
  } catch (error) {
    console.error('Failed to parse stored game session', error)
    return null
  }
}

export function writeStoredGameSession(storageKey: string, session: StoredGameSession) {
  let rulesVersion = session.rulesVersion

  if (rulesVersion === undefined) {
    // Callers build these records fresh, so an unset ruleset means "whatever
    // this run already had". Carrying the previous value forward keeps a run
    // that was started under v1 on v1 for its whole life, even across a deploy
    // that changed the rules mid-run. Only a genuinely new run (nothing stored,
    // or a different seed) is stamped with the current ruleset.
    try {
      const raw = localStorage.getItem(storageKey)
      const prev = raw ? (JSON.parse(raw) as StoredGameSession) : null
      rulesVersion =
        prev && prev.seed === session.seed
          ? prev.rulesVersion ?? 1
          : CURRENT_RULES_VERSION
    } catch {
      rulesVersion = CURRENT_RULES_VERSION
    }
  }

  localStorage.setItem(storageKey, JSON.stringify({ ...session, rulesVersion }))
}

export function clearStoredGameSession(storageKey: string) {
  localStorage.removeItem(storageKey)
}

// ── Per-tournament session storage ────────────────────────────────────────────
// Each tournament gets its own storage slot so playing in one tournament can
// never overwrite another's in-progress run. The unscoped legacy key is
// migrated on first read.

export const tournamentSessionKey = (tournamentId: string | bigint) =>
  `${TOURNAMENT_SESSION_STORAGE_KEY}:${tournamentId.toString()}`

const LAST_TOURNAMENT_KEY = 'blokaz_tournament_last_tid'

export function rememberLastTournament(tournamentId: string | bigint) {
  try {
    localStorage.setItem(LAST_TOURNAMENT_KEY, tournamentId.toString())
  } catch {}
}

export function readLastTournamentId(): string | null {
  try {
    return localStorage.getItem(LAST_TOURNAMENT_KEY)
  } catch {
    return null
  }
}

export function readTournamentSession(
  tournamentId: string | bigint,
  address?: `0x${string}`,
  contractAddress?: `0x${string}`
): StoredGameSession | null {
  const key = tournamentSessionKey(tournamentId)
  const entry = readStoredGameSession(key, address, contractAddress)
  if (entry) return entry
  // Legacy single-slot entry (pre per-tournament storage): claim and migrate
  // it when it belongs to this tournament.
  const legacy = readStoredGameSession(
    TOURNAMENT_SESSION_STORAGE_KEY,
    address,
    contractAddress
  )
  if (legacy?.tournamentId === tournamentId.toString()) {
    try {
      localStorage.setItem(key, JSON.stringify(legacy))
      localStorage.removeItem(TOURNAMENT_SESSION_STORAGE_KEY)
    } catch {}
    return legacy
  }
  return null
}

export interface ResumableTournamentRun {
  tournamentId: string
  score: number
  moves: number
}

/**
 * Returns the in-progress run saved on this device for a specific tournament,
 * or null when there is nothing to resume. Score is derived from the recorded
 * move totals — the same invariant the engine maintains.
 */
export function readResumableTournamentRun(
  tournamentId: string | bigint,
  address?: `0x${string}`,
  contractAddress?: `0x${string}`
): ResumableTournamentRun | null {
  const stored = readTournamentSession(tournamentId, address, contractAddress)
  if (!stored?.snapshot?.moveHistory?.length) return null
  return {
    tournamentId: tournamentId.toString(),
    score: stored.snapshot.moveHistory.reduce(
      (sum, m) => sum + (m.scoreEvent?.totalPoints ?? 0),
      0
    ),
    moves: stored.snapshot.moveHistory.filter((m) => m.pieceIndex >= 0).length,
  }
}
