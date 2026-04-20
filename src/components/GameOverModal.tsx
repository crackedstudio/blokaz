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
    <div
      className="absolute inset-0 z-50 overflow-y-auto p-4 flex flex-col items-center justify-center"

      style={{ 
        background: 'rgba(12,12,16,0.95)', 
        backgroundImage: 'repeating-linear-gradient(45deg, var(--ink), var(--ink) 10px, var(--paper-2) 10px, var(--paper-2) 20px)',
        opacity: 0.98
      }}
    >
      <div className="relative w-full max-w-sm">
        {/* Close Button */}
        <button 
          onClick={handleAbandon}
          className="absolute -top-4 -right-4 z-50 brutal-btn border-4 border-ink bg-paper-2 p-2 text-ink flex items-center justify-center h-12 w-12" style={{ boxShadow: '4px 4px 0 var(--ink)' }}
        >
          <BrutalIcon name="back" size={24} strokeWidth={4} />
        </button>

        {/* Game Over Sticker */}
        <div className="mb-6 flex justify-center">
          <div
            className="brutal-sticker text-center"
            style={{
              background: 'var(--danger)',
              padding: '12px 30px',
              fontSize: 48,
              letterSpacing: '-0.03em',
              lineHeight: 0.9,
              transform: 'rotate(-4deg) scale(1.1)',
              boxShadow: `8px 8px 0 var(--ink)`,
              zIndex: 30
            }}
          >
            <div className="border-t-4 border-white pt-1">
              GAME
              <br />
              OVER
            </div>
          </div>
        </div>

        {/* Main Stats Card */}
        <div
          className="border-4 border-ink p-6"
          style={{ background: 'var(--paper)', boxShadow: `10px 10px 0 ${shadowColor}` }}
        >
          <div className="mb-1 font-display text-[11px] tracking-[0.18em] text-ink opacity-80">
            FINAL SCORE
          </div>
          <div
            className="mb-4 font-display tabular-nums"
            style={{ fontSize: 72, letterSpacing: '-0.04em', lineHeight: 0.9 }}
          >
            {score.toLocaleString()}
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <div className="border-4 border-ink bg-accent-lime px-3 py-1 font-display text-[10px] tracking-widest text-ink uppercase shadow-[3px_3px_0_var(--ink)]">
              NEW HIGH SCORE
            </div>
            <div className="border-4 border-ink bg-accent-pink px-3 py-1 font-display text-[10px] tracking-widest text-ink uppercase shadow-[3px_3px_0_var(--ink)]">
              {achievementChips[1]}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'BIGGEST COMBO', value: `×${stats.bestCombo}`, bg: 'var(--paper-2)', icon: 'zap' as const },
              { label: 'LINES CLEARED', value: stats.linesCleared, bg: 'var(--paper-2)', icon: 'star' as const },
              { label: 'PIECES PLACED', value: stats.piecesPlaced, bg: 'var(--paper-2)', icon: 'history' as const },
              { label: 'TIME', value: stats.time, bg: 'var(--paper-2)', icon: 'timer' as const },
            ].map((stat) => (
              <div
                key={stat.label}
                className="border-[3px] border-ink p-2.5 relative"
                style={{ background: stat.bg }}
              >
                <div className="flex items-center gap-1 font-display text-[8px] tracking-[0.15em] opacity-80 uppercase mb-0.5">
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

        {/* Weekly Ladder Progress */}
        <div
          className="mt-4 border-4 border-ink bg-accent-yellow p-4" style={{ boxShadow: '6px 6px 0 var(--ink)' }}
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

        {/* Main Action Button */}
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="brutal-btn flex w-full items-center justify-center gap-3 border-4 border-ink bg-accent-lime py-5 font-display text-sm tracking-[0.15em] uppercase disabled:opacity-50" style={{ boxShadow: '6px 6px 0 var(--ink)' }}
          >
            {isRegistering ? <div className="brutal-loader" /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
            {isAllSuccess ? 'REPLAYING...' : 'SUBMIT + PLAY AGAIN'}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              className="brutal-btn border-4 border-ink bg-paper-2 py-4 font-display text-[11px] tracking-widest uppercase" style={{ boxShadow: '4px 4px 0 var(--ink)' }}
            >
              SHARE CAST
            </button>
            <button
              onClick={onOpenLeaderboard}
              className="brutal-btn border-4 border-ink bg-accent-orange py-4 font-display text-[11px] tracking-widest shadow-[4px_4px_0_var(--ink)] uppercase text-ink"
            >
              LEADERBOARD
            </button>
          </div>
        </div>

        {hasError && (
          <div className="mt-4 border-4 border-danger bg-paper-2 p-3 text-center">
            <p className="font-display text-[10px] uppercase text-danger">
              Submission Failed
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default GameOverModal
