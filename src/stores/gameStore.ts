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
  onChainStatus: 'none' | 'pending' | 'syncing' | 'registered' | 'failed'
  tournamentId: bigint | null
  
  // GoodDollar Integration States
  gModeEnabled: boolean
  isWhitelisted: boolean
  isStreaming: boolean
  clearanceTurns: number

  startGame: (seed: bigint, preserveOnChain?: boolean) => void
  setOnChainData: (gameId: bigint, seed: `0x${string}`, status?: 'registered' | 'pending' | 'syncing' | 'failed') => void
  setOnChainGameId: (id: bigint) => void
  setOnChainSeed: (seed: `0x${string}`) => void
  setTournamentId: (id: bigint | null) => void
  setGModeEnabled: (enabled: boolean) => void
  setIsWhitelisted: (whitelisted: boolean) => void
  setIsStreaming: (streaming: boolean) => void
  setClearanceTurns: (turns: number) => void
  placePiece: (index: number, r: number, c: number) => any
  resetGame: () => void
  reviveGame: () => void
  forceReset: () => void
}

export const useGameStore = create<GameState>((set, get) => ({
  gameSession: null,
  score: 0,
  comboStreak: 0,
  currentPieces: [],
  isGameOver: false,
  onChainGameId: null,
  onChainSeed: null,
  onChainStatus: 'none',
  tournamentId: null,
  gModeEnabled: false,
  isWhitelisted: false,
  isStreaming: false,
  clearanceTurns: 0,

  startGame: (seed, preserveOnChain = false) => {
    const session = new GameSession(seed)
    // @ts-ignore
    window.currentPieces = session.currentPieces

    const updates: Partial<GameState> = {
      gameSession: session,
      score: 0,
      comboStreak: 0,
      currentPieces: session.currentPieces,
      isGameOver: false
    }

    if (!preserveOnChain) {
      updates.onChainGameId = null
      updates.onChainSeed = null
      updates.onChainStatus = 'none'
    }

    set(updates)
  },

  setOnChainData: (gameId, seed, status = 'registered') => {
    set({ onChainGameId: gameId, onChainSeed: seed, onChainStatus: status })
  },

  setOnChainGameId: (id) => set({ onChainGameId: id }),
  setOnChainSeed: (seed) => set({ onChainSeed: seed }),
  setTournamentId: (id) => set({ tournamentId: id }),
  setGModeEnabled: (enabled) => set({ gModeEnabled: enabled }),
  setIsWhitelisted: (whitelisted) => set({ isWhitelisted: whitelisted }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setClearanceTurns: (turns) => set({ clearanceTurns: turns }),

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
  },
  
  reviveGame: () => {
    const { gameSession, clearanceTurns } = get()
    if (!gameSession) return
    
    // Default turns to 3 if not set yet
    const turns = clearanceTurns > 0 ? clearanceTurns : 3
    gameSession.activateClearance(turns)
    
    set({
      isGameOver: false,
      currentPieces: [...gameSession.currentPieces],
      clearanceTurns: gameSession.clearanceTurns
    })
    
    // @ts-ignore
    window.currentPieces = gameSession.currentPieces
  },

  forceReset: (keepTournamentId = false) => {
    set({
      gameSession: null,
      score: 0,
      comboStreak: 0,
      currentPieces: [],
      isGameOver: false,
      onChainGameId: null,
      onChainSeed: null,
      onChainStatus: 'none',
      tournamentId: keepTournamentId ? get().tournamentId : null
    })
  },

}))
