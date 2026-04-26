import React, { useMemo } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useGoodDollar } from '../hooks/useGoodDollar'
import { packMoves } from '../engine/replay'
import {
  useSubmitScore,
  useActiveGame,
  useActiveTournamentGame,
  useLeaderboard,
  useSubmitTournamentScore,
} from '../hooks/useBlokzGame'
import { useAccount, useReadContract } from 'wagmi'
import { BLOKZ_GAME_ABI, BLOKZ_TOURNAMENT_ABI } from '../constants/abi'
import contractInfo from '../contract.json'
import { requestSubmitSignature } from '../api/signer'
import { keccak256, encodePacked } from 'viem'
import {
  CLASSIC_SESSION_STORAGE_KEY,
  TOURNAMENT_SESSION_STORAGE_KEY,
  clearStoredGameSession,
  readStoredGameSession,
} from '../utils/gameSessionStorage'
import { BrutalIcon } from './BrutalIcon'

const GAME_ADDRESS = contractInfo.game as `0x${string}`
const TOURNAMENT_ADDRESS = contractInfo.tournament as `0x${string}`

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
  // Each contract tracks its own activeGame mapping — use the right one per mode
  const { gameId: classicActiveGameId, isLoading: isLoadingClassicGameId } =
    useActiveGame(mode === 'classic' ? address : undefined)
  const { gameId: tournamentActiveGameId, isLoading: isLoadingTournamentGameId } =
    useActiveTournamentGame(mode === 'tournament' ? address : undefined)
  const activeGameId = mode === 'tournament' ? tournamentActiveGameId : classicActiveGameId
  const isLoadingGameId = mode === 'tournament' ? isLoadingTournamentGameId : isLoadingClassicGameId
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
    reviveGame,
  } = useGameStore()

  const {
    gModeEnabled,
    isWhitelisted,
    gBalance,
    payForRetry,
    verificationUrl,
  } = useGoodDollar()

  const [isPayingRetry, setIsPayingRetry] = React.useState(false)
  const [showShareSheet, setShowShareSheet] = React.useState(false)

  const handleGRetry = async () => {
    setIsPayingRetry(true)
    const success = await payForRetry()
    if (success) {
      reviveGame()
    }
    setIsPayingRetry(false)
  }
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

  // Classic games live in GAME_ADDRESS; tournament games in TOURNAMENT_ADDRESS.
  // Both hooks are always called (Rules of Hooks), but only the relevant one is enabled.
  const { data: classicGameData, isLoading: isLoadingClassicContract } = useReadContract({
    address: GAME_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'games',
    args: effectiveGameId ? [effectiveGameId] : undefined,
    query: { enabled: mode === 'classic' && !!effectiveGameId },
  })
  const { data: tournamentGameData, isLoading: isLoadingTournamentContract } = useReadContract({
    address: TOURNAMENT_ADDRESS,
    abi: BLOKZ_TOURNAMENT_ABI,
    functionName: 'games',
    args: effectiveGameId ? [effectiveGameId] : undefined,
    query: { enabled: mode === 'tournament' && !!effectiveGameId },
  })
  const gameData = mode === 'tournament' ? tournamentGameData : classicGameData
  const isLoadingContract = mode === 'tournament' ? isLoadingTournamentContract : isLoadingClassicContract

  const recoveredSeed = useMemo(() => {
    if (onChainSeed) return onChainSeed
    if (!address) return null
    const contractAddr = mode === 'tournament' ? TOURNAMENT_ADDRESS : GAME_ADDRESS
    return (
      readStoredGameSession(storageKey, address, contractAddr)?.seed ?? null
    )
  }, [address, onChainSeed, storageKey, mode])

  const onChainHash = useMemo(() => {
    if (!gameData) return null
    const txData = gameData as { seedHash?: `0x${string}` } & readonly unknown[]
    // Named field works for both contracts; index fallback differs:
    // classic struct: [player, seedHash, ...] → index 1
    // tournament struct: [player, tournamentId, seedHash, ...] → index 2
    const indexFallback = mode === 'tournament' ? txData[2] : txData[1]
    return (txData.seedHash ?? indexFallback ?? null) as `0x${string}` | null
  }, [gameData, mode])

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

  const handleSubmit = async () => {
    if (!gameSession || !recoveredSeed || !effectiveGameId || !isSeedMatch)
      return
    if (isPending || isConfirming || isSuccess) return
    const packed = packMoves(gameSession.moveHistory)
    if (isTournamentMode) {
      try {
        const { signature, deadline } = await requestSubmitSignature(
          tournamentId!,
          effectiveGameId!,
          gameSession.score,
          gameSession.moveHistory,
          recoveredSeed,
          address!
        )
        submitTournamentScore(
          tournamentId!,
          effectiveGameId!,
          gameSession.score,
          deadline,
          signature
        )
      } catch (err) {
        console.error('Failed to get submission signature:', err)
      }
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
    onChainStatus === 'syncing' ||
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
    if (isAllSuccess) {
      clearStoredGameSession(storageKey)
      const timer = setTimeout(() => {
        resetForNextGame()
        onPlayAgain()
      }, 800)
      return () => clearTimeout(timer)
    }
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

  const shadowColor = isTournamentMode
    ? 'var(--accent-pink)'
    : 'var(--accent-yellow)'
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

  const buildBoardEmoji = (grid: Uint8Array): string => {
    const EMOJI = ['⬛', '🟦', '🟥', '🟩', '🟨', '🟪', '🟧', '🟫', '⬜', '🔴']
    const SIZE = 9
    const rows: string[] = []
    for (let r = 0; r < SIZE; r++) {
      let row = ''
      for (let c = 0; c < SIZE; c++) {
        const cell = grid[r * SIZE + c]
        row += EMOJI[Math.min(cell, EMOJI.length - 1)] ?? '⬛'
      }
      rows.push(row)
    }
    return rows.join('\n')
  }

  const HASHTAGS = `#miniapps #minipay #playblokaz #celo`

  const buildShareText = (withUrl: boolean) => {
    const parts = [`just scored ${score.toLocaleString()} on BLOKAZ 🎮`]
    if (stats.bestCombo > 1) parts.push(`×${stats.bestCombo} combo 🔥 · ${stats.linesCleared} lines`)
    else parts.push(`${stats.linesCleared} lines cleared · rank #${rankData.currentRank}`)
    parts.push(``)
    if (gameSession?.grid) parts.push(buildBoardEmoji(gameSession.grid))
    parts.push(``)
    if (withUrl) parts.push(`can you beat it? blokaz.xyz\n`)
    parts.push(HASHTAGS)
    return parts.join('\n')
  }

  const handleShareWarpcast = () => {
    const text = buildShareText(true)
    const url = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent('https://blokaz.xyz')}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleShareTwitter = () => {
    // No &url= param — emoji board + hashtags fill ~270 chars, adding a URL would exceed 280
    const text = buildShareText(false)
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

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
    <div className="fixed inset-0 z-50 overflow-hidden">
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
            className="brutal-btn absolute right-2 top-2 z-50 flex h-11 w-11 items-center justify-center border-4 border-ink bg-paper-2 p-2 text-ink sm:h-12 sm:w-12"
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
                  className="border-4 border-ink bg-accent-lime px-3 py-1 font-display text-[10px] uppercase tracking-widest shadow-[3px_3px_0_var(--ink)]"
                  style={{ color: accentTextColor }}
                >
                  NEW HIGH SCORE
                </div>
                <div
                  className="border-4 border-ink bg-accent-pink px-3 py-1 font-display text-[10px] uppercase tracking-widest shadow-[3px_3px_0_var(--ink)]"
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
                    <div className="mb-0.5 flex items-center gap-1 font-display text-[8px] uppercase tracking-[0.15em] opacity-80">
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
              style={{
                boxShadow: '6px 6px 0 var(--ink)',
                color: accentTextColor,
              }}
            >
              <div className="mb-2 flex items-center justify-between font-display text-[10px] uppercase tracking-widest">
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
                style={{
                  boxShadow: '6px 6px 0 var(--ink)',
                  color: accentTextColor,
                }}
              >
                {isRegistering ? (
                  <div className="brutal-loader" />
                ) : (
                  <BrutalIcon name="play" size={20} strokeWidth={2.5} />
                )}
                {isAllSuccess ? 'REPLAYING...' : 'SUBMIT + PLAY AGAIN'}
              </button>

              {/* GoodDollar Retry Option */}
              {gModeEnabled && mode === 'classic' && (
                <div
                  className="border-4 border-ink"
                  style={{
                    background: 'var(--paper-2)',
                    boxShadow: '6px 6px 0 var(--ink)',
                  }}
                >
                  <div
                    className="flex items-center justify-between border-b-4 border-ink px-4 py-2.5"
                    style={{ background: 'var(--paper)' }}
                  >
                    <div className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.18em]">
                      <div
                        className="flex h-5 w-5 items-center justify-center border-2 border-ink font-display text-[8px] font-bold"
                        style={{
                          background: 'var(--accent-lime)',
                          color: 'var(--ink-fixed)',
                        }}
                      >
                        G$
                      </div>
                      GOODDOLLAR REVIVAL
                    </div>
                    <div
                      className="border-2 border-ink px-2 py-0.5 font-display text-[8px] uppercase tracking-[0.15em]"
                      style={{
                        background: 'var(--accent-yellow)',
                        color: 'var(--ink-fixed)',
                      }}
                    >
                      LIVE
                    </div>
                  </div>

                  <div className="p-3">
                    {!isWhitelisted ? (
                      <>
                        <div className="mb-3 font-body text-[10px] leading-relaxed text-ink/60">
                          Verify your identity once to unlock G$ revival power.
                        </div>
                        <a
                          href={verificationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="brutal-btn flex w-full items-center justify-center gap-2 border-4 border-ink bg-accent-pink py-3 font-display text-[11px] uppercase tracking-wider shadow-[4px_4px_0_var(--ink)]"
                          style={{ color: 'var(--ink-fixed)' }}
                        >
                          <BrutalIcon name="alert" size={13} />
                          VERIFY TO REVIVE
                        </a>
                      </>
                    ) : (
                      <>
                        <div className="mb-3 grid grid-cols-2 gap-2">
                          <div
                            className="border-[3px] border-ink p-2"
                            style={{ background: 'var(--paper)' }}
                          >
                            <div className="mb-0.5 font-display text-[7px] uppercase tracking-[0.15em] opacity-60">
                              BALANCE
                            </div>
                            <div
                              className="font-display text-sm"
                              style={{ letterSpacing: '-0.02em' }}
                            >
                              {gBalance
                                ? (Number(gBalance.value) / 1e18).toFixed(1)
                                : '0'}{' '}
                              G$
                            </div>
                          </div>
                          <div
                            className="border-[3px] border-ink p-2"
                            style={{
                              background: 'var(--accent-lime)',
                              color: 'var(--ink-fixed)',
                            }}
                          >
                            <div className="mb-0.5 font-display text-[7px] uppercase tracking-[0.15em] opacity-70">
                              COST
                            </div>
                            <div
                              className="font-display text-sm"
                              style={{ letterSpacing: '-0.02em' }}
                            >
                              10 G$
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={handleGRetry}
                          disabled={
                            isPayingRetry ||
                            (gBalance?.value || 0n) < 10n * 10n ** 18n
                          }
                          className="brutal-btn flex w-full items-center justify-center gap-2 border-4 border-ink bg-accent-lime py-3.5 font-display text-[11px] uppercase tracking-wider shadow-[4px_4px_0_var(--ink)] disabled:opacity-50"
                          style={{ color: 'var(--ink-fixed)' }}
                        >
                          {isPayingRetry ? (
                            <div className="brutal-loader" />
                          ) : (
                            <>
                              <BrutalIcon
                                name="zap"
                                size={14}
                                strokeWidth={2.5}
                              />
                              REVIVE — CONTINUE RUN
                            </>
                          )}
                        </button>
                        <div className="mt-2 text-center font-display text-[8px] uppercase tracking-[0.18em] text-ink/50">
                          RESTORES 3 CLEARANCE SHAPES
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {showShareSheet ? (
                <div
                  className="border-4 border-ink"
                  style={{
                    background: 'var(--paper-2)',
                    boxShadow: '6px 6px 0 var(--ink)',
                  }}
                >
                  <div
                    className="flex items-center justify-between border-b-4 border-ink px-3 py-2"
                    style={{ background: 'var(--paper)' }}
                  >
                    <span className="font-display text-[10px] uppercase tracking-[0.18em]">
                      SHARE YOUR RUN
                    </span>
                    <button
                      onClick={() => setShowShareSheet(false)}
                      className="brutal-btn flex h-7 w-7 items-center justify-center border-2 border-ink"
                      style={{
                        background: 'var(--paper-2)',
                        boxShadow: '2px 2px 0 var(--ink)',
                      }}
                    >
                      <BrutalIcon name="back" size={12} strokeWidth={3} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    <button
                      onClick={handleShareWarpcast}
                      className="brutal-btn flex w-full items-center justify-between border-4 border-ink px-4 py-3 font-display text-[11px] uppercase tracking-wider shadow-[4px_4px_0_var(--ink)]"
                      style={{
                        background: 'var(--accent-pink)',
                        color: 'var(--ink-fixed)',
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="flex h-5 w-5 items-center justify-center border-2 border-ink text-[9px] font-bold"
                          style={{
                            background: 'var(--ink-fixed)',
                            color: 'var(--accent-pink)',
                          }}
                        >
                          W
                        </span>
                        CAST ON WARPCAST
                      </span>
                      <span className="text-base">→</span>
                    </button>
                    <button
                      onClick={handleShareTwitter}
                      className="brutal-btn flex w-full items-center justify-between border-4 border-ink px-4 py-3 font-display text-[11px] uppercase tracking-wider shadow-[4px_4px_0_var(--ink)]"
                      style={{
                        background: 'var(--ink)',
                        color: 'var(--paper)',
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="flex h-5 w-5 items-center justify-center border-2 border-paper text-[9px] font-bold"
                          style={{
                            background: 'var(--paper)',
                            color: 'var(--ink)',
                          }}
                        >
                          X
                        </span>
                        POST ON X / TWITTER
                      </span>
                      <span className="text-base">→</span>
                    </button>
                    <div className="text-center font-display text-[8px] uppercase tracking-[0.18em] text-ink/40">
                      blokaz.xyz · @playblokaz
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowShareSheet(true)}
                    className="brutal-btn flex items-center justify-center gap-1.5 border-4 border-ink bg-paper-2 py-3.5 font-display text-[11px] uppercase tracking-wider text-ink shadow-[4px_4px_0_var(--ink)] sm:py-4 sm:text-xs"
                  >
                    <BrutalIcon name="rocket" size={13} strokeWidth={2} />
                    SHARE RUN
                  </button>
                  <button
                    onClick={onOpenLeaderboard}
                    className="brutal-btn border-4 border-ink bg-accent-cyan py-3.5 font-display text-[11px] uppercase tracking-wider shadow-[4px_4px_0_var(--ink)] sm:py-4 sm:text-xs"
                    style={{ color: accentTextColor }}
                  >
                    LEADERBOARD
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GameOverModal
