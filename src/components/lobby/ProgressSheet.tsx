/**
 * PROGRESS — everything the lobby's progress card no longer shows.
 *
 * Blokaz runs two ladders that both used the word LEVEL: WEEKLY is
 * server-derived, 12 rungs, and pays power-ups plus stablecoin at 4, 8 and 12;
 * CAREER is local XP over 60 levels, fed by the daily missions. The front page
 * shows one line for each; the detail lives here, one track at a time so the
 * two can't be confused for one another.
 */

import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMetaStore } from '../../stores/metaStore'
import { isMissionComplete, MAX_LEVEL as MAX_CAREER_LEVEL } from '../../engine/meta'
import {
  MAX_LEVEL as MAX_WEEKLY_LEVEL,
  OBJECTIVE_KEYS,
  OBJECTIVE_LABELS,
  formatTarget,
  levelCompletion,
  levelSpec,
  objectiveRatio,
  type ObjectiveKey,
} from '../../constants/levels'
import type { LevelState } from '../../hooks/usePlayerLevel'
import { BrutalIcon } from '../BrutalIcon'
import MissionRow from '../MissionRow'
import LevelLadderModal from '../LevelLadderModal'
import { BlockCluster } from '../blocks/BlockFX'

type Track = 'weekly' | 'career'

