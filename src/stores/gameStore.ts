import { create } from 'zustand'
import { GameSession } from '../engine/game'
import type { ShapeDefinition } from '../engine/shapes'

interface GameState {
  gameSession: GameSession | null
  score: number
  comboStreak: number
  currentPieces: (ShapeDefinition | null)[]
  isGameOver: boolean
  onChainGameId: bigint | null
  onChainSeed: `0x${string}` | null
  
  startGame: (seed: bigint) => void
  setOnChainData: (gameId: bigint, seed: `0x${string}`) => void
  placePiece: (index: number, r: number, c: number) => any
  resetGame: () => void
}

export const useGameStore = create<GameState>((set, get) => ({
  gameSession: null,
  score: 0,
  comboStreak: 0,
  currentPieces: [],
  isGameOver: false,
  onChainGameId: null,
  onChainSeed: null,

  startGame: (seed) => {
    const session = new GameSession(seed)
    // @ts-ignore
    window.currentPieces = session.currentPieces
    set({
      gameSession: session,
      score: 0,
      comboStreak: 0,
      currentPieces: session.currentPieces,
      isGameOver: false,
      onChainGameId: null,
      onChainSeed: null
    })
  },

  setOnChainData: (gameId, seed) => {
    set({ onChainGameId: gameId, onChainSeed: seed })
  },

  placePiece: (index, r, c) => {
    const { gameSession } = get()
    if (!gameSession) return null
    
    const result = gameSession.placePiece(index, r, c)
    if (result.success) {
      set({
        score: gameSession.score,
        comboStreak: gameSession.comboStreak,
        currentPieces: [...gameSession.currentPieces],
        isGameOver: result.isGameOver
      })
      // @ts-ignore
      window.currentPieces = gameSession.currentPieces
    }
    return result
  },

  resetGame: () => {
    get().startGame(BigInt(Date.now()))
  }
}))
