import React from 'react'
import type { StreakDay } from '../hooks/useDailyStreak'

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * The last seven days, oldest first, filled where the player finished a run.
 *
 * The letters come from the dates themselves rather than a fixed M–S row, so
 * the strip always ends on today. Both panels that drew this used to fill their
 * bars from the current weekday, which showed a player who had never played a
 * week that was mostly complete.
 */
const StreakStrip: React.FC<{ week: StreakDay[]; height?: number }> = ({
  week,
  height = 18,
}) => {
  // Before the count has loaded — or with no wallet connected — draw the seven
  // days as unplayed rather than collapsing the panel, so it keeps its shape
  // and reads as an empty week instead of a missing feature.
  const days =
    week.length > 0
      ? week
      : Array.from({ length: 7 }, (_, i) => ({
          day: new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10),
          played: false,
        }))

  return (
    <div className="flex gap-1.5">
      {days.map(({ day, played }, i) => {
        const isToday = i === days.length - 1
        return (
          <div key={day} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full border-2 border-ink"
              style={{
                height,
                background: played ? 'var(--accent-lime)' : 'var(--rule)',
                // Today is the one the player can still change, so it is
                // outlined rather than left to read as just another gap.
                outline: isToday && !played ? '2px dashed var(--ink-soft)' : undefined,
                outlineOffset: -2,
              }}
              title={day}
            />
            <span
              className="font-display text-[8px]"
              style={{ color: isToday ? 'var(--ink)' : 'var(--ink-soft)' }}
            >
              {WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default StreakStrip
