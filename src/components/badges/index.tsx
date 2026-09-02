/**
 * Badge components — ported from the Claude Design project "Blokaz Badge
 * System". Two changes from the design file, both to fit the running app:
 *
 *  1. No `ground` prop. The design took an explicit 'cream' | 'navy' |
 *     'forest'; the app already knows its theme through CSS custom
 *     properties, so the badge reads --ink and --badge-lock and follows the
 *     theme on its own. Every call site would otherwise have to thread the
 *     current theme down.
 *
 *  2. No duplicated ladder table. The design file carried its own copy of the
 *     twelve names, accents and cash flags. constants/levels.ts is a
 *     hand-mirrored contract with the server, so a second copy is a liability
 *     — `level` is looked up there instead. (Verified identical at port time:
 *     all twelve names and accents, and cash on 4/8/12.)
 */

import React from 'react'
import { levelSpec, MAX_LEVEL } from '../../constants/levels'
import {
  ACHIEVEMENT_ACCENTS,
  ACHIEVEMENT_ICONS,
  BADGE_INK,
  LADDER_ICONS,
} from './icons'

/**
 * Border and drop shadow both take --ink, as the design specifies: on navy and
 * forest that is a light shadow, which is what makes a badge read as a sticker
 * sitting on the panel rather than another card in it. Change this one
 * constant to var(--shadow) to fall in line with the app's other surfaces.
 */
const BADGE_EDGE = 'var(--ink)'

/** Levels past the eighth have no matching score tier — they get a second frame. */
const isPostSystem = (level: number) => level >= 9

// ── Ornaments ───────────────────────────────────────────────────────────────

const LockGlyph: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" fill="none" stroke={BADGE_EDGE} strokeWidth="2.4" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={BADGE_EDGE} strokeWidth="2.4" fill="none" strokeLinecap="square" />
    <rect x="10.5" y="13.5" width="3" height="3.5" fill={BADGE_EDGE} />
  </svg>
)

/** Corner ribbon for a rung whose reward has already been paid. */
const ClaimedRibbon: React.FC = () => (
  <div style={{ position: 'absolute', top: -3, left: -3, width: 26, height: 26, overflow: 'hidden', zIndex: 3 }}>
    <div
      style={{
        position: 'absolute', top: 4, left: -9, width: 40, height: 12,
        background: BADGE_EDGE, transform: 'rotate(-45deg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span style={{ fontFamily: '"Archivo Black", sans-serif', fontSize: 7, color: 'var(--paper)' }}>✓</span>
    </div>
  </div>
)

/** Stablecoin marker for levels 4, 8 and 12 — readable without the row beside it. */
const CashChip: React.FC<{ size: number }> = ({ size }) => {
  const s = Math.max(16, size * 0.32)
  return (
    <div
      style={{
        position: 'absolute', bottom: -s * 0.28, right: -s * 0.28, width: s, height: s,
        background: '#ffd51f', border: `2px solid ${BADGE_EDGE}`, boxShadow: `2px 2px 0 ${BADGE_EDGE}`,
        display: 'grid', placeItems: 'center', zIndex: 4,
      }}
    >
      <span style={{ fontFamily: '"Archivo Black", sans-serif', fontSize: s * 0.52, color: BADGE_INK, lineHeight: 1 }}>
        $
      </span>
    </div>
  )
}

// ── Ladder badge ────────────────────────────────────────────────────────────

export type LadderBadgeState = 'locked' | 'earned' | 'claimed'

interface LadderBadgeProps {
  level: number
  size?: number
  state?: LadderBadgeState
  /** The level numeral in the corner. Drop it below ~32px, where it stops reading. */
  showLevel?: boolean
  className?: string
}

export const LadderBadge: React.FC<LadderBadgeProps> = ({
  level,
  size = 46,
  state = 'earned',
  showLevel = true,
  className = '',
}) => {
  const clamped = Math.min(Math.max(level, 1), MAX_LEVEL)
  const spec = levelSpec(clamped)
  const locked = state === 'locked'
  const fill = locked ? 'var(--badge-lock)' : spec.accent
  const icon = LADDER_ICONS[clamped]
  const post = isPostSystem(clamped)
  const outer = post ? Math.round(size * 0.09) : 0

  return (
    <div
      className={className}
      style={{ position: 'relative', width: size + outer, height: size + outer, flexShrink: 0 }}
      role="img"
      aria-label={`Level ${clamped}, ${spec.name}, ${state}`}
    >
      {post && <div style={{ position: 'absolute', inset: 0, border: `2px solid ${BADGE_EDGE}`, opacity: 0.45 }} />}

      <div
        style={{
          position: 'absolute', left: outer / 2, top: outer / 2, width: size, height: size,
          background: fill, border: `3px solid ${BADGE_EDGE}`, boxShadow: `5px 5px 0 ${BADGE_EDGE}`,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, opacity: locked ? 0.35 : 1 }} aria-hidden="true">
          {icon?.(spec.accent)}
        </div>

        {locked && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <LockGlyph size={size * 0.32} />
          </div>
        )}

        {showLevel && (
          <div
            style={{
              position: 'absolute', bottom: -1, left: 0, background: BADGE_EDGE, color: fill,
              fontFamily: '"Archivo Black", sans-serif', fontSize: Math.max(9, size * 0.15),
              padding: `${Math.max(1, size * 0.02)}px ${Math.max(3, size * 0.05)}px`, lineHeight: 1,
            }}
          >
            {clamped}
          </div>
        )}

        {spec.cashMilestone && !locked && <CashChip size={size} />}
        {state === 'claimed' && <ClaimedRibbon />}
      </div>
    </div>
  )
}

// ── Achievement badge ───────────────────────────────────────────────────────

interface AchievementBadgeProps {
  /** An id from engine/meta.ts ACHIEVEMENTS. */
  id: string
  name?: string
  size?: number
  locked?: boolean
  className?: string
}

export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  id,
  name,
  size = 46,
  locked = false,
  className = '',
}) => {
  const accent = ACHIEVEMENT_ACCENTS[id] ?? '#ffd51f'
  const split = accent === 'split'
  const fill = locked ? 'var(--badge-lock)' : split ? '#ffd51f' : accent
  const icon = ACHIEVEMENT_ICONS[id]

  return (
    <div
      className={className}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      role="img"
      aria-label={name ? `${name}${locked ? ', locked' : ', unlocked'}` : id}
    >
      <div
        style={{
          position: 'relative', width: size, height: size, background: fill,
          border: `3px solid ${BADGE_EDGE}`, boxShadow: `5px 5px 0 ${BADGE_EDGE}`, overflow: 'hidden',
        }}
      >
        {split && !locked && (
          <div
            style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #ff3d3d 50%, #ffd51f 50%)' }}
            aria-hidden="true"
          />
        )}
        <div style={{ position: 'absolute', inset: 0, opacity: locked ? 0.35 : 1 }} aria-hidden="true">
          {icon?.(split ? '#ffd51f' : accent)}
        </div>
        {locked && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <LockGlyph size={size * 0.32} />
          </div>
        )}
      </div>
    </div>
  )
}
