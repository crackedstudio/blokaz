import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { GridRenderer } from '../canvas/GridRenderer'
import { PieceRenderer } from '../canvas/PieceRenderer'
import { TouchController } from '../canvas/TouchController'
import { AnimationManager } from '../canvas/AnimationManager'
import { Grid } from '../engine/grid'
import type { ShapeDefinition } from '../engine/shapes'
import ScoreBar from './ScoreBar'
import GameOverModal from './GameOverModal'
import TournamentLeaderboard from './TournamentLeaderboard'
import {
  hapticImpact,
  hapticNotification,
  hapticError,
} from '../miniapp/haptics'
import {
  useStartTournamentGame,
  generateGameSeed,
  useActiveGame,
} from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import { keccak256, encodePacked } from 'viem'
import contractInfo from '../contract.json'
import {
  TOURNAMENT_SESSION_STORAGE_KEY,
  readStoredGameSession,
  writeStoredGameSession,
} from '../utils/gameSessionStorage'

const CONTRACT_ADDRESS = contractInfo.address as `0x${string}`

interface TournamentGameScreenProps {
  onBackToHall: () => void
}

const TournamentGameScreen: React.FC<TournamentGameScreenProps> = ({
  onBackToHall,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animManagerRef = useRef<AnimationManager>(new AnimationManager())
  const lastTimeRef = useRef<number>(0)

  const {
    gameSession,
    score,
    comboStreak,
    isGameOver,
    startGame,
    setOnChainData,
    onChainStatus,
    tournamentId,
    setTournamentId,
    onChainSeed,
    onChainGameId,
  } = useGameStore()

  const { address, isConnected } = useAccount()
  const {
    gameId: onChainActiveGameId,
    isLoading: isLoadingActiveGame,
    refetch: refetchActiveGame,
  } = useActiveGame(address)
  const {
    startTournamentGame: contractStartTournamentGame,
    isPending,
    isConfirming,
    isSuccess,
  } = useStartTournamentGame()

  const [currentSeed, setCurrentSeed] = useState<{
    seed: `0x${string}`
    hash: `0x${string}`
  } | null>(null)
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false)
  const [isSyncingContract, setIsSyncingContract] = useState(true)
  const [sessionConflict, setSessionConflict] = useState(false)

  // --- HYDRATION & RECONCILIATION ---
  useEffect(() => {
    if (!isConnected || !address || isLoadingActiveGame) return

    const storedSession = readStoredGameSession(
      TOURNAMENT_SESSION_STORAGE_KEY,
      address,
      CONTRACT_ADDRESS
    )

    const contractActiveId = (onChainActiveGameId as bigint) || 0n

    if (contractActiveId !== 0n) {
      // Contract says we have a game. Check if we have matching seed.
      if (
        storedSession &&
        (storedSession.gameId === contractActiveId.toString() ||
          !storedSession.gameId)
      ) {
        console.log('Recovering active on-chain session:', contractActiveId)
        setOnChainData(contractActiveId, storedSession.seed, 'none')
        setSessionConflict(false)
      } else {
        console.warn(
          'Session conflict: On-chain game exists but local seed is missing or mismatching.',
          {
            contractActiveId: contractActiveId.toString(),
            storedId: storedSession?.gameId,
          }
        )
        setSessionConflict(true)
      }
    } else {
      // Contract says no active game. If storage has one, it's stale.
      if (storedSession) {
        console.log('Contract has no active game, clearing stale local session')
        // We don't necessarily need to clear it, but we shouldn't use it as "registered"
        setOnChainData(0n, null, 'none')
      }
      setSessionConflict(false)
    }

    setIsSyncingContract(false)
  }, [
    isConnected,
    address,
    isLoadingActiveGame,
    onChainActiveGameId,
    setOnChainData,
  ])

  // Basic hydration for mode state (tournamentId)
  useEffect(() => {
    if (!isConnected || !address) return
    const storedSession = readStoredGameSession(
      TOURNAMENT_SESSION_STORAGE_KEY,
      address,
      CONTRACT_ADDRESS
    )
    if (storedSession?.tournamentId && !tournamentId) {
      setTournamentId(BigInt(storedSession.tournamentId))
    }
  }, [isConnected, address, setTournamentId, tournamentId])

  // Redirect if no tournamentId is active (sanity check)
  useEffect(() => {
    if (tournamentId === null) {
      onBackToHall()
    }
  }, [tournamentId, onBackToHall])

  // 1. Handle Start (On-chain ONLY)
  const handleStartGame = () => {
    if (!isConnected || !address) return

    // ESSENTIAL: Pull freshest state from store to avoid stale closures during "Play Again"
    const freshState = useGameStore.getState()
    const { onChainSeed: latestSeed, onChainGameId: latestGameId } = freshState

    // Check if we HAVE a hydrated seed with an ACTIVE gameId
    if (latestSeed && latestGameId && latestGameId !== 0n) {
      console.log(
        'Using fresh store state for tournament match recovery:',
        latestSeed
      )
      const localSeed = BigInt(
        keccak256(
          encodePacked(['bytes32', 'address'], [latestSeed, address])
        ).slice(0, 18)
      )
      startGame(localSeed, true) // TRUE to preserve onChain data
      return
    }

    const { seed, hash } = generateGameSeed(address)

    // Start local engine
    const localSeed = BigInt(hash.slice(0, 18))
    startGame(localSeed)

    setCurrentSeed({ seed, hash })
    setOnChainData(0n, seed, 'pending')

    writeStoredGameSession(TOURNAMENT_SESSION_STORAGE_KEY, {
      address,
      seed,
      hash,
      gameId: null,
      tournamentId: tournamentId?.toString(),
      contractAddress: CONTRACT_ADDRESS,
    })

    contractStartTournamentGame(tournamentId!, hash)
  }

  // 2. Background Sync
  useEffect(() => {
    if (isSuccess && currentSeed && address) {
      setOnChainData(0n, currentSeed.seed, 'syncing')

      const timer = setInterval(async () => {
        const res = await refetchActiveGame()
        const newGameId = res.data as bigint
        if (newGameId && newGameId !== 0n) {
          setOnChainData(newGameId, currentSeed.seed, 'registered')

          writeStoredGameSession(TOURNAMENT_SESSION_STORAGE_KEY, {
            address,
            seed: currentSeed.seed,
            hash: currentSeed.hash,
            gameId: newGameId.toString(),
            tournamentId: tournamentId?.toString(),
            contractAddress: CONTRACT_ADDRESS,
          })

          clearInterval(timer)
        }
      }, 2000)

      return () => clearInterval(timer)
    }
  }, [
    address,
    currentSeed,
    isSuccess,
    refetchActiveGame,
    setOnChainData,
    tournamentId,
  ])

  // Initialize canvas renderers
  useEffect(() => {
    if (!canvasRef.current || !gameSession) return

    const canvas = canvasRef.current
    const gridSize = Math.min(window.innerWidth - 32, window.innerHeight * 0.55)
    const cellSize = gridSize / 9
    const trayGap = Math.round(cellSize * 0.5)
    const trayHeight = Math.round(gridSize / 3)
    const trayY = gridSize + trayGap

    canvas.width = gridSize
    canvas.height = gridSize + trayGap + trayHeight
    canvas.style.width = `${gridSize}px`
    canvas.style.height = `${canvas.height}px`

    const gridRenderer = new GridRenderer(canvas, gridSize)
    const pieceRenderer = new PieceRenderer(canvas, trayY, cellSize)
    const animManager = animManagerRef.current

    const touchController = new TouchController(
      canvas,
      gridRenderer,
      pieceRenderer,
      (pieceIndex: number, row: number, col: number) => {
        const result = useGameStore.getState().placePiece(pieceIndex, row, col)
        if (!result?.success) {
          hapticError()
          return
        }

        hapticImpact()
        const linesCleared = result.linesCleared
        if (
          linesCleared &&
          (linesCleared.rows.length > 0 || linesCleared.cols.length > 0)
        ) {
          hapticNotification()
          animManager.trigger('LINE_CLEAR', {
            rows: linesCleared.rows,
            cols: linesCleared.cols,
          })
          if (result.scoreEvent && result.scoreEvent.newComboStreak > 0) {
            animManager.trigger('COMBO', {
              streak: result.scoreEvent.newComboStreak,
            })
          }
        }

        if (result.scoreEvent && result.scoreEvent.totalPoints > 0) {
          animManager.trigger('SCORE', {
            x: gridSize * 0.5,
            y: gridSize * 0.45,
            score: result.scoreEvent.totalPoints,
          })
        }
      },
      (shape: ShapeDefinition, row: number, col: number) => {
        if (!shape) return false
        const session = useGameStore.getState().gameSession
        return session ? Grid.canPlace(session.grid, shape, row, col) : false
      }
    )

    let rafHandle: number
    lastTimeRef.current = 0

    const render = (timestamp: number) => {
      const delta = lastTimeRef.current ? timestamp - lastTimeRef.current : 16
      lastTimeRef.current = timestamp
      animManager.update(delta)

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const currentSession = useGameStore.getState().gameSession
      if (!currentSession) return

      const ghost = (window as any).activeGhost as {
        row: number
        col: number
        valid: boolean
      } | null
      const dragState = touchController.getDragState()
      let ghostCells: { row: number; col: number; valid: boolean }[] | undefined

      if (ghost && dragState.isDragging && dragState.dragIndex !== null) {
        const shape = currentSession.currentPieces[dragState.dragIndex]
        if (shape) {
          ghostCells = shape.cells
            .map(([dr, dc]) => ({
              row: ghost.row + dr,
              col: ghost.col + dc,
              valid: ghost.valid,
            }))
            .filter(
              (cell) =>
                cell.row >= 0 && cell.row < 9 && cell.col >= 0 && cell.col < 9
            )
        }
      }

      const isTournamentMatch = true // Always true in this screen

      gridRenderer.draw(currentSession.grid, ghostCells, isTournamentMatch)
      pieceRenderer.drawTray(
        currentSession.currentPieces,
        dragState.isDragging && dragState.dragIndex !== null
          ? dragState.dragIndex
          : undefined,
        isTournamentMatch
      )

      if (dragState.isDragging && dragState.dragIndex !== null) {
        const shape = currentSession.currentPieces[dragState.dragIndex]
        if (shape) {
          pieceRenderer.drawDragging(
            shape,
            dragState.dragPos.x,
            dragState.dragPos.y,
            cellSize,
            isTournamentMatch
          )
        }
      }

      animManager.draw(ctx, cellSize, isTournamentMatch)
      rafHandle = requestAnimationFrame(render)
    }

    rafHandle = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafHandle)
      touchController.destroy()
    }
  }, [!!gameSession])

  return (
    <div className="brutal-grid-bg relative flex h-screen select-none flex-col overflow-hidden bg-paper text-ink">
      <ScoreBar
        score={score}
        comboStreak={comboStreak}
        tournamentId={tournamentId}
      />

      <div className="z-10 flex items-center justify-between border-b-4 border-ink bg-paper px-6 py-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-10 w-10 items-center justify-center border-4 border-ink bg-accent-yellow font-display text-xl"
            style={{ boxShadow: '4px 4px 0 var(--ink)' }}
          >
            T
          </div>
          <div>
            <div className="font-display text-[10px] uppercase tracking-[0.2em] text-danger">
              TOURNAMENT MATCH
            </div>
            <div
              className="font-display text-lg"
              style={{ letterSpacing: '-0.03em' }}
            >
              CONTENDER LOBBY #{tournamentId?.toString()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsLeaderboardOpen(true)}
            className="brutal-btn border-4 border-ink bg-accent-cyan px-4 py-2 font-display text-[10px] uppercase tracking-[0.14em]"
            style={{ boxShadow: '4px 4px 0 var(--ink)' }}
          >
            RANKINGS
          </button>
          {!gameSession && (
            <button
              onClick={onBackToHall}
              className="brutal-btn border-4 border-ink bg-danger px-4 py-2 font-display text-[10px] uppercase tracking-[0.14em] text-paper"
              style={{ boxShadow: '4px 4px 0 var(--ink)' }}
            >
              EXIT MATCH
            </button>
          )}
        </div>
      </div>

      <div className="z-10 flex flex-1 items-start justify-center pt-8">
        <div
          className="relative border-4 border-ink bg-ink"
          style={{ boxShadow: '10px 10px 0 var(--ink)' }}
        >
          <canvas
            ref={canvasRef}
            style={{ touchAction: 'none', display: 'block' }}
          />

          {gameSession && (
            <div className="absolute right-4 top-4 z-30">
              {onChainStatus === 'pending' || isPending || isConfirming ? (
                <div
                  className="flex items-center gap-2 border-2 border-ink bg-accent-yellow px-3 py-1.5 font-display text-[10px] uppercase tracking-[0.14em]"
                  style={{ boxShadow: '2px 2px 0 var(--ink)' }}
                >
                  <div className="h-2 w-2 animate-pulse bg-ink" />
                  REGISTERING
                </div>
              ) : onChainStatus === 'syncing' ? (
                <div
                  className="flex items-center gap-2 border-2 border-ink bg-accent-cyan px-3 py-1.5 font-display text-[10px] uppercase tracking-[0.14em]"
                  style={{ boxShadow: '2px 2px 0 var(--ink)' }}
                >
                  <div className="brutal-loader" />
                  FINALIZING
                </div>
              ) : onChainStatus === 'registered' ? (
                <div
                  className="flex items-center gap-2 border-2 border-ink bg-accent-lime px-3 py-1.5 font-display text-[10px] uppercase tracking-[0.14em]"
                  style={{ boxShadow: '2px 2px 0 var(--ink)' }}
                >
                  <div className="h-2 w-2 bg-ink" />
                  MATCH VERIFIED
                </div>
              ) : null}
            </div>
          )}

          {!gameSession && (
            <div
              className="absolute inset-0 z-40 flex items-center justify-center"
              style={{
                background: 'rgba(12,12,16,0.55)',
                backdropFilter: 'blur(6px)',
              }}
            >
              <div
                className="mx-4 w-full max-w-xs border-4 border-ink bg-paper p-8 text-center"
                style={{ boxShadow: '8px 8px 0 var(--accent-pink)' }}
              >
                <div
                  className="mb-4 inline-block border-4 border-ink bg-accent-yellow px-4 py-1 font-display text-[11px] tracking-[0.14em]"
                  style={{
                    transform: 'rotate(-3deg)',
                    boxShadow: '4px 4px 0 var(--ink)',
                  }}
                >
                  TOURNAMENT MODE
                </div>
                <h2
                  className="mb-2 font-display text-[42px] leading-[0.9]"
                  style={{ letterSpacing: '-0.04em' }}
                >
                  READY FOR{' '}
                  <span
                    style={{
                      color: 'var(--danger)',
                      WebkitTextStroke: '1px var(--ink)',
                      display: 'inline-block',
                      transform: 'rotate(-2deg)',
                    }}
                  >
                    GLORY?
                  </span>
                </h2>
                <p className="mb-8 font-display text-[10px] uppercase leading-relaxed tracking-[0.16em] text-ink/60">
                  You are about to enter a competitive match. Your final score
                  will be recorded on the leaderboard.
                </p>

                <button
                  onClick={handleStartGame}
                  disabled={
                    isPending ||
                    isConfirming ||
                    isSyncingContract ||
                    sessionConflict
                  }
                  className="brutal-btn w-full border-4 border-ink bg-accent-lime py-4 font-display text-sm uppercase tracking-[0.14em] text-ink disabled:opacity-50"
                  style={{ boxShadow: '6px 6px 0 var(--ink)' }}
                >
                  {isSyncingContract ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="brutal-loader" />
                      SYNCING...
                    </div>
                  ) : sessionConflict ? (
                    'SESSION CONFLICT'
                  ) : isPending || isConfirming ? (
                    'PREPARING...'
                  ) : (
                    'COMMENCE MATCH'
                  )}
                </button>

                {sessionConflict && (
                  <div className="mt-4 border-4 border-danger bg-paper-2 p-4 text-left">
                    <p className="mb-2 font-display text-[9px] uppercase tracking-[0.14em] text-piece-red">
                      MATCHING ERROR
                    </p>
                    <p className="mb-4 text-[10px] leading-relaxed text-ink/70">
                      An active session exists on the blockchain with a
                      different record. You must reset to start a fresh match.
                    </p>
                    <button
                      onClick={() => {
                        useGameStore.getState().forceReset(true)
                        setSessionConflict(false)
                      }}
                      className="brutal-btn w-full border-4 border-ink bg-danger py-2 font-display text-[10px] uppercase tracking-[0.14em] text-paper"
                      style={{ boxShadow: '4px 4px 0 var(--ink)' }}
                    >
                      RESET SESSION
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {isGameOver && (
            <GameOverModal
              score={score}
              onPlayAgain={handleStartGame}
              onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
              mode="tournament"
            />
          )}
        </div>
      </div>

      <TournamentLeaderboard
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        tournamentId={tournamentId}
      />

      <div className="pointer-events-none p-6 text-center opacity-40">
        <div className="font-display text-[10px] uppercase tracking-[0.5em] text-ink">
          TOURNAMENT EDITION
        </div>
      </div>
    </div>
  )
}

export default TournamentGameScreen
