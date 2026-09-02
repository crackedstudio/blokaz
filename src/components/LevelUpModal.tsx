import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { audioEngine } from '../audio/AudioEngine'
import { BrutalIcon } from './BrutalIcon'
import { levelSpec } from '../constants/levels'
import type { LevelAdvance } from '../hooks/usePlayerLevel'

/** player_inventory column → the name players see in the shop. */
const POWERUP_LABELS: Record<string, string> = {
  revival_bundle: 'Revival Bundle',
  score_boost: 'Score Boost',
  shield: 'Shield',
  bomb: 'Bomb',
  rotate_pass: 'Rotate Pass',
}

function seenKey(address: string) {
  return `blokaz:levelup_seen_${address.toLowerCase()}`
}

function loadSeen(address: string): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(address)) ?? '[]')
    return Array.isArray(raw) ? raw.filter((n) => typeof n === 'number') : []
  } catch {
    return []
  }
}

function markSeen(address: string, levels: number[]) {
  try {
    const merged = Array.from(new Set([...loadSeen(address), ...levels]))
    localStorage.setItem(seenKey(address), JSON.stringify(merged))
  } catch {
    // Private mode / storage disabled — the modal simply may show again.
  }
}

interface Props {
  address: string
  advances: LevelAdvance[]
  accent: string
}

/**
 * Celebrates levels cleared by the refresh that just ran.
 *
 * A climb back through a level already cleared once (after the weekly demotion)
 * still shows here — the player did earn it back — but it is labelled as a
 * reclaim, because rewards are paid on the first clear only.
 */
const LevelUpModal: React.FC<Props> = ({ address, advances, accent }) => {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [shown, setShown] = useState<LevelAdvance[]>([])

  useEffect(() => {
    const seen = loadSeen(address)
    const fresh = advances.filter((a) => !seen.includes(a.level))
    if (fresh.length === 0) return

    setShown(fresh)
    markSeen(
      address,
      fresh.map((a) => a.level)
    )
    setOpen(true)
    // Fires once per level, gated by the same seen-list as the modal, so a
    // re-render can never replay the fanfare.
    try { audioEngine.levelUp() } catch {}
    requestAnimationFrame(() => setVisible(true))
  }, [address, advances])

  const dismiss = () => {
    setVisible(false)
    setTimeout(() => setOpen(false), 240)
  }

  if (!open || shown.length === 0) return null

  // The highest level reached is the headline; anything below it was a step on
  // the way there during the same week.
  const top = shown[shown.length - 1]
  const topSpec = levelSpec(top.level)

  // Portalled, and above the sheet tier. The app shell is `relative z-[1]`,
  // which makes it a stacking context — a fixed overlay rendered inside it can
  // never paint above a sheet portalled to <body>, whatever z-index it is
  // given. Clearing a level is the most important thing that can be on screen,
  // so it goes to the body at the top of the scale.
  return createPortal(
    <div
      className="fixed inset-0 z-[440] flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.55)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 240ms ease',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Level ${top.level} reached`}
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm border-[3px] border-ink"
        style={{
          background: 'var(--paper)',
          boxShadow: '8px 8px 0 var(--shadow)',
          transform: visible
            ? 'translateY(0) scale(1)'
            : 'translateY(18px) scale(0.96)',
          transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Headline ── */}
        <div
          className="border-b-[3px] border-ink px-5 py-4 text-center"
          style={{ background: accent, color: 'var(--ink-fixed)' }}
        >
          <div className="flex items-center justify-center gap-2">
            <BrutalIcon name="crown" size={18} strokeWidth={2.5} />
            <span className="font-display text-[11px] tracking-[0.18em]">
              {shown.length > 1 ? `${shown.length} LEVELS CLEARED` : 'LEVEL UP'}
            </span>
          </div>
          <div className="mt-2 font-display text-[26px] leading-none tracking-[-0.02em]">
            LEVEL {top.level}
          </div>
          <div
            className="mt-1 font-display text-[11px] tracking-[0.1em]"
            style={{ opacity: 0.8 }}
          >
            {topSpec.name}
          </div>
        </div>

        {/* ── What each cleared level paid ── */}
        <div className="max-h-[46vh] space-y-2 overflow-y-auto p-4">
          {shown.map((advance) => {
            const powerups = Object.entries(advance.powerups)
            return (
              <div
                key={advance.level}
                className="border-[2px] border-ink p-3"
                style={{ background: 'var(--paper-2)' }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="font-display text-[10px] tracking-[0.12em]"
                    style={{ color: 'var(--ink)' }}
                  >
                    LVL {advance.level} · {advance.name}
                  </span>
                  {!advance.firstClear && (
                    <span
                      className="shrink-0 font-display text-[8px] tracking-[0.12em]"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      RECLAIMED
                    </span>
                  )}
                </div>

                {advance.firstClear ? (
                  <>
                    {powerups.length > 0 && (
                      <div
                        className="mt-1.5 font-body text-[11px] leading-snug"
                        style={{ color: 'var(--ink)' }}
                      >
                        {powerups
                          .map(
                            ([col, qty]) =>
                              `${qty}× ${POWERUP_LABELS[col] ?? col}`
                          )
                          .join(' · ')}{' '}
                        added to your inventory
                      </div>
                    )}
                    {advance.cash && (
                      <div
                        className="mt-1.5 font-display text-[9px] tracking-[0.1em]"
                        style={{ color: 'var(--ink)' }}
                      >
                        {advance.cash.pending
                          ? 'CASH REWARD RESERVED — LANDS IN YOUR REWARDS SHORTLY'
                          : `CASH REWARD · ${advance.cash.amount} ${advance.cash.token} — CLAIM IT IN REWARDS`}
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className="mt-1.5 font-body text-[11px] leading-snug"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    Rank won back. This level's rewards were already paid the
                    first time you cleared it.
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Dismiss ── */}
        <div className="border-t-[3px] border-ink p-4">
          <button
            type="button"
            onClick={dismiss}
            className="w-full border-[3px] border-ink px-4 py-3 font-display text-[11px] tracking-[0.14em]"
            style={{
              background: accent,
              color: 'var(--ink-fixed)',
              boxShadow: '5px 5px 0 var(--shadow)',
            }}
          >
            KEEP CLIMBING
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default LevelUpModal
