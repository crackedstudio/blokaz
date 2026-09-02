/**
 * One daily-mission row — shared by the lobby's progression tile and
 * StatsModal so the same mission never renders two different ways.
 */

import React from 'react'
import { isMissionComplete } from '../engine/meta'
import type { ActiveMission, MissionKind } from '../engine/meta'
import { BrutalIcon } from './BrutalIcon'

/** One glyph per mission kind, so a row is readable before it is read. */
export const MISSION_ICONS: Record<
  MissionKind,
  'star' | 'zap' | 'flame' | 'play' | 'rocket'
> = {
  score_run: 'star',
  lines_total: 'zap',
  combo_run: 'flame',
  games_total: 'play',
  multi_total: 'rocket',
}

const MissionRow: React.FC<{ mission: ActiveMission }> = ({ mission }) => {
  const complete = isMissionComplete(mission)
  const pct = Math.min(100, Math.round((mission.progress / mission.target) * 100))

  return (
    <div
      className="border-[2px] border-ink px-3 py-2.5"
      style={{
        background: complete ? 'var(--paper)' : 'var(--paper-2)',
        boxShadow: complete ? 'none' : '3px 3px 0 var(--shadow)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center border-[2px] border-ink"
            style={{
              background: complete ? 'var(--accent-lime)' : 'var(--accent-yellow)',
              color: 'var(--ink-fixed)',
            }}
          >
            <BrutalIcon
              name={complete ? 'check' : MISSION_ICONS[mission.kind]}
              size={10}
              strokeWidth={3}
            />
          </span>
          <span
            className="truncate font-display text-[9px] leading-tight tracking-[0.08em]"
            style={{
              color: complete ? 'var(--ink-soft)' : 'var(--ink)',
              textDecoration: complete ? 'line-through' : 'none',
            }}
          >
            {mission.label}
          </span>
        </span>
        <span
          className="shrink-0 border-[2px] border-ink px-1.5 py-[1px] font-display text-[8px] tracking-[0.1em]"
          style={{
            // The lime "DONE" chip is a fixed colour in both themes, so it
            // takes fixed ink. The pending chip sits on paper and must follow
            // the theme's own ink or it vanishes in dark mode.
            background: complete ? 'var(--accent-lime)' : 'var(--paper)',
            color: complete ? 'var(--ink-fixed)' : 'var(--ink)',
          }}
        >
          {complete ? 'DONE' : `+${mission.xp} XP`}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div
          className="h-[8px] flex-1 border-[2px] border-ink"
          style={{ background: 'var(--paper)' }}
          role="progressbar"
          aria-label={mission.label}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              background: complete ? 'var(--accent-lime)' : 'var(--accent-yellow)',
            }}
          />
        </div>
        <span
          className="shrink-0 font-display text-[8px] tabular-nums tracking-[0.08em]"
          style={{ color: 'var(--ink-soft)' }}
        >
          {Math.min(mission.progress, mission.target).toLocaleString()}/
          {mission.target.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

export default MissionRow
