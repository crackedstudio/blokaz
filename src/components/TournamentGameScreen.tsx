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
  useActiveTournamentGame,
} from '../hooks/useBlokzGame'
import { requestStartSignature } from '../api/signer'
import { useAccount } from 'wagmi'
import { keccak256, encodePacked } from 'viem'
import contractInfo from '../contract.json'
import {
  TOURNAMENT_SESSION_STORAGE_KEY,
  readStoredGameSession,
  writeStoredGameSession,
} from '../utils/gameSessionStorage'

const TOURNAMENT_ADDRESS = contractInfo.tournament as `0x${string}`

interface TournamentGameScreenProps {
  onBackToHall: () => void
}

const TournamentGameScreen: React.FC<TournamentGameScreenProps> = ({
  onBackToHall,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boardContainerRef = useRef<HTMLDivElement>(null)
  const animManagerRef = useRef<AnimationManager>(new AnimationManager())
  const lastTimeRef = useRef<number>(0)
  const cellSizeRef = useRef<number>(0)

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
  } = useGameStore()

  const { address, isConnected } = useAccount()
  const {
    gameId: onChainActiveGameId,
    isLoading: isLoadingActiveGame,
    refetch: refetchActiveGame,
  } = useActiveTournamentGame(address)
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
  const [canvasDims, setCanvasDims] = useState<{
    gridSize: number
    trayY: number
    trayH: number
  } | null>(null)

  // --- HYDRATION & RECONCILIATION ---
  useEffect(() => {
    if (!isConnected || !address || isLoadingActiveGame) return

    const storedSession = readStoredGameSession(
      TOURNAMENT_SESSION_STORAGE_KEY,
      address,
      TOURNAMENT_ADDRESS
    )

    const contractActiveId = (onChainActiveGameId as bigint) || 0n

    if (contractActiveId !== 0n) {
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
      if (storedSession) {
        console.log('Contract has no active game, clearing stale local session')
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
      TOURNAMENT_ADDRESS
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
  const handleStartGame = async () => {
    if (!isConnected || !address) return

    const freshState = useGameStore.getState()
    const { onChainSeed: latestSeed, onChainGameId: latestGameId } = freshState

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
      startGame(localSeed, true)
      return
    }

    const { seed, hash } = generateGameSeed(address)
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
      contractAddress: TOURNAMENT_ADDRESS,
    })

    try {
      const { signature, nonce, deadline } = await requestStartSignature(
        tournamentId!,
        hash,
        address
      )
      contractStartTournamentGame(tournamentId!, hash, nonce, deadline, signature)
    } catch (err) {
      console.error('Failed to get start signature:', err)
      hapticError()
    }
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
            contractAddress: TOURNAMENT_ADDRESS,
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

  // 3. Canvas setup with proper ResizeObserver (mirrors classic GameScreen)
  useEffect(() => {
    if (!canvasRef.current || !gameSession) return

    const canvas = canvasRef.current

    const vpFallback = Math.min(
      window.innerWidth - 32,
      Math.round(window.innerHeight * 0.72)
    )

    const computeDims = (containerWidth: number, containerHeight = 0) => {
      let gridSize = containerWidth > 0 ? containerWidth : vpFallback
      if (containerHeight > 0) {
        const maxByHeight = Math.floor((containerHeight * 18) / 25)
        if (maxByHeight > 0 && maxByHeight < gridSize) gridSize = maxByHeight
      }
      const cellSize = gridSize / 9
      const trayGap = Math.round(cellSize * 0.5)
      const trayHeight = Math.round(gridSize / 3)
      const trayY = gridSize + trayGap
      return { gridSize, cellSize, trayGap, trayHeight, trayY }
    }

    const initialW = boardContainerRef.current?.clientWidth || 0
    const initialH = boardContainerRef.current?.clientHeight || 0
    const init = computeDims(initialW, initialH)

    canvas.width = init.gridSize
    canvas.height = init.gridSize + init.trayGap + init.trayHeight
    canvas.style.width = `${init.gridSize}px`
    canvas.style.height = `${canvas.height}px`
    canvas.style.background = 'transparent'

    setCanvasDims({
      gridSize: init.gridSize,
      trayY: init.trayY,
      trayH: init.trayHeight,
    })
    cellSizeRef.current = init.cellSize

    const gridRenderer = new GridRenderer(canvas, init.gridSize)
    const pieceRenderer = new PieceRenderer(canvas, init.trayY, init.cellSize)
    const animManager = animManagerRef.current

    let ro: ResizeObserver | null = null
    if (boardContainerRef.current) {
      ro = new ResizeObserver(([entry]) => {
        const w = entry.contentRect.width
        const h = entry.contentRect.height
        if (w <= 0) return
        const d = computeDims(w, h)
        const totalH = d.gridSize + d.trayGap + d.trayHeight
        canvas.width = d.gridSize
        canvas.height = totalH
        canvas.style.width = `${d.gridSize}px`
        canvas.style.height = `${totalH}px`
        gridRenderer.resize(d.gridSize)
        pieceRenderer.resize(d.trayY, d.cellSize, d.gridSize)
        cellSizeRef.current = d.cellSize
        setCanvasDims({
          gridSize: d.gridSize,
          trayY: d.trayY,
          trayH: d.trayHeight,
        })
      })
      ro.observe(boardContainerRef.current)
    }

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
            x: gridRenderer.currentGridSize * 0.5,
            y: gridRenderer.currentGridSize * 0.45,
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

      gridRenderer.draw(currentSession.grid, ghostCells, true)
      pieceRenderer.drawTray(
        currentSession.currentPieces,
        dragState.isDragging && dragState.dragIndex !== null
          ? dragState.dragIndex
          : undefined,
        true
      )

      if (dragState.isDragging && dragState.dragIndex !== null) {
        const shape = currentSession.currentPieces[dragState.dragIndex]
        if (shape) {
          pieceRenderer.drawDragging(
            shape,
            dragState.dragPos.x,
            dragState.dragPos.y,
            cellSizeRef.current,
            true
          )
        }
      }

      animManager.draw(ctx, cellSizeRef.current, true)
      rafHandle = requestAnimationFrame(render)
    }

    rafHandle = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafHandle)
      touchController.destroy()
      ro?.disconnect()
    }
  }, [!!gameSession])

  return (
    <div className="brutal-grid-bg relative flex h-screen select-none flex-col overflow-hidden bg-paper text-ink">
      <ScoreBar
        score={score}
        comboStreak={comboStreak}
        tournamentId={tournamentId}
      />

      {/* Header bar */}
      <div className="z-10 flex shrink-0 items-center justify-between border-b-4 border-ink bg-paper px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center border-4 border-ink font-display text-lg"
            style={{ background: 'var(--accent-pink)', boxShadow: '3px 3px 0 var(--ink)', color: 'var(--ink-fixed)' }}
          >
            T
          </div>
          <div>
            <div className="font-display text-[9px] uppercase tracking-[0.2em] text-danger">
              TOURNAMENT MATCH
            </div>
            <div className="font-display text-base" style={{ letterSpacing: '-0.03em' }}>
              BRACKET #{tournamentId?.toString()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* On-chain sync chip */}
          {gameSession && (
            <>
              {onChainStatus === 'pending' || isPending || isConfirming ? (
                <div
                  className="flex items-center gap-1.5 border-2 border-ink px-2 py-1 font-display text-[9px] uppercase tracking-[0.12em]"
                  style={{ background: 'var(--accent-yellow)', color: 'var(--ink-fixed)', boxShadow: '2px 2px 0 var(--ink)' }}
                >
                  <div className="h-1.5 w-1.5 animate-pulse bg-ink" />
                  REGISTERING
                </div>
              ) : onChainStatus === 'syncing' ? (
                <div
                  className="flex items-center gap-1.5 border-2 border-ink px-2 py-1 font-display text-[9px] uppercase tracking-[0.12em]"
                  style={{ background: 'var(--accent-cyan)', color: 'var(--ink-fixed)', boxShadow: '2px 2px 0 var(--ink)' }}
                >
                  <div className="brutal-loader" />
                  SYNCING
                </div>
              ) : onChainStatus === 'registered' ? (
                <div
                  className="flex items-center gap-1.5 border-2 border-ink px-2 py-1 font-display text-[9px] uppercase tracking-[0.12em]"
                  style={{ background: 'var(--accent-lime)', color: 'var(--ink-fixed)', boxShadow: '2px 2px 0 var(--ink)' }}
                >
                  <div className="h-1.5 w-1.5 bg-ink" />
                  VERIFIED
                </div>
              ) : null}
            </>
          )}

          <button
            onClick={() => setIsLeaderboardOpen(true)}
            className="brutal-btn border-3 border-ink px-3 py-2 font-display text-[9px] uppercase tracking-[0.14em]"
            style={{ background: 'var(--accent-cyan)', boxShadow: '3px 3px 0 var(--ink)', color: 'var(--ink-fixed)' }}
          >
            RANKS
          </button>

          {!gameSession && (
            <button
              onClick={onBackToHall}
              className="brutal-btn border-3 border-ink px-3 py-2 font-display text-[9px] uppercase tracking-[0.14em] text-paper"
              style={{ background: 'var(--danger)', boxShadow: '3px 3px 0 var(--ink)' }}
            >
              EXIT
            </button>
          )}
        </div>
      </div>

      {/* Game area — fills remaining vertical space */}
      {!gameSession ? (
        /* Lobby / "ready to play" screen */
        <div className="z-10 flex flex-1 items-center justify-center p-4">
          <div
            className="w-full max-w-xs border-4 border-ink bg-paper p-8 text-center"
            style={{ boxShadow: '8px 8px 0 var(--accent-pink)' }}
          >
            <div
              className="mb-4 inline-block border-4 border-ink bg-accent-yellow px-4 py-1 font-display text-[11px] tracking-[0.14em]"
              style={{
                transform: 'rotate(-3deg)',
                boxShadow: '4px 4px 0 var(--ink)',
                color: 'var(--ink-fixed)',
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
              className="brutal-btn w-full border-4 border-ink bg-accent-lime py-4 font-display text-sm uppercase tracking-[0.14em] disabled:opacity-50"
              style={{ boxShadow: '6px 6px 0 var(--ink)', color: 'var(--ink-fixed)' }}
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

            <button
              onClick={onBackToHall}
              className="mt-4 w-full border-2 border-ink py-2 font-display text-[9px] uppercase tracking-[0.14em] text-ink/60"
            >
              BACK TO HALL
            </button>
          </div>
        </div>
      ) : (
        /* Canvas board */
        <div
          ref={boardContainerRef}
          className="z-10 flex min-h-0 flex-1 select-none items-center justify-center p-3"
        >
          <div className="relative inline-flex flex-col">
            {/* Decorative frames behind the canvas */}
            {canvasDims && (
              <>
                <div
                  className="pointer-events-none absolute left-0 top-0 border-[4px] border-ink"
                  style={{
                    background: 'var(--ink)',
                    width: canvasDims.gridSize,
                    height: canvasDims.gridSize,
                    boxShadow: '8px 8px 0 var(--accent-pink)',
                  }}
                />
                <div
                  className="pointer-events-none absolute left-0 z-[1] grid grid-cols-3 border-[3px] border-ink"
                  style={{
                    background: 'var(--ink)',
                    top: canvasDims.trayY,
                    width: canvasDims.gridSize,
                    height: canvasDims.trayH,
                    boxShadow: '6px 6px 0 var(--accent-pink)',
                  }}
                >
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center border-r-[3px] last:border-r-0"
                      style={{ borderColor: 'rgba(245,239,227,0.2)' }}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="relative z-[2]" style={{ display: 'inline-block' }}>
              <canvas
                ref={canvasRef}
                style={{ touchAction: 'none', display: 'block' }}
              />

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
        </div>
      )}

      <TournamentLeaderboard
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        tournamentId={tournamentId}
      />
    </div>
  )
}

export default TournamentGameScreen
