import React from 'react'
import { LEVELS } from '../constants/levels'
import type { LadderStanding } from '../hooks/usePlayerLevel'
import { LadderBadge } from './badges'
import PlayerName from './PlayerName'

/**
 * Who is furthest up the ladder.
 *
 * Presentational — the caller owns the fetch, so the rankings drawer and the
 * ladder view each read once rather than twice when both happen to be open.
 *
 * `compact` is the strip inside the ladder view, where the rungs below are the
 * main event. `full` is the rankings drawer, where this IS the content and can
 * afford the room.
 */
const LadderStandings: React.FC<{
  rows: LadderStanding[]
  you?: string
  variant?: 'compact' | 'full'
}> = ({ rows, you, variant = 'compact' }) => {
  if (rows.length === 0) return null

  const compact = variant === 'compact'

  return (
    <div className={compact ? 'flex flex-col gap-1.5' : 'flex flex-col gap-3'}>
      {rows.map((row) => {
        const isYou = !!you && row.address.toLowerCase() === you.toLowerCase()
        const accent = LEVELS[row.level]?.accent ?? 'var(--accent-yellow)'

        return (
          <div
            key={row.address}
            className={
              compact
                ? 'flex items-center gap-2 border-[2px] border-ink px-2 py-1'
                : 'flex items-center gap-3 border-4 border-ink px-3 py-3'
            }
            style={{
              background: isYou ? accent : 'var(--paper-2)',
              color: isYou ? 'var(--ink-fixed)' : 'var(--ink)',
              boxShadow: compact ? undefined : '4px 4px 0 var(--shadow)',
            }}
          >
            <span
              className={`shrink-0 text-center font-display tabular-nums ${
                compact ? 'w-5 text-[10px]' : 'w-8 text-[18px]'
              }`}
            >
              {row.rank}
            </span>

            <LadderBadge
              level={row.level}
              size={compact ? 20 : 34}
              state="earned"
              showLevel={false}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <PlayerName
                  address={row.address}
                  isCurrentUser={isYou}
                  className={compact ? 'font-body text-[11px]' : 'font-body text-sm'}
                />
                {isYou && !compact && (
                  <span
                    className="px-1.5 py-0.5 font-display text-[9px] tracking-[0.1em]"
                    style={{
                      background: 'var(--ink)',
                      color: 'var(--paper)',
                      border: '2px solid var(--ink)',
                    }}
                  >
                    YOU
                  </span>
                )}
              </div>
              {!compact && (
                <div className="mt-0.5 font-display text-[9px] tracking-[0.12em] opacity-70">
                  {row.name}
                </div>
              )}
            </div>

            <span
              className={`shrink-0 font-display tracking-[0.08em] ${
                compact ? 'text-[9px]' : 'text-[11px]'
              }`}
            >
              LVL {row.level}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default LadderStandings
