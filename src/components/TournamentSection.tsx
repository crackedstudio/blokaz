import React, { useState, useEffect } from 'react'
import { 
  useTournamentCount, 
  useTournament, 
  useInTournament, 
  useUSDCAllowance, 
  useApproveUSDC, 
  useJoinTournament,
  useFinalizeTournament,
  USDC_DECIMALS
} from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import { formatUnits } from 'viem'
import { useGameStore } from '../stores/gameStore'

interface TournamentCardProps {
  id: bigint
  onStartMatch: (id: bigint) => void
}

const TournamentCard: React.FC<TournamentCardProps> = ({ id, onStartMatch }) => {
  const { address } = useAccount()
  const { tournament, isLoading: isLoadingDetails, refetch: refetchTournament } = useTournament(id)
  const { isIn, isLoading: isLoadingIn, refetch: refetchIn } = useInTournament(id, address)
  const { allowance, refetch: refetchAllowance } = useUSDCAllowance(address)
  
  const { approve, isPending: isApproving, isConfirming: isConfirmingApprove, isSuccess: isApproveSuccess, error: approveError } = useApproveUSDC()
  const { joinTournament, isPending: isJoining, isConfirming: isConfirmingJoin, isSuccess: isJoinSuccess, error: joinError } = useJoinTournament()
  const { finalizeTournament, isPending: isFinalizing, isSuccess: isFinalizeSuccess } = useFinalizeTournament()

  useEffect(() => {
    if (isApproveSuccess) refetchAllowance()
  }, [isApproveSuccess, refetchAllowance])

  useEffect(() => {
    if (isJoinSuccess) {
      refetchIn()
      refetchTournament()
    }
  }, [isJoinSuccess, refetchIn, refetchTournament])

  useEffect(() => {
    if (isFinalizeSuccess) {
      refetchTournament()
    }
  }, [isFinalizeSuccess, refetchTournament])

  if (isLoadingDetails || !tournament) {
    return <div className="h-32 bg-white/5 rounded-2xl animate-pulse" />
  }

  const [creator, entryFee, startTime, endTime, maxPlayers, playerCount, finalized, prizePool] = tournament as any
  
  const now = BigInt(Math.floor(Date.now() / 1000))
  const isStarted = now >= startTime
  const isEnded = now >= endTime
  const isFull = playerCount >= maxPlayers
  const needsApproval = allowance !== undefined && allowance < entryFee

  const formatTime = (ts: bigint) => new Date(Number(ts) * 1000).toLocaleDateString()
  const formatAmount = (amt: bigint) => formatUnits(amt, USDC_DECIMALS)

  const handleJoin = async () => {
    if (needsApproval) {
      approve(entryFee)
    } else {
      joinTournament(id)
    }
  }

  return (
    <div className={`p-5 rounded-2xl border transition-all duration-300 ${
      isEnded ? 'bg-black/20 border-white/5 opacity-60' : 'bg-white/5 border-white/10 hover:border-blue-500/30 shadow-lg'
    }`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="font-black text-lg tracking-tight">Tournament #{id.toString()}</h4>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
            Ends {formatTime(endTime)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-blue-400 font-black text-xl">{formatAmount(prizePool)} USDC</div>
          <p className="text-[10px] text-gray-600 uppercase font-bold">Prize Pool</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="p-3 bg-black/40 rounded-xl border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase tracking-tighter mb-1">Entry Fee</div>
          <div className="font-mono text-sm">{formatAmount(entryFee)} USDC</div>
        </div>
        <div className="p-3 bg-black/40 rounded-xl border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase tracking-tighter mb-1">Players</div>
          <div className="font-mono text-sm">{playerCount}/{maxPlayers}</div>
        </div>
      </div>

      {isIn ? (
        <div className="space-y-2">
          {!isEnded && isStarted && (
            <button 
              onClick={() => onStartMatch(id)}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 text-sm uppercase tracking-widest"
            >
              Start Tournament Match
            </button>
          )}
          {isEnded && !finalized && (
            <button 
              onClick={() => finalizeTournament(id)}
              disabled={isFinalizing}
              className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-black rounded-xl transition-all text-sm uppercase"
            >
              {isFinalizing ? 'Finalizing...' : 'Finalize & Distribute'}
            </button>
          )}
          {isEnded && finalized && (
            <div className="text-center py-2 bg-white/5 rounded-lg border border-white/5 text-[10px] text-gray-500 uppercase tracking-widest font-bold">
              Tournament Finalized
            </div>
          )}
          {!isEnded && !isStarted && (
            <div className="text-center py-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20 text-[10px] text-yellow-500 uppercase tracking-widest font-bold">
              Match Starts {formatTime(startTime)}
            </div>
          )}
        </div>
      ) : (
        <>
          <button 
            onClick={handleJoin}
            className="w-full py-3 bg-white text-black hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40 font-black rounded-xl transition-all active:scale-95 text-sm uppercase tracking-widest shadow-xl shadow-white/5"
            disabled={isEnded || isFull || isJoining || isApproving || isConfirmingApprove || isConfirmingJoin}
          >
            {isApproving || isConfirmingApprove ? 'Approving USDC...' :
             isJoining || isConfirmingJoin ? 'Joining...' :
             isFull ? 'Tournament Full' :
             needsApproval ? 'Approve USDC' : 'Join Tournament'}
          </button>

          {(approveError || joinError) && (
            <p className="mt-2 text-[10px] text-red-500 font-bold uppercase tracking-tight text-center bg-red-500/10 p-2 rounded-lg border border-red-500/20">
              {approveError?.message || joinError?.message || 'Transaction failed'}
            </p>
          )}
        </>
      )}
    </div>
  )
}

const TournamentSection: React.FC = () => {
  const { count, isLoading } = useTournamentCount()
  const { setTournamentId } = useGameStore()

  const handleStartMatch = (id: bigint) => {
    setTournamentId(id)
    // Implicitly navigate back to game screen to start the match
    window.location.hash = '#/'
  }

  return (
    <div className="p-4 space-y-4">
      <div className="mb-6">
        <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] mb-2">Available Contests</h3>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          Join premium tournaments with USDC entry fees. Perform at your best to win a share of the prize pool.
        </p>
      </div>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-white/5 rounded-2xl animate-pulse" />
          ))
        ) : count && count > 0n ? (
          Array.from({ length: Number(count) }).map((_, i) => (
            <TournamentCard 
              key={i} 
              id={BigInt(i)} 
              onStartMatch={handleStartMatch} 
            />
          ))
        ) : (
          <div className="text-center py-12 opacity-30">
            <div className="w-12 h-12 border-2 border-dashed border-white/20 rounded-full mx-auto flex items-center justify-center mb-4 text-xl">
              🏆
            </div>
            <p className="text-sm font-medium">No tournaments active</p>
            <p className="text-[10px] uppercase tracking-widest mt-1">Check back soon for new contests</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default TournamentSection
