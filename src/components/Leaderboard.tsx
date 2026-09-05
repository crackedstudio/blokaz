import React, { useState, useEffect } from 'react'
import { BlockCluster } from './blocks/BlockFX'
import {
  useLeaderboard,
  useUsername,
  useSetUsername,
} from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import contractInfo from '../contract.json'
import { BrutalIcon } from './BrutalIcon'
// Shared with the ladder standings so a player is named the same on both.
import PlayerName from './PlayerName'
import LadderStandings from './LadderStandings'
import { useLadderStandings } from '../hooks/usePlayerLevel'

interface LeaderboardProps {
  isOpen: boolean
  onClose: () => void
}

const UsernameRegistration: React.FC = () => {
  const { address } = useAccount()
  const { username, refetch } = useUsername(address)
  const { setUsername, isPending, isConfirming, isSuccess } = useSetUsername()
  const [newName, setNewName] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (isSuccess) {
      refetch()
      setNewName('')
      setJustSaved(true)
      const t = setTimeout(() => setJustSaved(false), 2500)
      return () => clearTimeout(t)
    }
  }, [isSuccess, refetch])

  if (!address) return null

  const isBusy = isPending || isConfirming
  const isValid = newName.length >= 3
  const tooShort = newName.length > 0 && newName.length < 3

  return (
    <div
      className="relative z-20 mx-4 mb-4 border-4 border-ink"
      style={{ background: 'var(--paper-2)', boxShadow: '4px 4px 0 var(--shadow)' }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between border-b-4 border-ink px-4 py-3"
        style={{ background: 'var(--paper)' }}
      >
        <div className="font-display text-[10px] uppercase tracking-[0.16em]">
          {username ? 'UPDATE IDENTITY' : 'SET YOUR IDENTITY'}
        </div>
        {username && (
          <span
            className="rounded-none border-[2px] border-ink px-2 py-0.5 font-display text-[9px] uppercase tracking-wider"
            style={{ background: 'var(--accent-yellow)', color: 'var(--ink-fixed)' }}
          >
            {username}
          </span>
        )}
      </div>

      {/* Input + button stacked */}
      <div className="flex flex-col gap-3 p-4">
        <div className="relative">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            placeholder="Choose a display name…"
            maxLength={16}
            disabled={isBusy}
            className="brutal-input w-full pr-12 disabled:opacity-50"
            style={{
              borderColor: tooShort ? 'var(--danger, #e53e3e)' : 'var(--ink)',
              transition: 'border-color 120ms',
            }}
          />
          {/* Character counter */}
          {newName.length > 0 && (
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-display text-[10px] tabular-nums"
              style={{ color: tooShort ? 'var(--danger, #e53e3e)' : 'var(--ink-soft)', opacity: 0.7 }}
            >
              {newName.length}/16
            </span>
          )}
        </div>

        {/* Hint */}
        <div className="font-display text-[9px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-soft)', minHeight: 14 }}>
          {tooShort
            ? <span style={{ color: 'var(--danger, #e53e3e)' }}>MIN 3 CHARACTERS</span>
            : isConfirming
              ? <span className="animate-pulse" style={{ color: 'var(--accent-cyan)' }}>CONFIRMING ON-CHAIN…</span>
              : 'LETTERS, NUMBERS AND _ ONLY'}
        </div>

        {/* Full-width save button */}
        <button
          onClick={() => setUsername(newName)}
          disabled={!isValid || isBusy}
          className="brutal-btn flex w-full items-center justify-center gap-2 border-4 border-ink py-3 font-display text-[12px] uppercase tracking-[0.15em] shadow-[4px_4px_0_var(--shadow)] transition-colors disabled:opacity-40 disabled:shadow-none"
          style={{
            background: justSaved ? 'var(--accent-lime)' : 'var(--accent-yellow)',
            color: 'var(--ink-fixed)',
          }}
        >
          {isBusy ? (
            <>
              <div className="brutal-loader" />
              {isConfirming ? 'CONFIRMING…' : 'SAVING…'}
            </>
          ) : justSaved ? (
            <>
              <BrutalIcon name="check" size={14} strokeWidth={3} />
              SAVED!
            </>
          ) : (
            'SAVE IDENTITY'
          )}
        </button>
      </div>
    </div>
  )
}

const RANK_ACCENT: Record<number, string> = {
  1: 'var(--accent-yellow)',
  2: 'var(--accent-lime)',
  3: 'var(--accent-cyan)'
}


