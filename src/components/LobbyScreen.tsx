import React, { useMemo, useState } from 'react'
import { BrutalIcon } from './BrutalIcon'
import { useAccount } from 'wagmi'
import { useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { useLeaderboard, useTournamentCount, USDC_DECIMALS } from '../hooks/useBlokzGame'
import { BLOKZ_GAME_ABI } from '../constants/abi'
import contractInfo from '../contract.json'

const CONTRACT_ADDRESS = contractInfo.address as `0x${string}`

interface LobbyScreenProps {
  onPlayClassic: () => void
  onPlayTournaments: () => void
}

const TetrisBlocks: React.FC = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="18" width="9" height="9" fill="#FF3D3D" stroke="#0C0C10" strokeWidth="1.5"/>
    <rect x="9" y="18" width="9" height="9" fill="#FF3D3D" stroke="#0C0C10" strokeWidth="1.5"/>
    <rect x="9" y="9" width="9" height="9" fill="#FF3D3D" stroke="#0C0C10" strokeWidth="1.5"/>
    <rect x="18" y="9" width="9" height="9" fill="#8A3DFF" stroke="#0C0C10" strokeWidth="1.5"/>
    <rect x="18" y="18" width="9" height="9" fill="#2F6BFF" stroke="#0C0C10" strokeWidth="1.5"/>
    <rect x="27" y="18" width="9" height="9" fill="#2F6BFF" stroke="#0C0C10" strokeWidth="1.5"/>
    <rect x="18" y="27" width="9" height="9" fill="#FFD51F" stroke="#0C0C10" strokeWidth="1.5"/>
    <rect x="27" y="27" width="9" height="9" fill="#B7FF3B" stroke="#0C0C10" strokeWidth="1.5"/>
  </svg>
)

