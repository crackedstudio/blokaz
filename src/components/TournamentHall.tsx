import React, { useMemo, useState } from 'react'
import TournamentSection from './TournamentSection'
import TournamentHowToPlay, {
  hasSeenTournamentOnboarding,
} from './TournamentHowToPlay'
import { useTournamentCount } from '../hooks/useBlokzGame'
import { useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { BLOKZ_TOURNAMENT_ABI } from '../constants/abi'
import contractInfo from '../contract.json'
import { BrutalIcon } from './BrutalIcon'
import { BlockRain } from './blocks/BlockFX'

const TOURNAMENT_ADDRESS = contractInfo.tournament as `0x${string}`

interface TournamentHallProps {
  onBack: () => void
  onEnterMatch: () => void
}

const TournamentHall: React.FC<TournamentHallProps> = ({
  onBack,
  onEnterMatch,
}) => {
  const [showHowToPlay, setShowHowToPlay] = useState(
    () => !hasSeenTournamentOnboarding()
  )
  const { count } = useTournamentCount()
  const tournamentContracts = useMemo(
    () =>
      count && count > 0n
        ? Array.from({ length: Number(count) }, (_, index) => ({
            address: TOURNAMENT_ADDRESS,
            abi: BLOKZ_TOURNAMENT_ABI,
            functionName: 'tournaments' as const,
            args: [BigInt(index + 1)] as const,
          }))
        : [],
    [count]
  )
  const { data: tournamentRows } = useReadContracts({
    contracts: tournamentContracts,
    query: {
      enabled: tournamentContracts.length > 0,
    },
  })
  const totalPrizePool = useMemo(
    () =>
      (tournamentRows ?? []).reduce((sum, row) => {
        if (row.status !== 'success' || !row.result) return sum
        return sum + ((row.result as readonly unknown[])[7] as bigint)
      }, 0n),
    [tournamentRows]
  )
  const activeCount = useMemo(() => {
    const now = BigInt(Math.floor(Date.now() / 1000))
    return (tournamentRows ?? []).filter(row => {
      if (row.status !== 'success' || !row.result) return false
      const endTime = (row.result as readonly unknown[])[3] as bigint
      return now < endTime
    }).length
  }, [tournamentRows])

  const formattedPrizePool = useMemo(() => {
    const raw = Number(formatUnits(totalPrizePool, 6))
    if (!Number.isFinite(raw) || raw === 0) return '0'
    return raw.toLocaleString(undefined, {
      minimumFractionDigits: raw < 10 ? 1 : 0,
      maximumFractionDigits: 1,
    })
  }, [totalPrizePool])

  return (
    <div
      className="brutal-grid-bg min-h-screen w-full"
      style={{ background: 'var(--paper)' }}
    >
      {showHowToPlay && (
        <TournamentHowToPlay onDone={() => setShowHowToPlay(false)} />
      )}

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-16">
        {/* Hero */}
        <div
          className="relative mb-6 overflow-hidden border-4 border-ink p-6"
          style={{ background: 'var(--ink)', boxShadow: '6px 6px 0 var(--shadow)' }}
        >
          <BlockRain count={5} distance={330} from={58} to={96} seed={5} opacity={0.85} />
          <div
            className="relative z-10 mb-2 font-display text-[10px] tracking-[0.18em]"
            style={{ color: 'var(--ink-fixed)', opacity: 0.7 }}
          >
            PRIZE POOL TOTAL
          </div>
          <div className="relative z-10 flex items-baseline gap-3">
            <div
              className="font-display text-paper"
              style={{ fontSize: 56, letterSpacing: '-0.04em', lineHeight: 1 }}
            >
              {formattedPrizePool} USDT
            </div>
          </div>
          <div className="relative z-10 mt-5 flex items-center gap-3">
            <div
              className="font-display text-paper"
              style={{ fontSize: 32, letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              {activeCount} LIVE BRACKETS
            </div>
            <span className="font-display text-paper" style={{ fontSize: 28 }}>→</span>
          </div>
          <div className="relative z-10 mt-3 flex flex-wrap gap-3">
            <span
              className="border-2 border-paper px-3 py-1 font-display text-[10px] tracking-[0.12em]"
              style={{ background: 'var(--accent-lime)', color: 'var(--ink-fixed)' }}
            >
              {activeCount} ACTIVE
            </span>
            <button
              onClick={() => setShowHowToPlay(true)}
              className="brutal-btn flex items-center gap-2 border-2 border-paper px-3 py-1 font-display text-[10px] tracking-[0.12em] text-paper opacity-80 hover:opacity-100"
            >
              <BrutalIcon name="alert" size={10} strokeWidth={2.5} className="text-paper" />
              HOW TO PARTICIPATE
            </button>
          </div>
          <div className="relative z-10 mt-2 flex flex-wrap gap-3">
            <span className="border-2 border-paper px-3 py-1 font-display text-[10px] tracking-[0.12em] text-paper">
              COLOR-LOCKED ARENAS
            </span>
          </div>
        </div>

        {/* Tournament list */}
        <TournamentSection onStartMatch={() => onEnterMatch()} />

        {/* Back */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={onBack}
            className="brutal-btn flex items-center gap-2 border-4 border-ink bg-paper px-6 py-3 font-display text-[11px] tracking-[0.14em] text-ink"
            style={{ boxShadow: '4px 4px 0 var(--shadow)' }}
          >
            <BrutalIcon name="back" size={14} /> BACK TO CLASSIC
          </button>
        </div>
      </div>
    </div>
  )
}

export default TournamentHall
