import React from 'react'

interface ScoreBarProps {
  score: number
  comboStreak: number
}

const ScoreBar: React.FC<ScoreBarProps> = ({ score, comboStreak }) => {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Score</div>
        <div className="text-3xl font-black text-white tabular-nums">{score.toLocaleString()}</div>
      </div>
      {comboStreak > 0 && (
        <div className="flex items-center gap-1 bg-[#aa3bff]/20 border border-[#aa3bff]/40 rounded-lg px-3 py-1.5 animate-pulse">
          <span className="text-lg">🔥</span>
          <span className="text-[#aa3bff] font-black text-lg">x{comboStreak}</span>
        </div>
      )}
    </div>
  )
}

export default ScoreBar