const LobbyScreen: React.FC<LobbyScreenProps> = ({ onPlayClassic, onPlayTournaments }) => {
  const { address } = useAccount()

  const { leaderboard, currentEpoch } = useLeaderboard()
  const { count: tournamentCount } = useTournamentCount()

  const tournamentContracts = useMemo(
    () =>
      tournamentCount && tournamentCount > 0n
        ? Array.from({ length: Number(tournamentCount) }, (_, i) => ({
            address: CONTRACT_ADDRESS,
            abi: BLOKZ_GAME_ABI,
            functionName: 'tournaments' as const,
            args: [BigInt(i)] as const,
          }))
        : [],
    [tournamentCount]
  )

  const { data: tournamentRows } = useReadContracts({
    contracts: tournamentContracts,
    query: { enabled: tournamentContracts.length > 0 },
  })

  const { totalPool, activeTournaments } = useMemo(() => {
    const rows = tournamentRows ?? []
    let pool = 0n
    let active = 0
    for (const row of rows) {
      if (row.status !== 'success' || !row.result) continue
      const r = row.result as readonly unknown[]
      if ((r[5] as number) === 1) {
        active++
        pool += (r[7] as bigint) ?? 0n
      }
    }
    return { totalPool: pool, activeTournaments: active }
  }, [tournamentRows])

  const formattedPool = useMemo(() => {
    const raw = Number(formatUnits(totalPool, USDC_DECIMALS))
    return raw ? raw.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'
  }, [totalPool])

  const playerStats = useMemo(() => {
    if (!leaderboard || !address) return null
    const entries = leaderboard as readonly { player: `0x${string}`; score: number; gameId: bigint }[]
    const sorted = [...entries].sort((a, b) => b.score - a.score)
    const idx = sorted.findIndex(e => e.player.toLowerCase() === address.toLowerCase())
    if (idx === -1) return null
    return { rank: idx + 1, bestScore: sorted[idx].score }
  }, [leaderboard, address])

  const season = currentEpoch !== undefined ? Math.floor(Number(currentEpoch) / 12) + 1 : null
  const week = currentEpoch !== undefined ? (Number(currentEpoch) % 12) + 1 : null

  const [streak] = useState<number>(() => {
    try {
      const s = localStorage.getItem('blokaz_streak')
      return s ? parseInt(s, 10) : 0
    } catch { return 0 }
  })

  return (
    <div className="w-full max-w-lg mx-auto px-4 flex flex-col gap-3 pb-4">

      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <div
        className="border-[3px] border-ink p-4 mt-1"
        style={{ background: 'var(--accent-yellow)', boxShadow: '5px 5px 0 var(--ink)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-display text-[10px] tracking-[0.18em] text-ink">
            {season !== null && week !== null
              ? `SEASON ${String(season).padStart(2, '0')} · WEEK ${String(week).padStart(2, '0')}`
              : 'WEEKLY SEASON'}
          </span>
          <div className="flex items-center gap-2">
            <div
              className="border-[2px] border-ink px-2 py-[3px] font-display text-[10px] tracking-widest"
              style={{ background: 'var(--ink)', color: 'var(--accent-yellow)' }}
            >
              WEEKLY
            </div>
            <TetrisBlocks />
          </div>
        </div>

        <div className="font-display leading-[0.92]" style={{ fontSize: 'clamp(44px, 14vw, 64px)', letterSpacing: '-0.025em' }}>
          <div className="text-ink">STACK.</div>
          <div className="text-ink">SMASH.</div>
          <div style={{ color: 'var(--danger)' }}>STAKE.</div>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 border-[3px] border-ink" style={{ boxShadow: '5px 5px 0 var(--ink)' }}>
        <div className="flex flex-col items-center justify-center py-4 border-r-[3px] border-ink" style={{ background: 'var(--paper)' }}>
          <span className="font-display text-[9px] tracking-[0.16em] text-ink opacity-75 mb-1">BEST</span>
          <span className="font-display text-2xl text-ink" style={{ letterSpacing: '-0.03em' }}>
            {playerStats ? playerStats.bestScore.toLocaleString() : '—'}
          </span>
        </div>
        <div
          className="flex flex-col items-center justify-center py-4 border-r-[3px] border-ink"
          style={{ background: 'var(--accent-pink)' }}
        >
          <span className="font-display text-[9px] tracking-[0.16em] text-ink opacity-75 mb-1">RANK</span>
          <span className="font-display text-2xl text-ink" style={{ letterSpacing: '-0.03em' }}>
            {playerStats ? `#${playerStats.rank}` : '—'}
          </span>
        </div>
        <div
          className="flex flex-col items-center justify-center py-4"
          style={{ background: 'var(--accent-lime)' }}
        >
          <span className="font-display text-[9px] tracking-[0.16em] text-ink opacity-75 mb-1">WON</span>
          <span className="font-display text-2xl text-ink" style={{ letterSpacing: '-0.03em' }}>
            —
          </span>
        </div>
      </div>

      {/* ── Play Classic ────────────────────────────────────────────────── */}
      <button
        onClick={onPlayClassic}
        className="brutal-btn border-[3px] border-ink flex items-stretch overflow-hidden text-left"
        style={{ background: 'var(--danger)', boxShadow: '5px 5px 0 var(--ink)' }}
      >
        <div
          className="flex items-center justify-center w-16 border-r-[3px] border-ink flex-shrink-0"
          style={{ background: 'var(--ink)' }}
        >
          <span className="font-display text-2xl" style={{ color: 'var(--accent-yellow)' }}>▶</span>
        </div>
        <div className="flex-1 px-4 py-4">
          <div className="font-display text-xl tracking-[0.04em] text-paper flex items-center justify-between">
            PLAY CLASSIC <span className="opacity-70 text-2xl leading-none">→</span>
          </div>
          <div className="font-display text-[10px] tracking-[0.1em] text-paper opacity-80 mt-1">
            Weekly leaderboard · Free
          </div>
        </div>
      </button>

      {/* ── Tournaments ─────────────────────────────────────────────────── */}
      <div className="relative">
        {totalPool > 0n && (
          <div
            className="absolute -top-[10px] right-3 z-10 border-[2px] border-ink px-2 py-[2px] font-display text-[9px] tracking-[0.12em]"
            style={{ background: 'var(--accent-lime)', color: 'var(--ink-fixed)' }}
          >
            +${formattedPool} POOL
          </div>
        )}
        <button
          onClick={onPlayTournaments}
          className="brutal-btn w-full border-[3px] border-ink flex items-stretch overflow-hidden text-left"
          style={{ background: '#2F6BFF', boxShadow: '5px 5px 0 var(--ink)' }}
        >
          <div
            className="flex items-center justify-center w-16 border-r-[3px] border-ink flex-shrink-0"
            style={{ background: 'var(--ink)' }}
          >
            <BrutalIcon name="trophy" size={22} strokeWidth={2.5} />
          </div>
          <div className="flex-1 px-4 py-4">
            <div className="font-display text-xl tracking-[0.04em] text-paper flex items-center justify-between">
              TOURNAMENTS <span className="opacity-70 text-2xl leading-none">→</span>
            </div>
            <div className="font-display text-[10px] tracking-[0.1em] text-paper opacity-80 mt-1">
              {activeTournaments > 0 ? `${activeTournaments} open · $1–$10 entry` : 'View all brackets'}
            </div>
          </div>
        </button>
      </div>

      {/* ── Daily streak ────────────────────────────────────────────────── */}
      <div
        className="border-[3px] border-ink flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--ink)', boxShadow: '5px 5px 0 var(--ink)' }}
      >
        <div className="flex items-center gap-3">
          <BrutalIcon name="flame" size={20} strokeWidth={2.5} />
          <div>
            <div className="font-display text-[9px] tracking-[0.16em] text-paper opacity-75 mb-0.5">DAILY STREAK</div>
            <div className="font-display text-[13px] tracking-[0.06em] text-paper">
              {streak > 0 ? `DAY ${streak} · ${streak >= 7 ? '2X' : `${streak}X`} BONUS` : 'START YOUR STREAK'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-[5px]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="w-[18px] h-[18px] border-[2px] border-paper"
              style={{ background: i < streak ? 'var(--accent-yellow)' : 'rgba(255,255,255,0.15)' }}
            />
          ))}
        </div>
      </div>

    </div>
  )
}

export default LobbyScreen
