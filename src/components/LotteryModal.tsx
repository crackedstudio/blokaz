/**
 * LotteryModal — slot-reel lottery overlay.
 *
 * UX flow:
 *   idle (user sees reel + SPIN button)
 *   → spinning (2 s, user-triggered)
 *   → decel (0.9 s)
 *   → revealed (prize shown, TAP TO CONTINUE)
 *   → onContinue()
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Prize } from '../utils/lottery'
import { PRIZES, getDailySpinsRemaining, MAX_DAILY_SPINS } from '../utils/lottery'
import { audioEngine } from '../audio/AudioEngine'

// ─── Design tokens ────────────────────────────────────────────────────────────
const INK   = '#0C0C10'
const PAPER = '#F5EFE3'
const LIME  = '#B7FF3B'
const YELLOW = '#FFD51F'
const RED   = '#FF3D3D'

// ─── Types ────────────────────────────────────────────────────────────────────
type SpinPhase = 'idle' | 'spinning' | 'decel' | 'revealed'

export interface LotteryModalProps {
  prize: Prize
  threshold: number
  onContinue: () => void
}

const sh = (x = 6, y = 6, c = INK) => `${x}px ${y}px 0 ${c}`

// ─── GlyphTile ────────────────────────────────────────────────────────────────
const GlyphTile: React.FC<{ glyph: string; fg: string; bg: string; size?: number }> = ({
  glyph, fg, bg, size = 48,
}) => (
  <div style={{
    width: size, height: size, background: INK, color: bg,
    border: `2.5px solid ${fg}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: '"Archivo Black", system-ui',
    fontSize: glyph.length > 2 ? Math.round(size * 0.3) : Math.round(size * 0.44),
    letterSpacing: '-0.04em', lineHeight: 1, flexShrink: 0,
  }}>
    {glyph}
  </div>
)

// ─── ReelCard ─────────────────────────────────────────────────────────────────
const ReelCard: React.FC<{ prize: Prize; size: number; highlighted?: boolean }> = ({
  prize, size, highlighted = false,
}) => (
  <div style={{
    width: size, height: size,
    background: prize.bg, color: prize.fg,
    border: '4px solid #0C0C10',
    boxShadow: highlighted ? sh(7, 7, prize.accent) : sh(4, 4),
    padding: 8, flexShrink: 0,
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    transform: highlighted ? 'translateY(-3px)' : 'none',
    transition: 'transform 100ms ease-out, box-shadow 100ms ease-out',
    fontFamily: '"Archivo Black", system-ui',
  }}>
    <div style={{
      fontSize: prize.glyph.length > 2 ? Math.round(size * 0.28) : Math.round(size * 0.42),
      lineHeight: 1, letterSpacing: '-0.04em', textAlign: 'center', flex: 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {prize.glyph}
    </div>
    <div style={{
      fontSize: 8, letterSpacing: '0.14em', textAlign: 'center',
      background: prize.fg, color: prize.bg, padding: '2px 3px',
    }}>
      {prize.name}
    </div>
  </div>
)

// ─── PrizeReel ────────────────────────────────────────────────────────────────
const COPIES   = 20
const CARD_GAP = 10
// Phase timings and reel speeds. Shared by the animation and the reel audio —
// the clicks are derived from these, so changing a speed keeps them in sync.
const SPIN_MS        = 2000
const DECEL_MS       = 900
const SPIN_SPEED     = 2000   // px/s while spinning
const DECEL_SPEED    = 650    // px/s while slowing
const SPIN_CARD_SIZE = 108    // cardSize used for every non-revealed phase

const PrizeReel: React.FC<{
  phase: SpinPhase
  winningIdx: number
  width: number
  cardSize: number
}> = ({ phase, winningIdx, width, cardSize }) => {
  const stride = cardSize + CARD_GAP
  const center = width / 2 - cardSize / 2

  const strip: (Prize & { _key: string; _absIdx: number })[] = []
  for (let c = 0; c < COPIES; c++) {
    for (let i = 0; i < PRIZES.length; i++) {
      strip.push({ ...PRIZES[i], _key: `${c}-${i}`, _absIdx: c * PRIZES.length + i })
    }
  }

  const baseIdx       = Math.floor((COPIES * PRIZES.length) / 2)
  const stoppedOffset = center - (baseIdx + winningIdx) * stride

  const [offset, setOffset] = useState(stoppedOffset)

  useEffect(() => {
    if (phase === 'idle' || phase === 'revealed') {
      setOffset(stoppedOffset)
      return
    }
    const speed = phase === 'spinning' ? SPIN_SPEED : DECEL_SPEED
    const total = COPIES * PRIZES.length * stride
    let rafId: number
    const t0 = performance.now()

    const tick = (t: number) => {
      const dt = (t - t0) / 1000
      setOffset(-(dt * speed % total) + center)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [phase, winningIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const centeredAbsIdx = (phase === 'idle' || phase === 'revealed') ? baseIdx + winningIdx : -1

  return (
    <div style={{ position: 'relative', width, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* top pointer */}
      <div style={{
        width: 0, height: 0, marginBottom: 4,
        borderLeft: '12px solid transparent', borderRight: '12px solid transparent',
        borderTop: `16px solid ${YELLOW}`,
        filter: `drop-shadow(2px 2px 0 ${INK})`,
      }} />

      {/* reel window */}
      <div style={{
        width, height: cardSize + 20,
        background: INK,
        border: `3px solid ${PAPER}`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* spotlight band */}
        <div style={{
          position: 'absolute', left: center - 5, top: 0, bottom: 0,
          width: cardSize + 10,
          background: `repeating-linear-gradient(45deg, ${YELLOW}22, ${YELLOW}22 6px, transparent 6px, transparent 12px)`,
          borderLeft: `2px solid ${YELLOW}`,
          borderRight: `2px solid ${YELLOW}`,
        }} />

        {/* scrolling strip */}
        <div style={{
          position: 'absolute', top: 10,
          height: cardSize,
          display: 'flex', gap: CARD_GAP,
          transform: `translateX(${offset}px)`,
          willChange: 'transform',
        }}>
          {strip.map((p) => (
            <ReelCard
              key={p._key}
              prize={p}
              size={cardSize}
              highlighted={p._absIdx === centeredAbsIdx}
            />
          ))}
        </div>

        {/* motion vignette while spinning */}
        {(phase === 'spinning' || phase === 'decel') && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `linear-gradient(90deg, ${INK}cc 0%, transparent 10%, transparent 90%, ${INK}cc 100%)`,
          }} />
        )}

        {/* idle overlay — question-mark fog */}
        {phase === 'idle' && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `linear-gradient(90deg, ${INK}dd 0%, ${INK}44 25%, ${INK}44 75%, ${INK}dd 100%)`,
          }} />
        )}
      </div>

      {/* bottom pointer */}
      <div style={{
        width: 0, height: 0, marginTop: 4,
        borderLeft: '12px solid transparent', borderRight: '12px solid transparent',
        borderBottom: `16px solid ${YELLOW}`,
        filter: `drop-shadow(2px -2px 0 ${INK})`,
      }} />
    </div>
  )
}

