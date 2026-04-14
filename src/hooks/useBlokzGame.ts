import { 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt, 
  useAccount 
} from 'wagmi'
import { keccak256, encodePacked, toHex } from 'viem'
import { BLOKZ_GAME_ABI } from '../constants/abi'
import contractInfo from '../contract.json'

const CONTRACT_ADDRESS = contractInfo.address as `0x${string}`

/**
 * Utility to generate a random 32-byte seed and its hash.
 */
export function generateGameSeed() {
  const seed = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const hash = keccak256(seed)
  return { seed, hash }
}

// ────────────────────────────────────────────────────────── Read Hooks ──

/**
 * Hook to get the current leaderboard for a specific epoch.
 */
export function useLeaderboard(epoch?: bigint) {
  const { data: currentEpoch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'getCurrentEpoch',
  })

  const { data: leaderboard, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'getLeaderboard',
    args: [epoch ?? currentEpoch ?? 0n],
  })

  return { leaderboard, isLoading, currentEpoch, refetch }
}

/**
 * Hook to check if a player has an active game.
 */
export function useActiveGame(address?: `0x${string}`) {
  const { data: gameId, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'activeGame',
    args: address ? [address] : undefined,
  })

  return { gameId, isLoading }
}

/**
 * Hook to get specific tournament details.
 */
export function useTournament(tournamentId: bigint) {
  const { data: tournament, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'tournaments',
    args: [tournamentId],
  })

  return { tournament, isLoading }
}

// ───────────────────────────────────────────────────────── Write Hooks ──

/**
 * Hook to start a new game session on-chain.
 */
export function useStartGame() {
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const startGame = (seedHash: `0x${string}`) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: BLOKZ_GAME_ABI,
      functionName: 'startGame',
      args: [seedHash],
    })
  }

  return { startGame, hash, isPending, isConfirming, isSuccess, error }
}

/**
 * Hook to submit a game score and update the leaderboard.
 */
export function useSubmitScore() {
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const submitScore = (
    gameId: bigint,
    seed: `0x${string}`,
    packedMoves: readonly bigint[],
    score: number,
    moveCount: number
  ) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: BLOKZ_GAME_ABI,
      functionName: 'submitScore',
      args: [gameId, seed, packedMoves, score, moveCount],
    })
  }

  return { submitScore, hash, isPending, isConfirming, isSuccess, error }
}

/**
 * Hook to join a tournament by paying the entry fee.
 */
export function useJoinTournament() {
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const joinTournament = (tournamentId: bigint) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: BLOKZ_GAME_ABI,
      functionName: 'joinTournament',
      args: [tournamentId],
    })
  }

  return { joinTournament, hash, isPending, isConfirming, isSuccess, error }
}

/**
 * Hook to submit a tournament-specific score.
 */
export function useSubmitTournamentScore() {
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const submitTournamentScore = (
    tournamentId: bigint,
    gameId: bigint,
    seed: `0x${string}`,
    packedMoves: readonly bigint[],
    score: number,
    moveCount: number
  ) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: BLOKZ_GAME_ABI,
      functionName: 'submitTournamentScore',
      args: [tournamentId, gameId, seed, packedMoves, score, moveCount],
    })
  }

  return { submitTournamentScore, hash, isPending, isConfirming, isSuccess, error }
}

/**
 * Hook to finalize a tournament (anyone can call this after endTime).
 */
export function useFinalizeTournament() {
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const finalizeTournament = (tournamentId: bigint) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: BLOKZ_GAME_ABI,
      functionName: 'finalizeTournament',
      args: [tournamentId],
    })
  }

  return { finalizeTournament, hash, isPending, isConfirming, isSuccess, error }
}

// ───────────────────────────────────────────────────────── Admin Hooks ──

export function useCreateTournament() {
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const createTournament = (fee: bigint, start: bigint, end: bigint, max: number) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: BLOKZ_GAME_ABI,
      functionName: 'createTournament',
      args: [fee, start, end, max],
    })
  }

  return { createTournament, hash, isPending, isConfirming, isSuccess, error }
}

export function useWithdrawRevenue() {
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const withdraw = () => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: BLOKZ_GAME_ABI,
      functionName: 'withdrawProtocolRevenue',
    })
  }

  return { withdraw, hash, isPending, isConfirming, isSuccess, error }
}
