/**
 * The lobby's compartment.
 *
 * One card says one thing: an icon, a micro label, and a figure. Anything more
 * — meters, rows, bodies of copy — belongs in the sheet the card opens.
 *
 * The restraint is on INFORMATION, not on colour. Every card takes a piece
 * colour and a hard offset shadow, lifts on hover and presses on click, so a
 * page with six facts on it still reads as a game rather than a settings
 * screen. Anything decorative here is animation or colour, never more text.
 */

import React from 'react'
import { BrutalIcon } from '../BrutalIcon'

type IconName = React.ComponentProps<typeof BrutalIcon>['name']

export type Tone =
  | 'red'
  | 'blue'
  | 'lime'
  | 'cyan'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'pink'
  | 'ink'

interface ToneSpec {
  bg: string
  fg: string
  soft: string
  /** The icon plate. Always the opposite pole of the card so the icon pops. */
  chip: string
  chipFg: string
}

/**
 * Piece colours are fixed hexes in every theme, so each tone pins its own
 * foreground rather than following the theme's ink.
 */
const TONES: Record<Tone, ToneSpec> = {
  red: {
    bg: 'var(--piece-red)',
    fg: '#ffffff',
    soft: 'rgba(255,255,255,0.82)',
    chip: 'var(--ink-fixed)',
    chipFg: 'var(--accent-yellow)',
  },
  blue: {
    bg: 'var(--piece-blue)',
    fg: '#ffffff',
    soft: 'rgba(255,255,255,0.82)',
    chip: 'var(--ink-fixed)',
    chipFg: 'var(--piece-cyan)',
  },
  purple: {
    bg: 'var(--piece-purple)',
    fg: '#ffffff',
    soft: 'rgba(255,255,255,0.82)',
    chip: 'var(--ink-fixed)',
    chipFg: 'var(--accent-lime)',
  },
  pink: {
    bg: 'var(--accent-pink)',
    fg: '#ffffff',
    soft: 'rgba(255,255,255,0.82)',
    chip: 'var(--ink-fixed)',
    chipFg: '#ffffff',
  },
  orange: {
    bg: 'var(--accent-orange)',
    fg: 'var(--ink-fixed)',
    soft: 'rgba(12,12,16,0.72)',
    chip: 'var(--ink-fixed)',
    chipFg: 'var(--accent-orange)',
  },
  lime: {
    bg: 'var(--piece-lime)',
    fg: 'var(--ink-fixed)',
    soft: 'rgba(12,12,16,0.72)',
    chip: 'var(--ink-fixed)',
    chipFg: 'var(--piece-lime)',
  },
  cyan: {
    bg: 'var(--piece-cyan)',
    fg: 'var(--ink-fixed)',
    soft: 'rgba(12,12,16,0.72)',
    chip: 'var(--ink-fixed)',
    chipFg: 'var(--piece-cyan)',
  },
  yellow: {
    bg: 'var(--accent-yellow)',
    fg: 'var(--ink-fixed)',
    soft: 'rgba(12,12,16,0.72)',
    chip: 'var(--ink-fixed)',
    chipFg: 'var(--accent-yellow)',
  },
  ink: {
    bg: 'var(--ink-fixed)',
    fg: '#ffffff',
    soft: 'rgba(255,255,255,0.6)',
    chip: 'var(--accent-yellow)',
    chipFg: 'var(--ink-fixed)',
  },
}

interface CardProps {
  icon: IconName
  label: string
  /** The one figure this compartment exists to show. */
  value?: string
  tone: Tone
  /** PLAY only — the single card allowed to shout. */
  hero?: boolean
  /** Small cards drop the figure and shrink to a strip. */
  mini?: boolean
  /** Entrance stagger, in ms. */
  delay?: number
  /** Decorative layer painted behind the content — never information. */
  decoration?: React.ReactNode
  onClick?: () => void
}

export const Card: React.FC<CardProps> = ({
  icon,
  label,
  value,
  tone,
  hero = false,
  mini = false,
  delay = 0,
  decoration,
  onClick,
}) => {
  const t = TONES[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={value ? `${label}: ${value}` : label}
      className={`lobby-card relative flex h-full w-full min-w-0 flex-col overflow-hidden border-[3px] border-ink text-left ${
        mini ? 'gap-2 px-3 py-3' : hero ? 'gap-6 px-5 py-6' : 'gap-3 px-4 py-4'
      }`}
      style={{
        background: t.bg,
        color: t.fg,
        boxShadow: hero ? '8px 8px 0 var(--shadow)' : '5px 5px 0 var(--shadow)',
        minHeight: hero ? 190 : mini ? 62 : 118,
        animation: `cardIn 420ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      {decoration}

      {/* The icon is the label. The word under it is a caption for the icon. */}
      <span
        className="relative z-[1] flex shrink-0 items-center justify-center border-[2px] border-ink"
        style={{
          width: hero ? 46 : mini ? 24 : 32,
          height: hero ? 46 : mini ? 24 : 32,
          background: t.chip,
          color: t.chipFg,
        }}
      >
        <BrutalIcon name={icon} size={hero ? 23 : mini ? 14 : 17} strokeWidth={2.5} />
      </span>

      <div className="relative z-[1] min-w-0">
        <span
          className="block font-display uppercase leading-none tracking-[0.18em]"
          style={{ fontSize: mini ? 8 : 9, color: t.soft }}
        >
          {label}
        </span>
        {value !== undefined && (
          <span
            className="mt-2 block font-display tabular-nums"
            style={{
              fontSize: hero ? 'clamp(40px, 6.5vw, 72px)' : 'clamp(24px, 3.2vw, 34px)',
              lineHeight: 0.86,
              letterSpacing: '-0.045em',
              textShadow: hero ? '3px 3px 0 rgba(0,0,0,0.28)' : undefined,
            }}
          >
            {value}
          </span>
        )}
      </div>
    </button>
  )
}
