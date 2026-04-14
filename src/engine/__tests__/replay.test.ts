import { describe, it, expect } from 'vitest'
import { packMoves, unpackMoves, buildProof } from '../replay'
import { GameSession } from '../game'
import type { MoveRecord } from '../game'

describe('Replay Proof Builder', () => {
  it('should pack and unpack moves losslessly', () => {
    const mockMoves: MoveRecord[] = [
      { pieceIndex: 0, row: 0, col: 0, shapeId: 'S1', scoreEvent: {} as any },
      { pieceIndex: 1, row: 8, col: 8, shapeId: 'S1', scoreEvent: {} as any },
      { pieceIndex: 2, row: 4, col: 5, shapeId: 'S1', scoreEvent: {} as any },
    ]

    const packed = packMoves(mockMoves)
    expect(packed.length).toBe(1)
    
    const unpacked = unpackMoves(packed, mockMoves.length)
    expect(unpacked[0]).toEqual({ pieceIndex: 0, row: 0, col: 0 })
    expect(unpacked[1]).toEqual({ pieceIndex: 1, row: 8, col: 8 })
    expect(unpacked[2]).toEqual({ pieceIndex: 2, row: 4, col: 5 })
  })

  it('should handle many moves across multiple words', () => {
    const mockMoves: MoveRecord[] = []
    for (let i = 0; i < 60; i++) {
      mockMoves.push({
        pieceIndex: i % 3,
        row: i % 9,
        col: (i * 2) % 9,
        shapeId: 'S1',
        scoreEvent: {} as any
      })
    }

    const packed = packMoves(mockMoves)
    // 25 moves per word. 60 moves -> 2 full words (50) + 1 partial word (10). Total 3.
    expect(packed.length).toBe(3)
    
    const unpacked = unpackMoves(packed, mockMoves.length)
    expect(unpacked.length).toBe(60)
    for (let i = 0; i < 60; i++) {
      expect(unpacked[i].pieceIndex).toBe(i % 3)
      expect(unpacked[i].row).toBe(i % 9)
      expect(unpacked[i].col).toBe((i * 2) % 9)
    }
  })

  it('should build a valid proof from a session', () => {
    const session = new GameSession(123n)
    session.placePiece(0, 0, 0)
    
    const proof = buildProof(session)
    expect(proof.seed).toBe(123n)
    expect(proof.moveCount).toBe(1)
    expect(proof.packedMoves.length).toBe(1)
    expect(proof.finalScore).toBe(session.score)
    expect(proof.gridHash).toBe(Grid.gridHash(session.grid))
  })
})

import { Grid } from '../grid'
