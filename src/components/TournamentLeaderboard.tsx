import React from 'react'
import { useTournamentLeaderboard, useUsername } from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import contractInfo from '../contract.json'
import { BrutalIcon } from './BrutalIcon'

const RANK_BG: Record<number, string> = { 
  1: 'var(--accent-yellow)', 
  2: 'var(--accent-lime)', 
  3: 'var(--accent-cyan)' 
}

interface TournamentLeaderboardProps {
  tournamentId: bigint | null
  isOpen: boolean
  onClose: () => void
  prizePool?: bigint
}

const PlayerName: React.FC<{ address: string; isCurrentUser: boolean }> = ({ address, isCurrentUser }) => {
  const { username, isLoading } = useUsername(address as `0x${string}`)
  const truncated = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`
  if (isLoading) return <div className="h-4 w-24 animate-pulse bg-ink/10" />
  return <span className={`font-body text-sm ${isCurrentUser ? 'font-bold' : ''}`} style={{ color: 'inherit' }}>{username || truncated(address)}</span>
}

const TournamentLeaderboard: React.FC<TournamentLeaderboardProps> = ({ tournamentId, isOpen, onClose, prizePool }) => {
  const { address } = useAccount()
  const { leaderboard, isLoading, refetch } = useTournamentLeaderboard(tournamentId ?? undefined)

  React.useEffect(() => {
    if (isOpen && tournamentId !== null) refetch()
  }, [isOpen, tournamentId, refetch])

  const getPrizeEstimate = (rank: number) => {
    if (!prizePool || prizePool === 0n) return null
    if (rank === 1) return (prizePool * 50n) / 100n
    if (rank === 2) return (prizePool * 25n) / 100n
    if (rank === 3) return (prizePool * 15n) / 100n
    return null
  }

  const formatAmount = (amt: bigint) => (Number(amt) / 1e6).toFixed(2)

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
        className="fixed top-0 right-0 h-full w-full max-w-md z-[90] transform transition-transform duration-500 ease-in-out flex flex-col border-l-4 border-ink"
        style={{
          background: 'var(--paper)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          boxShadow: '-8px 0 0 var(--ink)',
        }}
      >
        {/* Header */}
        <div className="border-b-4 border-ink p-6 flex items-center justify-between" style={{ background: 'var(--ink)' }}>
          <div>
            <div className="font-display text-paper" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              TOURNAMENT #{tournamentId?.toString()}
            </div>
            <div
              className="font-display text-accent-yellow text-[10px] tracking-[0.2em] mt-1"
            >
              OFFICIAL STANDINGS
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 border-4 border-paper font-display text-ink bg-paper flex items-center justify-center brutal-btn"
            style={{ boxShadow: '3px 3px 0 var(--paper)' }}
          >
            <BrutalIcon name="back" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          <div className="flex items-center justify-between px-2 pb-1">
            <div className="font-display text-[10px] tracking-[0.14em] opacity-70">GLOBAL CONTENDERS</div>
            <div className="font-display text-[10px] tracking-[0.12em] opacity-60">
              {leaderboard?.length || 0} JOINED
            </div>
          </div>

          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 border-4 border-ink animate-pulse" style={{ background: 'var(--paper-2)' }} />
            ))
          ) : leaderboard && leaderboard.length > 0 ? (
            leaderboard
              .sort((a, b) => b.score - a.score)
              .map((entry, index) => {
                const isCurrentUser = address?.toLowerCase() === entry.player.toLowerCase()
                const rank = index + 1
                const prize = getPrizeEstimate(rank)
                const rowBg = isCurrentUser ? 'var(--ink)' : (RANK_BG[rank] ?? 'var(--paper-2)')
                const textColor = isCurrentUser 
                  ? 'var(--paper)' 
                  : (RANK_BG[rank] ? 'var(--ink-fixed)' : 'var(--ink)')

                return (
                  <div
                    key={entry.player}
                    className="border-4 border-ink flex items-center gap-3 px-3 py-3"
                    style={{
                      background: rowBg,
                      color: textColor,
                      transform: isCurrentUser ? 'scale(1.03)' : 'none',
                      boxShadow: isCurrentUser ? '0 0 0 3px var(--accent-yellow), 6px 6px 0 var(--ink)' : '4px 4px 0 var(--ink)',
                    }}
                  >
                    {/* Rank */}
                    <div className="font-display w-8 text-center shrink-0" style={{ fontSize: 20 }}>
                      {rank}
                    </div>

                    {/* Player */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <PlayerName address={entry.player} isCurrentUser={isCurrentUser} />
                        {isCurrentUser && (
                          <span
                            className="font-display text-[9px] tracking-[0.1em] px-1.5 py-0.5"
                            style={{ background: 'var(--accent-yellow)', color: 'var(--ink)', border: '2px solid var(--ink)' }}
                          >
                            YOU
                          </span>
                        )}
                      </div>
                      {prize && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="font-display text-[9px] tracking-[0.1em] opacity-70">EST. PRIZE:</span>
                          <span
                            className="font-display text-[11px]"
                            style={{ color: isCurrentUser ? 'var(--accent-lime)' : 'var(--piece-green)' }}
                          >
                            {formatAmount(prize)} USDC
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <div className="font-display tabular-nums" style={{ fontSize: 22, letterSpacing: '-0.02em' }}>
                        {entry.score.toLocaleString()}
                      </div>
                      <div className="font-display text-[9px] tracking-[0.12em] opacity-50">SCORE</div>
                    </div>
                  </div>
                )
              })
          ) : (
            <div className="border-4 border-ink p-8 text-center" style={{ background: 'var(--paper-2)' }}>
              <div className="font-display text-xl mb-2">THE FIELD IS EMPTY</div>
              <div className="font-body text-sm opacity-50 italic">Be the first to claim the throne</div>
            </div>
          )}
        </div>

        <div className="border-t-4 border-ink p-5 text-center" style={{ background: 'var(--ink)' }}>
          <div className="font-display text-[9px] tracking-[0.12em] text-paper opacity-60 leading-relaxed">
            ONLY MEMBERS ARE ELIGIBLE FOR PRIZES.<br />RANKING BASED ON SINGLE HIGHEST SCORE.
          </div>
        </div>
      </div>
    </>
  )
}

export default TournamentLeaderboard
