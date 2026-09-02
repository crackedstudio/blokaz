/**
 * MY STATS — the full meta-progression view behind the header's nav button.
 *
 * The lobby panel is a glance: level, XP, today's three missions. This is the
 * whole record — lifetime totals and the achievement list, which had no home in
 * the UI at all until now. Same source (metaStore, localStorage), same
 * brutalist surface language as the rest of the lobby: 3px ink borders, hard
 * offset shadows, accent header strips.
 */

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMetaStore } from '../stores/metaStore'
import { ACHIEVEMENTS, isMissionComplete, MAX_LEVEL } from '../engine/meta'
import { BrutalIcon } from './BrutalIcon'
import MissionRow from './MissionRow'
import { BlockRain } from './blocks/BlockFX'
import { AchievementBadge } from './badges'

// ── Section heading ──────────────────────────────────────────────────────────

const SectionBar: React.FC<{ title: string; trailing?: React.ReactNode }> = ({
  title,
  trailing,
}) => (
  <div
    className="flex items-center justify-between gap-2 border-b-[3px] border-t-[3px] border-ink px-4 py-2.5"
    style={{ background: 'var(--paper-2)' }}
  >
    <span
      className="font-display text-[10px] tracking-[0.18em]"
      style={{ color: 'var(--label-soft)' }}
    >
      {title}
    </span>
    {trailing}
  </div>
)

const CountChip: React.FC<{ children: React.ReactNode; complete?: boolean }> = ({
  children,
  complete = false,
}) => (
  <span
    className="border-[2px] border-ink px-1.5 py-[1px] font-display text-[8px] tabular-nums tracking-[0.1em]"
    style={{
      background: complete ? 'var(--accent-lime)' : 'var(--paper)',
      color: complete ? 'var(--ink-fixed)' : 'var(--ink)',
    }}
  >
    {children}
  </span>
)

// ── One lifetime figure ──────────────────────────────────────────────────────

