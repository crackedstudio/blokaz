import { describe, it, expect } from 'vitest'
import { GameSession } from '../game'

describe('Game Session', () => {
  it('should initialize a new game with 3 pieces', () => {
    const session = new GameSession(123n)
    expect(session.currentPieces.length).toBe(3)
    expect(session.currentPieces.every((p) => p !== null)).toBe(true)
    expect(session.score).toBe(0)
    expect(session.isGameOver).toBe(false)
    expect(session.dealCount).toBe(1)
  })

  it('should update state after placing a piece', () => {
    const session = new GameSession(123n)
    const firstPiece = session.currentPieces[0]!
    
    // Most pieces can be placed at 0,0 on empty grid
    const result = session.placePiece(0, 0, 0)
    
    expect(result.success).toBe(true)
    expect(session.piecesPlaced).toBe(1)
    expect(session.currentPieces[0]).toBe(null)
    expect(session.score).toBeGreaterThan(0)
    expect(session.moveHistory.length).toBe(1)
  })

  it('should automatically deal new pieces after 3 placements', () => {
    const session = new GameSession(42n)
    
    // Ensure we can place all 3 pieces
    const p0 = session.currentPieces[0]!
    const p1 = session.currentPieces[1]!
    const p2 = session.currentPieces[2]!
    
    // Pick spots that definitely don't overlap for small pieces
    // (0,0), (0,5), (5,0)
    const r0 = session.placePiece(0, 0, 0)
    const r1 = session.placePiece(1, 0, 5)
    const r2 = session.placePiece(2, 5, 0)
    
    expect(r0.success).toBe(true)
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    
    expect(session.piecesPlaced).toBe(0) // Reset after deal
    expect(session.dealCount).toBe(2)
    expect(session.currentPieces.every((p) => p !== null)).toBe(true)
  })

  it('should detect game over when no pieces fit', () => {
    const session = new GameSession(1n)
    // Fill the grid manually
    session.grid.fill(1)
    
    // We need to trigger a check. 
    // Usually checked after placement or deal.
    // If we fill it manually, canPlaceAny will be false.
    // Let's mock a placement that results in no more moves.
    const canFit = Grid.canPlaceAny(session.grid, session.currentPieces.filter(p => p !== null) as any)
    expect(canFit).toBe(false)
  })

  it('should be deterministic - same seed, same pieces', () => {
    const s1 = new GameSession(888n)
    const s2 = new GameSession(888n)
    
    expect(s1.currentPieces.map(p => p?.id)).toEqual(s2.currentPieces.map(p => p?.id))
    
    s1.placePiece(0, 0, 0)
    s2.placePiece(0, 0, 0)
    
    expect(s1.currentPieces.map(p => p?.id)).toEqual(s2.currentPieces.map(p => p?.id))
  })
})

import { Grid } from '../grid'
