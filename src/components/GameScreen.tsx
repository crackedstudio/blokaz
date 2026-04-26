import React, { useEffect, useRef, useState } from 'react'
import { useGoodDollar } from '../hooks/useGoodDollar'
import { useGameStore } from '../stores/gameStore'
import { GridRenderer } from '../canvas/GridRenderer'
import { PieceRenderer } from '../canvas/PieceRenderer'
import { TouchController } from '../canvas/TouchController'
import { AnimationManager } from '../canvas/AnimationManager'
import { Grid } from '../engine/grid'
import { SHAPES, TOTAL_WEIGHT } from '../engine/shapes'
import type { ShapeDefinition } from '../engine/shapes'
import ScoreBar from './ScoreBar'
import GameOverModal from './GameOverModal'
import { ComboOverlay } from './ComboOverlay'
import { BrutalIcon } from './BrutalIcon'
import {
  hapticImpact,
  hapticNotification,
  hapticError,
} from '../miniapp/haptics'
import {
  useStartGame,
  generateGameSeed,
  useActiveGame,
  useLeaderboard,
  useUsername,
} from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import { keccak256, encodePacked } from 'viem'
import contractInfo from '../contract.json'
import {
  CLASSIC_SESSION_STORAGE_KEY,
  readStoredGameSession,
  writeStoredGameSession,
} from '../utils/gameSessionStorage'
import { IS_MINIPAY } from '../utils/miniPay'