const Leaderboard: React.FC<LeaderboardProps> = ({ isOpen, onClose }) => {
  const { address } = useAccount()
  const { currentEpoch } = useLeaderboard()
  const [viewEpoch, setViewEpoch] = useState<bigint | undefined>(undefined)
  // Server-derived, and unrelated to the epoch being viewed — the ladder is a
  // standing position, not a weekly scoreboard.
  const { data: ladder } = useLadderStandings(25)
  // Two boards in one panel. Scores open by default: it is the older habit, and
  // the one the lobby card's rank number refers to.
  const [board, setBoard] = useState<'scores' | 'ladder'>('scores')

  // When the panel opens or currentEpoch loads, reset to current epoch
  useEffect(() => {
    if (isOpen && currentEpoch !== undefined) setViewEpoch(currentEpoch)
  }, [isOpen, currentEpoch])

  const { leaderboard, isLoading } = useLeaderboard(viewEpoch)

  const isCurrentEpoch = viewEpoch === undefined || viewEpoch === currentEpoch
  const canGoBack = viewEpoch !== undefined && viewEpoch > 0n
  const canGoForward = !isCurrentEpoch

  const sorted = leaderboard ? [...leaderboard].sort((a, b) => b.score - a.score) : []

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[80]"
          style={{ background: 'var(--overlay)' }}
          onClick={onClose}
        />
      )}

      <div
        className="fixed right-0 top-0 z-[90] flex h-full w-full transform flex-col border-l-4 border-ink transition-transform duration-300 ease-out md:w-[480px]"
        style={{
          background: 'var(--paper)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          boxShadow: '-8px 0 0 var(--shadow)',
        }}
      >
        {/* Background Pattern Layer */}
        <div className="brutal-dot-bg absolute inset-0 pointer-events-none" />
        {/* Header */}
        <div
          className="flex items-center justify-between border-b-4 border-ink p-5"
          style={{ background: 'var(--ink)' }}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div
                className="font-display text-paper"
                style={{ fontSize: 28, letterSpacing: '-0.03em', lineHeight: 1 }}
              >
                {board === 'ladder' ? 'THE LADDER' : 'CLASSIC RANKINGS'}
              </div>
              <BlockCluster cell={8} />
            </div>
            {/* Epoch navigation */}
            {/* Weeks apply to scores alone — a rung is where a player stands
                now, not something you can page back through. */}
            <div
              className="mt-3 flex items-center gap-2"
              style={{ display: board === 'scores' ? undefined : 'none' }}
            >
              <button
                onClick={() => setViewEpoch(e => e !== undefined && e > 0n ? e - 1n : e)}
                disabled={!canGoBack}
                className="flex h-7 w-7 items-center justify-center border-2 border-paper font-display text-paper disabled:opacity-30"
                style={{ background: 'transparent' }}
              >
                ‹
              </button>
              <div className="flex flex-col gap-1">
                <div className="inline-flex items-center gap-2 border-2 border-paper bg-accent-yellow px-3 py-1 font-display text-[11px] tracking-[0.16em] text-ink">
                  {viewEpoch !== undefined ? `WEEK #${viewEpoch.toString()}` : 'LOADING...'}
                  {!isCurrentEpoch && (
                    <span className="border border-ink bg-ink px-1 text-[9px] text-paper">PAST</span>
                  )}
                </div>
                <div className="font-display text-[9px] tracking-[0.12em] text-paper opacity-60">
                  RESETS EVERY THURSDAY
                </div>
              </div>
              <button
                onClick={() => setViewEpoch(e => e !== undefined ? e + 1n : e)}
                disabled={!canGoForward}
                className="flex h-7 w-7 items-center justify-center border-2 border-paper font-display text-paper disabled:opacity-30"
                style={{ background: 'transparent' }}
              >
                ›
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close leaderboard"
            className="brutal-btn flex h-10 w-10 items-center justify-center border-[3px] border-paper bg-paper font-display text-ink"
            style={{ boxShadow: '4px 4px 0 var(--shadow)', color: 'var(--ink)' }}
          >
            <BrutalIcon name="back" size={20} />
          </button>
        </div>

        {/* ── Board switch ── */}
        <div className="relative z-10 flex shrink-0 border-b-4 border-ink">
          {([
            ['scores', 'WEEK SCORES'],
            ['ladder', 'THE LADDER'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setBoard(key)}
              className="flex-1 border-r-4 border-ink px-3 py-3 font-display text-[10px] tracking-[0.14em] last:border-r-0"
              style={{
                background: board === key ? 'var(--accent-yellow)' : 'var(--paper-2)',
                color: board === key ? 'var(--ink-fixed)' : 'var(--ink-soft)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative z-10 flex flex-1 flex-col overflow-y-auto px-4 py-6">
          <UsernameRegistration />

          {/* ── The ladder ──
              Its own board rather than a block above the scores: the two answer
              different questions. A score is the best week anyone has had; a
              rung is how far up anyone has climbed, and it does not reset on
              Thursday. */}
          {board === 'ladder' ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex items-baseline justify-between px-2 pb-2">
                <span className="brutal-label-soft opacity-100">WHO IS WHERE</span>
                <span
                  className="font-display text-[9px] tabular-nums tracking-[0.12em]"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  {ladder ? `${ladder.players} CLIMBING` : ''}
                </span>
              </div>

              {ladder && ladder.standings.length > 0 ? (
                <LadderStandings rows={ladder.standings} you={address} variant="full" />
              ) : (
                <p
                  className="py-10 text-center font-display text-[10px] uppercase leading-relaxed tracking-[0.14em]"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  {ladder ? 'Nobody on the ladder yet' : 'Loading the ladder...'}
                </p>
              )}
            </div>
          ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="brutal-label-soft px-2 pb-2 opacity-100">
              CLASSIC PLAYERS
            </div>

            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse border-4 border-ink"
                  style={{ background: 'var(--paper-2)' }}
                />
              ))
            ) : sorted.length > 0 ? (
              sorted.map((entry, index) => {
                const isCurrentUser =
                  address?.toLowerCase() === entry.player.toLowerCase()
                const rank = index + 1
                const rowBg = isCurrentUser
                  ? 'var(--ink)'
                  : (RANK_ACCENT[rank] ?? 'var(--paper-2)')
                const textColor = isCurrentUser
                  ? 'var(--paper)'
                  : (RANK_ACCENT[rank] ? 'var(--ink-fixed)' : 'var(--ink)')

                return (
                  <div
                    key={entry.player}
                    className="flex items-center gap-3 border-4 border-ink px-3 py-3"
                    style={{
                      background: rowBg,
                      transform: isCurrentUser ? 'scale(1.03)' : 'none',
                      boxShadow: isCurrentUser
                        ? '0 0 0 3px var(--accent-yellow), 6px 6px 0 var(--shadow)'
                        : '4px 4px 0 var(--shadow)',
                      color: textColor,
                    }}
                  >
                    <div
                      className="w-8 shrink-0 text-center font-display"
                      style={{ fontSize: 18, letterSpacing: '-0.02em' }}
                    >
                      {rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <PlayerName address={entry.player} isCurrentUser={isCurrentUser} />
                        {isCurrentUser && (
                          <span
                            className="px-1.5 py-0.5 font-display text-[9px] tracking-[0.1em]"
                            style={{
                              background: 'var(--accent-yellow)',
                              color: 'var(--ink)',
                              border: '2px solid var(--ink)',
                            }}
                          >
                            YOU
                          </span>
                        )}
                      </div>
                      <a
                        href={`${contractInfo.explorer}/${entry.player}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 font-body text-[10px] opacity-70 transition-opacity hover:opacity-100"
                        style={{ color: textColor }}
                      >
                        Details →
                      </a>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-display tabular-nums" style={{ fontSize: 20 }}>
                        {entry.score.toLocaleString()}
                      </div>
                      <div className="font-display text-[9px] tracking-[0.12em] opacity-70">
                        PTS
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div
                className="border-4 border-ink p-8 text-center"
                style={{ background: 'var(--paper-2)' }}
              >
                <div className="mb-2 font-display text-xl">
                  {isCurrentEpoch ? 'NO SCORES YET' : 'NO SCORES THIS WEEK'}
                </div>
                <div className="font-body text-sm italic opacity-80">
                  {isCurrentEpoch ? 'Be the first to claim the throne' : 'Nobody played this week'}
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        <div
          className="border-t-4 border-ink p-4 text-center"
          style={{ background: 'var(--ink)' }}
        >
          <div
            className="font-display text-[9px] leading-relaxed tracking-[0.14em] opacity-60"
            style={{ color: 'var(--paper)' }}
          >
            {board === 'ladder' ? (
              <>
                THE LADDER IS 12 RUNGS.
                <br />
                EVERY LEVEL STARTS YOU FROM ZERO.
                <br />
                CLEAR ONE EVERY WEEK OR DROP A RUNG.
              </>
            ) : (
              <>
            LEADERBOARD RESETS EVERY THURSDAY.
            <br />
            GLOBAL IDENTITIES ARE PERMANENT.
            <br />
            TOP PLAYERS SHARE NATIVE REWARD POOL.
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default Leaderboard
