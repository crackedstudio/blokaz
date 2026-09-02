import React, { useRef, useState, useEffect } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useConnect } from 'wagmi'
import { useOwner, useUsername } from '../hooks/useBlokzGame'
import { useTheme } from '../hooks/useTheme'
import { BrutalIcon } from './BrutalIcon'
import ThemeToggle from './ThemeToggle'
import { IS_MINIPAY, isWebBrowser } from '../utils/miniPay'
import { useThemeStore, type UserTheme, type ThemeName } from '../stores/themeStore'
import LegalModal, { type LegalModalType } from './LegalModal'
import FAQSheet from './FAQSheet'
import HowToPlayModal from './HowToPlayModal'
import StatsModal from './StatsModal'
import { audioEngine } from '../audio/AudioEngine'
import { usePlayerRewards, getRewardUrl } from '../hooks/useRewards'

type HeaderView = 'lobby' | 'classic' | 'tournaments' | 'tournament-play' | 'admin'

interface HeaderProps {
  onShowLeaderboard?: () => void
  onHideLeaderboard?: () => void
  onViewChange: (view: 'lobby' | 'classic' | 'tournaments' | 'admin') => void
  activeView: HeaderView
  showLeaderboardAction: boolean
  isLeaderboardOpen?: boolean
}

const MiniPayWalletBadge: React.FC = () => {
  const { address, isConnected } = useAccount()
  const { effectiveTheme } = useTheme()
  const isDarkTheme = effectiveTheme !== 'light'
  const walletBg = isDarkTheme ? 'var(--accent)' : 'var(--accent-soft)'
  const walletColor = isDarkTheme ? '#FFFFFF' : 'var(--ink-fixed)'

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-2 border-[3px] border-ink px-4 py-[10px] font-display text-[12px] tracking-[0.08em] uppercase"
        style={{
          background: walletBg,
          color: walletColor,
          boxShadow: '4px 4px 0 var(--shadow)',
        }}
      >
        <div
          className="h-2 w-2 rounded-full animate-pulse"
          style={{ background: walletColor }}
        />
        {isConnected && address ? truncateAddress(address) : 'MINIPAY'}
      </div>
    </div>
  )
}

const HeaderDivider: React.FC = () => (
  <div
    className="hidden h-8 w-px lg:block"
    style={{ background: 'var(--rule)' }}
  />
)

/**
 * Single LOGIN button that opens a dropdown with two connection options:
 *  • Social  (Web3Auth — Google / Twitter / email) — marked as RECOMMENDED
 *  • Wallet  (RainbowKit — MetaMask, WalletConnect, etc.)
 *
 * Replaces the previous two-button layout for a cleaner UX.
 */
