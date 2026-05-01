import React, { useState } from 'react'
import { BrutalIcon } from './BrutalIcon'

const TELEGRAM_URL = 'https://t.me/+ulIKRKsI1HYxNmQ0'

interface NoGasModalProps {
  address?: `0x${string}`
  onDismiss: () => void
}

/**
 * Shown when the connected wallet has an insufficient CELO balance to pay gas.
 * Directs the user to the Blokaz Telegram group where they can request gas.
 */
const NoGasModal: React.FC<NoGasModalProps> = ({ address, onDismiss }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers that block clipboard without HTTPS
      const el = document.createElement('textarea')
      el.value = address
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Abbreviated address for display: 0x1234…abcd
  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onDismiss}
    >
      {/* Panel — stop propagation so clicks inside don't close */}
      <div
        className="relative w-full max-w-sm border-[4px] border-ink bg-paper"
        style={{ boxShadow: '8px 8px 0 var(--ink)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header bar ── */}
        <div
          className="flex items-center justify-between border-b-[4px] border-ink px-5 py-4"
          style={{ background: 'var(--accent-yellow)' }}
        >
          <div className="flex items-center gap-3">
            <BrutalIcon name="alert" size={22} strokeWidth={2.5} />
            <span
              className="font-display text-[14px] tracking-[0.12em] uppercase"
              style={{ color: 'var(--ink-fixed)' }}
            >
              NO GAS DETECTED
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="brutal-btn border-[2px] border-ink bg-paper p-1"
            style={{ boxShadow: '2px 2px 0 var(--ink)' }}
            aria-label="Dismiss"
          >
            <BrutalIcon name="close" size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-5 py-6 space-y-4">
          <p className="font-display text-[13px] tracking-wide text-ink leading-relaxed uppercase">
            Your wallet doesn't have enough{' '}
            <span className="font-bold">CELO</span> to pay for transactions.
            <br />
            Gameplay requires a small amount of gas to save your score on-chain.
          </p>

          {/* Step-by-step tip */}
          <div
            className="border-[3px] border-ink"
            style={{ background: 'var(--paper-2)', boxShadow: '3px 3px 0 var(--ink)' }}
          >
            {/* Tip header */}
            <div
              className="flex items-center gap-2 border-b-[3px] border-ink px-3 py-2"
              style={{ background: 'var(--ink)' }}
            >
              <BrutalIcon name="zap" size={11} strokeWidth={2.5} color="var(--paper)" />
              <span className="font-display text-[9px] tracking-[0.18em] uppercase" style={{ color: 'var(--paper)' }}>
                HOW TO GET GAS
              </span>
            </div>
            {/* Steps */}
            <div className="divide-y-[2px] divide-ink">
              {[
                { n: '1', text: 'Copy your wallet address below' },
                { n: '2', text: <>Join our Telegram group</> },
                { n: '3', text: <>Paste your address in <span className="font-bold">#request-gas</span></> },
                { n: '4', text: 'We\'ll top you up — come back and play!' },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-start gap-3 px-3 py-2.5">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center border-[2px] border-ink font-display text-[10px] font-bold leading-none"
                    style={{ background: 'var(--accent-yellow)', color: 'var(--ink-fixed)' }}
                  >
                    {n}
                  </span>
                  <span className="font-display text-[11px] tracking-[0.06em] uppercase text-ink leading-snug pt-0.5">
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Wallet address copy row */}
          {address && (
            <div className="space-y-1.5">
              <p className="font-display text-[9px] tracking-[0.15em] text-ink uppercase opacity-60">
                Step 1 — Copy your wallet address
              </p>
              <button
                onClick={handleCopy}
                className="brutal-btn flex w-full items-center justify-between border-[3px] border-ink px-3 py-2.5 text-left"
                style={{
                  background: copied ? 'var(--accent-yellow)' : 'var(--paper-2)',
                  boxShadow: '3px 3px 0 var(--ink)',
                  transition: 'background 0.15s ease',
                }}
              >
                <span
                  className="font-mono text-[11px] tracking-wider text-ink"
                  style={{ letterSpacing: '0.04em' }}
                >
                  {copied ? address : shortAddr}
                </span>
                <span className="ml-3 shrink-0">
                  {copied ? (
                    <span className="font-display text-[9px] tracking-[0.12em] uppercase" style={{ color: 'var(--ink-fixed)' }}>
                      COPIED ✓
                    </span>
                  ) : (
                    <BrutalIcon name="copy" size={13} strokeWidth={2.5} />
                  )}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex flex-col gap-3 border-t-[4px] border-ink px-5 py-4">
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="brutal-btn flex w-full items-center justify-center gap-2 border-[3px] border-ink py-3 font-display text-[13px] tracking-[0.1em] uppercase"
            style={{
              background: 'var(--accent-yellow)',
              boxShadow: '4px 4px 0 var(--ink)',
              color: 'var(--ink-fixed)',
            }}
          >
            {/* Telegram send icon */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            JOIN TELEGRAM
          </a>

          <button
            onClick={onDismiss}
            className="brutal-btn w-full border-[3px] border-ink bg-paper py-2.5 font-display text-[11px] tracking-[0.12em] text-ink uppercase"
            style={{ boxShadow: '3px 3px 0 var(--ink)' }}
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  )
}

export default NoGasModal