const StatTile: React.FC<{
  label: string
  value: string
  background: string
}> = ({ label, value, background }) => {
  const coloured = background !== 'var(--paper-2)'
  return (
    <div
      className="border-[2px] border-ink p-3"
      style={{ background, boxShadow: '3px 3px 0 var(--shadow)' }}
    >
      <div
        className="font-display text-[8px] tracking-[0.14em]"
        style={{ color: coloured ? 'var(--ink-fixed)' : 'var(--ink-soft)', opacity: coloured ? 0.75 : 1 }}
      >
        {label}
      </div>
      <div
        className="mt-1.5 font-display text-[20px] tabular-nums"
        style={{
          color: coloured ? 'var(--ink-fixed)' : 'var(--ink)',
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ── One achievement ──────────────────────────────────────────────────────────

const AchievementRow: React.FC<{
  id: string
  name: string
  description: string
  xp: number
  unlocked: boolean
}> = ({ id, name, description, xp, unlocked }) => (
  <div
    className="flex items-center gap-3 border-[2px] border-ink px-3 py-2.5"
    style={{
      background: unlocked ? 'var(--paper-2)' : 'var(--paper)',
      boxShadow: unlocked ? '3px 3px 0 var(--shadow)' : 'none',
      opacity: unlocked ? 1 : 0.62,
    }}
  >
    <AchievementBadge id={id} name={name} size={34} locked={!unlocked} />
    <div className="min-w-0 flex-1 leading-tight">
      <div className="truncate font-display text-[10px] tracking-[0.1em]">{name}</div>
      <div
        className="mt-0.5 truncate font-body text-[10px]"
        style={{ color: 'var(--ink-soft)' }}
      >
        {description}
      </div>
    </div>
    <span
      className="shrink-0 border-[2px] border-ink px-1.5 py-[1px] font-display text-[8px] tracking-[0.1em]"
      style={{
        background: unlocked ? 'var(--accent-lime)' : 'var(--paper-2)',
        color: unlocked ? 'var(--ink-fixed)' : 'var(--ink-soft)',
      }}
    >
      {unlocked ? 'UNLOCKED' : `+${xp} XP`}
    </span>
  </div>
)

// ── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

const StatsModal: React.FC<Props> = ({ onClose }) => {
  const { level, intoLevel, needed, title, progress, address } = useMetaStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const atMax = level >= MAX_LEVEL
  const pct = atMax ? 100 : Math.min(100, Math.round((intoLevel / needed) * 100))
  const unlocked = new Set(progress.unlockedAchievements)
  const missionsDone = progress.missions.filter(isMissionComplete).length
  const { lifetime } = progress

  // Portalled to the body on purpose: the lobby wraps its panels in FadeUp,
  // which keeps a transform on the wrapper, and a transformed ancestor becomes
  // the containing block for `fixed` children — the overlay would otherwise be
  // trapped inside the panel instead of covering the screen.
  return createPortal(
    <div
      className="fixed inset-0 z-[420] flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-label="My stats"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col border-[3px] border-ink"
        style={{ background: 'var(--paper)', boxShadow: '8px 8px 0 var(--shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="relative flex shrink-0 items-center justify-between gap-3 overflow-hidden border-b-[3px] border-ink px-4 py-3"
          style={{ background: 'var(--accent-yellow)', color: 'var(--ink-fixed)' }}
        >
          <BlockRain count={3} distance={110} from={62} to={88} size={[14, 20]} seed={3} opacity={0.75} />
          <div className="relative z-[1] flex min-w-0 items-center gap-3">
            <div
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center border-[3px] border-ink font-display text-[16px]"
              style={{ background: 'var(--ink-fixed)', color: 'var(--accent-yellow)' }}
            >
              {address ? level : '–'}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="font-display text-[10px] tracking-[0.18em]">MY STATS</div>
              <div className="mt-0.5 truncate font-display text-[14px] tracking-[0.04em]">
                {address ? `LEVEL ${level} · ${title}` : 'NOT CONNECTED'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="relative z-[1] shrink-0 border-[3px] border-ink p-1.5"
            style={{ background: 'var(--paper)', color: 'var(--ink)' }}
          >
            <BrutalIcon name="close" size={14} strokeWidth={3} />
          </button>
        </div>

        {!address ? (
          <div
            className="px-6 py-10 text-center font-display text-[11px] uppercase leading-relaxed tracking-[0.14em]"
            style={{ color: 'var(--ink-soft)' }}
          >
            Connect your wallet to start
            <br />
            tracking levels, missions and records.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {/* ── XP toward the next level ── */}
            <div className="px-4 py-3" style={{ background: 'var(--paper)' }}>
              <div className="flex items-center justify-between">
                <span
                  className="font-display text-[9px] tracking-[0.14em]"
                  style={{ color: 'var(--label-soft)' }}
                >
                  {atMax ? 'MAX LEVEL' : `NEXT: LEVEL ${level + 1}`}
                </span>
                <span
                  className="font-display text-[9px] tabular-nums tracking-[0.08em]"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  {atMax
                    ? `${progress.totalXp.toLocaleString()} XP`
                    : `${intoLevel.toLocaleString()} / ${needed.toLocaleString()} XP`}
                </span>
              </div>
              <div
                className="mt-2 h-[14px] border-[2px] border-ink"
                style={{ background: 'var(--paper-2)' }}
                role="progressbar"
                aria-label="Level progress"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background:
                      'repeating-linear-gradient(135deg, var(--accent-cyan) 0 12px, var(--accent-lime) 12px 24px)',
                  }}
                />
              </div>
            </div>

            {/* ── Lifetime record ── */}
            <SectionBar title="LIFETIME" />
            <div className="grid grid-cols-2 gap-3 px-4 py-3">
              <StatTile
                label="BEST SCORE"
                value={lifetime.bestScore.toLocaleString()}
                background="var(--accent-lime)"
              />
              <StatTile
                label="BEST COMBO"
                value={`${lifetime.bestCombo}×`}
                background="var(--accent-cyan)"
              />
              <StatTile
                label="GAMES PLAYED"
                value={lifetime.gamesPlayed.toLocaleString()}
                background="var(--paper-2)"
              />
              <StatTile
                label="LINES CLEARED"
                value={lifetime.totalLines.toLocaleString()}
                background="var(--paper-2)"
              />
              <StatTile
                label="TOTAL SCORE"
                value={lifetime.totalScore.toLocaleString()}
                background="var(--paper-2)"
              />
              <StatTile
                label="TOTAL XP"
                value={progress.totalXp.toLocaleString()}
                background="var(--paper-2)"
              />
            </div>

            {/* ── Today's missions ── */}
            <SectionBar
              title="TODAY'S MISSIONS"
              trailing={
                <CountChip
                  complete={missionsDone === progress.missions.length && missionsDone > 0}
                >
                  {missionsDone}/{progress.missions.length}
                </CountChip>
              }
            />
            <div className="flex flex-col gap-2.5 px-4 py-3">
              {progress.missions.map((mission, i) => (
                <MissionRow key={`${mission.kind}-${mission.target}-${i}`} mission={mission} />
              ))}
            </div>

            {/* ── Achievements ── */}
            <SectionBar
              title="ACHIEVEMENTS"
              trailing={
                <CountChip complete={unlocked.size === ACHIEVEMENTS.length}>
                  {unlocked.size}/{ACHIEVEMENTS.length}
                </CountChip>
              }
            />
            <div
              className="flex flex-col gap-2.5 px-4 py-3"
              style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
            >
              {/* Earned first — the list is a trophy shelf, not a to-do list. */}
              {[...ACHIEVEMENTS]
                .sort(
                  (a, b) =>
                    Number(unlocked.has(b.id)) - Number(unlocked.has(a.id)) || a.xp - b.xp
                )
                .map((achievement) => (
                  <AchievementRow
                    key={achievement.id}
                    id={achievement.id}
                    name={achievement.name}
                    description={achievement.description}
                    xp={achievement.xp}
                    unlocked={unlocked.has(achievement.id)}
                  />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default StatsModal