const LoginDropdown: React.FC<{ onConnectWallet: () => void }> = ({ onConnectWallet }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { effectiveTheme } = useTheme()
  const { connect, isPending, variables } = useConnect()
  const isSocialBusy = isPending && (variables?.connector as any)?.id === 'web3auth'
  const isDarkTheme = effectiveTheme !== 'light'
  const buttonBg = isDarkTheme ? 'var(--accent)' : 'var(--accent-soft)'
  const buttonColor = isDarkTheme ? '#FFFFFF' : 'var(--ink-fixed)'

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="brutal-btn flex items-center gap-2 border-[3px] border-ink px-4 py-[10px] font-display text-[12px] tracking-[0.08em] uppercase"
        style={{
          background: buttonBg,
          boxShadow: '4px 4px 0 var(--shadow)',
          color: buttonColor,
        }}
      >
        LOGIN
        <span className="text-[10px] leading-none">{open ? '▴' : '▾'}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-[200] w-56 border-[3px] border-ink bg-paper"
          style={{ boxShadow: '4px 4px 0 var(--shadow)' }}
        >
          {/* ── Social (recommended) ── */}
          <button
            onClick={async () => {
              setOpen(false)
              const { web3AuthConnector } = await import('../config/web3auth')
              connect({ connector: web3AuthConnector })
            }}
            disabled={isSocialBusy}
            className="flex w-full items-center justify-between border-b-[3px] border-ink px-4 py-3 font-display text-[11px] tracking-[0.1em] uppercase text-ink transition-colors hover:bg-accent-yellow/20 disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <BrutalIcon name="zap" size={12} strokeWidth={2.5} />
              {isSocialBusy ? (
                <span className="flex items-center gap-1.5">
                  <div className="brutal-loader" style={{ borderColor: 'var(--ink)', borderTopColor: 'transparent' }} />
                  SIGNING IN
                </span>
              ) : (
                'SOCIAL'
              )}
            </span>
            {/* Best badge */}
            <span
              className="border-[2px] border-ink bg-accent-pink px-1.5 py-0.5 font-display text-[8px] tracking-widest uppercase leading-none text-white"
            >
              BEST
            </span>
          </button>

          {/* ── Wallet (MetaMask / WalletConnect) ── */}
          <button
            onClick={() => {
              setOpen(false)
              onConnectWallet()
            }}
            className="flex w-full items-center gap-2 px-4 py-3 font-display text-[11px] tracking-[0.1em] uppercase text-ink transition-colors hover:bg-paper-2"
          >
            <BrutalIcon name="share" size={12} strokeWidth={2.5} />
            WALLET
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Settings sheet ─────────────────────────────────────────────────────────

const TELEGRAM_SUPPORT = 'https://t.me/+ulIKRKsI1HYxNmQ0'

const THEME_OPTIONS: { value: UserTheme; label: string; icon: string }[] = [
  { value: 'auto',         label: 'AUTO',   icon: 'A' },
  { value: 'light',        label: 'CREAM',  icon: '☀' },
  { value: 'dark-navy',    label: 'NAVY',   icon: '◗' },
  { value: 'dark-forest',  label: 'FOREST', icon: '❋' },
]

/**
 * Audio controls.
 *
 * Music and effects are separate rows because they are separate wants: plenty
 * of players mute a soundtrack but still need to hear that a line cleared.
 * The engine is not reactive, so local state mirrors it and writes through —
 * the engine itself owns persistence.
 */
const AudioSettings: React.FC = () => {
  const [musicOn, setMusicOn] = React.useState(audioEngine.musicEnabled)
  const [sfxOn, setSfxOn] = React.useState(audioEngine.enabled)
  const [musicVol, setMusicVol] = React.useState(audioEngine.musicVolume)
  const [sfxVol, setSfxVol] = React.useState(audioEngine.volume)

  const row = (
    label: string,
    sub: string,
    on: boolean,
    toggle: () => void,
    vol: number,
    setVol: (v: number) => void,
    accent: string
  ) => (
    <div
      className="border-[3px] border-ink px-4 py-3"
      style={{ background: 'var(--paper-2)', boxShadow: '4px 4px 0 var(--shadow)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[12px] uppercase tracking-[0.12em]">{label}</div>
          <div className="mt-0.5 font-body text-[10px]" style={{ color: 'var(--ink-soft)' }}>
            {sub}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${label} ${on ? 'on' : 'off'}`}
          onClick={toggle}
          className="relative h-8 w-[58px] shrink-0 border-[3px] border-ink"
          style={{ background: on ? accent : 'var(--paper)' }}
        >
          <span
            className="absolute top-[1px] h-[22px] w-[22px] border-[2px] border-ink transition-[left] duration-150"
            style={{ left: on ? 29 : 1, background: 'var(--ink-fixed)' }}
          />
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={vol}
        disabled={!on}
        aria-label={`${label} volume`}
        onChange={(e) => setVol(parseFloat(e.target.value))}
        className="mt-3 w-full"
        style={{ accentColor: accent, opacity: on ? 1 : 0.35 }}
      />
    </div>
  )

  return (
    <section>
      <div
        className="mb-2 border-l-4 border-ink pl-3 font-display text-[11px] uppercase tracking-[0.2em]"
        style={{ color: 'var(--ink-soft)' }}
      >
        AUDIO
      </div>
      <div className="flex flex-col gap-3">
        {row(
          'Music',
          'Background soundtrack',
          musicOn,
          () => {
            const next = !musicOn
            setMusicOn(next)
            audioEngine.setMusicEnabled(next)
            // The toggle is itself a gesture, so this is a valid moment to
            // start a context that was still waiting for one.
            if (next) audioEngine.unlock()
            audioEngine.uiToggle(next)
          },
          musicVol,
          (v) => {
            setMusicVol(v)
            audioEngine.setMusicVolume(v)
          },
          'var(--accent-cyan)'
        )}
        {row(
          'Sound effects',
          'Placements, clears, power-ups',
          sfxOn,
          () => {
            const next = !sfxOn
            setSfxOn(next)
            audioEngine.setEnabled(next)
            // Play the confirmation only when turning ON — off should be silent.
            if (next) audioEngine.uiToggle(true)
          },
          sfxVol,
          (v) => {
            setSfxVol(v)
            audioEngine.setVolume(v)
            audioEngine.uiTap()
          },
          'var(--accent-lime)'
        )}
      </div>
    </section>
  )
}

/**
 * Desktop audio control.
 *
 * The settings sheet is `lg:hidden`, so without this a desktop player has no
 * way to mute anything — which is not acceptable for a page that starts a
 * soundtrack on its own. Same AudioSettings panel, in a popover beside the
 * theme toggle.
 */
const AudioMenu: React.FC = () => {
  const [open, setOpen] = React.useState(false)
  const [anyOn, setAnyOn] = React.useState(
    audioEngine.musicEnabled || audioEngine.enabled
  )
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The icon reflects whether anything is audible, so the header shows mute
  // state at a glance rather than only inside the popover.
  React.useEffect(() => {
    if (open) setAnyOn(audioEngine.musicEnabled || audioEngine.enabled)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Audio settings"
        aria-expanded={open}
        onClick={() => {
          audioEngine.unlock()
          setOpen((v) => !v)
        }}
        className="flex h-10 w-10 items-center justify-center border-[3px] border-ink"
        style={{
          background: anyOn ? 'var(--accent-yellow)' : 'var(--paper)',
          color: 'var(--ink-fixed)',
          boxShadow: '3px 3px 0 var(--shadow)',
        }}
      >
        <span className="font-display text-[14px] leading-none">
          {anyOn ? '\u266A' : '\u2715'}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-[60] w-[290px] border-[3px] border-ink p-4"
          style={{ background: 'var(--paper)', boxShadow: '6px 6px 0 var(--shadow)' }}
          onChange={() => setAnyOn(audioEngine.musicEnabled || audioEngine.enabled)}
          onClick={() => setAnyOn(audioEngine.musicEnabled || audioEngine.enabled)}
        >
          <AudioSettings />
        </div>
      )}
    </div>
  )
}

const SettingsSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [legalModal, setLegalModal] = React.useState<LegalModalType>(null)
  const [showFAQ, setShowFAQ] = React.useState(false)
  const [showHowToPlay, setShowHowToPlay] = React.useState(false)
  const [showStats, setShowStats] = React.useState(false)
  const { userTheme, setUserTheme } = useThemeStore((s) => ({
    userTheme: s.userTheme,
    setUserTheme: s.setUserTheme,
  }))
  const [themeOpen, setThemeOpen] = React.useState(false)
  const themeRef = React.useRef<HTMLDivElement>(null)
  const { address } = useAccount()
  const { username } = useUsername(address)
  const { rewards, isLoading: isLoadingRewards } = usePlayerRewards(address)

  // Close theme dropdown on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Derive a 9-cell block pattern from wallet address for decorative avatar accent
  const blockPattern = React.useMemo(() => {
    const palette = [
      'var(--accent-yellow)',
      'var(--accent-pink)',
      'var(--accent-lime)',
      'var(--accent)',
      'var(--paper-2)',
    ]
    return Array.from({ length: 9 }, (_, i) => {
      if (!address) return palette[4]
      const char = address.replace('0x', '')[i * 2] ?? '0'
      const v = parseInt(char, 16)
      if (v < 3) return palette[4]
      if (v < 7) return palette[0]
      if (v < 10) return palette[2]
      if (v < 13) return palette[1]
      return palette[3]
    })
  }, [address])
  const [claimingId, setClaimingId] = React.useState<string | null>(null)
  const [claimErr, setClaimErr] = React.useState<string | null>(null)

  // Load locally saved cash link URLs so claimed rewards can still be opened
  const savedLinks: Record<string, string> = React.useMemo(() => {
    if (!address) return {}
    try {
      const raw = JSON.parse(localStorage.getItem(`blokaz_claimed_${address.toLowerCase()}`) ?? '{}')
      const result: Record<string, string> = {}
      for (const [id, entry] of Object.entries(raw)) {
        result[id] = (entry as any).cashLinkUrl
      }
      return result
    } catch { return {} }
  }, [address])

  const handleSettingsClaim = async (rewardId: string, label: string, amount: string, token: string) => {
    if (!address) return
    setClaimingId(rewardId)
    setClaimErr(null)
    const result = await getRewardUrl(address, rewardId)
    setClaimingId(null)
    if (result.ok && result.cashLinkUrl) {
      // Save pending claim — confirmation modal will appear when user returns
      const pending = { rewardId, cashLinkUrl: result.cashLinkUrl, label, amount, token }
      localStorage.setItem(`blokaz_pending_claim_${address.toLowerCase()}`, JSON.stringify(pending))
      window.location.href = result.cashLinkUrl
    } else {
      setClaimErr(result.error ?? 'Failed to get reward')
    }
  }

  const claimed   = rewards.filter(r => r.claimed_at)
  const unclaimed = rewards.filter(r => !r.claimed_at)

  return (
    <div className="fixed inset-0 z-[200] flex flex-col lg:hidden">
      {/* Backdrop — tap to close */}
      <button
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
        aria-label="Close settings"
      />

      {/* Full-height sheet sliding from bottom */}
      <div
        className="relative mt-auto flex max-h-[92dvh] w-full flex-col border-t-4 border-ink"
        style={{ background: 'var(--paper)', boxShadow: '0 -8px 0 var(--shadow)' }}
      >
        {/* ── Header ── */}
        <div
          className="flex shrink-0 items-center justify-between border-b-4 border-ink px-6 py-4"
          style={{ background: 'var(--paper-2)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center border-[3px] border-ink"
              style={{ background: 'var(--accent-yellow)' }}
            >
              <BrutalIcon name="wrench" size={18} strokeWidth={2.5} style={{ color: 'var(--ink-fixed)' }} />
            </div>
            <span className="font-display text-[16px] uppercase tracking-[0.15em]">SETTINGS</span>
          </div>
          <button
            onClick={onClose}
            className="brutal-btn flex h-10 w-10 items-center justify-center border-[3px] border-ink text-ink"
            style={{ background: 'var(--paper)', boxShadow: '3px 3px 0 var(--shadow)' }}
          >
            <BrutalIcon name="close" size={16} strokeWidth={3} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          <div className="px-6 py-5 space-y-6" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>

            {/* ── User profile card ── */}
            <section>
              <div
                className="flex items-center gap-3 border-[3px] border-ink px-4 py-4"
                style={{ background: 'var(--paper-2)', boxShadow: '4px 4px 0 var(--shadow)' }}
              >
                {/* Avatar */}
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center border-[3px] border-ink font-display text-[14px] leading-none"
                  style={{ background: 'var(--accent-yellow)', color: 'var(--ink-fixed)' }}
                >
                  {address ? address.slice(-2).toUpperCase() : 'GS'}
                </div>
                {/* Identity */}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[14px] uppercase tracking-[0.08em]">
                    {username || (address ? truncateAddress(address) : 'GUEST')}
                  </div>
                  <div
                    className="mt-0.5 truncate font-body text-[10px]"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    {address ? truncateAddress(address) : 'NOT CONNECTED'}
                  </div>
                </div>
                {/* Decorative block pattern derived from wallet address */}
                <div
                  className="grid shrink-0 gap-[3px] border-[3px] border-ink p-[5px]"
                  style={{
                    gridTemplateColumns: 'repeat(3, 10px)',
                    gridTemplateRows: 'repeat(3, 10px)',
                    background: 'var(--paper-2)',
                    boxShadow: '3px 3px 0 var(--shadow)',
                  }}
                >
                  {blockPattern.map((color, i) => (
                    <div key={i} style={{ background: color, width: 10, height: 10 }} />
                  ))}
                </div>
              </div>

              {/* Level, missions and lifetime records — the desktop nav's MY
                  STATS button has no room in the mobile tab bar, so it lives
                  here, attached to the profile it describes. */}
              <button
                onClick={() => setShowStats(true)}
                className="mt-3 flex w-full items-center justify-between border-[3px] border-ink px-5 py-4 text-left"
                style={{
                  background: 'var(--accent-cyan)',
                  color: 'var(--ink-fixed)',
                  boxShadow: '4px 4px 0 var(--shadow)',
                }}
              >
                <div className="flex items-center gap-3">
                  <BrutalIcon name="trending" size={18} strokeWidth={2.5} />
                  <div>
                    <div className="font-display text-[12px] uppercase tracking-[0.12em]">My Stats</div>
                    <div className="mt-0.5 font-body text-[10px]" style={{ opacity: 0.7 }}>
                      Level, missions &amp; records
                    </div>
                  </div>
                </div>
                <span className="ml-4 text-xl opacity-60">→</span>
              </button>
            </section>

            {/* ── Appearance ── */}
            <section>
              <div className="mb-2 border-l-4 border-ink pl-3 font-display text-[11px] uppercase tracking-[0.2em]" style={{ color: 'var(--ink-soft)' }}>
                APPEARANCE
              </div>
              {/* Brutalist theme dropdown */}
              <div ref={themeRef} className="relative">
                <button
                  onClick={() => setThemeOpen(v => !v)}
                  className="flex w-full items-center justify-between border-[3px] border-ink px-4 py-3 font-display text-[11px] uppercase tracking-[0.12em]"
                  style={{
                    background: 'var(--accent-yellow)',
                    color: 'var(--ink-fixed)',
                    boxShadow: '4px 4px 0 var(--shadow)',
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] leading-none">
                      {THEME_OPTIONS.find(o => o.value === userTheme)?.icon}
                    </span>
                    {THEME_OPTIONS.find(o => o.value === userTheme)?.label}
                  </span>
                  <span className="text-[10px] leading-none">{themeOpen ? '▴' : '▾'}</span>
                </button>

                {themeOpen && (
                  <div
                    className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 border-[3px] border-ink"
                    style={{ background: 'var(--paper)', boxShadow: '4px 4px 0 var(--shadow)' }}
                  >
                    {THEME_OPTIONS.map((opt, i) => {
                      const isActive = userTheme === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => { setUserTheme(opt.value); setThemeOpen(false) }}
                          className="flex w-full items-center gap-2.5 px-4 py-3 font-display text-[11px] uppercase tracking-[0.12em] transition-colors"
                          style={{
                            background: isActive ? 'var(--paper-2)' : 'transparent',
                            color: isActive ? 'var(--accent-yellow)' : 'var(--ink)',
                            borderTop: i > 0 ? '2px solid var(--ink)' : 'none',
                          }}
                        >
                          <span className="text-[15px] leading-none">{opt.icon}</span>
                          <span className="flex-1 text-left">{opt.label}</span>
                          {isActive && <span className="text-[10px] opacity-60">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>

            <AudioSettings />

            {/* ── Divider ── */}
            <div className="border-t-[3px] border-ink border-dashed" />

            {/* ── Legal & Support ── */}
            <section>
              <div
                className="mb-4 border-l-4 border-ink pl-3 font-display text-[11px] uppercase tracking-[0.2em]"
                style={{ color: 'var(--ink-soft)' }}
              >
                LEGAL & SUPPORT
              </div>
              <div className="flex flex-col gap-3">
                {([
                  { label: 'Terms of Service',     sub: 'View in-app',              modal: 'terms'   as LegalModalType },
                  { label: 'Privacy Policy',        sub: 'View in-app',              modal: 'privacy' as LegalModalType },
                  { label: 'About Cracked Studios', sub: 'crackedstudios.xyz',       modal: 'about'   as LegalModalType },
                ] as const).map(({ label, sub, modal }) => (
                  <button
                    key={label}
                    onClick={() => setLegalModal(modal)}
                    className="flex w-full items-center justify-between border-[3px] border-ink px-5 py-4 text-left"
                    style={{
                      background: 'var(--paper-2)',
                      color: 'var(--ink)',
                      boxShadow: '4px 4px 0 var(--shadow)',
                    }}
                  >
                    <div>
                      <div className="font-display text-[12px] uppercase tracking-[0.12em]">{label}</div>
                      <div className="mt-0.5 font-body text-[10px]" style={{ color: 'var(--ink-soft)' }}>{sub}</div>
                    </div>
                    <span className="ml-4 text-xl opacity-40">→</span>
                  </button>
                ))}
                {/* How to Play */}
                <button
                  onClick={() => setShowHowToPlay(true)}
                  className="flex w-full items-center justify-between border-[3px] border-ink px-5 py-4 text-left"
                  style={{
                    background: 'var(--accent-lime)',
                    color: 'var(--ink-fixed)',
                    boxShadow: '4px 4px 0 var(--shadow)',
                  }}
                >
                  <div>
                    <div className="font-display text-[12px] uppercase tracking-[0.12em]">How to Play</div>
                    <div className="mt-0.5 font-body text-[10px]" style={{ color: 'var(--ink-fixed)', opacity: 0.7 }}>Step-by-step game guide</div>
                  </div>
                  <span className="ml-4 text-xl opacity-60">→</span>
                </button>

                {/* FAQ */}
                <button
                  onClick={() => setShowFAQ(true)}
                  className="flex w-full items-center justify-between border-[3px] border-ink px-5 py-4 text-left"
                  style={{
                    background: 'var(--accent-yellow)',
                    color: 'var(--ink-fixed)',
                    boxShadow: '4px 4px 0 var(--shadow)',
                  }}
                >
                  <div>
                    <div className="font-display text-[12px] uppercase tracking-[0.12em]">Help & FAQ</div>
                    <div className="mt-0.5 font-body text-[10px]" style={{ color: 'var(--ink-fixed)', opacity: 0.7 }}>Common questions answered</div>
                  </div>
                  <span className="ml-4 text-xl opacity-60">→</span>
                </button>

                {/* Support */}
                <a
                  href={TELEGRAM_SUPPORT}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between border-[3px] border-ink px-5 py-4"
                  style={{
                    background: 'var(--paper-2)',
                    color: 'var(--ink)',
                    boxShadow: '4px 4px 0 var(--shadow)',
                  }}
                >
                  <div>
                    <div className="font-display text-[12px] uppercase tracking-[0.12em]">Support</div>
                    <div className="mt-0.5 font-body text-[10px]" style={{ color: 'var(--ink-soft)' }}>Chat with us on Telegram</div>
                  </div>
                  <span className="ml-4 text-xl opacity-40">→</span>
                </a>
              </div>
            </section>

            {/* ── Rewards ── */}
            {address && (
              <section>
                <div className="mb-4 border-l-4 border-ink pl-3 font-display text-[11px] uppercase tracking-[0.2em]" style={{ color: 'var(--ink-soft)' }}>
                  REWARDS
                </div>

                {isLoadingRewards ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => (
                      <div key={i} className="h-14 animate-pulse border-[3px] border-ink" style={{ background: 'var(--paper-2)' }} />
                    ))}
                  </div>
                ) : rewards.length === 0 ? (
                  <div
                    className="border-[3px] border-ink px-5 py-5 text-center font-display text-[11px] uppercase tracking-widest"
                    style={{ background: 'var(--paper-2)', color: 'var(--ink-soft)' }}
                  >
                    No rewards yet
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {/* Unclaimed */}
                    {unclaimed.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between border-[3px] border-ink px-5 py-4"
                        style={{ background: 'var(--accent-yellow)', boxShadow: '4px 4px 0 var(--shadow)' }}
                      >
                        <div>
                          <div className="font-display text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-fixed)' }}>
                            {r.label}
                          </div>
                          <div className="mt-0.5 font-display text-[18px] leading-none" style={{ letterSpacing: '-0.02em', color: 'var(--ink-fixed)' }}>
                            {r.amount} <span className="text-[11px] opacity-60">{r.token}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleSettingsClaim(r.id, r.label, r.amount, r.token)}
                          disabled={claimingId === r.id}
                          className="brutal-btn border-2 border-ink bg-ink px-4 py-2 font-display text-[10px] uppercase tracking-wider text-paper disabled:opacity-50"
                          style={{ boxShadow: '3px 3px 0 var(--shadow)' }}
                        >
                          {claimingId === r.id ? '...' : 'CLAIM'}
                        </button>
                      </div>
                    ))}

                    {/* Claimed history */}
                    {claimed.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between border-[3px] border-ink px-5 py-4"
                        style={{ background: 'var(--paper-2)', boxShadow: '4px 4px 0 var(--shadow)' }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-display text-[11px] uppercase tracking-[0.1em]">
                            {r.label}
                          </div>
                          <div className="mt-0.5 font-display text-[18px] leading-none" style={{ letterSpacing: '-0.02em' }}>
                            {r.amount} <span className="text-[11px] opacity-60">{r.token}</span>
                          </div>
                          <div className="mt-1 font-display text-[9px] uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>
                            {new Date(r.claimed_at!).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
                          <span
                            className="border-2 border-ink px-2 py-0.5 font-display text-[9px] uppercase tracking-wider"
                            style={{ background: 'var(--accent-lime)', color: 'var(--ink-fixed)' }}
                          >
                            ✓ DONE
                          </span>
                          {savedLinks[r.id] && (
                            <button
                              onClick={() => { window.location.href = savedLinks[r.id] }}
                              className="brutal-btn border-2 border-ink px-2 py-0.5 font-display text-[9px] uppercase tracking-wider"
                              style={{ background: 'var(--accent-yellow)', color: 'var(--ink-fixed)' }}
                            >
                              OPEN LINK
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {claimErr && (
                  <div className="mt-3 border-2 border-danger bg-danger px-4 py-3 font-display text-[10px] uppercase tracking-wider text-paper">
                    {claimErr}
                  </div>
                )}
              </section>
            )}

            <div className="border-t-[3px] border-ink border-dashed" />

            {/* ── Version stamp ── */}
            <div
              className="border-[3px] border-ink px-5 py-4 text-center font-display text-[10px] uppercase tracking-[0.16em]"
              style={{ background: 'var(--paper-2)', color: 'var(--ink-soft)' }}
            >
              BLOKAZ · © {new Date().getFullYear()} CRACKED STUDIOS
            </div>

          </div>
        </div>
      </div>

      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
      {showFAQ && <FAQSheet onClose={() => setShowFAQ(false)} />}
      {showHowToPlay && <HowToPlayModal onDone={() => setShowHowToPlay(false)} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
    </div>
  )
}

// ─── Mobile bottom nav ───────────────────────────────────────────────────────

const MobileBottomNav: React.FC<{
  activeView: HeaderView
  isLeaderboardOpen: boolean
  onViewChange: (view: 'lobby' | 'classic' | 'tournaments' | 'admin') => void
  onShowLeaderboard?: () => void
  onHideLeaderboard?: () => void
  isOwner: boolean
}> = ({ activeView, isLeaderboardOpen, onViewChange, onShowLeaderboard, onHideLeaderboard, isOwner }) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Prevent double-fires from rapid taps
  const tapping = useRef(false)

  const go = (action: () => void) => {
    if (tapping.current) return
    tapping.current = true
    action()
    setTimeout(() => { tapping.current = false }, 350)
  }

  // Close all overlays and navigate — guards against same-view re-taps
  const navigate = (view: 'lobby' | 'classic' | 'tournaments' | 'admin') => {
    go(() => {
      setSettingsOpen(false)
      // Close leaderboard if open
      if (isLeaderboardOpen) onHideLeaderboard?.()
      // No-op if already on this view (prevents spurious forceReset)
      const alreadyThere =
        view === 'lobby' ? activeView === 'lobby' :
        view === 'classic' ? activeView === 'classic' :
        view === 'tournaments' ? (activeView === 'tournaments' || activeView === 'tournament-play') :
        view === 'admin' ? activeView === 'admin' : false
      if (!alreadyThere) onViewChange(view)
    })
  }

  const openLeaderboard = () => {
    go(() => {
      setSettingsOpen(false)
      if (!isLeaderboardOpen) onShowLeaderboard?.()
    })
  }

  const toggleSettings = () => {
    go(() => {
      if (isLeaderboardOpen) onHideLeaderboard?.()
      setSettingsOpen(v => !v)
    })
  }

  const tabs = [
    {
      label: 'HOME',
      icon: 'home' as const,
      active: activeView === 'lobby' && !isLeaderboardOpen && !settingsOpen,
      onClick: () => navigate('lobby'),
    },
    {
      label: 'CLASSIC',
      icon: 'zap' as const,
      active: activeView === 'classic' && !isLeaderboardOpen && !settingsOpen,
      onClick: () => navigate('classic'),
    },
    {
      label: 'TOURNEY',
      icon: 'trophy' as const,
      active: (activeView === 'tournaments' || activeView === 'tournament-play') && !isLeaderboardOpen && !settingsOpen,
      onClick: () => navigate('tournaments'),
    },
    {
      label: 'RANKS',
      icon: 'trending' as const,
      active: isLeaderboardOpen && !settingsOpen,
      onClick: openLeaderboard,
    },
    {
      label: 'SETTINGS',
      icon: 'wrench' as const,
      active: settingsOpen,
      onClick: toggleSettings,
    },
    ...(isOwner
      ? [{
          label: 'ADMIN',
          icon: 'alert' as const,
          active: activeView === 'admin' && !isLeaderboardOpen && !settingsOpen,
          onClick: () => navigate('admin'),
        }]
      : []),
  ]

  return (
    <>
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[210] flex border-t-4 border-ink bg-paper lg:hidden"
        style={{
          boxShadow: '0 -3px 0 var(--shadow)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.label}
            onClick={tab.onClick}
            className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 font-display text-[8px] tracking-[0.14em] uppercase transition-colors active:opacity-70 ${
              tab.active ? 'bg-ink' : 'bg-paper'
            }`}
            style={{
              color: tab.active ? 'var(--paper)' : 'var(--ink)',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <BrutalIcon name={tab.icon} size={18} strokeWidth={2.5} />
            {tab.label}
          </button>
        ))}
      </nav>
    </>
  )
}

const truncateAddress = (value?: string) =>
  value ? `${value.slice(0, 4)}…${value.slice(-2)}` : 'CONNECT'

export const Header: React.FC<HeaderProps> = ({
  onShowLeaderboard,
  onHideLeaderboard,
  onViewChange,
  activeView,
  showLeaderboardAction,
  isLeaderboardOpen = false,
}) => {
  const { address } = useAccount()
  const { owner } = useOwner()
  const { effectiveTheme } = useTheme()
  const { isConnected } = useAccount()
  const [showStats, setShowStats] = useState(false)

  const isOwner =
    address && owner && address.toLowerCase() === owner.toLowerCase()
  const isTournamentView =
    activeView === 'tournaments' || activeView === 'tournament-play'
  const isDarkTheme = effectiveTheme !== 'light'
  const connectedChipBg = isDarkTheme ? 'var(--accent)' : 'var(--accent-soft)'
  const connectedChipColor = isDarkTheme ? '#FFFFFF' : 'var(--ink-fixed)'

  const safeNavigate = (view: 'lobby' | 'classic' | 'tournaments' | 'admin') => {
    if (typeof onViewChange === 'function') onViewChange(view)
  }

  const navTabs = [
    {
      label: 'CLASSIC',
      active: activeView === 'classic',
      view: 'classic' as const,
    },
    {
      label: 'TOURNAMENTS',
      active: isTournamentView,
      view: 'tournaments' as const,
    },
    {
      label: 'LEADERBOARD',
      active: isLeaderboardOpen,
      onClick: onShowLeaderboard,
    },
    {
      label: 'MY STATS',
      active: showStats,
      onClick: () => setShowStats(true),
    },
    ...(isOwner
      ? [
          {
            label: 'ADMIN',
            active: activeView === 'admin',
            view: 'admin' as const,
          },
        ]
      : []),
  ]

  return (
    <>
      <header
        className="fixed left-0 right-0 top-0 z-50 border-b-4 border-ink bg-paper px-4 py-3 lg:px-6 lg:py-4"
        style={{ borderBottomColor: 'var(--ink)' }}
      >
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 lg:gap-6">
          <div
            className={`group cursor-pointer items-center gap-2.5 lg:flex lg:basis-[320px] lg:min-w-[210px] lg:gap-[14px] ${
              activeView === 'classic' || activeView === 'tournament-play'
                ? 'hidden'
                : 'flex min-w-0'
            }`}
            onClick={() => safeNavigate('lobby')}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center border-[3px] border-ink font-display text-[18px] transition-transform group-hover:-rotate-3 lg:h-[46px] lg:w-[46px] lg:text-[22px]"
              style={{
                background: 'var(--accent-yellow)',
                boxShadow: '3px 3px 0 var(--shadow)',
                color: 'var(--ink-fixed)',
              }}
            >
              B
            </div>
            <span className="font-display text-[18px] leading-none tracking-tight text-ink lg:text-[24px]">
              BLOKAZ
            </span>
          </div>

          <div className="hidden flex-1 justify-center lg:flex">
            <div className="flex items-center gap-2">
              {navTabs.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() =>
                    tab.onClick ? tab.onClick() : tab.view && safeNavigate(tab.view)
                  }
                  className="font-display uppercase"
                  style={{
                    padding: '8px 14px',
                    border: '3px solid var(--ink)',
                    background: tab.active ? 'var(--ink)' : 'var(--paper)',
                    color: tab.active ? 'var(--label)' : 'var(--ink)',
                    boxShadow: tab.active
                      ? '4px 4px 0 var(--shadow)'
                      : '3px 3px 0 var(--shadow)',
                    letterSpacing: tab.active ? '0.08em' : '0.1em',
                    fontSize: tab.active ? 13 : 12,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2 lg:basis-[320px] lg:gap-3">
            {/* ThemeToggle moved to Settings sheet on mobile; keep for desktop only */}
            <div className="hidden lg:block">
              <AudioMenu />
            </div>
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
            <HeaderDivider />

            {IS_MINIPAY ? null : (
              <ConnectButton.Custom>
                {({
                  account,
                  chain,
                  mounted,
                  openAccountModal,
                  openChainModal,
                  openConnectModal,
                }) => {
                  const ready = mounted
                  const connected = ready && account && chain

                  const handleClick = () => {
                    if (chain?.unsupported) return openChainModal()
                    openAccountModal()
                  }

                  return (
                    <div
                      className="flex items-center gap-2 lg:gap-3"
                      style={{ opacity: ready ? 1 : 0 }}
                    >
                      {!connected ? (
                        <LoginDropdown onConnectWallet={openConnectModal} />
                      ) : (
                        <>
                          {/* Address chip: hidden on mobile to save width */}
                          <button
                            onClick={handleClick}
                            className="hidden border-[3px] border-ink px-4 py-[10px] font-display text-[12px] tracking-[0.08em] uppercase lg:block"
                            style={{
                              background: connectedChipBg,
                              color: connectedChipColor,
                              boxShadow: '4px 4px 0 var(--shadow)',
                            }}
                          >
                            {chain?.unsupported
                              ? 'NETWORK ⚠'
                              : truncateAddress(account.address)}
                          </button>
                          {/* Avatar icon: always visible */}
                          <button
                            onClick={handleClick}
                            className="flex h-10 w-10 items-center justify-center border-[3px] border-ink font-display text-[11px] uppercase"
                            style={{
                              background: connectedChipBg,
                              color: connectedChipColor,
                              boxShadow: '3px 3px 0 var(--shadow)',
                            }}
                            aria-label="Open account"
                          >
                            {account.address?.slice(-2).toUpperCase() ?? 'W'}
                          </button>
                        </>
                      )}
                    </div>
                  )
                }}
              </ConnectButton.Custom>
            )}
          </div>
        </div>
      </header>
    <MobileBottomNav
      activeView={activeView}
      isLeaderboardOpen={isLeaderboardOpen ?? false}
      onViewChange={onViewChange}
      onShowLeaderboard={onShowLeaderboard}
      onHideLeaderboard={onHideLeaderboard}
      isOwner={!!isOwner}
    />
    {showStats && <StatsModal onClose={() => setShowStats(false)} />}
    </>
  )
}

export default Header
