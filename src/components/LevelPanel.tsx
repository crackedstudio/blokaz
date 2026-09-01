import React, { useMemo, useState } from 'react'
import type { LevelState } from '../hooks/usePlayerLevel'
import {
  MAX_LEVEL,
  OBJECTIVE_KEYS,
  OBJECTIVE_LABELS,
  levelSpec,
  levelCompletion,
  objectiveRatio,
  formatTarget,
  type ObjectiveKey,
} from '../constants/levels'
import { BrutalIcon } from './BrutalIcon'
import LevelLadderModal from './LevelLadderModal'

const OBJECTIVE_ICONS: Record<
  ObjectiveKey,
  'play' | 'trophy' | 'shop' | 'star'
> = {
  games: 'play',
  tournaments: 'trophy',
  purchases: 'shop',
  points: 'star',
}

// ── One objective row ────────────────────────────────────────────────────────

const ObjectiveRow: React.FC<{
  objective: ObjectiveKey
  current: number
  target: number
  done: boolean
  accent: string
}> = ({ objective, current, target, done, accent }) => {
  const ratio = objectiveRatio(current, target)
  // A zero target is met by default — say so plainly instead of showing "0/0".
  const readout =
    target === 0
      ? 'NOT REQUIRED'
      : `${formatTarget(objective, Math.min(current, target))} / ${formatTarget(objective, target)}`

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <BrutalIcon
            name={done ? 'check' : OBJECTIVE_ICONS[objective]}
            size={13}
            strokeWidth={2.5}
          />
          <span
            className="truncate font-display text-[9px] tracking-[0.12em]"
            style={{ color: done ? 'var(--ink)' : 'var(--ink-soft)' }}
          >
            {OBJECTIVE_LABELS[objective]}
          </span>
        </span>
        <span
          className="shrink-0 font-display text-[9px] tabular-nums tracking-[0.08em]"
          style={{ color: done ? 'var(--ink)' : 'var(--ink-soft)' }}
        >
          {readout}
        </span>
      </div>

      <div
        className="mt-1.5 h-[7px] border-[2px] border-ink"
        style={{ background: 'var(--paper-2)' }}
        role="progressbar"
        aria-label={OBJECTIVE_LABELS[objective]}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full transition-[width] duration-500"
          style={{
            width: `${ratio * 100}%`,
            background: done ? accent : 'var(--ink-soft)',
          }}
        />
      </div>
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  state: LevelState | null
  isLoading: boolean
}

/**
 * The weekly challenge board: where the player sits on the 12-level ladder,
 * how far the four objectives have got this week, what clearing the level pays,
 * and whether Monday's rollover is about to cost them a level.
 *
 * Presentational on purpose. The lobby renders a desktop rail and a mobile
 * stack that are BOTH mounted (visibility is a CSS concern), so the owning
 * screen holds the single usePlayerLevel subscription and passes it here —
 * otherwise every player would fire two /levels/refresh calls per visit.
 */
