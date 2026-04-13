import React from 'react'

interface GameOverModalProps {
  score: number
  onPlayAgain: () => void
}

const GameOverModal: React.FC<GameOverModalProps> = ({ score, onPlayAgain }) => {
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
          className="w-full bg-[#aa3bff] hover:bg-[#9b2ef0] active:scale-95 text-white font-bold py-3 rounded-xl transition-all mb-3"
        >
          Play Again
        </button>
        <button
          disabled
          className="w-full bg-white/5 text-gray-600 font-bold py-3 rounded-xl cursor-not-allowed"
          title="Coming in Phase 4"
        >
          Submit Score
        </button>
      </div>
    </div>
  )
}

export default GameOverModal
