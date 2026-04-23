import React, { useState, useEffect, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { BrutalIcon } from './BrutalIcon'
import { useLeaderboard, useTournamentCount } from '../hooks/useBlokzGame'
import { useGameStore } from '../stores/gameStore'

interface LandingPageProps {
  onPlayClassic: () => void
  onOpenTournaments: () => void
  onOpenLeaderboard?: () => void
}

const LandingPage: React.FC<LandingPageProps> = ({
  onPlayClassic,
  onOpenTournaments,
  onOpenLeaderboard,
}) => {
  const { address } = useAccount()
  const { leaderboard, currentEpoch } = useLeaderboard()
  const { count: tournamentCount } = useTournamentCount()
  const [countdown, setCountdown] = useState({ days: 2, hours: 14, minutes: 48 })

  // Find user's rank and best score from leaderboard
  const { playerRank, playerBestScore, playerWon } = useMemo(() => {
    if (!leaderboard || !address) {
      return { playerRank: undefined, playerBestScore: 0, playerWon: 0 }
    }

    const board = Array.isArray(leaderboard) ? leaderboard : []
    let rank: number | undefined
    let bestScore = 0
    let won = 0

    for (let i = 0; i < board.length; i++) {
      const entry = board[i]
      if (entry && entry[0] && entry[0].toLowerCase() === address.toLowerCase()) {
        rank = i + 1
        bestScore = Number(entry[1] ?? 0)
        won = Number(entry[2] ?? 0)
        break
      }
    }

    return { playerRank: rank, playerBestScore: bestScore, playerWon: won }
  }, [leaderboard, address])

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        let { days, hours, minutes } = prev
        minutes--
        if (minutes < 0) {
          minutes = 59
          hours--
          if (hours < 0) {
            hours = 23
            days--
          }
        }
        return { days, hours, minutes }
      })
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const formatAddress = (addr: string | undefined) => {
    if (!addr) return '0x...'
    return `0x${addr.slice(2, 6).toUpperCase()}...${addr.slice(-4).toUpperCase()}`
  }

  const bestScore = playerBestScore
  const rank = playerRank || 0
  const wonAmount = playerWon
  const tournamentCountNum = tournamentCount ? Number(tournamentCount) : 0

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: 'var(--paper)',
      }}
    >
      {/* Status bar - mobile only */}
      <div className="lg:hidden sticky top-0 z-50 border-b-3 border-ink bg-paper px-4 py-2.5 flex justify-between items-center text-[11px] font-body text-ink">
        <span className="font-semibold">9:41</span>
        <div className="flex gap-1.5 items-center">
          <svg width={14} height={12} viewBox="0 0 14 12" className="text-ink">
            <rect x="2" y="8" width="2" height="4" fill="currentColor" />
            <rect x="6" y="4" width="2" height="8" fill="currentColor" />
            <rect x="10" y="0" width="2" height="12" fill="currentColor" />
          </svg>
          <svg width={14} height={12} viewBox="0 0 14 12" className="text-ink">
            <path d="M12 10a2 2 0 0 1-2 2M8 6a6 6 0 0 1 6 6M2 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth={1.5} fill="none" />
          </svg>
          <svg width={18} height={12} viewBox="0 0 18 12" className="text-ink">
            <rect x="2" y="2" width="14" height="8" stroke="currentColor" strokeWidth={1} fill="none" />
            <rect x="3" y="3" width="5" height="6" fill="currentColor" />
          </svg>
        </div>
      </div>

      {/* Header bar - logo and wallet */}
      <div className="border-b-4 border-ink bg-paper px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div
            className="border-4 border-ink p-1"
            style={{
              background: '#FFD51F',
              width: 38,
              height: 38,
            }}
          >
            <div
              className="w-full h-full border-2 border-ink flex items-center justify-center font-display text-lg font-black"
              style={{ color: 'var(--ink)' }}
            >
              B
            </div>
          </div>
          <div className="font-display text-[18px] font-black tracking-tight text-ink">
            BLOKAZ
          </div>
        </div>
        <button
          onClick={onOpenLeaderboard}
          className="border-2 border-ink px-2.5 py-1.5 font-display text-[9px] font-black tracking-[0.1em] text-ink"
          style={{
            background: '#B7FF3B',
            boxShadow: '2px 2px 0 var(--ink)',
          }}
        >
          {formatAddress(address)}
        </button>
      </div>

      {/* Main content area */}
      <div className="px-4 py-4 pb-24">
        {/* Season info */}
        <div className="mb-5 flex items-center justify-between border-3 border-ink px-4 py-2.5 bg-paper-2 text-[11px]">
          <span className="font-display font-black tracking-[0.12em] text-ink uppercase">
            SEASON 03 · WEEK 04
          </span>
          <span className="font-display font-black tracking-[0.12em] text-ink">
            {countdown.days}D {countdown.hours}H {countdown.minutes}M
          </span>
        </div>

        {/* Hero headline */}
        <div
          className="mb-6 border-4 border-ink p-5 relative"
          style={{
            background: '#FFD51F',
            boxShadow: '4px 4px 0 var(--ink)',
          }}
        >
          <div className="relative leading-none mb-2">
            <div
              className="hero-text-outline font-display text-[52px] font-black tracking-tight"
            >
              STACK.
              <br />
              SMASH.
              <br />
              STAKE.
            </div>
          </div>

          {/* Decorative squares */}
          <div className="absolute top-3 right-3 flex gap-1">
            {[
              { bg: '#FF3D3D' },
              { bg: '#FFB8D6' },
              { bg: '#2F6BFF' },
            ].map((item, i) => (
              <div
                key={i}
                className="border-2 border-ink"
                style={{
                  width: 16,
                  height: 16,
                  background: item.bg,
                }}
              />
            ))}
          </div>
        </div>

        {/* Stats grid */}
        <div className="mb-6 grid grid-cols-3 gap-2.5">
          {/* Best */}
          <div
            className="border-4 border-ink p-3"
            style={{
              background: 'var(--paper-2)',
              boxShadow: '3px 3px 0 var(--ink)',
            }}
          >
            <div className="font-display text-[8px] font-black tracking-[0.14em] text-ink/70 mb-2">
              BEST
            </div>
            <div className="font-display text-[28px] font-black tracking-tight text-ink">
              {bestScore.toLocaleString()}
            </div>
          </div>

          {/* Rank */}
          <div
            className="border-4 border-ink p-3"
            style={{
              background: '#FFB8D6',
              boxShadow: '3px 3px 0 var(--ink)',
            }}
          >
            <div className="font-display text-[8px] font-black tracking-[0.14em] text-ink/70 mb-2">
              RANK
            </div>
            <div className="font-display text-[28px] font-black tracking-tight text-ink">
              #{rank}
            </div>
          </div>

          {/* Won */}
          <div
            className="border-4 border-ink p-3"
            style={{
              background: '#B7FF3B',
              boxShadow: '3px 3px 0 var(--ink)',
            }}
          >
            <div className="font-display text-[8px] font-black tracking-[0.14em] text-ink/70 mb-2">
              WON
            </div>
            <div className="font-display text-[28px] font-black tracking-tight text-ink">
              ${wonAmount}
            </div>
          </div>
        </div>

        {/* Play Classic button */}
        <button
          onClick={onPlayClassic}
          className="w-full mb-3 border-4 border-ink p-4 flex items-center justify-between active:translate-x-[2px] active:translate-y-[2px]"
          style={{
            background: '#FF3D3D',
            boxShadow: '4px 4px 0 var(--ink)',
            transition: 'all 80ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="border-3 border-white flex items-center justify-center"
              style={{
                width: 32,
                height: 32,
                background: '#000',
              }}
            >
              <BrutalIcon name="play" size={16} className="text-white ml-0.5" strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <div className="font-display text-[16px] font-black text-white tracking-tight">
                PLAY CLASSIC
              </div>
              <div className="text-[9px] font-body text-white/90 tracking-normal">
                Weekly leaderboard · Free
              </div>
            </div>
          </div>
          <span className="text-[24px] text-white font-black">→</span>
        </button>

        {/* Tournaments button */}
        <button
          onClick={onOpenTournaments}
          className="w-full mb-3 border-4 border-ink p-4 flex items-center justify-between active:translate-x-[2px] active:translate-y-[2px]"
          style={{
            background: '#2F6BFF',
            boxShadow: '4px 4px 0 var(--ink)',
            transition: 'all 80ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="border-3 border-white flex items-center justify-center"
              style={{
                width: 32,
                height: 32,
                background: '#000',
              }}
            >
              <BrutalIcon name="trophy" size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <div className="font-display text-[16px] font-black text-white tracking-tight">
                TOURNAMENTS
              </div>
              <div className="text-[9px] font-body text-white/90 tracking-normal">
                {tournamentCountNum} open · $1-$10 entry
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div className="text-[8px] font-display font-black text-black px-2 py-0.5" style={{ background: '#FFD51F', border: '2px solid #000' }}>
              +$247 POOL
            </div>
            <span className="text-[24px] text-white font-black">→</span>
          </div>
        </button>

        {/* Daily Streak */}
        <div
          className="border-4 border-ink overflow-hidden"
          style={{
            background: 'var(--paper-2)',
            boxShadow: '3px 3px 0 var(--ink)',
          }}
        >
          <div
            className="border-b-4 border-ink px-4 py-2.5 flex items-center justify-between"
            style={{ background: '#FF7A1A' }}
          >
            <div className="flex items-center gap-2 font-display text-[11px] font-black tracking-[0.14em] text-paper-2">
              <BrutalIcon name="flame" size={16} /> DAILY STREAK
            </div>
            <div className="font-display text-[12px] font-black text-paper-2">DAY 7</div>
          </div>
          <div className="p-4">
            <div className="mb-3 flex gap-1.5">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full border-2 border-ink"
                    style={{
                      height: 20,
                      background: i < 6 ? '#B7FF3B' : '#E8E8E8',
                    }}
                  />
                  <span className="font-display text-[8px] font-black text-ink/60">{day}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mb-3">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex-1 border-2 border-ink"
                  style={{
                    height: 14,
                    background: i < 6 ? '#B7FF3B' : '#E8E8E8',
                  }}
                />
              ))}
            </div>
            <div className="font-display text-[10px] font-black tracking-[0.12em] text-ink">
              2× BONUS ACTIVE ON ALL CLEARS
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
