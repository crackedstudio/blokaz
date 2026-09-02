/**
 * One daily-mission row — shared by the progress sheet and StatsModal.
 *
 * Deliberately not a card. Three bordered, shadowed cards stacked in a sheet
 * cost ~136px each and, at zero progress, rendered as three identical hollow
 * rectangles. This is two lines separated by a hairline, and progress reads as
 * board cells filling rather than a bar that is empty until it isn't.
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

/**
 * Progress as cells on a board rather than a filled bar.
 *
 * Small targets get one cell each, so "reach a 3× combo" is literally three
 * cells. Larger targets collapse to ten, where each cell is a tenth. Either
 * way an untouched mission still shows its shape instead of a blank strip.
 */
export const Pips: React.FC<{
  current: number
  target: number
  done: boolean
  size?: number
}> = ({ current, target, done, size = 9 }) => {
  const cells = target > 0 && target <= 12 ? target : 10
  const ratio = target > 0 ? Math.min(1, current / target) : 1
  const filled = done ? cells : Math.floor(ratio * cells)
  // Anything started but short of a whole cell still lights the first one —
  // "some progress" and "none" must not look identical.
  const lit = filled === 0 && current > 0 ? 1 : filled

  return (
    <div className="flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          className="flex-1 border-[2px] border-ink"
          style={{
            // No max width: every row ends at the same right edge whether it
            // has three cells or ten, so a column of missions reads as one
            // block rather than a ragged staircase.
            height: size,
            background:
              i < lit ? (done ? 'var(--accent-lime)' : 'var(--accent-yellow)') : 'transparent',
            opacity: i < lit ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  )
}

const MissionRow: React.FC<{ mission: ActiveMission }> = ({ mission }) => {
  const complete = isMissionComplete(mission)
  const current = Math.min(mission.progress, mission.target)

  return (
    <div className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center border-[2px] border-ink"
          style={{
            background: complete ? 'var(--accent-lime)' : 'var(--accent-yellow)',
            color: 'var(--ink-fixed)',
          }}
        >
          <BrutalIcon
            name={complete ? 'check' : MISSION_ICONS[mission.kind]}
            size={12}
            strokeWidth={3}
          />
        </span>

        <span
          className="min-w-0 flex-1 truncate font-display text-[10px] tracking-[0.04em]"
          style={{
            color: complete ? 'var(--ink-soft)' : 'var(--ink)',
            textDecoration: complete ? 'line-through' : 'none',
          }}
        >
          {mission.label}
        </span>

        <span
          className="shrink-0 font-display text-[10px] tabular-nums tracking-[0.04em]"
          style={{ color: 'var(--ink-soft)' }}
        >
          {complete ? 'DONE' : `${current.toLocaleString()}/${mission.target.toLocaleString()}`}
        </span>

        <span
          className="shrink-0 font-display text-[9px] tabular-nums tracking-[0.06em]"
          style={{ color: complete ? 'var(--accent-lime)' : 'var(--label-soft)' }}
        >
          +{mission.xp}
        </span>
      </div>

      {/* Indented to sit under the label, not the icon. */}
      <div className="pl-[32px]">
        <Pips current={mission.progress} target={mission.target} done={complete} />
      </div>
    </div>
  )
}

export default MissionRow
