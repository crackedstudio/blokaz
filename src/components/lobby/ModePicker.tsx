/**
 * MODE PICKER — the one thing behind PLAY.
 *
 * The lobby used to offer Classic and Tournaments as two competing cards, which
 * made the home screen ask a question before it offered an action. There is one
 * PLAY button now, and the choice happens here, where each mode can state its
 * own terms — free versus paid entry, leaderboard versus prize pool — instead
 * of compressing that into a card subtitle.
 */

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BrutalIcon } from '../BrutalIcon'

type IconName = React.ComponentProps<typeof BrutalIcon>['name']

const Mode: React.FC<{
  icon: IconName
  title: string
  figure: string
  figureLabel: string
  blurb: string
  bg: string
  fg: string
  soft: string
  onClick: () => void
}> = ({ icon, title, figure, figureLabel, blurb, bg, fg, soft, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="lobby-card relative flex w-full flex-col gap-4 overflow-hidden border-[3px] border-ink px-5 py-5 text-left"
    style={{ background: bg, color: fg, boxShadow: '5px 5px 0 var(--shadow)' }}
  >
    <div className="relative z-[1] flex items-start justify-between gap-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center border-[2px] border-ink"
        style={{ background: 'var(--ink-fixed)', color: bg }}
      >
        <BrutalIcon name={icon} size={19} strokeWidth={2.5} />
      </span>
      <div className="text-right">
        <span
          className="block font-display tabular-nums"
          style={{ fontSize: 28, lineHeight: 0.9, letterSpacing: '-0.04em' }}
        >
          {figure}
        </span>
        <span
          className="mt-1 block font-display text-[8px] uppercase tracking-[0.18em]"
          style={{ color: soft }}
        >
          {figureLabel}
        </span>
      </div>
    </div>

    <div className="relative z-[1]">
      <span
        className="block font-display uppercase"
        style={{ fontSize: 26, lineHeight: 0.92, letterSpacing: '-0.035em' }}
      >
        {title}
      </span>
      <span
        className="mt-2 block font-display text-[9px] uppercase leading-relaxed tracking-[0.14em]"
        style={{ color: soft }}
      >
        {blurb}
      </span>
    </div>
  </button>
)

interface Props {
  onClassic: () => void
  onTournaments: () => void
  /** Formatted total prize pool across open brackets. */
  pool: string
  openCount: number
  /** Web visitors outside MiniPay get one trial run before the gate. */
  trialGated: boolean
  onClose: () => void
}

const ModePicker: React.FC<Props> = ({
  onClassic,
  onTournaments,
  pool,
  openCount,
  trialGated,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[420] flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a mode"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col border-[3px] border-ink"
        style={{ background: 'var(--paper)', boxShadow: '8px 8px 0 var(--shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b-[3px] border-ink px-4 py-3">
          <span className="font-display text-[11px] uppercase tracking-[0.18em]">
            Choose a mode
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

        <div className="flex flex-col gap-3 overflow-y-auto overscroll-contain p-4">
          <Mode
            icon="play"
            title="Classic"
            figure="FREE"
            figureLabel={trialGated ? 'Web trial' : 'To enter'}
            blurb={
              trialGated
                ? 'One trial run in the browser · MiniPay required to compete'
                : 'Four-minute run · climbs the weekly leaderboard'
            }
            bg="var(--piece-red)"
            fg="#ffffff"
            soft="rgba(255,255,255,0.78)"
            onClick={onClassic}
          />

          <Mode
            icon="trophy"
            title="Tournaments"
            figure={`$${pool}`}
            figureLabel={openCount > 0 ? `${openCount} open` : 'No open brackets'}
            blurb={
              openCount > 0
                ? 'Paid entry from $1 · winners split the pool in stablecoin'
                : 'Paid brackets · nothing open right now'
            }
            bg="var(--piece-blue)"
            fg="#ffffff"
            soft="rgba(255,255,255,0.78)"
            onClick={onTournaments}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ModePicker
