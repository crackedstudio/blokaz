import React, { useState } from 'react'
import { startRewardClaim } from '../lib/rewardClaim'
import type { Reward } from '../hooks/useRewards'
import { LEVELS } from '../constants/levels'

interface Props {
  address: string
  /** The level that paid this reward — not necessarily the one being played. */
  level: number
  reward: Reward
  /**
   * `card` is the standalone block in the progress sheet; `row` is the inline
   * strip that sits inside a rung of the ladder, where the level is already
   * named by the row itself.
   */
  variant?: 'card' | 'row'
}

/**
 * Claim button for a cash link earned on a given level.
 *
 * Tapping it hands the player to the link and leaves the reward unclaimed until
 * they confirm they received it — PlayerRewardsPanel does that on their return,
 * wherever the claim was started from. So this stays a single button with no
 * confirmation state of its own.
 */
const LevelCashClaim: React.FC<Props> = ({ address, level, reward, variant = 'card' }) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const accent = LEVELS[level]?.accent ?? 'var(--accent-yellow)'

  const claim = async () => {
    setBusy(true)
    setError(null)
    const result = await startRewardClaim(address, reward)
    // On success the browser is already leaving for the cash link; only a
    // failure lands back here, so the button stays disabled either way until
    // then to prevent a double tap opening two claims.
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
    }
  }

  return (
    <div
      className={
        variant === 'card'
          ? 'border-[2px] border-ink px-3 py-2.5'
          : 'mt-2 border-[2px] border-ink px-2 py-1.5'
      }
      style={{ background: accent, color: 'var(--ink-fixed)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {/* The ladder marks a cash milestone with a $ chip on the badge —
                same glyph here so the reward reads as the same thing. */}
            <span className="font-display" aria-hidden>
              $
            </span>
            <span
              className={`font-display tracking-[0.1em] ${
                variant === 'card' ? 'text-[9px]' : 'text-[8px]'
              }`}
            >
              {variant === 'card'
                ? `LEVEL ${level} · ${LEVELS[level]?.name ?? ''} CASH REWARD`
                : 'CASH REWARD READY'}
            </span>
          </div>
          <div
            className={`font-display tabular-nums leading-none ${
              variant === 'card' ? 'mt-1 text-[18px]' : 'mt-0.5 text-[13px]'
            }`}
          >
            {reward.amount} {reward.token}
          </div>
        </div>

        <button
          onClick={claim}
          disabled={busy}
          className={`brutal-btn shrink-0 font-display tracking-[0.12em] disabled:opacity-50 ${
            variant === 'card' ? 'px-4 py-2 text-[10px]' : 'px-3 py-1.5 text-[9px]'
          }`}
          style={{ background: 'var(--paper)', color: 'var(--ink)' }}
        >
          {busy ? 'OPENING…' : 'CLAIM'}
        </button>
      </div>

      {error && (
        <div className="mt-1.5 font-body text-[10px] leading-snug">{error}</div>
      )}
    </div>
  )
}

export default LevelCashClaim
