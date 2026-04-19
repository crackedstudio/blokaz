import { Grid } from './grid'
import { SHAPES } from './shapes'
import type { ShapeDefinition } from './shapes'
import { DeterministicRNG, dealThree } from './rng'
import { calculateScore } from './scoring'
import type { ScoreEvent } from './scoring'

export interface MoveRecord {
  pieceIndex: number
  shapeId: string
  row: number
  col: number
  scoreEvent: ScoreEvent
}

export interface PlaceResult {
  success: boolean
  error?: string
  scoreEvent?: ScoreEvent
  linesCleared?: { rows: number[]; cols: number[] }
  isGameOver: boolean
}

export class GameSession {
  grid: Uint8Array
  score: number = 0
  comboStreak: number = 0
  currentPieces: (ShapeDefinition | null)[] = [null, null, null]
  piecesPlaced: number = 0
  moveHistory: MoveRecord[] = []
  isGameOver: boolean = false
  dealCount: number = 0
  seed: bigint

  private rng: DeterministicRNG

  constructor(seed: bigint) {
    this.seed = seed
    this.rng = new DeterministicRNG(seed)
    this.grid = Grid.createGrid()
    this.deal()
  }

  deal(): void {
    const trio = dealThree(this.rng, SHAPES)
    this.currentPieces = [...trio]
    this.piecesPlaced = 0
    this.dealCount++

    // Check if any of the new pieces can be placed
    if (!Grid.canPlaceAny(this.grid, trio)) {
      this.isGameOver = true
    }
  }

  placePiece(pieceIndex: number, row: number, col: number): PlaceResult {
    if (this.isGameOver) {
      return { success: false, error: 'Game is over', isGameOver: true }
    }

    if (pieceIndex < 0 || pieceIndex > 2) {
      return { success: false, error: 'Invalid piece index', isGameOver: false }
    }

    const piece = this.currentPieces[pieceIndex]
    if (!piece) {
      return {
        success: false,
        error: 'Piece already placed',
        isGameOver: false,
      }
    }

    if (!Grid.canPlace(this.grid, piece, row, col)) {
      return { success: false, error: 'Invalid placement', isGameOver: false }
    }

    // Assign the color ID defined in the shape definition
    const colorId = piece.colorId

    Grid.placeShape(this.grid, piece, row, col, colorId)

    const fullLines = Grid.findFullLines(this.grid)
    const { cellsCleared } = Grid.clearLines(
      this.grid,
      fullLines.rows,
      fullLines.cols
    )

    const scoreEvent = calculateScore(
      piece,
      fullLines.rows.length + fullLines.cols.length,
      this.comboStreak
    )

    this.score += scoreEvent.totalPoints
    this.comboStreak = scoreEvent.newComboStreak
    this.currentPieces[pieceIndex] = null
    this.piecesPlaced++

    this.moveHistory.push({
      pieceIndex,
      shapeId: piece.id,
      row,
      col,
      scoreEvent,
    })

    // If all pieces placed, deal new ones
    if (this.piecesPlaced === 3) {
      this.deal()
    } else {
      // Check if any remaining pieces can be placed
      const remainingPieces = this.currentPieces.filter(
        (p): p is ShapeDefinition => p !== null
      )
      if (!Grid.canPlaceAny(this.grid, remainingPieces)) {
        this.isGameOver = true
      }
    }

    return {
      success: true,
      scoreEvent,
      linesCleared: fullLines,
      isGameOver: this.isGameOver,
    }
  }
}
