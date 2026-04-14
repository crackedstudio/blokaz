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
import { hapticImpact, hapticNotification, hapticError } from '../miniapp/haptics'
import { useStartGame, generateGameSeed } from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'

const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRendererRef = useRef<GridRenderer | null>(null)
  const pieceRendererRef = useRef<PieceRenderer | null>(null)
  const touchControllerRef = useRef<TouchController | null>(null)
  const animManagerRef = useRef<AnimationManager>(new AnimationManager())
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  const { gameSession, score, comboStreak, isGameOver, startGame, setOnChainData, placePiece, resetGame } =
    useGameStore()

  // On-chain registration hook (unused until explicit integration)
  const { startGame: contractStartGame } = useStartGame()
  const [currentSeed, setCurrentSeed] = useState<{seed: `0x${string}`, hash: `0x${string}`} | null>(null)

  // 1. Initial Start (Local)
  useEffect(() => {
    const { seed, hash } = generateGameSeed()
    setCurrentSeed({ seed, hash })
    const localSeed = BigInt(hash.slice(0, 18)) 
    startGame(localSeed)
    setOnChainData(0n, seed) // Initial state
  }, [])

  // 2. Wallet Context
  const { address, isConnected } = useAccount()

  // Initialize canvas renderers whenever a new game session starts
  useEffect(() => {
    if (!canvasRef.current || !gameSession) return

    const canvas = canvasRef.current
    cancelAnimationFrame(rafRef.current)

    // Compute canvas dimensions from viewport
    const gridSize = Math.min(window.innerWidth - 32, window.innerHeight * 0.55)
    const cellSize = gridSize / 9
    // Tray is one "slot" tall (slotWidth = canvasWidth/3 = gridSize/3)
    const trayGap = Math.round(cellSize * 0.5)
    const trayHeight = Math.round(gridSize / 3)

    canvas.width = gridSize
    canvas.height = gridSize + trayGap + trayHeight
    canvas.style.width = `${gridSize}px`
    canvas.style.height = `${canvas.height}px`

    const trayY = gridSize + trayGap

    // Destroy previous touch controller
    touchControllerRef.current?.destroy()

    // Create renderers
    const gridRenderer = new GridRenderer(canvas, gridSize)
    const pieceRenderer = new PieceRenderer(canvas, trayY, cellSize)
    const animManager = animManagerRef.current
    gridRendererRef.current = gridRenderer
    pieceRendererRef.current = pieceRenderer

    const touchController = new TouchController(
      canvas,
      gridRenderer,
      pieceRenderer,
      // onPlace callback
      (pieceIndex: number, row: number, col: number) => {
        const result = placePiece(pieceIndex, row, col)
        if (!result?.success) {
          hapticError()
          return
        }

        hapticImpact()

        const linesCleared = result.linesCleared
        if (linesCleared && (linesCleared.rows.length > 0 || linesCleared.cols.length > 0)) {
          hapticNotification()
          animManager.trigger('LINE_CLEAR', {
            rows: linesCleared.rows,
            cols: linesCleared.cols,
          })
          if (result.scoreEvent && result.scoreEvent.newComboStreak > 0) {
            animManager.trigger('COMBO', { streak: result.scoreEvent.newComboStreak })
          }
        }

        if (result.scoreEvent && result.scoreEvent.totalPoints > 0) {
          // Position score fly-up near the center of the grid
          animManager.trigger('SCORE', {
            x: gridSize * 0.5,
            y: gridSize * 0.45,
            score: result.scoreEvent.totalPoints,
          })
        }
      },
      // canPlace callback — always reads from the live grid
      (shape: ShapeDefinition, row: number, col: number) =>
        Grid.canPlace(gameSession.grid, shape, row, col)
    )
    touchControllerRef.current = touchController

    // RAF render loop
    lastTimeRef.current = 0
    const render = (timestamp: number) => {
      const delta = lastTimeRef.current ? timestamp - lastTimeRef.current : 16
      lastTimeRef.current = timestamp
      animManager.update(delta)

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Build ghost cells from active drag state
      const ghost = (window as any).activeGhost as
        | { row: number; col: number; valid: boolean }
        | null
        | undefined
      const dragState = touchController.getDragState()
      let ghostCells: { row: number; col: number; valid: boolean }[] | undefined

      if (ghost && dragState.isDragging && dragState.dragIndex !== null) {
        const shape = gameSession.currentPieces[dragState.dragIndex]
        if (shape) {
          ghostCells = shape.cells
            .map(([dr, dc]) => ({
              row: ghost.row + dr,
              col: ghost.col + dc,
              valid: ghost.valid,
            }))
            .filter((cell) => cell.row >= 0 && cell.row < 9 && cell.col >= 0 && cell.col < 9)
        }
      }

      // Draw grid
      gridRenderer.draw(gameSession.grid, ghostCells)

      // Draw tray — hide the slot being dragged
      pieceRenderer.drawTray(
        gameSession.currentPieces,
        dragState.isDragging && dragState.dragIndex !== null ? dragState.dragIndex : undefined
      )

      // Draw the piece being dragged at cursor position
      if (dragState.isDragging && dragState.dragIndex !== null) {
        const shape = gameSession.currentPieces[dragState.dragIndex]
        if (shape) {
          pieceRenderer.drawDragging(shape, dragState.dragPos.x, dragState.dragPos.y, cellSize)
        }
      }

      // Draw animations on top
      animManager.draw(ctx, cellSize)

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafRef.current)
      touchController.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSession])

  const handlePlayAgain = () => {
    resetGame()
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0c] text-white select-none">
      <ScoreBar score={score} comboStreak={comboStreak} />
      <div className="flex-1 flex items-start justify-center pt-2">
        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{ touchAction: 'none', display: 'block' }}
          />
          {isGameOver && <GameOverModal score={score} onPlayAgain={handlePlayAgain} />}
        </div>
      </div>
    </div>
  )
}

export default GameScreen
