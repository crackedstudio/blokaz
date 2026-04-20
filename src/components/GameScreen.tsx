import React, { useEffect, useRef, useState } from 'react'
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
} from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import { keccak256, encodePacked } from 'viem'
import contractInfo from '../contract.json'
import {
  CLASSIC_SESSION_STORAGE_KEY,
  readStoredGameSession,
  writeStoredGameSession,
} from '../utils/gameSessionStorage'

const CONTRACT_ADDRESS = contractInfo.address as `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'


interface GameScreenProps {
  onOpenLeaderboard?: () => void
}

// ─── Desktop sidebar widgets ────────────────────────────────────────────────

// ─── Desktop sidebar widgets ────────────────────────────────────────────────

const DailyStreakPanel: React.FC = () => {
  const today = new Date().getDay()
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <div
      className="border-4 border-ink"
      style={{ background: 'var(--paper-2)', boxShadow: '4px 4px 0 var(--ink)' }}
    >
      <div className="flex items-center justify-between border-b-4 border-ink px-4 py-3" style={{ background: 'var(--accent-yellow)' }}>
        <div className="flex items-center font-display text-[10px] tracking-[0.16em] text-ink">
          <BrutalIcon name="flame" size={12} className="mr-2" /> DAILY STREAK
        </div>
        <div className="font-display text-sm text-ink">DAY 7</div>
      </div>
      <div className="px-4 py-3">
        <div className="mb-2 flex gap-1.5">
          {days.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="border-2 border-ink w-full"
                style={{
                  height: 18,
                  background: i < today ? 'var(--accent-lime)' : 'var(--rule)',
                }}
              />
              <span className="font-display text-[8px] text-ink/60">{d}</span>
            </div>
          ))}
        </div>
        <div className="font-body text-[10px] text-ink/70 uppercase tracking-[0.08em]">
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
      style={{ background: 'var(--paper-2)', boxShadow: '4px 4px 0 var(--ink)' }}
    >
      <div className="border-b-4 border-ink px-4 py-3 font-display text-[11px] tracking-[0.2em] uppercase bg-paper">
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
                className="border-2 border-ink px-2 py-0.5 font-display text-[9px] tracking-[0.1em] flex items-center gap-1.5"
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
                <span className="text-ink">{isLive ? 'LIVE' : danger.risk}</span>
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
      style={{ background: 'var(--paper-2)', boxShadow: '8px 8px 0 var(--ink)' }}
    >
      <div
        className="flex items-center justify-between border-b-4 border-ink px-4 py-3 font-display text-[11px] tracking-[0.14em]"
        style={{ background: 'var(--paper)' }}
      >
        <span className="flex items-center uppercase tracking-[0.2em]"><BrutalIcon name="trending" size={12} className="mr-2" /> WEEKLY LADDER</span>
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
            const isMe = entry.player.toLowerCase() === (address?.toLowerCase() ?? '')
            return (
              <div
                key={entry.player}
                className="flex items-center gap-2 border-b-2 border-ink px-3 py-2.5"
                style={{
                  background: isMe ? 'var(--accent-yellow)' : (i === 0 ? 'var(--accent-yellow)' : 'var(--paper-2)'),
                  color: (isMe || i === 0) ? 'var(--ink-fixed)' : 'inherit',
                }}
              >
                <span className="w-6 font-display text-sm">#{i + 1}</span>
                <span className="flex-1 truncate font-display text-xs">@{entry.player.slice(0, 8)}</span>
                <span className="font-display text-xs tabular-nums tracking-tighter">
                  {entry.score.toLocaleString()}
                </span>
              </div>
            )
          })}
          {userIdx > 2 && (
            <div className="flex items-center gap-2 border-b-2 border-ink px-3 py-2.5" style={{ background: 'var(--accent-cyan)' }}>
              <span className="w-6 font-display text-sm">#{userIdx + 1}</span>
              <span className="flex-1 font-display text-xs uppercase">YOU</span>
              <span className="font-display text-[9px] tabular-nums text-white border border-ink bg-ink px-1 ml-1">YOU</span>
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
    style={{ boxShadow: '6px 6px 0 var(--ink)' }}
  >
    <div className="flex items-center justify-between mb-4">
      <div className="font-display text-[10px] tracking-widest text-ink/80 uppercase">
        SHARE CARD
      </div>
      <div className="h-2 w-2 rounded-full bg-ink animate-pulse" />
    </div>
    
    <div className="border-4 border-ink bg-paper-2 p-5 shadow-[4px_4px_0_var(--ink)] relative overflow-hidden">
      {/* Decorative dots */}
      <div className="absolute -right-4 -top-4 opacity-10">
        <svg width="60" height="60" viewBox="0 0 60 60">
          <pattern id="dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="2" fill="var(--ink)" />
          </pattern>
          <rect x="0" y="0" width="60" height="60" fill="url(#dots)" />
        </svg>
      </div>

      <div
        className="font-display text-3xl tracking-tighter text-ink"
      >
        BLOKAZ.
      </div>
      <div className="mt-4 font-display text-[10px] tracking-widest text-ink/80 uppercase">
        CLASSIC RUN SCORE
      </div>
      <div
        className="mt-1 font-display leading-none text-accent-pink"
        style={{ fontSize: 'clamp(2.5rem, 4vw, 3.5rem)', letterSpacing: '-0.04em', WebkitTextStroke: '2px var(--ink)' }}
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
    className="border-4 border-ink p-3 flex flex-col justify-between"
    style={{ 
      background: bg, 
      boxShadow: '4px 4px 0 var(--ink)', 
      height: 74,
      color: (bg.includes('accent') && !bg.includes('pink') && !bg.includes('purple')) ? 'var(--ink-fixed)' : 'inherit'
    }}
  >
    <div className={`font-display text-[9px] tracking-[0.2em] uppercase ${(bg.includes('accent') && !bg.includes('pink') && !bg.includes('purple')) ? 'text-black/70' : 'text-ink/80'}`}>
      {label}
    </div>
    <div className="font-display text-2xl uppercase" style={{ letterSpacing: '-0.02em', lineHeight: 1 }}>
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

const GameScreen: React.FC<GameScreenProps> = ({ onOpenLeaderboard }) => {
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
    gameId: onChainActiveGameId,
    isLoading: isLoadingActiveGame,
    refetch: refetchActiveGame,
  } = useActiveGame(address)
  const {
    startGame: contractStartGame,
    isPending,
    isConfirming,
    isSuccess,
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
      CONTRACT_ADDRESS
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
        contractAddress: CONTRACT_ADDRESS,
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
  useEffect(() => {
    if (!isConnected && !gameSession) handleStartGame()
  }, [isConnected, gameSession])

  // Canvas init
  useEffect(() => {
    if (!canvasRef.current || !gameSession) return

    const canvas = canvasRef.current

    const vpFallback = Math.min(window.innerWidth - 32, Math.round(window.innerHeight * 0.75))

    const computeDims = (containerWidth: number) => {
      const gridSize = containerWidth > 0 ? containerWidth : vpFallback
      const cellSize = gridSize / 9
      const trayGap = Math.round(cellSize * 0.5)
      const trayHeight = Math.round(gridSize / 3)
      const trayY = gridSize + trayGap
      return { gridSize, cellSize, trayGap, trayHeight, trayY }
    }

    const initialW = boardContainerRef.current?.clientWidth || 0
    const init = computeDims(initialW)

    canvas.width = init.gridSize
    canvas.height = init.gridSize + init.trayGap + init.trayHeight
    canvas.style.width = `${init.gridSize}px`
    canvas.style.height = `${canvas.height}px`
    canvas.style.background = 'transparent'

    setCanvasDims({ gridSize: init.gridSize, trayY: init.trayY, trayH: init.trayHeight })
    cellSizeRef.current = init.cellSize

    const gridRenderer = new GridRenderer(canvas, init.gridSize)
    const pieceRenderer = new PieceRenderer(canvas, init.trayY, init.cellSize)
    const animManager = animManagerRef.current

    // ResizeObserver keeps canvas sized to container
    let ro: ResizeObserver | null = null
    if (boardContainerRef.current) {
      ro = new ResizeObserver(([entry]) => {
        const w = entry.contentRect.width
        if (w <= 0) return
        const d = computeDims(w)
        const totalH = d.gridSize + d.trayGap + d.trayHeight
        canvas.width = d.gridSize
        canvas.height = totalH
        canvas.style.width = `${d.gridSize}px`
        canvas.style.height = `${totalH}px`
        gridRenderer.resize(d.gridSize)
        pieceRenderer.resize(d.trayY, d.cellSize, d.gridSize)
        cellSizeRef.current = d.cellSize
        setCanvasDims({ gridSize: d.gridSize, trayY: d.trayY, trayH: d.trayHeight })
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
          : trayHoverIndexRef.current ?? undefined
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
    handleStartGame,
    isSyncingContract,
    sessionConflict,
    forceReset,
    setSessionConflict,
    onOpenLeaderboard,
  }

  const canvasArea = <CanvasArea {...commonCanvasProps} />

  if (isMobile) {
    return (
      <MobileLayout
        score={score}
        comboStreak={comboStreak}
        gameSession={gameSession}
        onOpenLeaderboard={onOpenLeaderboard}
        canvasArea={canvasArea}
      />
    )
  }

  return (
    <DesktopLayout
      score={score}
      comboStreak={comboStreak}
      gameSession={gameSession}
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
          color: 'var(--ink)',
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
          color: 'var(--ink)',
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
          color: 'var(--ink)',
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
  sessionConflict: boolean
  forceReset: () => void
  setSessionConflict: (v: boolean) => void
  onOpenLeaderboard?: () => void
}

const ClassicStartCard: React.FC<{
  isConnected: boolean
  handleStartGame: () => void
  isPending: boolean
  isConfirming: boolean
  isSyncingContract: boolean
  sessionConflict: boolean
  forceReset: () => void
  setSessionConflict: (v: boolean) => void
}> = ({
  isConnected,
  handleStartGame,
  isPending,
  isConfirming,
  isSyncingContract,
  sessionConflict,
  forceReset,
  setSessionConflict,
}) => (
  <div
    className="relative z-10 flex w-full flex-col gap-5 rounded-[6px] border-4 border-ink bg-paper px-7 py-8"
    style={{ boxShadow: '10px 10px 0 var(--accent-yellow)' }}
  >
    <div
      className="w-fit border-4 border-ink bg-accent-yellow px-6 py-2 font-display text-sm tracking-[0.15em]"
      style={{ boxShadow: '4px 4px 0 var(--ink)' }}
    >
      CLASSIC MODE
    </div>

    {/* Hero Image */}
    <div className="relative overflow-hidden border-4 border-ink bg-paper-2 shadow-[6px_6px_0_var(--ink)]">
      <img 
        src="/hero.png" 
        alt="Blokaz Game Preview" 
        className="w-full h-auto block"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/20 to-transparent pointer-events-none" />
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
        isPending || isConfirming || isSyncingContract || sessionConflict
      }
      className="brutal-btn flex w-full items-center justify-center gap-3 border-4 border-ink bg-accent-lime py-5 font-display text-sm tracking-[0.15em] uppercase shadow-[6px_6px_0_var(--ink)] disabled:opacity-70"
    >
      {isSyncingContract ? (
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

    {sessionConflict && (
      <div className="mt-6 border-4 border-danger bg-paper-2 p-4 shadow-[4px_4px_0_var(--ink)]">
        <div className="mb-2 flex items-center font-display text-xs tracking-widest text-piece-red uppercase">
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
          className="brutal-btn w-full border-[3px] border-ink bg-danger py-2 font-display text-[10px] tracking-widest text-white uppercase shadow-[3px_3px_0_var(--ink)]"
        >
          RESET SESSION
        </button>
      </div>
    )}

    <div className="flex items-center justify-center gap-2 text-center font-display text-[10px] tracking-widest opacity-70 uppercase">
      {isConnected
        ? <><BrutalIcon name="zap" size={10} strokeWidth={2} /> Score flows into the leaderboard automatically</>
        : <><BrutalIcon name="alert" size={10} strokeWidth={2} /> PRACTICE MODE — connect wallet for rewards</>}
    </div>
  </div>
)

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
  handleStartGame,
  isSyncingContract,
  sessionConflict,
  forceReset,
  setSessionConflict,
  onOpenLeaderboard,
}) => {
  if (!gameSession) {
    return (
      <ClassicStartCard
        isConnected={isConnected}
        handleStartGame={handleStartGame}
        isPending={isPending}
        isConfirming={isConfirming}
        isSyncingContract={isSyncingContract}
        sessionConflict={sessionConflict}
        forceReset={forceReset}
        setSessionConflict={setSessionConflict}
      />
    )
  }

  return (
    <div ref={boardContainerRef} className="w-full flex justify-center select-none">
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
              className="pointer-events-none absolute left-0 z-[1] grid grid-cols-3 border-[3px] border-ink bg-paper p-5"
              style={{
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
  gameSession: any
  onOpenLeaderboard?: () => void
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
    <span className="font-display text-[10px] tracking-[0.2em] opacity-60 uppercase">
      WEEKLY LEADERBOARD RUN
    </span>
    {onOpenLeaderboard && (
      <button
        onClick={onOpenLeaderboard}
        className="brutal-btn ml-auto border-4 border-ink px-4 py-2 font-display text-[10px] tracking-[0.1em]"
        style={{ background: 'var(--paper-2)', boxShadow: '4px 4px 0 var(--ink)' }}
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
          <div className="border-2 border-ink bg-accent-yellow px-2 py-1 font-display text-[11px] tracking-widest text-ink">
            +{Math.floor(score * 0.05)}
          </div>
        </div>
      )}
    </div>

    <div
      className="border-4 border-ink p-4"
      style={{ background: 'var(--paper-2)', boxShadow: '5px 5px 0 var(--ink)' }}
    >
      <div className="mb-3 font-display text-[10px] tracking-[0.2em] uppercase text-ink/70">
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
                  (sum: number, m: any) => sum + (m.scoreEvent?.linesCleared || 0),
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
}> = ({ score, gameSession }) => (
  <div className="flex w-full flex-col gap-5">
    <LiveLadder currentScore={score} />
    <DangerWatch currentPieces={gameSession?.currentPieces} />

    <button
      className="brutal-btn flex w-full items-center justify-between border-4 border-ink bg-accent-lime p-5 font-display text-xs tracking-[0.2em] shadow-[5px_5px_0_var(--ink)] uppercase"
    >
        <span className="flex items-center">
          <BrutalIcon name="rocket" size={16} className="mr-2" /> SHARE BEST SCORE
        </span>
        <span className="text-xl">→</span>
      </button>
  </div>
)

const MobileLayout: React.FC<MobileLayoutProps> = ({
  score,
  comboStreak,
  gameSession,
  onOpenLeaderboard,
  canvasArea,
}) => (
  <div className="min-h-screen bg-paper pt-[88px]">
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-6">
      {gameSession && (
        <>
          <div className="flex items-center justify-between py-3">
            <button
              className="brutal-btn border-4 border-ink bg-paper-2 p-2 shadow-[2px_2px_0_var(--ink)]"
              onClick={() => window.history.back()}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center gap-2 border-4 border-ink bg-accent-lime px-4 py-1.5 font-display text-[10px] tracking-[0.2em] shadow-[3px_3px_0_var(--ink)] uppercase">
              <div className="h-2 w-2 rounded-full bg-ink animate-pulse" />
              ON-CHAIN
            </div>

            <button className="brutal-btn border-4 border-ink bg-paper-2 p-2 shadow-[2px_2px_0_var(--ink)]">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              >
                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
              </svg>
            </button>
          </div>

          <ScoreBar score={score} comboStreak={comboStreak} />
        </>
      )}

      <ClassicTabStrip onOpenLeaderboard={onOpenLeaderboard} mobile />

      <div
        className={`w-full ${
          gameSession ? 'flex justify-center' : 'mx-auto max-w-[380px]'
        }`}
      >
        {canvasArea}
      </div>

      <LeftRail
        score={score}
        comboStreak={comboStreak}
        gameSession={gameSession}
      />
      <RightRail score={score} gameSession={gameSession} />
    </div>
  </div>
)

interface DesktopLayoutProps {
  score: number
  comboStreak: number
  gameSession: any
  onOpenLeaderboard?: () => void
  canvasArea: React.ReactNode
}

const DesktopLayout: React.FC<DesktopLayoutProps> = ({
  score,
  comboStreak,
  gameSession,
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

      <div className="w-full">
        {canvasArea}
      </div>

      <RightRail score={score} gameSession={gameSession} />
    </div>
  </div>
)

export default GameScreen
