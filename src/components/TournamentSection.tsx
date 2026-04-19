import React, { useState, useEffect, useCallback, useRef } from 'react'
import TournamentLeaderboard from './TournamentLeaderboard'
import {
  useTournamentCount,
  useTournament,
  useInTournament,
  useUSDCAllowance,
  useApproveUSDC,
  useJoinTournament,
  useFinalizeTournament,
  USDC_DECIMALS,
} from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import { formatUnits } from 'viem'
import { useGameStore } from '../stores/gameStore'

const ROW_COLORS = ['#FF3D3D', '#B7FF3B', '#8A3DFF', '#29E6E6']
const TAG_STYLES = [
  { bg: 'var(--accent-yellow)', label: 'HOT' },
  { bg: 'var(--paper-2)', label: 'CASUAL' },
  { bg: 'var(--accent-pink)', label: 'PRO' },
  { bg: 'var(--accent-orange)', label: 'NEW' },
]

interface TournamentCardProps {
  id: bigint
  index: number
  onStartMatch: (id: bigint) => void
  onViewRankings: (id: bigint, prizePool: bigint) => void
}

const TournamentCard: React.FC<TournamentCardProps> = ({
  id,
  index,
  onStartMatch,
  onViewRankings,
}) => {
  const { address } = useAccount()
  const {
    tournament,
    isLoading: isLoadingDetails,
    refetch: refetchTournament,
  } = useTournament(id)
  const {
    isIn,
    isLoading: isLoadingIn,
    refetch: refetchIn,
  } = useInTournament(id, address)
  const { allowance, refetch: refetchAllowance } = useUSDCAllowance(address)
  const {
    approve,
    isPending: isApproving,
    isConfirming: isConfirmingApprove,
    isSuccess: isApproveSuccess,
    error: approveError,
  } = useApproveUSDC()
  const {
    joinTournament,
    isPending: isJoining,
    isConfirming: isConfirmingJoin,
    isSuccess: isJoinSuccess,
    error: joinError,
  } = useJoinTournament()
  const {
    finalizeTournament,
    isPending: isFinalizing,
    isSuccess: isFinalizeSuccess,
  } = useFinalizeTournament()

  const [hover, setHover] = useState(false)
  const offset = hover ? 4 : 7

  useEffect(() => {
    if (isApproveSuccess) refetchAllowance()
  }, [isApproveSuccess, refetchAllowance])

  const joinTriggeredRef = useRef(false)
  useEffect(() => {
    if (isJoinSuccess && !joinTriggeredRef.current) {
      joinTriggeredRef.current = true
      refetchIn()
      refetchTournament()
      onStartMatch(id)
    }
  }, [isJoinSuccess, id, onStartMatch, refetchIn, refetchTournament])

  useEffect(() => {
    if (isFinalizeSuccess) refetchTournament()
  }, [isFinalizeSuccess, refetchTournament])

  const [now, setNow] = useState(BigInt(Math.floor(Date.now() / 1000)))
  useEffect(() => {
    const timer = setInterval(
      () => setNow(BigInt(Math.floor(Date.now() / 1000))),
      1000
    )
    return () => clearInterval(timer)
  }, [])

  if (isLoadingDetails || !tournament) {
    return (
      <div
        className="animate-pulse border-4 border-ink"
        style={{
          background: ROW_COLORS[index % 4],
          height: 120,
          boxShadow: '7px 7px 0 var(--ink)',
        }}
      />
    )
  }

  const [
    creator,
    entryFee,
    startTime,
    endTime,
    maxPlayers,
    playerCount,
    finalized,
    prizePool,
  ] = tournament as any
  const isStarted = now >= startTime
  const isEnded = now >= endTime
  const isFull = playerCount >= maxPlayers
  const needsApproval = allowance !== undefined && allowance < entryFee
  const formatTime = (ts: bigint) =>
    new Date(Number(ts) * 1000).toLocaleDateString()
  const formatDateTime = (ts: bigint) =>
    new Date(Number(ts) * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  const formatAmount = (amt: bigint) => formatUnits(amt, USDC_DECIMALS)

  const rowBg = ROW_COLORS[index % 4]
  const tagStyle = TAG_STYLES[index % 4]

  const handleJoin = () =>
    needsApproval ? approve(entryFee) : joinTournament(id)
  const insetFullWidthCtaStyle = {
    width: 'calc(100% - 8px)',
    margin: '0 4px 4px',
    background: 'var(--accent-lime)',
    color: 'var(--ink-fixed)',
    border: '3px solid var(--ink)',
    padding: '12px 0',
    fontSize: 14,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    fontFamily: "'Archivo Black'",
    boxShadow: '4px 4px 0 var(--ink)',
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: rowBg,
        border: '4px solid var(--ink)',
        boxShadow: `${offset}px ${offset}px 0 var(--ink)`,
        transform: `translate(${7 - offset}px, ${7 - offset}px)`,
        transition: 'all 100ms',
        padding: '14px 16px',
        filter: isEnded ? 'grayscale(0.5)' : 'none',
        opacity: isEnded ? 0.85 : 1,
        color: 'var(--ink-fixed)',
      }}
    >
      {/* Top row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          {/* Tag sticker */}
          <div
            className="inline-block font-display"
            style={{
              background: tagStyle.bg,
              color: 'var(--ink-contrast)',
              border: '3px solid var(--ink)',
              padding: '2px 8px',
              fontSize: 9,
              letterSpacing: '0.1em',
              transform: 'rotate(-3deg)',
              boxShadow: '3px 3px 0 var(--ink)',
              marginBottom: 6,
            }}
          >
            {tagStyle.label}
          </div>
          <div
            className="font-display"
            style={{ fontFamily: "'Archivo Black'", fontSize: 22, letterSpacing: '-0.02em', lineHeight: 1 }}
          >
            Tournament #{id.toString()}
          </div>
          <div
            className="font-body"
            style={{
              fontSize: 10,
              opacity: 0.75,
              marginTop: 2,
              letterSpacing: '0.06em',
            }}
          >
            Ends {formatTime(endTime)} @ {formatDateTime(endTime)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            className="font-display"
            style={{ fontSize: 9, letterSpacing: '0.14em', opacity: 0.7 }}
          >
            ENTRY
          </div>
          <div
            className="font-display"
            style={{
              background: 'var(--ink)',
              color: 'var(--paper)',
              border: '2px solid var(--ink)',
              padding: '2px 8px',
              display: 'inline-block',
              fontSize: 18,
            }}
          >
            {formatAmount(entryFee)} USDC
          </div>
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 2,
          background: 'var(--ink)',
          margin: '10px 0 8px',
        }}
      />

      {/* Meta tiles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'POOL', value: `${formatAmount(prizePool)} USDC` },
          {
            label: 'PLAYERS',
            value: `${playerCount}/${maxPlayers === 0n ? '∞' : maxPlayers}`,
          },
          { label: 'ENDS', value: formatTime(endTime) },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.25)',
              border: '2px solid var(--ink)',
              padding: '4px 6px',
              textAlign: 'center',
            }}
          >
            <div
              className="font-display"
              style={{ fontSize: 8, letterSpacing: '0.12em', opacity: 0.6 }}
            >
              {m.label}
            </div>
            <div className="font-display" style={{ fontSize: 12 }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {isIn ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {!isEnded && isStarted && (
            <>
              <button
                onClick={() => onStartMatch(id)}
                className="brutal-btn font-display"
                style={{
                  flex: 2,
                  background: 'var(--ink)',
                  color: 'var(--paper)',
                  border: '4px solid var(--ink)',
                  padding: '10px 0',
                  fontSize: 12,
                  letterSpacing: '0.1em',
                  boxShadow: '4px 4px 0 var(--ink)',
                }}
              >
                START MATCH
              </button>
              <button
                onClick={() => onViewRankings(id, prizePool)}
                className="brutal-btn font-display"
                style={{
                  flex: 1,
                  background: 'var(--accent-lime)',
                  color: 'var(--ink-fixed)',
                  border: '3px solid var(--ink)',
                  padding: '10px 0',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  fontFamily: "'Archivo Black'",
                  boxShadow: '4px 4px 0 var(--ink)',
                }}
              >
                RANKS
              </button>
            </>
          )}
          {isEnded && !finalized && (
            <>
              <button
                onClick={() => finalizeTournament(id)}
                disabled={isFinalizing}
                className="brutal-btn font-display"
                style={{
                  flex: 2,
                  background: 'var(--accent-lime)',
                  color: 'var(--ink-contrast)',
                  border: '3px solid var(--ink)',
                  padding: '10px 0',
                  fontSize: 12,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontFamily: "'Archivo Black'",
                  boxShadow: '4px 4px 0 var(--ink)',
                }}
              >
                {isFinalizing ? 'FINALIZING...' : 'FINALIZE'}
              </button>
              <button
                onClick={() => onViewRankings(id, prizePool)}
                className="brutal-btn font-display"
                style={{
                  flex: 1,
                  background: 'var(--accent-lime)',
                  color: 'var(--ink-fixed)',
                  border: '3px solid var(--ink)',
                  padding: '10px 0',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  fontFamily: "'Archivo Black'",
                  boxShadow: '4px 4px 0 var(--ink)',
                }}
              >
                BOARD
              </button>
            </>
          )}
          {isEnded && finalized && (
            <button
              onClick={() => onViewRankings(id, prizePool)}
              className="brutal-btn w-full font-display"
              style={insetFullWidthCtaStyle}
            >
              FINAL RESULTS
            </button>
          )}
          {!isEnded && !isStarted && (
            <div
              className="flex-1 border-4 border-ink py-2 text-center font-display"
              style={{
                background: 'var(--accent-yellow)',
                color: 'var(--ink-contrast)',
                fontSize: 10,
                letterSpacing: '0.12em',
              }}
            >
              {startTime - now < 3600n
                ? `STARTS IN ${Math.floor(Number(startTime - now) / 60)}M ${Number(startTime - now) % 60}S`
                : `STARTS ${formatTime(startTime)} @ ${formatDateTime(startTime)}`}
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            onClick={handleJoin}
            className="brutal-btn w-full font-display"
            disabled={
              isEnded ||
              isFull ||
              isJoining ||
              isApproving ||
              isConfirmingApprove ||
              isConfirmingJoin
            }
            style={{
              ...insetFullWidthCtaStyle,
              opacity: isEnded || isFull ? 0.5 : 1,
            }}
          >
            {isApproving || isConfirmingApprove
              ? 'APPROVING USDC...'
              : isJoining || isConfirmingJoin
                ? 'JOINING...'
                : isFull
                  ? 'TOURNAMENT FULL'
                  : needsApproval
                    ? 'APPROVE USDC'
                    : 'JOIN TOURNAMENT'}
          </button>
          {(approveError || joinError) && (
            <div
              className="mt-2 border-2 border-danger py-1 text-center font-display"
              style={{
                background: 'var(--danger-glow)',
                color: 'var(--danger)',
                fontSize: 10,
              }}
            >
              {approveError?.message ||
                joinError?.message ||
                'Transaction failed'}
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface TournamentSectionProps {
  onStartMatch?: (id: bigint) => void
}

const TournamentSection: React.FC<TournamentSectionProps> = ({
  onStartMatch,
}) => {
  const { count, isLoading } = useTournamentCount()
  const { setTournamentId } = useGameStore()
  const [selectedTournament, setSelectedTournament] = useState<{
    id: bigint
    prizePool: bigint
  } | null>(null)
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false)

  const handleStartMatch = useCallback(
    (id: bigint) => {
      setTournamentId(id)
      if (onStartMatch) onStartMatch(id)
      else window.location.hash = '#/classic'
    },
    [onStartMatch, setTournamentId]
  )

  const handleOpenLeaderboard = useCallback((id: bigint, prizePool: bigint) => {
    setSelectedTournament({ id, prizePool })
    setIsLeaderboardOpen(true)
  }, [])

  return (
    <div>
      <div
        className="mb-4 font-display"
        style={{ fontSize: 11, letterSpacing: '0.14em', opacity: 0.7 }}
      >
        AVAILABLE CONTESTS
      </div>

      <div className="custom-scrollbar max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse border-4 border-ink"
              style={{
                background: ROW_COLORS[i % 4],
                height: 120,
                boxShadow: '7px 7px 0 var(--ink)',
              }}
            />
          ))
        ) : count && count > 0n ? (
          Array.from({ length: Number(count) }).map((_, i) => (
            <TournamentCard
              key={i}
              id={BigInt(i)}
              index={i}
              onStartMatch={handleStartMatch}
              onViewRankings={handleOpenLeaderboard}
            />
          ))
        ) : (
          <div
            className="border-4 border-ink p-8 text-center"
            style={{ background: 'var(--paper-2)', boxShadow: '6px 6px 0 var(--ink)' }}
          >
            <div
              className="mb-2 font-display text-2xl"
              style={{ letterSpacing: '-0.02em' }}
            >
              NO ACTIVE CONTESTS
            </div>
            <div className="font-body text-sm opacity-60">
              Check back soon for new tournaments
            </div>
          </div>
        )}
      </div>

      <TournamentLeaderboard
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        tournamentId={selectedTournament?.id ?? null}
        prizePool={selectedTournament?.prizePool}
      />
    </div>
  )
}

export default TournamentSection