const LevelPanel: React.FC<Props> = ({ state, isLoading }) => {
  // Local to each mounted panel. The lobby renders a desktop and a mobile copy,
  // but exactly one has a visible ancestor, so only one modal can ever open.
  const [showLadder, setShowLadder] = useState(false)

  const spec = levelSpec(state?.level ?? 1)
  const accent = state?.accent ?? spec.accent

  const completion = useMemo(
    () => (state ? levelCompletion(state.progress, state.targets) : 0),
    [state]
  )

  if (!state && isLoading) {
    return (
      <div
        className="border-[3px] border-ink p-4"
        style={{
          background: 'var(--paper)',
          boxShadow: '5px 5px 0 var(--shadow)',
        }}
      >
        <div
          className="font-display text-[10px] tracking-[0.18em]"
          style={{ color: 'var(--label)' }}
        >
          LOADING LADDER…
        </div>
      </div>
    )
  }

  // Server unreachable and nothing cached — say nothing rather than show a
  // level the player might not actually be on.
  if (!state) return null

  const isMaxed = state.level >= MAX_LEVEL
  const nextLabel = isMaxed ? 'HOLD RANK' : `NEXT: LEVEL ${state.level + 1}`

  return (
    <>
      <div
        className="border-[3px] border-ink"
        style={{
          background: 'var(--paper)',
          boxShadow: '5px 5px 0 var(--shadow)',
        }}
      >
        {/* ── Header: level, badge, ladder position ── */}
        <div
          className="border-b-[3px] border-ink px-4 py-3"
          style={{ background: accent, color: 'var(--ink-fixed)' }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-[10px] tracking-[0.18em]">
              LEVEL {state.level}
              <span style={{ opacity: 0.65 }}> / {MAX_LEVEL}</span>
            </span>
            <span
              className="font-display text-[9px] tracking-[0.12em]"
              style={{ opacity: 0.75 }}
            >
              {nextLabel}
            </span>
          </div>
          <div className="mt-1 truncate font-display text-[15px] tracking-[0.04em]">
            {state.name}
          </div>
        </div>

        <div className="space-y-3 p-4">
          {/* ── Overall card completion ── */}
          <div>
            <div className="flex items-center justify-between">
              <span
                className="font-display text-[9px] tracking-[0.14em]"
                style={{ color: 'var(--label)' }}
              >
                THIS WEEK
              </span>
              <span
                className="font-display text-[9px] tabular-nums tracking-[0.08em]"
                style={{ color: 'var(--label)' }}
              >
                {Math.floor(completion * 100)}%
              </span>
            </div>
            <div
              className="mt-1.5 h-[11px] border-[2px] border-ink"
              style={{ background: 'var(--paper-2)' }}
            >
              <div
                className="h-full transition-[width] duration-500"
                style={{ width: `${completion * 100}%`, background: accent }}
              />
            </div>
          </div>

          {/* ── The four objectives ── */}
          <div className="space-y-2.5">
            {OBJECTIVE_KEYS.map((key) => (
              <ObjectiveRow
                key={key}
                objective={key}
                current={state.progress[key] ?? 0}
                target={state.targets[key]}
                done={state.complete[key]}
                accent={accent}
              />
            ))}
          </div>

          {/* ── Reward for clearing this level ── */}
          <div
            className="border-[2px] border-ink p-2.5"
            style={{ background: 'var(--paper-2)' }}
          >
            <div
              className="font-display text-[8px] tracking-[0.14em]"
              style={{ color: 'var(--label)' }}
            >
              {isMaxed ? 'HOLDING LEVEL 12 PAYS' : 'CLEAR THIS LEVEL TO EARN'}
            </div>
            <div
              className="mt-1 font-body text-[11px] leading-snug"
              style={{ color: 'var(--ink)' }}
            >
              {spec.reward}
            </div>
            {state.highestLevel > state.level && (
              <div
                className="mt-1.5 font-display text-[8px] tracking-[0.12em]"
                style={{ color: 'var(--ink-soft)' }}
              >
                BEST EVER · LEVEL {state.highestLevel} ·{' '}
                {levelSpec(state.highestLevel).name}
              </div>
            )}
          </div>

          {/* ── Weekly rollover warning ── */}
          <div
            className="border-[2px] border-ink p-2.5"
            style={{
              background: state.atRisk
                ? 'var(--paper-pink)'
                : 'var(--paper-lime)',
              color: 'var(--ink-fixed)',
            }}
          >
            <div className="flex items-start gap-2">
              <BrutalIcon
                name={state.atRisk ? 'alert' : 'check'}
                size={13}
                strokeWidth={2.5}
              />
              <div className="min-w-0">
                <div className="font-display text-[9px] tracking-[0.12em]">
                  {state.atRisk ? 'RANK AT RISK' : 'RANK SAFE THIS WEEK'}
                </div>
                <div className="mt-0.5 font-body text-[10px] leading-snug">
                  {state.atRisk
                    ? state.level > 1
                      ? `Clear a level before Monday or you drop to level ${state.level - 1}.`
                      : 'Level 1 is the floor — you cannot drop any further.'
                    : `+${state.levelsGainedThisWeek} level${
                        state.levelsGainedThisWeek === 1 ? '' : 's'
                      } this week. Monday's drop can't touch you.`}
                </div>
              </div>
            </div>
          </div>

          {/* ── See the whole ladder ── */}
          <button
            type="button"
            onClick={() => setShowLadder(true)}
            className="w-full border-[2px] border-ink px-3 py-2 font-display text-[9px] tracking-[0.14em]"
            style={{ background: 'var(--paper-2)', color: 'var(--ink)' }}
          >
            <span className="flex items-center justify-center gap-1.5">
              <BrutalIcon name="trending" size={12} strokeWidth={2.5} />
              VIEW ALL {MAX_LEVEL} LEVELS
            </span>
          </button>
        </div>
      </div>

      {showLadder && (
        <LevelLadderModal state={state} onClose={() => setShowLadder(false)} />
      )}
    </>
  )
}

export default LevelPanel