const Meter: React.FC<{ ratio: number; fill: string; height?: number; label: string }> = ({
  ratio,
  fill,
  height = 10,
  label,
}) => {
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  return (
    <div
      className="w-full border-[2px] border-ink"
      style={{ height, background: 'var(--paper-2)' }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  )
}

const Objective: React.FC<{
  objective: ObjectiveKey
  current: number
  target: number
  done: boolean
  accent: string
}> = ({ objective, current, target, done, accent }) => (
  <div>
    <div className="flex items-baseline justify-between gap-2">
      <span
        className="truncate font-display text-[9px] uppercase tracking-[0.12em]"
        style={{ color: done ? 'var(--ink)' : 'var(--ink-soft)' }}
      >
        {OBJECTIVE_LABELS[objective]}
      </span>
      <span
        className="shrink-0 font-display text-[9px] tabular-nums tracking-[0.06em]"
        style={{ color: done ? 'var(--ink)' : 'var(--ink-soft)' }}
      >
        {target === 0
          ? '—'
          : `${formatTarget(objective, Math.min(current, target))}/${formatTarget(objective, target)}`}
      </span>
    </div>
    <div className="mt-1.5">
      <Meter
        ratio={objectiveRatio(current, target)}
        fill={done ? accent : 'var(--ink-soft)'}
        height={7}
        label={OBJECTIVE_LABELS[objective]}
      />
    </div>
  </div>
)

interface Props {
  levelState: LevelState | null
  onClose: () => void
}

const ProgressSheet: React.FC<Props> = ({ levelState, onClose }) => {
  const { level, intoLevel, needed, title, progress } = useMetaStore()
  const [track, setTrack] = useState<Track>(levelState ? 'weekly' : 'career')
  const [showLadder, setShowLadder] = useState(false)

  const weeklyCompletion = useMemo(
    () => (levelState ? levelCompletion(levelState.progress, levelState.targets) : 0),
    [levelState]
  )

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const spec = levelSpec(levelState?.level ?? 1)
  const accent = levelState?.accent ?? spec.accent
  const careerMaxed = level >= MAX_CAREER_LEVEL
  const careerRatio = careerMaxed ? 1 : needed > 0 ? intoLevel / needed : 0
  const missionsDone = progress.missions.filter(isMissionComplete).length

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[420] flex items-end justify-center sm:items-center sm:p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Progress"
        onClick={onClose}
      >
        <div
          className="flex max-h-[92dvh] w-full max-w-md flex-col border-[2px] border-ink"
          style={{ background: 'var(--paper)', boxShadow: '6px 6px 0 var(--shadow)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b-[2px] border-ink px-4 py-3">
            <span className="flex items-center gap-2.5">
              <BlockCluster cell={7} />
              <span className="font-display text-[11px] uppercase tracking-[0.18em]">
                Progress
              </span>
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 p-1"
              style={{ color: 'var(--ink)' }}
            >
              <BrutalIcon name="close" size={15} strokeWidth={3} />
            </button>
          </div>

          {/* ── One track at a time ── */}
          <div className="flex shrink-0 border-b-[2px] border-ink">
            {(
              [
                ['weekly', 'Weekly · pays'],
                ['career', 'Career · ranks'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTrack(key)}
                className="flex-1 px-3 py-2.5 font-display text-[9px] uppercase tracking-[0.14em]"
                style={{
                  background: track === key ? 'var(--ink)' : 'transparent',
                  color: track === key ? 'var(--paper)' : 'var(--ink-soft)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {track === 'weekly' ? (
              levelState ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center border-[2px] border-ink font-display text-[16px] tabular-nums"
                      style={{ background: accent, color: 'var(--ink-fixed)' }}
                    >
                      {levelState.level}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-display text-[14px] tracking-[0.02em]">
                        {levelState.name}
                      </div>
                      <div
                        className="mt-0.5 font-display text-[9px] uppercase tracking-[0.14em]"
                        style={{ color: 'var(--ink-soft)' }}
                      >
                        Level {levelState.level} of {MAX_WEEKLY_LEVEL} ·{' '}
                        {Math.floor(weeklyCompletion * 100)}% this week
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {OBJECTIVE_KEYS.map((key) => (
                      <Objective
                        key={key}
                        objective={key}
                        current={levelState.progress[key] ?? 0}
                        target={levelState.targets[key]}
                        done={levelState.complete[key]}
                        accent={accent}
                      />
                    ))}
                  </div>

                  <p
                    className="font-body text-[11px] leading-snug"
                    style={{ color: 'var(--ink-soft)', margin: 0 }}
                  >
                    {spec.reward}
                  </p>

                  {levelState.atRisk && levelState.level > 1 && (
                    <div
                      className="flex items-center gap-2 border-[2px] border-ink px-3 py-2"
                      style={{ background: 'var(--paper-pink)', color: 'var(--ink-fixed)' }}
                    >
                      <BrutalIcon name="alert" size={13} strokeWidth={3} />
                      <span className="font-display text-[9px] tracking-[0.08em]">
                        CLEAR A LEVEL BEFORE MONDAY OR DROP TO {levelState.level - 1}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowLadder(true)}
                    className="border-[2px] border-ink px-3 py-2.5 font-display text-[9px] uppercase tracking-[0.14em]"
                    style={{ background: 'var(--paper-2)', color: 'var(--ink)' }}
                  >
                    All {MAX_WEEKLY_LEVEL} levels
                  </button>
                </div>
              ) : (
                <p
                  className="py-8 text-center font-display text-[10px] uppercase leading-relaxed tracking-[0.14em]"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  Weekly ladder unavailable
                  <br />
                  right now
                </p>
              )
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center border-[2px] border-ink font-display text-[16px] tabular-nums"
                    style={{ background: 'var(--ink-fixed)', color: 'var(--accent-yellow)' }}
                  >
                    {level}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-display text-[14px] tracking-[0.02em]">
                      {title}
                    </div>
                    <div
                      className="mt-0.5 font-display text-[9px] uppercase tracking-[0.14em]"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      {careerMaxed
                        ? `Max level · ${progress.totalXp.toLocaleString()} XP`
                        : `${intoLevel.toLocaleString()} / ${needed.toLocaleString()} XP to level ${level + 1}`}
                    </div>
                  </div>
                </div>

                <Meter
                  ratio={careerRatio}
                  fill="var(--accent-lime)"
                  label="Career XP progress"
                />

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className="font-display text-[9px] uppercase tracking-[0.16em]"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      Today's missions
                    </span>
                    <span
                      className="font-display text-[9px] tabular-nums tracking-[0.1em]"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      {missionsDone}/{progress.missions.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {progress.missions.map((mission, i) => (
                      <MissionRow
                        key={`${mission.kind}-${mission.target}-${i}`}
                        mission={mission}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showLadder && levelState && (
        <LevelLadderModal state={levelState} onClose={() => setShowLadder(false)} />
      )}
    </>,
    document.body
  )
}

export default ProgressSheet
