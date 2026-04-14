import React from 'react'
import { useSubmitScore, useActiveGame } from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import { packMoves } from '../engine/replay'
import { useGameStore } from '../stores/gameStore'

interface GameOverModalProps {
  score: number
  onPlayAgain: () => void
}

const GameOverModal: React.FC<GameOverModalProps> = ({ score, onPlayAgain }) => {
  const { address } = useAccount()
  const { gameId } = useActiveGame(address)
  const { gameSession, onChainSeed } = useGameStore()
  const { submitScore, isPending, isConfirming, isSuccess } = useSubmitScore()

  const handleSubmit = () => {
    if (!gameSession || !onChainSeed || gameId === undefined) return
    if (isPending || isConfirming || isSuccess) return

    const packed = packMoves(gameSession.moveHistory)
    submitScore(
      gameId ?? 0n,
      onChainSeed,
      packed,
      gameSession.score,
      gameSession.moveHistory.length
    )
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-lg z-50">
      <div className="bg-[#1a1b24] rounded-2xl border border-white/10 p-8 text-center w-72 shadow-2xl">
        <div className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-1">
          Game Over
        </div>
        <div className="text-gray-400 text-sm mb-2">Final Score</div>
        <div className="text-5xl font-black text-[#aa3bff] mb-6 tabular-nums">
          {score.toLocaleString()}
        </div>
        
        <button
          onClick={onPlayAgain}
          disabled={isPending || isConfirming}
          className="w-full bg-[#aa3bff] hover:bg-[#9b2ef0] active:scale-95 text-white font-bold py-3 rounded-xl transition-all mb-3 disabled:opacity-50"
        >
          {isSuccess ? 'Play Again' : 'Try Again'}
        </button>

        <button
          onClick={handleSubmit}
          disabled={!address || !gameId || isPending || isConfirming || isSuccess}
          className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isPending || isConfirming ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Submitting...
            </span>
          ) : isSuccess ? (
            '✓ Submitted'
          ) : (
            'Submit Score'
          )}
        </button>
        
        {!address && (
          <div className="mt-4 text-xs text-blue-400 font-medium">
            Connect wallet to save score
          </div>
        )}
        {address && !gameId && !isSuccess && (
          <div className="mt-4 text-xs text-gray-500">
            Waiting for game registration...
          </div>
        )}
      </div>
    </div>
  )
}

export default GameOverModal
