import React from 'react'
import { createPortal } from 'react-dom'
import { BrutalIcon } from './BrutalIcon'
import { LadderBadge, type LadderBadgeState } from './badges'
import {
  LEVELS,
  MAX_LEVEL,
  OBJECTIVE_KEYS,
  formatTarget,
  type ObjectiveKey,
} from '../constants/levels'
import type { LevelState } from '../hooks/usePlayerLevel'

/** Where a level sits relative to the player right now. */
type RowStatus = 'cleared' | 'current' | 'reclaim' | 'locked'

/**
 * The ladder tracks four positions but the badge art has three states:
 * `cleared` and `reclaim` both mean the reward has already been paid, which is
 * exactly what the claimed ribbon says.
 */
const BADGE_STATE: Record<RowStatus, LadderBadgeState> = {
  cleared: 'claimed',
  current: 'earned',
  reclaim: 'claimed',
  locked: 'locked',
}

const STATUS_LABEL: Record<RowStatus, string> = {
  cleared: 'CLEARED',
  current: 'IN PROGRESS',
  // Reached in an earlier week, then lost to the weekly demotion. Climbing back
  // through it counts as an advance but pays nothing — the reward was already
  // taken the first time.
  reclaim: 'REWARD TAKEN',
  locked: 'LOCKED',
}

const SHORT_LABELS: Record<ObjectiveKey, string> = {
  games: 'GAMES',
  tournaments: 'TOURN',
  purchases: 'SHOP',
  points: 'POINTS',
}

function statusFor(level: number, state: LevelState): RowStatus {
  if (level < state.level) return 'cleared'
  if (level === state.level) return 'current'
  if (level <= state.highestLevel) return 'reclaim'
  return 'locked'
}

// ── One rung ─────────────────────────────────────────────────────────────────

const LadderRow: React.FC<{ level: number; state: LevelState }> = ({
  level,
  state,
}) => {
  const spec = LEVELS[level]
  const status = statusFor(level, state)
  const isCurrent = status === 'current'
  const isLocked = status === 'locked'

  return (
    <div
      className="border-[2px] border-ink"
      style={{
        background: isCurrent ? 'var(--paper)' : 'var(--paper-2)',
        // The current rung is the one that matters; everything else steps back.
        boxShadow: isCurrent ? '4px 4px 0 var(--shadow)' : 'none',
        opacity: isLocked ? 0.55 : 1,
      }}
    >
      {/* ── Rung header ──
          Neutral now that the badge carries the level's colour. Painting the
          header in spec.accent as well put the badge on a field of its own
          fill, which left the artwork nothing to say — the only thing marking
          the badge out was its border. */}
      <div
        className="flex items-center justify-between gap-2 border-b-[2px] border-ink px-3 py-2"
        style={{
          background: 'var(--paper)',
          color: isLocked ? 'var(--ink-soft)' : 'var(--ink)',
        }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <LadderBadge level={level} size={34} state={BADGE_STATE[status]} showLevel={false} />
          <span className="truncate font-display text-[11px] tracking-[0.06em]">
            {level} · {spec.name}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 font-display text-[8px] tracking-[0.1em]">
          {status === 'cleared' && (
            <BrutalIcon name="check" size={11} strokeWidth={3} />
          )}
          {isLocked && <BrutalIcon name="skull" size={11} strokeWidth={2.5} />}
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="px-3 py-2.5">
        {/* ── The four objectives ── */}
        <div className="grid grid-cols-4 gap-2">
          {OBJECTIVE_KEYS.map((key) => {
            const target = spec.targets[key]
            const done = isCurrent && state.complete[key]
            return (
              <div key={key}>
                <div
                  className="font-display text-[7px] tracking-[0.1em]"
                  style={{ color: 'var(--label-soft)' }}
                >
                  {SHORT_LABELS[key]}
                </div>
                <div
                  className="font-display text-[11px] tabular-nums"
                  style={{ color: done ? spec.accent : 'var(--ink)' }}
                >
                  {target === 0 ? '—' : formatTarget(key, target)}
                </div>
                {/* Only the rung being played shows live progress; on the others
                    the target alone is the useful information. */}
                {isCurrent && target > 0 && (
                  <div
                    className="font-display text-[8px] tabular-nums"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    {formatTarget(
                      key,
                      Math.min(state.progress[key] ?? 0, target)
                    )}{' '}
                    now
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Reward ── */}
        <div
          className="mt-2 border-t-[2px] border-dashed pt-2 font-body text-[10px] leading-snug"
          style={{ borderColor: 'var(--ink-soft)', color: 'var(--ink-soft)' }}
        >
          {spec.reward}
        </div>
      </div>
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  state: LevelState
  onClose: () => void
}

/**
 * The full 12-rung ladder: every level's targets, badge and payout, with the
 * player's own position marked. Everything here comes from the client mirror in
 * constants/levels.ts, so opening it costs no round trip.
 */
const LevelLadderModal: React.FC<Props> = ({ state, onClose }) =>
  // Portalled to the body: the lobby animates its tiles in, and any lingering
  // transform on an ancestor would become the containing block for this fixed
  // overlay, trapping it inside a grid cell instead of covering the screen.
  createPortal(
    <div
      // Above the 420 sheet tier, not below it: this modal is opened from
      // inside ProgressSheet, so anything at or under that sheet's z-index
      // renders behind it and is unreachable. A modal spawned by another
      // modal has to outrank its parent.
      className="fixed inset-0 z-[430] flex items-center justify-center p-3"
    style={{ background: 'rgba(0,0,0,0.55)' }}
    role="dialog"
    aria-modal="true"
    aria-label="All levels"
    onClick={onClose}
  >
    <div
      className="flex max-h-[88vh] w-full max-w-md flex-col border-[3px] border-ink"
      style={{
        background: 'var(--paper)',
        boxShadow: '8px 8px 0 var(--shadow)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between gap-2 border-b-[3px] border-ink px-4 py-3"
        style={{ background: 'var(--paper-2)' }}
      >
        <div className="min-w-0">
          <div
            className="font-display text-[10px] tracking-[0.18em]"
            style={{ color: 'var(--label-soft)' }}
          >
            THE LADDER
          </div>
          <div className="mt-0.5 font-display text-[13px] tracking-[0.04em]">
            LEVEL {state.level} OF {MAX_LEVEL}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 border-[2px] border-ink p-1.5"
          style={{ background: 'var(--paper)' }}
        >
          <BrutalIcon name="close" size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── The rules, stated once ── */}
      <div
        className="border-b-[3px] border-ink px-4 py-3 font-body text-[10px] leading-relaxed"
        style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}
      >
        Hit all four targets in one week to clear a level. Targets are weekly
        totals and they carry over, so a strong week can climb several rungs at
        once. Gain no level in a week and you drop one on Monday — any advance
        keeps you safe. Each level pays out the first time you reach it.
      </div>

      {/* ── The 12 rungs ── */}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((level) => (
          <LadderRow key={level} level={level} state={state} />
        ))}
      </div>
      </div>
    </div>,
    document.body
  )

export default LevelLadderModal
