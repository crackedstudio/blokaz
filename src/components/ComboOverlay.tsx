import React, { useEffect, useState } from 'react'

interface ComboOverlayProps {
  streak: number
  trigger: number
}

const FLOAT_PIECES = [
  { cells: [[0,0],[1,0],[2,0],[2,1]], color: '#FF3D3D', rot: '-20deg', top: '55%', left: '8%' },
  { cells: [[0,0],[0,1],[1,0],[1,1]], color: '#FF3BBD', rot: '25deg', top: '62%', right: '10%' },
  { cells: [[0,0],[0,1],[0,2]], color: '#29E6E6', rot: '15deg', top: '72%', left: '18%' },
  { cells: [[0,0],[0,1],[0,2]], color: '#8A3DFF', rot: '-12deg', top: '68%', right: '20%' },
]

export const ComboOverlay: React.FC<ComboOverlayProps> = ({ streak, trigger }) => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (trigger === 0) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 1300)
    return () => clearTimeout(t)
  }, [trigger])

  if (!visible || streak === 0) return null

  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
      {/* Sunburst */}
      <div
        className="absolute inset-0"
        style={{
          background: `conic-gradient(from 0deg at 50% 55%,
            var(--accent-yellow) 0deg 15deg, var(--paper) 15deg 30deg,
            var(--accent-yellow) 30deg 45deg, var(--paper) 45deg 60deg,
            var(--accent-yellow) 60deg 75deg, var(--paper) 75deg 90deg,
            var(--accent-yellow) 90deg 105deg, var(--paper) 105deg 120deg,
            var(--accent-yellow) 120deg 135deg, var(--paper) 135deg 150deg,
            var(--accent-yellow) 150deg 165deg, var(--paper) 165deg 180deg,
            var(--accent-yellow) 180deg 195deg, var(--paper) 195deg 210deg,
            var(--accent-yellow) 210deg 225deg, var(--paper) 225deg 240deg,
            var(--accent-yellow) 240deg 255deg, var(--paper) 255deg 270deg,
            var(--accent-yellow) 270deg 285deg, var(--paper) 285deg 300deg,
            var(--accent-yellow) 300deg 315deg, var(--paper) 315deg 330deg,
            var(--accent-yellow) 330deg 345deg, var(--paper) 345deg 360deg)`,
          animation: 'comboSunburst 1.2s ease-out forwards',
        }}
      />

      {/* COMBO! text */}
      <div
        className="absolute left-1/2 font-display text-danger text-center leading-none"
        style={{
          top: '28%',
          transform: 'translateX(-50%) rotate(-4deg)',
          fontSize: 80,
          WebkitTextStroke: '3px var(--ink)',
          textShadow: '6px 6px 0 var(--ink)',
          letterSpacing: '-0.04em',
          animation: 'comboText 1.2s cubic-bezier(0.34,1.56,0.64,1) forwards',
        }}
      >
        COMBO!
      </div>

      {/* ×N sticker */}
      <div
        className="absolute left-1/2 bg-accent-pink text-ink border-4 border-ink font-display text-center"
        style={{
          top: '50%',
          transform: 'translateX(-50%) rotate(3deg)',
          fontSize: 40,
          padding: '6px 20px',
          boxShadow: '5px 5px 0 var(--ink)',
          letterSpacing: '-0.02em',
          animation: 'comboMult 1.2s cubic-bezier(0.34,1.56,0.64,1) 0.12s forwards',
          opacity: 0,
        }}
      >
        ×{streak}
      </div>

      {/* Floating piece confetti */}
      {FLOAT_PIECES.map((p, i) => {
        const rows = Math.max(...p.cells.map(c => c[0])) + 1
        const cols = Math.max(...p.cells.map(c => c[1])) + 1
        const sz = 12
        const grid: (string | null)[][] = Array(rows).fill(null).map(() => Array(cols).fill(null))
        p.cells.forEach(([r, c]) => { grid[r][c] = p.color })
        return (
          <div
            key={i}
            className="absolute"
            style={{
              top: p.top, left: (p as any).left, right: (p as any).right,
              transform: `rotate(${p.rot})`,
              animation: `floatUp 1s ease-out ${0.2 + i * 0.1}s forwards`,
              '--rot': p.rot,
            } as React.CSSProperties}
          >
            <div style={{ display: 'grid', gridTemplateRows: `repeat(${rows},${sz}px)`, gridTemplateColumns: `repeat(${cols},${sz}px)`, gap: 1 }}>
              {grid.flat().map((k, j) => k
                ? <div key={j} style={{ width: sz, height: sz, background: k, border: '1.5px solid var(--ink)', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 1, left: 1, right: 1, height: '30%', background: 'rgba(255,255,255,0.45)' }} />
                  </div>
                : <div key={j} style={{ width: sz, height: sz }} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
