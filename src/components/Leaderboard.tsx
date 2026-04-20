import React, { useState, useEffect } from 'react'
import {
  useLeaderboard,
  useUsername,
  useSetUsername,
} from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import { useTheme } from '../hooks/useTheme'
import contractInfo from '../contract.json'
import { BrutalIcon } from './BrutalIcon'

interface LeaderboardProps {
  isOpen: boolean
  onClose: () => void
}

const PlayerName: React.FC<{ address: string; isCurrentUser: boolean }> = ({
  address,
  isCurrentUser,
}) => {
  const { username, isLoading } = useUsername(address as `0x${string}`)
  const truncated = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`
  if (isLoading) return <div className="h-4 w-24 animate-pulse bg-ink/10" />
  return (
    <span className={`font-body text-sm ${isCurrentUser ? 'font-bold' : ''}`} style={{ color: 'inherit' }}>
      {username || truncated(address)}
    </span>
  )
}

const UsernameRegistration: React.FC = () => {
  const { address } = useAccount()
  const { username, refetch } = useUsername(address)
  const { setUsername, isPending, isConfirming, isSuccess } = useSetUsername()
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (isSuccess) {
      refetch()
      setNewName('')
    }
  }, [isSuccess, refetch])

  if (!address) return null

  return (
    <div
      className="relative z-20 mx-4 mb-4 border-4 border-ink p-4"
      style={{ background: 'var(--paper-2)', boxShadow: '4px 4px 0 var(--ink)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="font-display text-[10px] tracking-[0.14em]">
          {username ? 'UPDATE IDENTITY' : 'SET YOUR IDENTITY'}
        </div>
        {username && (
          <span className="font-body text-xs opacity-60">
            Current: <span className="font-bold">{username}</span>
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="3–16 characters"
          maxLength={16}
          disabled={isPending || isConfirming}
          className="brutal-input flex-1 disabled:opacity-50"
        />
        <button
          onClick={() => setUsername(newName)}
          disabled={!newName || newName.length < 3 || isPending || isConfirming}
          className="brutal-btn border-4 border-ink px-4 py-2 font-display text-[11px] tracking-[0.1em] disabled:opacity-40"
          style={{
            background: 'var(--accent-lime)',
            color: 'var(--ink-fixed)',
            boxShadow: '4px 4px 0 var(--ink)',
          }}
        >
          {isPending || isConfirming ? (
            <div className="brutal-loader" />
          ) : (
            'SAVE'
          )}
        </button>
      </div>
      {isConfirming && (
        <div className="mt-2 animate-pulse font-display text-[9px] tracking-[0.1em] text-accent-cyan">
          CONFIRMING ON-CHAIN...
        </div>
      )}
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
  const { leaderboard, isLoading, currentEpoch } = useLeaderboard()
  const { isDark } = useTheme()

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
          boxShadow: '-8px 0 0 var(--ink)',
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
            <div
              className="font-display text-paper"
              style={{ fontSize: 28, letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              CLASSIC RANKINGS
            </div>
            <div className="mt-3 inline-flex items-center border-2 border-paper bg-accent-yellow px-3 py-1 font-display text-[11px] tracking-[0.16em] text-ink">
              {currentEpoch !== undefined
                ? `EPOCH #${currentEpoch.toString()}`
                : 'LOADING...'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="brutal-btn flex h-10 w-10 items-center justify-center border-[3px] border-paper bg-paper font-display text-ink"
            style={{ boxShadow: '4px 4px 0 var(--paper)', color: 'var(--ink)' }}
          >
            <BrutalIcon name="back" size={20} />
          </button>
        </div>

        <div className="relative z-10 flex flex-1 flex-col overflow-y-auto px-4 py-6">
          <UsernameRegistration />

          <div className="mt-4 flex flex-col gap-4">
            <div className="px-2 pb-2 font-display text-[10px] tracking-[0.16em] opacity-70">
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
            ) : leaderboard && leaderboard.length > 0 ? (
              leaderboard
                .sort((a, b) => b.score - a.score)
                .map((entry, index) => {
                  const isCurrentUser =
                    address?.toLowerCase() === entry.player.toLowerCase()
                  const rank = index + 1
                  const rowBg = isCurrentUser
                    ? 'var(--ink)'
                    : (RANK_ACCENT[rank] ?? 'var(--paper-2)')
                  const textColor = isCurrentUser 
                    ? (isDark ? 'var(--paper)' : 'var(--paper)') 
                    : (RANK_ACCENT[rank] ? 'var(--ink-fixed)' : 'var(--ink)')

                  return (
                    <div
                      key={`${entry.gameId.toString()}-${entry.player}`}
                      className="flex items-center gap-3 border-4 border-ink px-3 py-3"
                      style={{
                        background: rowBg,
                        transform: isCurrentUser ? 'scale(1.03)' : 'none',
                        boxShadow: isCurrentUser
                          ? '0 0 0 3px var(--accent-yellow), 6px 6px 0 var(--ink)'
                          : '4px 4px 0 var(--ink)',
                        color: textColor,
                      }}
                    >
                      {/* Rank */}
                      <div
                        className="w-8 shrink-0 text-center font-display"
                        style={{ fontSize: 18, letterSpacing: '-0.02em' }}
                      >
                        {rank}
                      </div>

                      {/* Name */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <PlayerName
                            address={entry.player}
                            isCurrentUser={isCurrentUser}
                          />
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

                      {/* Score */}
                      <div className="shrink-0 text-right">
                        <div
                          className="font-display tabular-nums"
                          style={{ fontSize: 20 }}
                        >
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
                <div className="mb-2 font-display text-xl">NO SCORES YET</div>
                <div className="font-body text-sm italic opacity-80">
                  Be the first to claim the throne
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          className="border-t-4 border-ink p-4 text-center"
          style={{ background: 'var(--ink)' }}
        >
          <div
            className="font-display text-[9px] leading-relaxed tracking-[0.14em] opacity-60"
            style={{ color: 'var(--paper)' }}
          >
            GLOBAL IDENTITIES ARE PERMANENT.
            <br />
            TOP PLAYERS SHARE NATIVE REWARD POOL.
          </div>
        </div>
      </div>
    </>
  )
}

export default Leaderboard