// ─── SpinStatusBar ────────────────────────────────────────────────────────────
const SpinStatusBar: React.FC<{ phase: 'spinning' | 'decel' }> = ({ phase }) => (
  <div style={{
    width: '100%',
    background: PAPER, color: INK,
    border: '4px solid #0C0C10',
    boxShadow: sh(4, 4, YELLOW),
    padding: '7px 11px',
    display: 'flex', alignItems: 'center', gap: 10,
    fontFamily: '"Archivo Black", system-ui',
  }}>
    <div style={{
      width: 10, height: 10, background: RED,
      border: `2px solid ${INK}`, flexShrink: 0,
      animation: 'lotteryPulse 0.8s ease-in-out infinite',
    }} />
    <div style={{ fontSize: 13, letterSpacing: '-0.01em' }}>
      {phase === 'decel' ? 'STOPPING…' : 'SPINNING…'}
    </div>
    <div style={{
      flex: 1, height: 11, background: '#fff', border: `2px solid ${INK}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `repeating-linear-gradient(45deg, ${RED}, ${RED} 4px, #FF7A1A 4px, #FF7A1A 8px)`,
        width: phase === 'decel' ? '88%' : '50%',
        transition: 'width 400ms ease-out',
      }} />
    </div>
    <div style={{ fontSize: 9, letterSpacing: '0.16em', opacity: 0.65, flexShrink: 0 }}>
      5 REWARDS
    </div>
  </div>
)

// ─── BigPrizeReveal ───────────────────────────────────────────────────────────
const BigPrizeReveal: React.FC<{ prize: Prize; width: number }> = ({ prize, width }) => (
  <div style={{ width, position: 'relative', fontFamily: '"Archivo Black", system-ui' }}>
    <div style={{
      width: '100%', background: prize.bg, color: prize.fg,
      border: '4px solid #0C0C10', boxShadow: sh(8, 8, prize.accent),
      padding: 14, position: 'relative',
    }}>
      {/* hype sticker */}
      <div style={{
        position: 'absolute', top: -13, right: -8,
        background: prize.accent === INK ? PAPER : prize.accent,
        color: INK, border: '4px solid #0C0C10', boxShadow: sh(3, 3),
        padding: '3px 9px', fontSize: 10, letterSpacing: '0.14em',
        transform: 'rotate(6deg)',
      }}>
        {prize.hype}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <GlyphTile glyph={prize.glyph} fg={prize.fg} bg={prize.bg} size={66} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.16em', opacity: 0.65 }}>YOU WON</div>
          <div style={{ fontSize: 22, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 2 }}>
            {prize.name}
          </div>
          <div style={{
            display: 'inline-block', marginTop: 6,
            background: prize.fg, color: prize.bg,
            padding: '2px 7px', fontSize: 9, letterSpacing: '0.1em',
          }}>
            {prize.sub}
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 10, fontFamily: 'Space Grotesk, system-ui',
        fontSize: 12, lineHeight: 1.45, fontWeight: 700,
        color: prize.fg, opacity: 0.85,
      }}>
        {prize.body}
      </div>
    </div>
  </div>
)

