/**
 * PROGRESS — the detail behind the lobby's progress card.
 *
 * Blokaz runs two ladders that both used the word LEVEL: WEEKLY is
 * server-derived, 12 rungs, and pays power-ups plus stablecoin at 4, 8 and 12;
 * CAREER is local XP over 60 levels, fed by the daily missions. They live on
 * separate tabs so the two can never be read as one.
 *
 * Both tracks use the same row shape — icon, label, fraction, cells — because
 * a player should not need two reading habits for one screen. Progress shows
 * as board cells rather than a filled bar: at zero, a bar is a blank strip,
 * whereas cells still show how much there is to do.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMetaStore } from '../../stores/metaStore'
import { isMissionComplete } from '../../engine/meta'
import {
  MAX_LEVEL as MAX_WEEKLY_LEVEL,
  OBJECTIVE_KEYS,
  OBJECTIVE_LABELS,
  formatTarget,
  levelCompletion,
  levelSpec,
  type ObjectiveKey,
} from '../../constants/levels'
import type { LevelState } from '../../hooks/usePlayerLevel'
import { useLevelRewards } from '../../hooks/useRewards'
import { BrutalIcon } from '../BrutalIcon'
import MissionRow, { Pips } from '../MissionRow'
import LevelCashClaim from '../LevelCashClaim'
import LevelLadderModal from '../LevelLadderModal'
import { BlockCluster } from '../blocks/BlockFX'
import { LadderBadge } from '../badges'

type Track = 'weekly' | 'career'

const OBJECTIVE_ICONS: Record<
  ObjectiveKey,
  'play' | 'trophy' | 'shop' | 'star'
> = {
  games: 'play',
  tournaments: 'trophy',
  purchases: 'shop',
  points: 'star',
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/** A track's headline: level chip, name, the one number that matters, progress. */
const TrackHead: React.FC<{
  /** Either a level numeral (career) or a badge (weekly). */
  level: React.ReactNode
  chipBg: string
  chipFg: string
  /** Weekly passes its badge here; the plain chip is skipped when set. */
  badge?: React.ReactNode
  name: string
  note: string
  ratio: number
  fill: string
}> = ({ level, chipBg, chipFg, badge, name, note, ratio, fill }) => (
  <div>
    <div className="flex items-center gap-3">
      {badge ?? (
        <span
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center border-[3px] border-ink font-display text-[22px] tabular-nums"
          style={{ background: chipBg, color: chipFg, letterSpacing: '-0.04em' }}
        >
          {level}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div
          className="truncate font-display uppercase"
          style={{ fontSize: 19, lineHeight: 1, letterSpacing: '-0.02em' }}
        >
          {name}
        </div>
        <div
          className="mt-1.5 font-display text-[9px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--ink-soft)' }}
        >
          {note}
        </div>
      </div>
    </div>
    {/* A rule that fills, not a boxed bar — one less outline on the screen. */}
    <div
      className="mt-3 h-[6px] w-full"
      style={{ background: 'var(--paper-2)' }}
    >
      <div
        className="h-full transition-[width] duration-500"
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          background: fill,
        }}
        role="progressbar"
        aria-label={name}
        aria-valuenow={Math.round(Math.max(0, Math.min(1, ratio)) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  </div>
)

const SectionHead: React.FC<{ title: string; note: string }> = ({
  title,
  note,
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <span
      className="font-display text-[9px] uppercase tracking-[0.18em]"
      style={{ color: 'var(--label-soft)' }}
    >
      {title}
    </span>
    <span
      className="font-display text-[9px] uppercase tabular-nums tracking-[0.12em]"
      style={{ color: 'var(--ink-soft)' }}
    >
      {note}
    </span>
  </div>
)

/** One weekly target, shaped exactly like a daily mission row. */
const Objective: React.FC<{
  objective: ObjectiveKey
  current: number
  target: number
  done: boolean
}> = ({ objective, current, target, done }) => {
  // A zero target isn't an achievement — this level simply doesn't ask for it.
  // Ticking and striking it through reads as "already done", which had players
  // believing past purchases had been counted for them.
  const notRequired = target === 0
  const earned = done && !notRequired

  return (
    <div
      className="flex flex-col gap-2 py-2.5"
      style={{ opacity: notRequired ? 0.5 : 1 }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center border-[2px] border-ink"
          style={{
            background: notRequired
              ? 'var(--paper-2)'
              : earned
                ? 'var(--accent-lime)'
                : 'var(--accent-yellow)',
            color: notRequired ? 'var(--ink-soft)' : 'var(--ink-fixed)',
          }}
        >
          <BrutalIcon
            name={earned ? 'check' : OBJECTIVE_ICONS[objective]}
            size={12}
            strokeWidth={3}
          />
        </span>
        <span
          className="min-w-0 flex-1 truncate font-display text-[10px] tracking-[0.04em]"
          style={{
            color: earned ? 'var(--ink-soft)' : 'var(--ink)',
            textDecoration: earned ? 'line-through' : 'none',
          }}
        >
          {OBJECTIVE_LABELS[objective]}
        </span>
        <span
          className="shrink-0 font-display text-[10px] tabular-nums tracking-[0.04em]"
          style={{ color: 'var(--ink-soft)' }}
        >
          {notRequired
            ? 'NOT REQUIRED'
            : earned
              ? 'DONE'
              : `${formatTarget(objective, Math.min(current, target))}/${formatTarget(objective, target)}`}
        </span>
      </div>
      <div className="pl-[32px]">
        <Pips current={current} target={target} done={done} />
      </div>
    </div>
  )
}

const Divider: React.FC = () => (
  <div className="h-px w-full" style={{ background: 'var(--rule)' }} />
)

// ── Sheet ────────────────────────────────────────────────────────────────────

interface Props {
  levelState: LevelState | null
  onClose: () => void
  /** Needed to claim a cash link; absent when no wallet is connected. */
  address?: string
}

const ProgressSheet: React.FC<Props> = ({ levelState, onClose, address }) => {
  const { level, intoLevel, needed, title, progress } = useMetaStore()
  const [track, setTrack] = useState<Track>(levelState ? 'weekly' : 'career')
  const [showLadder, setShowLadder] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const weeklyCompletion = useMemo(
    () =>
      levelState ? levelCompletion(levelState.progress, levelState.targets) : 0,
    [levelState]
  )

  // Cash links already earned and not yet taken, keyed by the level that paid
  // them — a level 1 reward stays a level 1 reward however far the player has
  // climbed since.
  const { byLevel: rewardsByLevel } = useLevelRewards(address)
  const unclaimed = useMemo(
    () => [...rewardsByLevel.entries()].sort(([a], [b]) => a - b),
    [rewardsByLevel]
  )

  const spec = levelSpec(levelState?.level ?? 1)
  const accent = levelState?.accent ?? spec.accent
  // No ceiling on the career track: every level has a next one to fill toward.
  const careerRatio = needed > 0 ? intoLevel / needed : 0

  const missionsDone = progress.missions.filter(isMissionComplete).length
  // What today is still worth — a section header that only counts completions
  // gives the player no reason to read on.
  const xpLeft = progress.missions
    .filter((m) => !isMissionComplete(m))
    .reduce((sum, m) => sum + m.xp, 0)

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
          className="flex max-h-[92dvh] w-full max-w-md flex-col border-[3px] border-ink"
          style={{
            background: 'var(--paper)',
            boxShadow: '6px 6px 0 var(--shadow)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b-[3px] border-ink px-4 py-3">
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

          {/* ── Tabs ── */}
          <div
            className="flex shrink-0 border-b-[3px] border-ink"
            role="tablist"
            aria-label="Progress track"
          >
            {(
              [
                ['weekly', 'Weekly', 'Pays'],
                ['career', 'Career', 'Ranks'],
              ] as const
            ).map(([key, name, kind]) => {
              const active = track === key
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTrack(key)}
                  className="relative flex-1 px-3 pb-2.5 pt-2.5"
                  style={{
                    background: active ? 'var(--paper-2)' : 'transparent',
                  }}
                >
                  <span
                    className="block font-display text-[11px] uppercase tracking-[0.14em]"
                    style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}
                  >
                    {name}
                  </span>
                  <span
                    className="mt-1 block font-display text-[8px] uppercase tracking-[0.18em]"
                    style={{
                      color: active ? 'var(--ink-soft)' : 'var(--muted)',
                    }}
                  >
                    {kind}
                  </span>
                  {/* The selected tab is marked, not just tinted — a tint alone
                      reads as decoration on a dark surface. */}
                  <span
                    className="absolute inset-x-0 bottom-0 h-[4px]"
                    style={{
                      background: active
                        ? 'var(--accent-yellow)'
                        : 'transparent',
                    }}
                  />
                </button>
              )
            })}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {track === 'weekly' ? (
              levelState ? (
                <div className="flex flex-col gap-4">
                  <TrackHead
                    level={levelState.level}
                    chipBg={accent}
                    chipFg="var(--ink-fixed)"
                    badge={<LadderBadge level={levelState.level} size={46} state="earned" />}
                    name={levelState.name}
                    note={`Level ${levelState.level} of ${MAX_WEEKLY_LEVEL} · ${Math.floor(
                      weeklyCompletion * 100
                    )}% of this level`}
                    ratio={weeklyCompletion}
                    fill={accent}
                  />

                  {address && unclaimed.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <SectionHead
                        title="Cash rewards to claim"
                        note={`${unclaimed.length} waiting`}
                      />
                      {unclaimed.map(([rewardLevel, reward]) => (
                        <LevelCashClaim
                          key={reward.id}
                          address={address}
                          level={rewardLevel}
                          reward={reward}
                        />
                      ))}
                    </div>
                  )}

                  <div>
                    <SectionHead
                      title="This level's targets"
                      note={(() => {
                        // Objectives this level doesn't ask for are excluded
                        // from the tally, so "3/3 met" means genuinely done.
                        const required = OBJECTIVE_KEYS.filter(
                          (k) => levelState.targets[k] > 0
                        )
                        const met = required.filter(
                          (k) => levelState.complete[k]
                        )
                        return `${met.length}/${required.length} met`
                      })()}
                    />
                    <div
                      className="mt-1 flex flex-col divide-y"
                      style={{ borderColor: 'var(--rule)' }}
                    >
                      {OBJECTIVE_KEYS.map((key) => (
                        <Objective
                          key={key}
                          objective={key}
                          current={levelState.progress[key] ?? 0}
                          target={levelState.targets[key]}
                          done={levelState.complete[key]}
                        />
                      ))}
                    </div>
                  </div>

                  <Divider />

                  <div>
                    {/* "Pays" belongs to money. Most levels credit power-ups
                        and nothing else, so saying they pay led players to
                        expect cash on a level that has none. Cash is stated
                        separately, and only where there is some. */}
                    <SectionHead title="Clearing this level gives" note="" />
                    <p
                      className="mt-2 font-body text-[11px] leading-snug"
                      style={{ color: 'var(--ink-soft)', margin: '8px 0 0' }}
                    >
                      {spec.reward}
                    </p>
                    {spec.cashMilestone &&
                      (() => {
                        // The pool is a fixed set of slots handed out in the
                        // order players clear the level, so what is left is the
                        // offer itself — not a detail. A player who can see six
                        // remaining has a reason to finish this week.
                        const slot = levelState.cashSlots?.[String(levelState.level)]
                        const gone = slot ? slot.left === 0 && slot.total > 0 : false
                        return (
                          <div
                            className="mt-2 inline-flex items-center gap-1.5 border-[2px] border-ink px-2 py-1"
                            style={{
                              background: gone ? 'var(--rule)' : accent,
                              color: gone ? 'var(--ink-soft)' : 'var(--ink-fixed)',
                            }}
                          >
                            <span className="font-display text-[11px]" aria-hidden>
                              $
                            </span>
                            <span className="font-display text-[9px] tracking-[0.1em]">
                              {gone
                                ? 'CASH REWARDS ALL CLAIMED'
                                : slot && slot.total > 0
                                  ? `PLUS A CASH REWARD · ${slot.left} OF ${slot.total} LEFT`
                                  : 'PLUS A CASH REWARD'}
                            </span>
                          </div>
                        )
                      })()}
                  </div>

                  {levelState.atRisk && levelState.level > 1 && (
                    <div
                      className="flex items-center gap-2 border-[2px] border-ink px-3 py-2"
                      style={{
                        background: 'var(--paper-pink)',
                        color: 'var(--ink-fixed)',
                      }}
                    >
                      <BrutalIcon name="alert" size={13} strokeWidth={3} />
                      <span className="font-display text-[9px] tracking-[0.08em]">
                        CLEAR A LEVEL BEFORE MONDAY OR DROP TO{' '}
                        {levelState.level - 1}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowLadder(true)}
                    className="border-[2px] border-ink px-3 py-2.5 font-display text-[9px] uppercase tracking-[0.14em]"
                    style={{
                      background: 'var(--paper-2)',
                      color: 'var(--ink)',
                    }}
                  >
                    All {MAX_WEEKLY_LEVEL} levels
                  </button>
                </div>
              ) : (
                <p
                  className="py-10 text-center font-display text-[10px] uppercase leading-relaxed tracking-[0.14em]"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  Weekly ladder unavailable
                  <br />
                  right now
                </p>
              )
            ) : (
              <div className="flex flex-col gap-4">
                <TrackHead
                  level={level}
                  chipBg="var(--ink-fixed)"
                  chipFg="var(--accent-yellow)"
                  name={title}
                  note={`${intoLevel.toLocaleString()} / ${needed.toLocaleString()} XP to level ${level + 1}`}
                  ratio={careerRatio}
                  fill="var(--accent-lime)"
                />

                <div>
                  <SectionHead
                    title="Today's missions"
                    note={
                      // An empty list is "not connected yet", not "all done" —
                      // missions are rolled per address.
                      progress.missions.length === 0
                        ? 'Connect to play'
                        : xpLeft > 0
                          ? `${missionsDone}/${progress.missions.length} · ${xpLeft} XP left`
                          : 'All done'
                    }
                  />
                  {progress.missions.length === 0 ? (
                    <p
                      className="mt-3 font-body text-[11px] leading-snug"
                      style={{ color: 'var(--ink-soft)', margin: '12px 0 0' }}
                    >
                      Three missions are rolled for you each day. Connect a
                      wallet to start earning XP toward the next level.
                    </p>
                  ) : (
                    <div
                      className="mt-1 flex flex-col divide-y"
                      style={{ borderColor: 'var(--rule)' }}
                    >
                      {progress.missions.map((mission, i) => (
                        <MissionRow
                          key={`${mission.kind}-${mission.target}-${i}`}
                          mission={mission}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showLadder && levelState && (
        <LevelLadderModal
          state={levelState}
          onClose={() => setShowLadder(false)}
          rewardsByLevel={rewardsByLevel}
          address={address}
        />
      )}
    </>,
    document.body
  )
}

export default ProgressSheet
