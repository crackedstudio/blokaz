import React, { useEffect, useRef, useState } from 'react'
import { BrutalIcon } from './BrutalIcon'

interface ScoreBarProps {
  score: number
  comboStreak: number
  bestScore?: number
  tournamentId?: bigint | null
  compact?: boolean
}

const TensionBar: React.FC<{
  comboStreak: number
  accentColor: string
  dark?: boolean
}> = ({ comboStreak, accentColor, dark = false }) => {
  const tensionPct = comboStreak > 0 ? Math.min(100, comboStreak * 20 + 30) : 28
  const tensionActive = comboStreak >= 4

  return (
    <div className="flex items-center gap-2 px-4 pb-4">
      <div
        className="flex items-center gap-1 font-display text-[9px] tracking-[0.14em]"
        style={{ color: 'var(--paper)', whiteSpace: 'nowrap' }}
      >
        <BrutalIcon name="zap" size={10} strokeWidth={2} /> NEXT CLEAR
      </div>
      <div
        className="relative h-[18px] flex-1 overflow-hidden border-[3px]"
        style={{ borderColor: 'var(--paper)' }}
      >
        <div
          className={`absolute inset-y-0 left-0 ${tensionActive ? 'tension-fill-strobe' : 'tension-fill'}`}
          style={{
            width: `${tensionPct}%`,
            transition: 'width 200ms linear',
            backgroundImage: `repeating-linear-gradient(45deg, ${accentColor}, ${accentColor} 4px, #FF7A1A 4px 8px)`,
          }}
        />
      </div>
      <div
        className="font-display text-[9px] tracking-[0.12em]"
        style={{ color: 'var(--paper)', whiteSpace: 'nowrap' }}
      >
        ×{comboStreak + 1} NEXT
      </div>
    </div>
  )
}

const ScoreBar: React.FC<ScoreBarProps> = ({
  score,
  comboStreak,
  bestScore,
  tournamentId,
  compact = false,
}) => {
  const isTournament = tournamentId !== null && tournamentId !== undefined
  const prevScore = useRef(score)
  const [flashKey, setFlashKey] = useState(0)

  useEffect(() => {
    if (score !== prevScore.current) {
      prevScore.current = score
      setFlashKey((k) => k + 1)
    }
  }, [score])

  const accentColor = isTournament ? 'var(--accent-cyan)' : 'var(--accent-purple)'
  const textColor = 'var(--paper)'
  const barBg = 'var(--ink)'
  const vPad = compact ? 'py-3' : 'py-6'
  const hPad = compact ? 'px-4' : 'px-6'

  return (
    <div className="border-b-4 border-ink" style={{ background: barBg }}>
      <div className={`flex items-center justify-between ${hPad} ${vPad}`}>
        {/* Left: Score */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1 font-display text-[10px] uppercase tracking-[0.2em] text-accent-yellow">
            <BrutalIcon name="star" size={10} strokeWidth={2} /> SCORE
          </div>
          <div
            key={flashKey}
            className="score-flash font-display tabular-nums"
            style={{
              color: textColor,
              fontSize: compact ? 'clamp(1.6rem, 6vw, 2.2rem)' : 'clamp(2.5rem, 8vw, 3.5rem)',
              letterSpacing: '-0.04em',
              lineHeight: 0.9,
              marginTop: 2,
            }}
          >
            {score.toLocaleString()}
          </div>
        </div>

        {/* Center: Combo Sticker */}
        <div className="flex items-center justify-center">
          {comboStreak > 0 && (
            <div
              className="brutal-sticker px-3 py-1.5"
              style={{ transform: 'rotate(-5deg) scale(1.05)', zIndex: 20 }}
            >
              <div className="font-display text-[9px] tracking-[0.2em] uppercase" style={{ color: 'white' }}>COMBO</div>
              <div className={`font-display leading-none ${compact ? 'text-xl' : 'text-2xl'}`} style={{ letterSpacing: '-0.02em' }}>
                ×{comboStreak}
              </div>
            </div>
          )}
        </div>

        {/* Right: Best */}
        <div className="flex flex-col items-end text-right">
          <div className="flex items-center gap-1 font-display text-[10px] uppercase tracking-[0.2em] text-accent-yellow">
            BEST <BrutalIcon name="crown" size={10} strokeWidth={2} />
          </div>
          <div
            className="font-display tabular-nums"
            style={{
              color: textColor,
              fontSize: compact ? 'clamp(1.2rem, 4vw, 1.6rem)' : 'clamp(1.5rem, 5vw, 2rem)',
              letterSpacing: '-0.04em',
              lineHeight: 0.9,
              marginTop: 2,
            }}
          >
            {bestScore != null ? bestScore.toLocaleString() : score > 0 ? score.toLocaleString() : '—'}
          </div>
        </div>
      </div>

      <TensionBar
        comboStreak={comboStreak}
        accentColor={accentColor}
        dark={true}
      />
    </div>
  )
}

export default ScoreBar
