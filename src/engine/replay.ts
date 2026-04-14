import { GameSession } from './game'
import type { MoveRecord } from './game'
import { Grid } from './grid'

/**
 * Packs moves into 10-bit chunks (2 bit index, 4 bit row, 4 bit col)
 * 25 moves per 256-bit word (250 bits used)
 */
export function packMoves(moves: MoveRecord[]): bigint[] {
  const packed: bigint[] = []
  let currentWord = 0n
  let movesInWord = 0

  for (const move of moves) {
    if (movesInWord === 25) {
      packed.push(currentWord)
      currentWord = 0n
      movesInWord = 0
    }

    // move bits: [index: 2][row: 4][col: 4]
    const moveBits =
      (BigInt(move.pieceIndex) << 8n) |
      (BigInt(move.row) << 4n) |
      BigInt(move.col)

    currentWord |= moveBits << BigInt(movesInWord * 10)
    movesInWord++
  }

  // Push last word if not empty
  if (movesInWord > 0) {
    packed.push(currentWord)
  }

  return packed
}

export function unpackMoves(
  packed: bigint[],
  moveCount: number
): { pieceIndex: number; row: number; col: number }[] {
  const moves: { pieceIndex: number; row: number; col: number }[] = []
  let movesProcessed = 0

  for (const word of packed) {
    for (let i = 0; i < 25; i++) {
      if (movesProcessed >= moveCount) break

      const moveBits = (word >> BigInt(i * 10)) & 0x3ffn
      const pieceIndex = Number((moveBits >> 8n) & 0x3n)
      const row = Number((moveBits >> 4n) & 0xfn)
      const col = Number(moveBits & 0xfn)

      moves.push({ pieceIndex, row, col })
      movesProcessed++
    }
  }

  return moves
}

export interface GameProof {
  seed: bigint
  packedMoves: bigint[]
  moveCount: number
  finalScore: number
  gridHash: string
}

export function buildProof(session: GameSession): GameProof {
  return {
    seed: session.seed,
    packedMoves: packMoves(session.moveHistory),
    moveCount: session.moveHistory.length,
    finalScore: session.score,
    gridHash: Grid.gridHash(session.grid),
  }
}