// ─── LotteryModal ─────────────────────────────────────────────────────────────
export const LotteryModal: React.FC<LotteryModalProps> = ({ prize, threshold, onContinue }) => {
  const [phase, setPhase]           = useState<SpinPhase>('idle')
  const [sheetVisible, setSheetVisible] = useState(false)
  const winningIdx = Math.max(0, PRIZES.findIndex(p => p.id === prize.id))
  const spinsLeft  = getDailySpinsRemaining()  // already decremented before this renders

  // Slide-up entrance
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSheetVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Auto-advance after user triggers spin
  useEffect(() => {
    if (phase === 'spinning') {
      const t = setTimeout(() => setPhase('decel'), SPIN_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'decel') {
      const t = setTimeout(() => setPhase('revealed'), DECEL_MS)
      return () => clearTimeout(t)
    }
  }, [phase])

  /**
   * Reel audio.
   *
   * The clicks are placed from the same geometry the animation uses — a card
   * crosses the pointer every `stride / speed` seconds — so the ticking stays
   * locked to the cards instead of being a generic rattle. The whole sequence
   * for a phase is scheduled in one go on the audio clock; React only decides
   * when a phase begins.
   */
  useEffect(() => {
    const stride = SPIN_CARD_SIZE + CARD_GAP
    try {
      if (phase === 'spinning') {
        audioEngine.spinStart()
        const gap = stride / SPIN_SPEED
        audioEngine.spinTicks(SPIN_MS / 1000, gap, gap)
        return
      }
      if (phase === 'decel') {
        // Ticks widen from the running rate to the rate at the slower speed,
        // then the reel lands.
        const fromGap = stride / SPIN_SPEED
        const toGap = stride / DECEL_SPEED
        const end = audioEngine.spinTicks(DECEL_MS / 1000, fromGap, toGap)
        audioEngine.spinStop(end)
        return
      }
      if (phase === 'revealed') {
        audioEngine.spinReveal(prize.rarity, prize.id === 'nothing')
      }
    } catch {
      /* audio is never allowed to break the reel */
    }
  }, [phase, prize])

  const handleSpin = useCallback(() => {
    if (phase !== 'idle') return
    setPhase('spinning')
  }, [phase])

  const handleContinue = useCallback(() => {
    if (phase !== 'revealed') return
    setSheetVisible(false)
    setTimeout(onContinue, 220)
  }, [phase, onContinue])

  const isRevealed = phase === 'revealed'
  const isIdle     = phase === 'idle'
  const isSpinning = phase === 'spinning' || phase === 'decel'

  // Sheet height: smaller when idle/spinning (reel is hero), taller when revealed
  const sheetHeightVh = isRevealed ? 78 : 66
  const cardSize      = isRevealed ? 78 : 108
  const innerWidth    = Math.min(typeof window !== 'undefined' ? window.innerWidth - 28 : 362, 362)

  return (
    <>
      <style>{`
        @keyframes lotteryPulse   { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes lotterySpinBtn { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
        @keyframes lotterySheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>

      {/* Backdrop */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(12,12,16,0.65)',
        backdropFilter: 'blur(2px)',
      }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        zIndex: 9001,
        height: `${sheetHeightVh}dvh`,
        background: INK, color: PAPER,
        borderTop: `4px solid ${PAPER}`,
        boxShadow: `0 -6px 0 ${INK}, 0 -10px 0 ${RED}`,
        padding: '10px 14px max(14px,env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', gap: 10,
        overflow: 'hidden',
        fontFamily: '"Archivo Black", system-ui',
        animation: sheetVisible ? 'lotterySheetUp 300ms cubic-bezier(0.22,1,0.36,1) both' : 'none',
        transition: 'height 300ms cubic-bezier(0.22,1,0.36,1)',
      }}>
        {/* diagonal stripe bg */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `repeating-linear-gradient(-45deg, transparent 0, transparent 24px, ${PAPER}08 24px, ${PAPER}08 48px)`,
        }} />

        {/* drag handle */}
        <div style={{
          width: 48, height: 4, background: PAPER, opacity: 0.4,
          alignSelf: 'center', position: 'relative', zIndex: 2, marginBottom: 2,
          flexShrink: 0,
        }} />

        {/* ── Header row ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          position: 'relative', zIndex: 2, flexShrink: 0,
        }}>
          <div style={{
            background: RED, color: '#ffffff',
            border: `3px solid ${INK}`, boxShadow: sh(3, 3),
            padding: '4px 9px', fontSize: 11, letterSpacing: '0.14em',
            transform: 'rotate(-1.5deg)',
          }}>
            WHEEL SPIN
          </div>
          <div style={{
            background: YELLOW, color: INK,
            border: `2px solid ${INK}`,
            padding: '3px 7px', fontSize: 9, letterSpacing: '0.14em',
            boxShadow: sh(2, 2, PAPER),
          }}>
            {threshold.toLocaleString()} PTS
          </div>
          <div style={{ flex: 1 }} />
          {/* spins remaining badge */}
          <div style={{
            background: PAPER, color: INK,
            border: `2px solid ${INK}`,
            padding: '3px 7px', fontSize: 9, letterSpacing: '0.1em',
          }}>
            {spinsLeft}/{MAX_DAILY_SPINS} TODAY
          </div>
          {/* close — only active after reveal */}
          <button
            onClick={isRevealed ? handleContinue : undefined}
            style={{
              width: 28, height: 28, background: PAPER, color: INK,
              border: `2px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, boxShadow: sh(2, 2, RED),
              opacity: isRevealed ? 1 : 0.35,
              cursor: isRevealed ? 'pointer' : 'default',
              fontFamily: '"Archivo Black", system-ui',
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Reel ── */}
        <div style={{ position: 'relative', zIndex: 2, alignSelf: 'center', flexShrink: 0 }}>
          <PrizeReel
            phase={phase}
            winningIdx={winningIdx}
            width={innerWidth}
            cardSize={cardSize}
          />
        </div>

        {/* ── Middle area ── */}
        <div style={{
          position: 'relative', zIndex: 2, flex: 1,
          display: 'flex', flexDirection: 'column',
          justifyContent: isRevealed ? 'center' : 'flex-end',
          minHeight: 0,
        }}>
          {/* Idle: teaser copy */}
          {isIdle && (
            <div style={{
              width: '100%',
              background: PAPER, color: INK,
              border: `4px solid ${INK}`, boxShadow: sh(4, 4, YELLOW),
              padding: '9px 12px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 10, height: 10, background: YELLOW,
                border: `2px solid ${INK}`, flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 13, letterSpacing: '-0.01em' }}>YOU EARNED A FREE SPIN!</div>
                <div style={{
                  fontFamily: 'Space Grotesk, system-ui',
                  fontSize: 11, fontWeight: 700, opacity: 0.65, marginTop: 2,
                }}>
                  Score milestone reached. Tap SPIN to claim your reward.
                </div>
              </div>
            </div>
          )}

          {/* Spinning: status bar */}
          {isSpinning && <SpinStatusBar phase={phase as 'spinning' | 'decel'} />}

          {/* Revealed: prize card */}
          {isRevealed && (
            <div style={{ marginTop: 4 }}>
              <BigPrizeReveal prize={prize} width={innerWidth} />
            </div>
          )}
        </div>

        {/* ── CTA ── */}
        <div style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}>
          {isIdle && (
            <button
              onClick={handleSpin}
              style={{
                width: '100%', padding: '15px 0',
                background: YELLOW, color: INK,
                border: `4px solid ${INK}`, boxShadow: sh(6, 6),
                fontFamily: '"Archivo Black", system-ui',
                fontSize: 18, letterSpacing: '0.12em',
                cursor: 'pointer',
                touchAction: 'manipulation',
                animation: 'lotterySpinBtn 1.6s ease-in-out infinite',
              }}
            >
              🎡 SPIN THE WHEEL
            </button>
          )}

          {isSpinning && (
            <div style={{
              width: '100%', height: 52,
              background: `${PAPER}10`,
              border: `2px dashed ${PAPER}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, letterSpacing: '0.18em', color: PAPER, opacity: 0.45,
            }}>
              SPIN IN PROGRESS…
            </div>
          )}

          {isRevealed && (
            <button
              onClick={handleContinue}
              style={{
                width: '100%', padding: '14px 0',
                background: LIME, color: INK,
                border: `4px solid ${INK}`, boxShadow: sh(5, 5),
                fontFamily: '"Archivo Black", system-ui',
                fontSize: 15, letterSpacing: '0.1em',
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              ▶ TAP TO CONTINUE
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default LotteryModal