const GAME_ADDRESS = contractInfo.game as `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

interface GameScreenProps {
  onOpenLeaderboard?: () => void
  onBack?: () => void
}

// ─── Desktop sidebar widgets ────────────────────────────────────────────────

// ─── Desktop sidebar widgets ────────────────────────────────────────────────

const DailyStreakPanel: React.FC = () => {
  const today = new Date().getDay()
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <div
      className="border-4 border-ink"
      style={{
        background: 'var(--paper-2)',
        boxShadow: '4px 4px 0 var(--ink)',
      }}
    >
      <div
        className="flex items-center justify-between border-b-4 border-ink px-4 py-3"
        style={{ background: 'var(--accent-yellow)' }}
      >
        <div
          className="flex items-center font-display text-[10px] tracking-[0.16em]"
          style={{ color: 'var(--ink-fixed)' }}
        >
          <BrutalIcon name="flame" size={12} className="mr-2" /> DAILY STREAK
        </div>
        <div
          className="font-display text-sm"
          style={{ color: 'var(--ink-fixed)' }}
        >
          DAY 7
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="mb-2 flex gap-1.5">
          {days.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full border-2 border-ink"
                style={{
                  height: 18,
                  background: i < today ? 'var(--accent-lime)' : 'var(--rule)',
                }}
              />
              <span className="font-display text-[8px] text-ink/60">{d}</span>
            </div>
          ))}
        </div>
        <div className="font-body text-[10px] uppercase tracking-[0.08em] text-ink/70">
          2× BONUS ACTIVE ON ALL CLEARS
        </div>
      </div>
    </div>
  )
}

const DANGER_DEFS = [
  {
    name: '3×3 SQUARE',
    risk: 'HIGH',
    color: '#FF3D3D',
    weight: SHAPES.find((shape) => shape.id === 'O3')?.spawnWeight ?? 0,
    match: (shape: ShapeDefinition) => shape.id === 'O3',
  },
  {
    name: '5-LONG LINE',
    risk: 'MED',
    color: '#FF7A1A',
    weight: SHAPES.filter(
      (shape) => shape.id === 'I5H' || shape.id === 'I5V'
    ).reduce((sum, shape) => sum + shape.spawnWeight, 0),
    match: (shape: ShapeDefinition) => shape.id === 'I5H' || shape.id === 'I5V',
  },
  {
    name: 'Z-ZIGZAG',
    risk: 'LOW',
    color: '#B7FF3B',
    weight: SHAPES.filter((shape) => shape.family === 'zigzag').reduce(
      (sum, shape) => sum + shape.spawnWeight,
      0
    ),
    match: (shape: ShapeDefinition) => shape.family === 'zigzag',
  },
] as const

const DangerWatch: React.FC<{ currentPieces?: (ShapeDefinition | null)[] }> = ({
  currentPieces = [],
}) => {
  return (
    <div
      className="border-4 border-ink"
      style={{
        background: 'var(--paper-2)',
        boxShadow: '4px 4px 0 var(--ink)',
      }}
    >
      <div className="border-b-4 border-ink bg-paper px-4 py-3 font-display text-[11px] uppercase tracking-[0.2em]">
        DANGER WATCH
      </div>
      <div className="space-y-1.5 p-3">
        {DANGER_DEFS.map((danger) => {
          const isLive = currentPieces.some(
            (shape) => shape && danger.match(shape)
          )
          return (
            <div
              key={danger.name}
              className="flex items-center justify-between border-[3px] border-ink px-2 py-2 transition-colors"
              style={{
                background: isLive ? 'var(--accent-yellow)' : 'var(--paper-2)',
                boxShadow: isLive ? '3px 3px 0 var(--ink)' : 'none',
                color: isLive ? 'var(--ink-fixed)' : 'inherit',
              }}
            >
              <div className="font-display text-[11px] uppercase tracking-[0.05em]">
                {danger.name}
              </div>
              <div
                className="flex items-center gap-1.5 border-2 border-ink px-2 py-0.5 font-display text-[9px] tracking-[0.1em]"
                style={{
                  background: isLive ? 'var(--accent-lime)' : 'transparent',
                }}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full border border-ink"
                  style={{
                    background: isLive ? 'white' : 'var(--ink)',
                  }}
                />
                <span
                  style={{ color: isLive ? 'var(--ink-fixed)' : 'var(--ink)' }}
                >
                  {isLive ? 'LIVE' : danger.risk}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const LiveLadder: React.FC<{ currentScore: number }> = ({ currentScore }) => {
  const { leaderboard, isLoading } = useLeaderboard()
  const { address } = useAccount()
  const sorted = leaderboard
    ? [...leaderboard].sort((a, b) => b.score - a.score)
    : []
  const top3 = sorted.slice(0, 3)
  const userIdx = sorted.findIndex(
    (e) => e.player.toLowerCase() === (address?.toLowerCase() ?? '')
  )

  return (
    <div
      className="border-4 border-ink"
      style={{
        background: 'var(--paper-2)',
        boxShadow: '8px 8px 0 var(--ink)',
      }}
    >
      <div
        className="flex items-center justify-between border-b-4 border-ink px-4 py-3 font-display text-[11px] tracking-[0.14em]"
        style={{ background: 'var(--paper)' }}
      >
        <span className="flex items-center uppercase tracking-[0.2em]">
          <BrutalIcon name="trending" size={12} className="mr-2" /> WEEKLY
          LADDER
        </span>
        <span className="font-display text-[9px] text-ink/80">2D 14H</span>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse bg-ink/5" />
          ))}
        </div>
      ) : (
        <div>
          {top3.map((entry, i) => {
            const isMe =
              entry.player.toLowerCase() === (address?.toLowerCase() ?? '')
            return (
              <div
                key={entry.player}
                className="flex items-center gap-2 border-b-2 border-ink px-3 py-2.5"
                style={{
                  background: isMe
                    ? 'var(--accent-yellow)'
                    : i === 0
                      ? 'var(--accent-yellow)'
                      : 'var(--paper-2)',
                  color: isMe || i === 0 ? 'var(--ink-fixed)' : 'inherit',
                }}
              >
                <span className="w-6 font-display text-sm">#{i + 1}</span>
                <span className="flex-1 truncate font-display text-xs">
                  @{entry.player.slice(0, 8)}
                </span>
                <span className="font-display text-xs tabular-nums tracking-tighter">
                  {entry.score.toLocaleString()}
                </span>
              </div>
            )
          })}
          {userIdx > 2 && (
            <div
              className="flex items-center gap-2 border-b-2 border-ink px-3 py-2.5"
              style={{
                background: 'var(--accent-cyan)',
                color: 'var(--ink-fixed)',
              }}
            >
              <span className="w-6 font-display text-sm">#{userIdx + 1}</span>
              <span className="flex-1 font-display text-xs uppercase">YOU</span>
              <span className="ml-1 border border-ink bg-ink px-1 font-display text-[9px] tabular-nums text-white">
                YOU
              </span>
              <span className="font-display text-xs tabular-nums tracking-tighter">
                {sorted[userIdx].score.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ShareCard: React.FC<{ score: number }> = ({ score }) => (
  <div
    className="border-4 border-ink bg-accent-pink p-5"
    style={{ boxShadow: '6px 6px 0 var(--ink)', color: 'var(--ink-fixed)' }}
  >
    <div className="mb-4 flex items-center justify-between">
      <div className="font-display text-[10px] uppercase tracking-widest opacity-80">
        SHARE CARD
      </div>
      <div className="h-2 w-2 animate-pulse rounded-full bg-ink" />
    </div>

    <div className="relative overflow-hidden border-4 border-ink bg-paper-2 p-5 shadow-[4px_4px_0_var(--ink)]">
      {/* Decorative dots */}
      <div className="absolute -right-4 -top-4 opacity-10">
        <svg width="60" height="60" viewBox="0 0 60 60">
          <pattern
            id="dots"
            x="0"
            y="0"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="2" fill="var(--ink)" />
          </pattern>
          <rect x="0" y="0" width="60" height="60" fill="url(#dots)" />
        </svg>
      </div>

      <div className="font-display text-3xl tracking-tighter text-ink">
        BLOKAZ.
      </div>
      <div className="mt-4 font-display text-[10px] uppercase tracking-widest text-ink/80">
        CLASSIC RUN SCORE
      </div>
      <div
        className="mt-1 font-display leading-none text-accent-pink"
        style={{
          fontSize: 'clamp(2.5rem, 4vw, 3.5rem)',
          letterSpacing: '-0.04em',
          WebkitTextStroke: '2px var(--ink)',
        }}
      >
        {score.toLocaleString()}
      </div>
    </div>
  </div>
)

// ─── Stat block for desktop left column ─────────────────────────────────────
const StatBlock: React.FC<{ label: string; value: string; bg: string }> = ({
  label,
  value,
  bg,
}) => (
  <div
    className="flex flex-col justify-between border-4 border-ink p-3"
    style={{
      background: bg,
      boxShadow: '4px 4px 0 var(--ink)',
      height: 74,
      color:
        bg.includes('accent') && !bg.includes('pink') && !bg.includes('purple')
          ? 'var(--ink-fixed)'
          : 'inherit',
    }}
  >
    <div
      className={`font-display text-[9px] uppercase tracking-[0.2em] ${bg.includes('accent') && !bg.includes('pink') && !bg.includes('purple') ? 'text-black/70' : 'text-ink/80'}`}
    >
      {label}
    </div>
    <div
      className="font-display text-2xl uppercase"
      style={{ letterSpacing: '-0.02em', lineHeight: 1 }}
    >
      {value}
    </div>
  </div>
)

// ─── Main component ──────────────────────────────────────────────────────────

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

const GameScreen: React.FC<GameScreenProps> = ({
  onOpenLeaderboard,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boardContainerRef = useRef<HTMLDivElement>(null)
  const animManagerRef = useRef<AnimationManager>(new AnimationManager())
  const lastTimeRef = useRef<number>(0)
  const trayHoverIndexRef = useRef<number | null>(null)
  const cellSizeRef = useRef<number>(0)

  const {
    gameSession,
    score,
    comboStreak,
    isGameOver,
    startGame,
    setOnChainData,
    forceReset,
    onChainStatus,
    onChainSeed,
    onChainGameId,
  } = useGameStore()

  const { address, isConnected } = useAccount()
  const {
    gModeEnabled,
    setGModeEnabled,
    isWhitelisted,
    isStreaming,
    gBalance,
    entitlement,
    claimUBI,
    startGStream,
    stopGStream,
    payForRetry,
    verificationUrl,
  } = useGoodDollar()

  // G$ Auto-stream Effect — startGStream/stopGStream are stable callbacks (refs inside hook)
  // so omitting them from deps is intentional and safe
  const startGStreamRef = useRef(startGStream)
  const stopGStreamRef = useRef(stopGStream)
  useEffect(() => {
    startGStreamRef.current = startGStream
  }, [startGStream])
  useEffect(() => {
    stopGStreamRef.current = stopGStream
  }, [stopGStream])

  useEffect(() => {
    if (gModeEnabled && isWhitelisted && gameSession && !isStreaming) {
      startGStreamRef.current()
    } else if ((!gameSession || !gModeEnabled) && isStreaming) {
      stopGStreamRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gModeEnabled, isWhitelisted, !!gameSession, isStreaming])
  const { leaderboard: lbData } = useLeaderboard()
  const bestScore = React.useMemo(() => {
    if (!lbData || !address) return undefined
    const entries = lbData as readonly {
      player: `0x${string}`
      score: number
      gameId: bigint
    }[]
    const mine = entries.filter(
      (e) => e.player.toLowerCase() === address.toLowerCase()
    )
    return mine.length > 0 ? Math.max(...mine.map((e) => e.score)) : undefined
  }, [lbData, address])

  const {
    gameId: onChainActiveGameId,
    isLoading: isLoadingActiveGame,
    refetch: refetchActiveGame,
  } = useActiveGame(address)
  const {
    startGame: contractStartGame,
    isPending,
    isConfirming,
    isSuccess,
    error: startGameError,
  } = useStartGame()

  const [currentSeed, setCurrentSeed] = useState<{
    seed: `0x${string}`
    hash: `0x${string}`
  } | null>(null)
  const [isSyncingContract, setIsSyncingContract] = useState(true)
  const [sessionConflict, setSessionConflict] = useState(false)
  const [comboTrigger, setComboTrigger] = useState(0)
  const [canvasDims, setCanvasDims] = useState<{
    gridSize: number
    trayY: number
    trayH: number
  } | null>(null)
  const isMobile = useIsMobile()

  // 0. Account Switch Protection
  const lastAddressRef = useRef<`0x${string}` | undefined>(address)
  useEffect(() => {
    if (address !== lastAddressRef.current) {
      forceReset()
      lastAddressRef.current = address
    }
  }, [address, forceReset])

  // 0.5 Hydration & Reconciliation
  useEffect(() => {
    if (!isConnected || !address || isLoadingActiveGame) {
      if (!isConnected) setIsSyncingContract(false)
      return
    }
    const storedSession = readStoredGameSession(
      CLASSIC_SESSION_STORAGE_KEY,
      address,
      GAME_ADDRESS
    )
    const contractActiveId = (onChainActiveGameId as bigint) || 0n
    if (contractActiveId !== 0n) {
      if (
        storedSession &&
        (storedSession.gameId === contractActiveId.toString() ||
          !storedSession.gameId)
      ) {
        setOnChainData(contractActiveId, storedSession.seed, 'none')
        setSessionConflict(false)
      } else {
        setSessionConflict(true)
      }
    } else {
      if (storedSession) setOnChainData(0n, null, 'none')
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

  // 1. Handle Start
  const handleStartGame = () => {
    if (isPending || isConfirming) return // already has a tx in flight
    const freshState = useGameStore.getState()
    const { onChainSeed: latestSeed, onChainGameId: latestGameId } = freshState
    if (
      isConnected &&
      address &&
      latestSeed &&
      latestGameId &&
      latestGameId !== 0n
    ) {
      const localSeed = BigInt(
        keccak256(
          encodePacked(['bytes32', 'address'], [latestSeed, address])
        ).slice(0, 18)
      )
      startGame(localSeed, true)
      return
    }
    const dummyAddr = address || ZERO_ADDRESS
    const { seed, hash } = generateGameSeed(dummyAddr)
    const localSeed = BigInt(hash.slice(0, 18))
    startGame(localSeed)
    if (isConnected && address) {
      setCurrentSeed({ seed, hash })
      setOnChainData(0n, seed, 'pending')
      writeStoredGameSession(CLASSIC_SESSION_STORAGE_KEY, {
        address,
        seed,
        hash,
        gameId: null,
        contractAddress: GAME_ADDRESS,
      })
      contractStartGame(hash)
    } else {
      setOnChainData(0n, seed, 'none')
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
          writeStoredGameSession(CLASSIC_SESSION_STORAGE_KEY, {
            address,
            seed: currentSeed.seed,
            hash: currentSeed.hash,
            gameId: newGameId.toString(),
            contractAddress: CONTRACT_ADDRESS,
          })
          clearInterval(timer)
        }
      }, 2000)
      return () => clearInterval(timer)
    }
  }, [address, currentSeed, isSuccess, refetchActiveGame, setOnChainData])

  // 3. Practice Mode Fallback
  // Skip in MiniPay: isConnected is always false on first render because
  // MiniPayAutoConnect hasn't resolved yet. Without this guard the game
  // silently starts in practice mode and contractStartGame is never called.
  useEffect(() => {
    if (!isConnected && !gameSession && !IS_MINIPAY) handleStartGame()
  }, [isConnected, gameSession])

  // Canvas init
  useEffect(() => {
    if (!canvasRef.current || !gameSession) return

    const canvas = canvasRef.current

    const vpFallback = Math.min(
      window.innerWidth - 32,
      Math.round(window.innerHeight * 0.75)
    )

    const computeDims = (containerWidth: number, containerHeight = 0) => {
      let gridSize = containerWidth > 0 ? containerWidth : vpFallback
      if (containerHeight > 0) {
        // totalCanvasH = gridSize + trayGap + trayH ≈ gridSize × 25/18
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

    // ResizeObserver keeps canvas sized to container
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
            setComboTrigger((t) => t + 1)
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
      },
      (index) => {
        trayHoverIndexRef.current = index
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

      gridRenderer.draw(currentSession.grid, ghostCells, false)
      pieceRenderer.drawTray(
        currentSession.currentPieces,
        dragState.isDragging && dragState.dragIndex !== null
          ? dragState.dragIndex
          : undefined,
        false,
        dragState.isDragging
          ? undefined
          : (trayHoverIndexRef.current ?? undefined)
      )

      if (dragState.isDragging && dragState.dragIndex !== null) {
        const shape = currentSession.currentPieces[dragState.dragIndex]
        if (shape)
          pieceRenderer.drawDragging(
            shape,
            dragState.dragPos.x,
            dragState.dragPos.y,
            cellSizeRef.current,
            false
          )
      }

      animManager.draw(ctx, cellSizeRef.current, false)
      rafHandle = requestAnimationFrame(render)
    }

    rafHandle = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafHandle)
      touchController.destroy()
      ro?.disconnect()
      trayHoverIndexRef.current = null
    }
  }, [!!gameSession])

  const handlePlayAgain = () => handleStartGame()

  const isMiniPayConnecting = IS_MINIPAY && !isConnected

  const commonCanvasProps = {
    canvasRef,
    boardContainerRef,
    canvasDims,
    gameSession,
    isConnected,
    onChainStatus,
    isPending,
    isConfirming,
    comboStreak,
    comboTrigger,
    isGameOver,
    score,
    address,
    handleStartGame,
    isSyncingContract,
    isMiniPayConnecting,
    sessionConflict,
    forceReset,
    setSessionConflict,
    onOpenLeaderboard,
    startGameError,
  }

  const canvasArea = (
    <CanvasArea
      {...commonCanvasProps}
      gModeEnabled={gModeEnabled}
      setGModeEnabled={setGModeEnabled}
      isWhitelisted={isWhitelisted}
      verificationUrl={verificationUrl}
      entitlement={entitlement}
      claimUBI={claimUBI}
    />
  )

  if (isMobile) {
    return (
      <MobileLayout
        score={score}
        comboStreak={comboStreak}
        bestScore={bestScore}
        gameSession={gameSession}
        onOpenLeaderboard={onOpenLeaderboard}
        onBack={onBack}
        canvasArea={canvasArea}
      />
    )
  }

  return (
    <DesktopLayout
      score={score}
      comboStreak={comboStreak}
      gameSession={gameSession}
      bestScore={bestScore}
      onOpenLeaderboard={onOpenLeaderboard}
      canvasArea={canvasArea}
    />
  )
}

// ─── Sub-components moved outside to avoid unmounting canvas ────────────────

interface SyncChipProps {
  gameSession: any
  isConnected: boolean
  onChainStatus: string
  isPending: boolean
  isConfirming: boolean
}

const SyncStatusChip: React.FC<SyncChipProps> = ({
  gameSession,
  isConnected,
  onChainStatus,
  isPending,
  isConfirming,
}) => {
  if (!gameSession || !isConnected) return null
  if (onChainStatus === 'pending' || isPending || isConfirming) {
    return (
      <div
        className="flex items-center gap-2 border-2 border-ink px-2 py-1 font-display text-[10px] tracking-[0.12em]"
        style={{
          background: 'var(--accent-yellow)',
          color: 'var(--ink-fixed)',
          boxShadow: '2px 2px 0 var(--ink)',
        }}
      >
        <div className="h-2 w-2 animate-pulse bg-ink" />
        SYNCING
      </div>
    )
  }
  if (onChainStatus === 'syncing') {
    return (
      <div
        className="flex items-center gap-2 border-2 border-ink px-2 py-1 font-display text-[10px] tracking-[0.12em]"
        style={{
          background: 'var(--accent-cyan)',
          color: 'var(--ink-fixed)',
          boxShadow: '2px 2px 0 var(--ink)',
        }}
      >
        <div className="brutal-loader" />
        FINALIZING
      </div>
    )
  }
  if (onChainStatus === 'registered') {
    return (
      <div
        className="flex items-center gap-2 border-2 border-ink px-2 py-1 font-display text-[10px] tracking-[0.12em]"
        style={{
          background: 'var(--accent-lime)',
          color: 'var(--ink-fixed)',
          boxShadow: '2px 2px 0 var(--ink)',
        }}
      >
        <div className="h-2 w-2" style={{ background: 'var(--ink)' }} />
        VERIFIED
      </div>
    )
  }
  return null
}

interface CanvasAreaProps {
  canvasRef: React.RefObject<HTMLCanvasElement>
  boardContainerRef: React.RefObject<HTMLDivElement>
  canvasDims: { gridSize: number; trayY: number; trayH: number } | null
  gameSession: any
  isConnected: boolean
  onChainStatus: string
  isPending: boolean
  isConfirming: boolean
  comboStreak: number
  comboTrigger: number
  isGameOver: boolean
  score: number
  handleStartGame: () => void
  isSyncingContract: boolean
  isMiniPayConnecting: boolean
  sessionConflict: boolean
  forceReset: () => void
  setSessionConflict: (v: boolean) => void
  onOpenLeaderboard?: () => void
  startGameError?: Error | null

  // GoodDollar Props
  gModeEnabled: boolean
  setGModeEnabled: (v: boolean) => void
  isWhitelisted: boolean
  verificationUrl: string | null
  address: string | undefined
  entitlement: bigint
  claimUBI: () => void
}

const ClassicStartCard: React.FC<{
  isConnected: boolean
  handleStartGame: () => void
  isPending: boolean
  isConfirming: boolean
  isSyncingContract: boolean
  isMiniPayConnecting: boolean
  sessionConflict: boolean
  forceReset: () => void
  setSessionConflict: (v: boolean) => void
  startGameError?: Error | null

  // GoodDollar Props
  gModeEnabled: boolean
  setGModeEnabled: (v: boolean) => void
  isWhitelisted: boolean
  verificationUrl: string | null
  address: string | undefined
  entitlement: bigint
  claimUBI: () => void
}> = ({
  isConnected,
  handleStartGame,
  isPending,
  isConfirming,
  isSyncingContract,
  isMiniPayConnecting,
  sessionConflict,
  forceReset,
  setSessionConflict,
  startGameError,
  gModeEnabled,
  setGModeEnabled,
  isWhitelisted,
  verificationUrl,
  address,
  entitlement,
  claimUBI,
}) => {
  const [copied, setCopied] = React.useState(false)
  const [showQR, setShowQR] = React.useState(false)
  const isLinkReady = !!verificationUrl && verificationUrl.startsWith('https://goodid');
  const displayUrl = verificationUrl || 'https://goodid.gooddollar.org';

  return (
  <div
    className="relative z-10 flex w-full flex-col gap-5 rounded-[6px] border-4 border-ink bg-paper px-7 py-8"
    style={{ boxShadow: '10px 10px 0 var(--accent-yellow)' }}
  >
    <div
      className="w-fit border-4 border-ink bg-accent-yellow px-6 py-2 font-display text-sm tracking-[0.15em]"
      style={{ boxShadow: '4px 4px 0 var(--ink)', color: 'var(--ink-fixed)' }}
    >
      CLASSIC MODE
    </div>

    {/* Hero Image */}
    <div className="relative overflow-hidden border-4 border-ink bg-paper-2 shadow-[6px_6px_0_var(--ink)]">
      <img
        src="/hero.png"
        alt="Blokaz Game Preview"
        className="block h-auto w-full"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/20 to-transparent" />
    </div>

    <div
      className="text-center font-display uppercase"
      style={{
        fontSize: 32,
        letterSpacing: '-0.03em',
        lineHeight: 1.1,
      }}
    >
      READY FOR A{' '}
      <span
        className="bg-accent-pink px-2 text-white"
        style={{
          display: 'inline-block',
          transform: 'rotate(-2deg)',
          border: '3px solid var(--ink)',
          boxShadow: '3px 3px 0 var(--ink)',
        }}
      >
        CLASSIC
      </span>{' '}
      RUN?
    </div>
    <button
      onClick={handleStartGame}
      disabled={
        isPending ||
        isConfirming ||
        isSyncingContract ||
        isMiniPayConnecting ||
        sessionConflict
      }
      className="brutal-btn flex w-full items-center justify-center gap-3 border-4 border-ink bg-accent-lime py-5 font-display text-sm uppercase tracking-[0.15em] shadow-[6px_6px_0_var(--ink)] disabled:opacity-70"
      style={{ color: 'var(--ink-fixed)' }}
    >
      {isMiniPayConnecting ? (
        <>
          <div className="brutal-loader" />
          CONNECTING...
        </>
      ) : isSyncingContract ? (
        <>
          <div className="brutal-loader" />
          SYNCING...
        </>
      ) : sessionConflict ? (
        'SESSION CONFLICT'
      ) : (
        'START CLASSIC GAME'
      )}
    </button>

    {/* GoodDollar (G$) Reward Mode */}
    {isConnected && (
      <div
        className="border-4 border-ink"
        style={{
          background: 'var(--paper-2)',
          boxShadow: '4px 4px 0 var(--ink)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b-4 border-ink px-4 py-3"
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
            REWARD MODE
          </div>
          <button
            onClick={() => setGModeEnabled(!gModeEnabled)}
            className={`relative h-7 w-14 border-[3px] border-ink transition-colors ${gModeEnabled ? 'bg-accent-lime' : 'bg-paper-2'}`}
            style={{ boxShadow: '2px 2px 0 var(--ink)' }}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 border-2 border-ink transition-transform ${gModeEnabled ? 'translate-x-[30px]' : 'translate-x-0.5'}`}
              style={{ background: 'var(--paper)' }}
            />
          </button>
        </div>

        {gModeEnabled && (
          <div className="p-4">
            {!isWhitelisted ? (
              <div className="flex flex-col gap-3">
                <div className="font-body text-[10px] leading-relaxed text-ink/60">
                  Face-verify once to earn G$ while you play and unlock the
                  Revive power.
                </div>
                <a
                  href={isLinkReady ? displayUrl : '#'}
                  onClick={(e) => {
                    if (!isLinkReady) {
                      e.preventDefault();
                      alert('Generating verification link... please wait a moment.');
                    }
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`brutal-btn flex w-full items-center justify-center gap-2 border-4 border-ink bg-accent-pink py-3 font-display text-[10px] uppercase tracking-wider shadow-[4px_4px_0_var(--ink)] ${!isLinkReady ? 'opacity-50' : ''}`}
                  style={{ color: 'var(--ink-fixed)' }}
                >
                  {!isLinkReady && <div className="brutal-loader !border-paper h-3 w-3" />}
                  <BrutalIcon name={isLinkReady ? 'alert' : 'chevron-right'} size={12} />
                  {isLinkReady ? 'VERIFY IDENTITY' : 'GENERATING LINK...'}
                </a>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!isLinkReady) return;
                      navigator.clipboard.writeText(displayUrl)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className={`hover:bg-accent-lime/10 relative flex-1 border-[3px] border-ink py-2 font-display text-[8px] uppercase tracking-wider shadow-[2px_2px_0_var(--ink)] transition-colors ${!isLinkReady ? 'opacity-30 cursor-not-allowed' : ''}`}
                    style={{ background: 'var(--paper)' }}
                  >
                    {copied ? (
                      <span className="text-accent-lime animate-pulse font-bold">COPIED TO CLIPBOARD!</span>
                    ) : (
                      'COPY LINK'
                    )}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => isLinkReady && setShowQR(true)}
                      className={`hover:bg-accent-lime/10 border-[3px] border-ink px-3 py-2 font-display text-[8px] uppercase tracking-wider shadow-[2px_2px_0_var(--ink)] transition-colors ${!isLinkReady ? 'opacity-30 cursor-not-allowed' : ''}`}
                      style={{ background: 'var(--paper)' }}
                    >
                      QR CODE
                    </button>
                    {showQR && (
                      <div 
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
                        onClick={() => setShowQR(false)}
                      >
                        <div 
                          className="w-full max-w-[300px] border-4 border-ink p-6 shadow-[10px_10px_0_var(--ink)]"
                          style={{ background: 'var(--paper)' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="mb-4 flex items-center justify-between border-b-2 border-ink pb-2">
                            <span className="font-display text-[10px] uppercase tracking-widest">VERIFY ON PHONE</span>
                            <button onClick={() => setShowQR(false)} className="font-bold">×</button>
                          </div>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(displayUrl)}`}
                            alt="Verification QR Code"
                            className="mx-auto block aspect-square w-full border-4 border-ink"
                          />
                          <div className="mt-4 text-center font-display text-[8px] uppercase tracking-widest text-ink/50">
                            SCAN THIS QR CODE WITH YOUR PHONE'S CAMERA
                          </div>
                          <button 
                            onClick={() => setShowQR(false)} 
                            className="mt-6 w-full border-[3px] border-ink py-2 font-display text-[9px] uppercase tracking-widest shadow-[4px_4px_0_var(--ink)] hover:bg-accent-lime transition-colors"
                            style={{ background: 'var(--accent-lime)' }}
                          >
                            CLOSE
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div
                  className="border-[3px] border-ink/20 p-2"
                  style={{ background: 'var(--paper)' }}
                >
                  <div className="break-all font-mono text-[8px] text-ink/40">
                    {isConnected && address ? address : 'No wallet connected'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-2 border-[3px] border-ink px-3 py-1.5"
                    style={{
                      background: 'var(--accent-lime)',
                      color: 'var(--ink-fixed)',
                    }}
                  >
                    <BrutalIcon name="zap" size={10} strokeWidth={2.5} />
                    <span className="font-display text-[9px] uppercase tracking-widest">
                      VERIFIED HUMAN
                    </span>
                  </div>
                  {entitlement > 0n && (
                    <button
                      onClick={claimUBI}
                      className="border-[3px] border-ink px-3 py-1.5 font-display text-[9px] uppercase tracking-wider shadow-[2px_2px_0_var(--ink)] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                      style={{
                        background: 'var(--accent-yellow)',
                        color: 'var(--ink-fixed)',
                      }}
                    >
                      CLAIM {Number(entitlement) / 100} G$
                    </button>
                  )}
                </div>
                <div
                  className="flex items-center gap-2 border-[3px] border-ink p-2.5"
                  style={{ background: 'var(--paper)' }}
                >
                  <div
                    className="h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ background: 'var(--accent-lime)' }}
                  />
                  <span className="font-display text-[9px] uppercase tracking-[0.15em] text-ink/70">
                    STREAMING 0.05 G$/MIN WHILE ACTIVE
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )}

    {sessionConflict && (
      <div className="mt-6 border-4 border-danger bg-paper-2 p-4 shadow-[4px_4px_0_var(--ink)]">
        <div className="mb-2 flex items-center font-display text-xs uppercase tracking-widest text-piece-red">
          <BrutalIcon name="alert" size={14} className="mr-2" /> DESYNC DETECTED
        </div>
        <div className="mb-4 font-body text-[11px] leading-relaxed text-ink/70">
          Blockchain has an active game that doesn't match your browser. You
          must reset.
        </div>
        <button
          onClick={() => {
            forceReset()
            setSessionConflict(false)
          }}
          className="brutal-btn w-full border-[3px] border-ink bg-danger py-2 font-display text-[10px] uppercase tracking-widest text-white shadow-[3px_3px_0_var(--ink)]"
        >
          RESET SESSION
        </button>
      </div>
    )}
    <div className="flex items-center justify-center gap-2 text-center font-display text-[10px] uppercase tracking-widest opacity-70">
      {isConnected ? (
        <>
          <BrutalIcon name="zap" size={10} strokeWidth={2} /> Score flows into
          the leaderboard automatically
        </>
      ) : isMiniPayConnecting ? (
        <>
          <BrutalIcon name="zap" size={10} strokeWidth={2} /> Connecting MiniPay
          wallet...
        </>
      ) : (
        <>
          <BrutalIcon name="alert" size={10} strokeWidth={2} /> PRACTICE MODE —
          connect wallet for rewards
        </>
      )}
    </div>

    {startGameError && (
      <div className="mt-2 break-all border-4 border-red-500 bg-red-50 p-3 font-display text-[10px] uppercase tracking-widest text-red-700">
        <BrutalIcon name="alert" size={12} className="mr-1" />
        TX ERROR: {startGameError.message?.slice(0, 120)}
      </div>
    )}
  </div>
  )
}

const CanvasArea: React.FC<CanvasAreaProps> = ({
  canvasRef,
  boardContainerRef,
  canvasDims,
  gameSession,
  isConnected,
  onChainStatus,
  isPending,
  isConfirming,
  comboStreak,
  comboTrigger,
  isGameOver,
  score,
  address,
  handleStartGame,
  isSyncingContract,
  isMiniPayConnecting,
  sessionConflict,
  forceReset,
  setSessionConflict,
  onOpenLeaderboard,
  startGameError,
  gModeEnabled,
  setGModeEnabled,
  isWhitelisted,
  verificationUrl,
  entitlement,
  claimUBI,
}) => {
  if (!gameSession) {
    return (
      <ClassicStartCard
        isConnected={isConnected}
        handleStartGame={handleStartGame}
        isPending={isPending}
        isConfirming={isConfirming}
        isSyncingContract={isSyncingContract}
        isMiniPayConnecting={isMiniPayConnecting}
        sessionConflict={sessionConflict}
        forceReset={forceReset}
        setSessionConflict={setSessionConflict}
        startGameError={startGameError}
        gModeEnabled={gModeEnabled}
        setGModeEnabled={setGModeEnabled}
        isWhitelisted={isWhitelisted}
        verificationUrl={verificationUrl}
        address={address}
        entitlement={entitlement}
        claimUBI={claimUBI}
      />
    )
  }

  return (
    <div
      ref={boardContainerRef}
      className="flex h-full w-full select-none items-center justify-center"
    >
      <div className="relative inline-flex flex-col">
        {canvasDims && (
          <>
            <div
              className="pointer-events-none absolute left-0 top-0 rounded-[6px] border-[4px] border-ink bg-paper-2"
              style={{
                width: canvasDims.gridSize,
                height: canvasDims.gridSize,
                boxShadow: '8px 8px 0 var(--ink)',
              }}
            />
            <div
              className="pointer-events-none absolute left-0 z-[1] grid grid-cols-3 border-[3px] border-ink p-5"
              style={{
                background: 'var(--accent-yellow)',
                top: canvasDims.trayY,
                width: canvasDims.gridSize,
                height: canvasDims.trayH,
                boxShadow: '6px 6px 0 var(--ink)',
              }}
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-center border-r-[3px] border-ink last:border-r-0"
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

          {/* Sync chip */}
          <div className="pointer-events-none absolute right-2 top-2 z-30">
            <SyncStatusChip
              gameSession={gameSession}
              isConnected={isConnected}
              onChainStatus={onChainStatus}
              isPending={isPending}
              isConfirming={isConfirming}
            />
          </div>

          {/* ComboOverlay */}
          <ComboOverlay streak={comboStreak} trigger={comboTrigger} />

          {isGameOver && (
            <GameOverModal
              score={score}
              onPlayAgain={handleStartGame}
              onOpenLeaderboard={onOpenLeaderboard}
              mode="classic"
            />
          )}
        </div>
      </div>
    </div>
  )
}

interface MobileLayoutProps {
  score: number
  comboStreak: number
  bestScore?: number
  gameSession: any
  onOpenLeaderboard?: () => void
  onBack?: () => void
  canvasArea: React.ReactNode
}

const ClassicTabStrip: React.FC<{
  onOpenLeaderboard?: () => void
  mobile?: boolean
}> = ({ onOpenLeaderboard, mobile = false }) => (
  <div
    className={`flex w-full flex-wrap items-center gap-4 border-b-2 border-ink ${
      mobile ? 'mb-4 min-h-12 pb-3' : 'mb-8 h-12 pb-4'
    }`}
  >
    <div
      className="border-4 border-ink px-4 py-2 font-display text-sm tracking-[0.1em]"
      style={{
        background: 'var(--accent-yellow)',
        boxShadow: '4px 4px 0 var(--ink)',
      }}
    >
      CLASSIC MODE
    </div>
    <span className="font-display text-[10px] uppercase tracking-[0.2em] opacity-60">
      WEEKLY LEADERBOARD RUN
    </span>
    {onOpenLeaderboard && (
      <button
        onClick={onOpenLeaderboard}
        className="brutal-btn ml-auto border-4 border-ink px-4 py-2 font-display text-[10px] tracking-[0.1em]"
        style={{
          background: 'var(--paper-2)',
          boxShadow: '4px 4px 0 var(--ink)',
        }}
      >
        RANKINGS
      </button>
    )}
  </div>
)

const LeftRail: React.FC<{
  score: number
  comboStreak: number
  gameSession: any
}> = ({ score, comboStreak, gameSession }) => (
  <div className="flex w-full flex-col gap-5">
    <div
      className="border-4 border-ink p-5"
      style={{ background: 'var(--ink)', boxShadow: '6px 6px 0 var(--ink)' }}
    >
      <div
        className="mb-2 font-display text-[10px] tracking-[0.2em] opacity-60"
        style={{ color: 'var(--accent-yellow)' }}
      >
        LIVE SCORE
      </div>
      <div
        className="font-display tabular-nums text-paper"
        style={{ fontSize: 64, letterSpacing: '-0.04em', lineHeight: 0.95 }}
      >
        {score.toLocaleString()}
      </div>
      {comboStreak > 0 && (
        <div className="mt-4 flex gap-2">
          <div className="brutal-sticker text-[14px]">COMBO ×{comboStreak}</div>
          <div
            className="border-2 border-ink bg-accent-yellow px-2 py-1 font-display text-[11px] tracking-widest"
            style={{ color: 'var(--ink-fixed)' }}
          >
            +{Math.floor(score * 0.05)}
          </div>
        </div>
      )}
    </div>

    <div
      className="border-4 border-ink p-4"
      style={{
        background: 'var(--paper-2)',
        boxShadow: '5px 5px 0 var(--ink)',
      }}
    >
      <div className="mb-3 font-display text-[10px] uppercase tracking-[0.2em] text-ink/70">
        NEXT CLEAR CHAIN
      </div>
      <div
        className="relative overflow-hidden border-[4px] border-ink"
        style={{ height: 24 }}
      >
        <div
          className={`tension-fill absolute inset-y-0 left-0 ${
            comboStreak >= 4 ? 'tension-fill-strobe' : ''
          }`}
          style={{
            width: `${Math.min(100, comboStreak * 20 + 28)}%`,
            transition: 'width 200ms cubic-bezier(0.17, 0.67, 0.83, 0.67)',
          }}
        />
      </div>
      <div className="mt-3 flex justify-between font-display text-[10px] uppercase tracking-widest text-ink/70">
        <span>×{comboStreak + 1} NEXT</span>
        <span>+220 BONUS</span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <StatBlock
        label="PIECES"
        value={gameSession ? String(gameSession.moveHistory.length) : '0'}
        bg="var(--paper-2)"
      />
      <StatBlock
        label="CLEARS"
        value={
          gameSession
            ? String(
                gameSession.moveHistory.reduce(
                  (sum: number, m: any) =>
                    sum + (m.scoreEvent?.linesCleared || 0),
                  0
                )
              )
            : '0'
        }
        bg="var(--accent-lime)"
      />
      <StatBlock
        label="MAX CHAIN"
        value={comboStreak > 0 ? `×${comboStreak}` : '—'}
        bg="var(--accent-pink)"
      />
      <StatBlock label="TIME" value="2:18" bg="var(--accent-cyan)" />
    </div>

    <DailyStreakPanel />
  </div>
)

const RightRail: React.FC<{
  score: number
  gameSession: any
  bestScore?: number
}> = ({ score, gameSession, bestScore }) => {
  const { leaderboard } = useLeaderboard()
  const [showShare, setShowShare] = React.useState(false)

  const shareScore = bestScore ?? score

  const rankData = React.useMemo(() => {
    const scores = (leaderboard ?? []).map((e) => e.score).sort((a, b) => b - a)
    const rank =
      scores.findIndex((v) => shareScore >= v) + 1 || scores.length + 1
    return rank
  }, [leaderboard, shareScore])

  const HASHTAGS = `#miniapps #minipay #playblokaz #celo`

  const handleShareWarpcast = () => {
    const text = `just scored ${shareScore.toLocaleString()} on BLOKAZ 🎮\nrank #${rankData} on the weekly ladder\n\ncan you beat it? blokaz.xyz\n\n${HASHTAGS}`
    const url = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent('@playblokaz')}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleShareTwitter = () => {
    const text = `just scored ${shareScore.toLocaleString()} on BLOKAZ 🎮\nrank #${rankData} on the weekly ladder\n\n${HASHTAGS}`
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('@playblokaz')}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <LiveLadder currentScore={score} />
      <DangerWatch currentPieces={gameSession?.currentPieces} />

      {showShare ? (
        <div
          className="border-4 border-ink"
          style={{
            background: 'var(--paper-2)',
            boxShadow: '5px 5px 0 var(--ink)',
          }}
        >
          <div
            className="flex items-center justify-between border-b-4 border-ink px-3 py-2"
            style={{ background: 'var(--paper)' }}
          >
            <span className="font-display text-[10px] uppercase tracking-[0.18em]">
              SHARE BEST SCORE
            </span>
            <button
              onClick={() => setShowShare(false)}
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
            <div
              className="mb-1 border-[3px] border-ink p-2 font-display text-2xl tabular-nums"
              style={{ background: 'var(--paper)', letterSpacing: '-0.03em' }}
            >
              {shareScore.toLocaleString()}
            </div>
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
              <span>→</span>
            </button>
            <button
              onClick={handleShareTwitter}
              className="brutal-btn flex w-full items-center justify-between border-4 border-ink px-4 py-3 font-display text-[11px] uppercase tracking-wider shadow-[4px_4px_0_var(--ink)]"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              <span className="flex items-center gap-2">
                <span
                  className="flex h-5 w-5 items-center justify-center border-2 border-paper text-[9px] font-bold"
                  style={{ background: 'var(--paper)', color: 'var(--ink)' }}
                >
                  X
                </span>
                POST ON X / TWITTER
              </span>
              <span>→</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowShare(true)}
          className="brutal-btn flex w-full items-center justify-between border-4 border-ink bg-accent-lime p-5 font-display text-xs uppercase tracking-[0.2em] shadow-[5px_5px_0_var(--ink)]"
          style={{ color: 'var(--ink-fixed)' }}
        >
          <span className="flex items-center">
            <BrutalIcon name="rocket" size={16} className="mr-2" /> SHARE BEST
            SCORE
          </span>
          <span className="text-xl">→</span>
        </button>
      )}
    </div>
  )
}

const MobileLayout: React.FC<MobileLayoutProps> = ({
  score,
  comboStreak,
  bestScore,
  gameSession,
  onOpenLeaderboard,
  onBack,
  canvasArea,
}) => (
  <div className={`flex w-full flex-col ${gameSession ? 'h-full overflow-hidden' : 'h-auto overflow-visible'}`}>
    {gameSession && (
      <>
        {/* ── Game chrome: back / status / pause ──────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b-4 border-ink bg-paper px-3 py-1.5">
          <button
            className="brutal-btn border-[3px] border-ink bg-paper p-1.5"
            style={{ boxShadow: '2px 2px 0 var(--ink)' }}
            onClick={onBack ?? (() => window.history.back())}
          >
            <BrutalIcon name="back" size={16} strokeWidth={3} />
          </button>

          <div
            className="flex items-center gap-2 border-[3px] border-ink px-3 py-1 font-display text-[10px] uppercase tracking-[0.18em]"
            style={{
              background: 'var(--accent-lime)',
              boxShadow: '2px 2px 0 var(--ink)',
              color: 'var(--ink-fixed)',
            }}
          >
            <div
              className="h-2 w-2 animate-pulse"
              style={{ background: 'var(--ink-fixed)', borderRadius: '50%' }}
            />
            ON-CHAIN
          </div>

          <button
            className="brutal-btn border-[3px] border-ink bg-paper p-1.5"
            style={{ boxShadow: '2px 2px 0 var(--ink)' }}
          >
            <BrutalIcon name="pause" size={16} strokeWidth={3} />
          </button>
        </div>

        {/* ── Compact score + tension bar ──────────────────────────── */}
        <div className="shrink-0">
          <ScoreBar
            score={score}
            comboStreak={comboStreak}
            bestScore={bestScore}
            compact
          />
        </div>
      </>
    )}

    {/* ── Canvas fills all remaining vertical space ────────────────── */}
    <div
      className={`min-h-0 flex-1 ${gameSession ? 'overflow-hidden' : 'mx-auto max-w-[400px] px-4 pt-4'}`}
    >
      {canvasArea}
    </div>
  </div>
)

interface DesktopLayoutProps {
  score: number
  comboStreak: number
  gameSession: any
  bestScore?: number
  onOpenLeaderboard?: () => void
  canvasArea: React.ReactNode
}

const DesktopLayout: React.FC<DesktopLayoutProps> = ({
  score,
  comboStreak,
  gameSession,
  bestScore,
  onOpenLeaderboard,
  canvasArea,
}) => (
  <div className="min-h-screen bg-paper">
    <div
      className="mx-auto grid w-full max-w-[1600px] items-start px-10 py-6"
      style={{
        gridTemplateColumns: '280px minmax(600px, 1fr) 280px',
        gap: 40,
        paddingTop: 124,
      }}
    >
      <div className="col-[1/-1]">
        <ClassicTabStrip onOpenLeaderboard={onOpenLeaderboard} />
      </div>

      <LeftRail
        score={score}
        comboStreak={comboStreak}
        gameSession={gameSession}
      />

      <div
        className="w-full"
        style={
          gameSession
            ? { height: 'calc(100vh - 240px)', minHeight: 520 }
            : undefined
        }
      >
        {canvasArea}
      </div>

      <RightRail
        score={score}
        gameSession={gameSession}
        bestScore={bestScore}
      />
    </div>
  </div>
)

export default GameScreen
