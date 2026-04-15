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
const USDC_ADDRESS = '0x01C5C0122039549AD1493B8220cABEdD739BC44E' as const
export const USDC_DECIMALS = 6

const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable'
  }
] as const


/**
 * Utility to generate a random 32-byte seed and its hash.
 * The hash includes the player's address to match the contract's verification logic.
 */
export function generateGameSeed(playerAddress: `0x${string}`) {
  const seed = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const hash = keccak256(encodePacked(['bytes32', 'address'], [seed as `0x${string}`, playerAddress]))
  return { seed, hash }
}

// ────────────────────────────────────────────────────────── Read Hooks ──

/**
 * Hook to get the current leaderboard for a specific epoch.
 */
export function useLeaderboard(epoch?: bigint) {
  const { data: currentEpoch, isLoading: isLoadingEpoch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'getCurrentEpoch',
  })

  // Only query the leaderboard if we have an epoch to query
  const targetEpoch = epoch ?? currentEpoch

  const { data: leaderboard, isLoading: isLoadingBoard, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'getLeaderboard',
    args: targetEpoch !== undefined ? [targetEpoch] : undefined,
    query: {
      enabled: targetEpoch !== undefined
    }
  })

  return { 
    leaderboard, 
    isLoading: isLoadingEpoch || isLoadingBoard, 
    currentEpoch, 
    refetch 
  }
}

/**
 * Hook to check if a player has an active game.
 */
export function useActiveGame(address?: `0x${string}`) {
  const { data: gameId, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'activeGame',
    args: address ? [address] : undefined,
  })

  return { gameId, isLoading, refetch }
}

/**
 * Hook to get specific tournament details.
 */
export function useTournament(tournamentId: bigint) {
  const { data: tournament, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'tournaments',
    args: [tournamentId],
  })

  return { tournament, isLoading, refetch }
}

/**
 * Hook to get the total number of tournaments created.
 */
export function useTournamentCount() {
  const { data: count, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'nextTournamentId',
  })

  return { count: count as bigint | undefined, isLoading }
}

/**
 * Hook to check if a player is joined in a specific tournament.
 */
export function useInTournament(tournamentId: bigint, playerAddress?: `0x${string}`) {
  const { data: isIn, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'inTournament',
    args: playerAddress ? [tournamentId, playerAddress] : undefined,
  })

  return { isIn: isIn as boolean | undefined, isLoading, refetch }
}

/**
 * Hook to check USDC allowance for the BlokzGame contract.
 */
export function useUSDCAllowance(ownerAddress?: `0x${string}`) {
  const { data: allowance, isLoading, refetch } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: ownerAddress ? [ownerAddress, CONTRACT_ADDRESS] : undefined,
  })

  return { allowance: allowance as bigint | undefined, isLoading, refetch }
}


/**
 * Hook to get a player's registered username.
 */
export function useUsername(address?: `0x${string}`) {
  const { data: username, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'usernames',
    args: address ? [address] : undefined,
  })

  return { username: username as string | undefined, isLoading, refetch }
}


/**
 * Hook to get the contract owner address.
 */
export function useOwner() {
  const { data: owner, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'owner',
  })

  return { owner: owner as `0x${string}` | undefined, isLoading }
}

/**
 * Hook to get the accumulated protocol revenue.
 */
export function useProtocolRevenue() {
  const { data: revenue, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: BLOKZ_GAME_ABI,
    functionName: 'protocolRevenue',
  })

  return { revenue: revenue as bigint | undefined, isLoading, refetch }
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

/**
 * Hook to register or update a player's username.
 */
export function useSetUsername() {
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const setUsername = (name: string) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: BLOKZ_GAME_ABI,
      functionName: 'setUsername',
      args: [name],
    })
  }

  return { setUsername, hash, isPending, isConfirming, isSuccess, error }
}

/**
 * Hook to approve USDC spending for the BlokzGame contract.
 */
export function useApproveUSDC() {
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const approve = (amount: bigint) => {
    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, amount],
    })
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error }
}


