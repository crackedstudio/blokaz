import React, { useMemo } from 'react'
import { useGameStore } from '../stores/gameStore'
import { packMoves } from '../engine/replay'
import {
  useSubmitScore,
  useActiveGame,
  useLeaderboard,
  useSubmitTournamentScore,
} from '../hooks/useBlokzGame'
import { useAccount, useReadContract } from 'wagmi'
import { BLOKZ_GAME_ABI } from '../constants/abi'
import contractInfo from '../contract.json'
import { keccak256, encodePacked } from 'viem'
import {
  CLASSIC_SESSION_STORAGE_KEY,
  TOURNAMENT_SESSION_STORAGE_KEY,
  clearStoredGameSession,
  readStoredGameSession,
} from '../utils/gameSessionStorage'
import { BrutalIcon } from './BrutalIcon'

const CONTRACT_ADDRESS = contractInfo.address as `0x${string}`

interface GameOverModalProps {
  score: number
  onPlayAgain: () => void
  mode: 'classic' | 'tournament'
  onOpenLeaderboard?: () => void
}

const EMPTY_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  onPlayAgain,
  mode,
  onOpenLeaderboard,
}) => {
  const { address } = useAccount()
  const { gameId: activeGameId, isLoading: isLoadingGameId } =
    useActiveGame(address)
  const { leaderboard } = useLeaderboard()
  const {
    gameSession,
    onChainSeed,
    onChainGameId,
    onChainStatus,
    forceReset,
    tournamentId,
    setTournamentId,
    comboStreak,
  } = useGameStore()
  const { submitScore, isPending, isConfirming, isSuccess, error } =
    useSubmitScore()
  const {
    submitTournamentScore,
    isPending: isToursPending,
    isConfirming: isToursConfirming,
    isSuccess: isToursSuccess,
    error: toursError,
  } = useSubmitTournamentScore()
  const storageKey =
    mode === 'tournament'
      ? TOURNAMENT_SESSION_STORAGE_KEY
      : CLASSIC_SESSION_STORAGE_KEY
  const isTournamentMode = mode === 'tournament' && tournamentId !== null

  const effectiveGameId = onChainGameId || activeGameId

  const { data: gameData, isLoading: isLoadingContract } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'games',
    args: effectiveGameId ? [effectiveGameId] : undefined,
    query: { enabled: !!effectiveGameId },
  })

  const recoveredSeed = useMemo(() => {
    if (onChainSeed) return onChainSeed
    if (!address) return null
    return (
      readStoredGameSession(storageKey, address, CONTRACT_ADDRESS)?.seed ?? null
    )
  }, [address, onChainSeed, storageKey])

  const onChainHash = useMemo(() => {
    if (!gameData) return null
    const txData = gameData as { seedHash?: `0x${string}` } & readonly unknown[]
    return (txData.seedHash ?? txData[1] ?? null) as `0x${string}` | null
  }, [gameData])

  const isSeedMatch = useMemo(() => {
    if (!recoveredSeed || !address) return false
    if (!gameData) return false
    const expectedHash = keccak256(
      encodePacked(['bytes32', 'address'], [recoveredSeed, address])
    )
    if (!onChainHash) return false
    console.log('--- Submission Pre-flight Check ---')
    console.log('Match Result:', expectedHash === onChainHash)
    return expectedHash === onChainHash
  }, [recoveredSeed, address, effectiveGameId, gameData, onChainHash])

  const isLoading = isLoadingGameId || isLoadingContract

  const resetForNextGame = () => {
    const activeTournamentId = tournamentId
    clearStoredGameSession(storageKey)
    forceReset()
    if (mode === 'tournament' && activeTournamentId !== null)
      setTournamentId(activeTournamentId)
  }

  const handleAbandon = () => {
    resetForNextGame()
    onPlayAgain()
  }

  const handleSubmit = () => {
    if (!gameSession || !recoveredSeed || !effectiveGameId || !isSeedMatch)
      return
    if (isPending || isConfirming || isSuccess) return
    const packed = packMoves(gameSession.moveHistory)
    if (isTournamentMode) {
      submitTournamentScore(
        tournamentId,
        effectiveGameId,
        recoveredSeed,
        packed,
        gameSession.score,
        gameSession.moveHistory.length
      )
    } else {
      submitScore(
        effectiveGameId,
        recoveredSeed,
        packed,
        gameSession.score,
        gameSession.moveHistory.length
      )
    }
  }

  const isRegistering =
    isPending || isConfirming || isToursPending || isToursConfirming
  const isSyncing = onChainStatus === 'pending' || onChainStatus === 'syncing'
  const isAllSuccess = isSuccess || isToursSuccess
  const hasError = error || toursError
  const isRegisteredOrRecovered =
    onChainStatus === 'registered' ||
    (!!effectiveGameId && onChainStatus === 'none' && !isLoading)
  const isPotentialConflict =
    effectiveGameId && !isSeedMatch && !isLoading && gameData
  const canSubmit =
    !isRegistering &&
    !isAllSuccess &&
    isSeedMatch &&
    !!effectiveGameId &&
    isRegisteredOrRecovered &&
    !isPotentialConflict

  React.useEffect(() => {
    if (isAllSuccess) clearStoredGameSession(storageKey)
  }, [isAllSuccess, storageKey])

  const submissionTriggeredRef = React.useRef(false)
  React.useEffect(() => {
    if (
      isTournamentMode &&
      canSubmit &&
      !submissionTriggeredRef.current &&
      !isRegistering &&
      !isAllSuccess
    ) {
      submissionTriggeredRef.current = true
      const timer = setTimeout(() => handleSubmit(), 800)
      return () => clearTimeout(timer)
    }
  }, [isTournamentMode, canSubmit, isRegistering, isAllSuccess])

  const shadowColor = isTournamentMode ? 'var(--accent-pink)' : 'var(--accent-yellow)'
  const accentTextColor = 'var(--ink-fixed)'
  const stats = useMemo(() => {
    const moves = gameSession?.moveHistory ?? []
    const linesCleared = moves.reduce(
      (sum, move) => sum + (move.scoreEvent?.linesCleared ?? 0),
      0
    )
    const bestCombo = moves.reduce(
      (best, move) => Math.max(best, move.scoreEvent?.newComboStreak ?? 0),
      comboStreak
    )
    const estimatedSeconds = moves.length * 7
    const minutes = Math.floor(estimatedSeconds / 60)
    const seconds = estimatedSeconds % 60
    return {
      linesCleared,
      bestCombo,
      piecesPlaced: moves.length,
      time: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    }
  }, [comboStreak, gameSession?.moveHistory])

  const rankData = useMemo(() => {
    const scores = (leaderboard ?? [])
      .map((entry) => entry.score)
      .sort((a, b) => b - a)
    const currentRank =
      scores.findIndex((value) => score >= value) + 1 || scores.length + 1
    const nextTarget = scores.find((value) => value > score) ?? score
    const lowerScores = scores.filter((value) => value <= score)
    const prevTarget =
      lowerScores.length > 0 ? lowerScores[lowerScores.length - 1] : 0
    const progressBase =
      nextTarget === prevTarget
        ? 100
        : ((score - prevTarget) / Math.max(1, nextTarget - prevTarget)) * 100
    return {
      currentRank,
      nextTarget,
      progress: Math.max(
        8,
        Math.min(100, Number.isFinite(progressBase) ? progressBase : 8)
      ),
      delta: Math.max(0, nextTarget - score),
    }
  }, [leaderboard, score])

  const achievementChips = [
    score >= 1000 ? 'NEW HIGH ENERGY' : 'RUN BANKED',
    rankData.currentRank <= 10
      ? `TOP ${rankData.currentRank}`
      : `+${Math.max(1, Math.floor(score / 75))} RANK`,
  ]

  const userIdx = (leaderboard ?? []).findIndex(
    (e) => e.player.toLowerCase() === (address?.toLowerCase() ?? '')
  )

  return (
    <div className="absolute inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: 'var(--overlay)',
          backdropFilter: 'blur(8px)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'linear-gradient(135deg, transparent 0%, transparent 42%, var(--ink) 42%, var(--ink) 45%, transparent 45%, transparent 100%)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="relative flex h-full items-center justify-center p-2 sm:p-4">
        <div
          className="relative flex w-full max-w-sm flex-col gap-3 text-ink"
          style={{ maxHeight: 'calc(100dvh - 1rem)' }}
        >
          <button
            onClick={handleAbandon}
            className="absolute right-2 top-2 z-50 brutal-btn flex h-11 w-11 items-center justify-center border-4 border-ink bg-paper-2 p-2 text-ink sm:h-12 sm:w-12"
            style={{ boxShadow: '4px 4px 0 var(--ink)' }}
          >
            <BrutalIcon name="back" size={20} strokeWidth={4} />
          </button>

          <div className="flex shrink-0 justify-center px-14 pt-2">
            <div
              className="brutal-sticker text-center"
              style={{
                background: 'var(--danger)',
                padding: '10px 22px',
                fontSize: 'clamp(2.25rem, 10vw, 3rem)',
                letterSpacing: '-0.03em',
                lineHeight: 0.9,
                transform: 'rotate(-4deg) scale(1.02)',
                boxShadow: `8px 8px 0 var(--ink)`,
                zIndex: 30,
              }}
            >
              <div className="border-t-4 border-white pt-1">
                GAME
                <br />
                OVER
              </div>
            </div>
          </div>

          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <div
              className="border-4 border-ink p-4 sm:p-6"
              style={{
                background: 'var(--paper)',
                boxShadow: `10px 10px 0 ${shadowColor}`,
              }}
            >
              <div className="mb-1 font-display text-[11px] tracking-[0.18em] text-ink opacity-80">
                FINAL SCORE
              </div>
              <div
                className="mb-4 font-display tabular-nums"
                style={{
                  fontSize: 'clamp(3.25rem, 13vw, 4.5rem)',
                  letterSpacing: '-0.04em',
                  lineHeight: 0.9,
                }}
              >
                {score.toLocaleString()}
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                <div
                  className="border-4 border-ink bg-accent-lime px-3 py-1 font-display text-[10px] tracking-widest uppercase shadow-[3px_3px_0_var(--ink)]"
                  style={{ color: accentTextColor }}
                >
                  NEW HIGH SCORE
                </div>
                <div
                  className="border-4 border-ink bg-accent-pink px-3 py-1 font-display text-[10px] tracking-widest uppercase shadow-[3px_3px_0_var(--ink)]"
                  style={{ color: accentTextColor }}
                >
                  {achievementChips[1]}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: 'BIGGEST COMBO',
                    value: `×${stats.bestCombo}`,
                    bg: 'var(--paper-2)',
                    icon: 'zap' as const,
                  },
                  {
                    label: 'LINES CLEARED',
                    value: stats.linesCleared,
                    bg: 'var(--paper-2)',
                    icon: 'star' as const,
                  },
                  {
                    label: 'PIECES PLACED',
                    value: stats.piecesPlaced,
                    bg: 'var(--paper-2)',
                    icon: 'history' as const,
                  },
                  {
                    label: 'TIME',
                    value: stats.time,
                    bg: 'var(--paper-2)',
                    icon: 'timer' as const,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="relative border-[3px] border-ink p-2.5"
                    style={{ background: stat.bg }}
                  >
                    <div className="mb-0.5 flex items-center gap-1 font-display text-[8px] tracking-[0.15em] uppercase opacity-80">
                      <BrutalIcon name={stat.icon} size={10} strokeWidth={2} />
                      {stat.label}
                    </div>
                    <div
                      className="font-display text-xl leading-none"
                      style={{ letterSpacing: '-0.02em' }}
                    >
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="border-4 border-ink bg-accent-yellow p-4"
              style={{ boxShadow: '6px 6px 0 var(--ink)', color: accentTextColor }}
            >
              <div className="mb-2 flex items-center justify-between font-display text-[10px] tracking-widest uppercase">
                <span>WEEKLY LADDER</span>
                <span>#{rankData.currentRank} NEXT</span>
              </div>
              <div className="relative h-4 border-4 border-ink bg-paper-2">
                <div
                  className="absolute inset-y-0 left-0 bg-danger"
                  style={{ width: `${rankData.progress}%` }}
                />
                <div
                  className="absolute -top-1 h-6 w-1 bg-ink"
                  style={{ left: `calc(${rankData.progress}% - 2px)` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between font-display text-[9px] tracking-widest opacity-90">
                <span>#{userIdx + 2 || '143'}</span>
                <span>#{rankData.currentRank - 1 || '89'} NEXT</span>
              </div>
            </div>

            {hasError && (
              <div className="border-4 border-danger bg-paper-2 p-3 text-center">
                <p className="font-display text-[10px] uppercase text-danger">
                  Submission Failed
                </p>
              </div>
            )}
          </div>

          <div
            className="shrink-0 border-4 border-ink bg-paper p-3"
            style={{ boxShadow: '8px 8px 0 var(--ink)' }}
          >
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="brutal-btn flex w-full items-center justify-center gap-3 border-4 border-ink bg-accent-lime py-4 font-display text-sm uppercase tracking-[0.15em] disabled:opacity-50 sm:py-5 sm:text-base"
                style={{ boxShadow: '6px 6px 0 var(--ink)', color: accentTextColor }}
              >
                {isRegistering ? (
                  <div className="brutal-loader" />
                ) : (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
                {isAllSuccess ? 'REPLAYING...' : 'SUBMIT + PLAY AGAIN'}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  className="brutal-btn border-4 border-ink bg-paper-2 py-3.5 font-display text-[11px] uppercase tracking-wider text-ink sm:py-4 sm:text-xs"
                  style={{ boxShadow: '4px 4px 0 var(--ink)' }}
                >
                  SHARE CAST
                </button>
                <button
                  onClick={onOpenLeaderboard}
                  className="brutal-btn border-4 border-ink bg-accent-orange py-3.5 font-display text-[11px] uppercase tracking-wider shadow-[4px_4px_0_var(--ink)] sm:py-4 sm:text-xs"
                  style={{ color: accentTextColor }}
                >
                  LEADERBOARD
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GameOverModal
