import React, { useMemo, useState, useEffect, useRef } from 'react'
import { BrutalIcon } from './BrutalIcon'
import { useAccount } from 'wagmi'
import { useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import {
  useLeaderboard,
  useTournamentCount,
  USDC_DECIMALS,
  useUsername,
} from '../hooks/useBlokzGame'
import { useTheme } from '../hooks/useTheme'
import { BLOKZ_TOURNAMENT_ABI } from '../constants/abi'
import contractInfo from '../contract.json'
import { isWebBrowser, isWebTrialGated } from '../utils/miniPay'
import { isWebWhitelisted } from '../utils/featureFlags'
import { MiniPayGateModal } from './MiniPayGateModal'
import MetaPanel from './MetaPanel'
import UsernameSetupModal, {
  hasDismissedUsernamePrompt,
} from './UsernameSetupModal'
import { NewsNudge } from './GameNotification'
import CampaignReminderModal from './CampaignReminderModal'
import WinnerClaimModal from './WinnerClaimModal'
import PlayerRewardsPanel from './PlayerRewardsPanel'

const TOURNAMENT_ADDRESS = contractInfo.tournament as `0x${string}`

// ─── Count-up hook ──────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900, delay = 0): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!target) {
      setValue(0)
      return
    }
    const t = setTimeout(() => {
      const start = Date.now()
      const tick = () => {
        const p = Math.min((Date.now() - start) / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        setValue(Math.round(target * eased))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => clearTimeout(t)
  }, [target, duration, delay])
  return value
}

// ─── Animated entrance wrapper ───────────────────────────────────────────────
const FadeUp: React.FC<{
  delay?: number
  children: React.ReactNode
  className?: string
}> = ({ delay = 0, children, className = '' }) => {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: `opacity 320ms ease, transform 320ms cubic-bezier(0.22,1,0.36,1)`,
      }}
    >
      {children}
    </div>
  )
}

// ─── News & updates ──────────────────────────────────────────────────────────
export interface NewsItem {
  id: string
  tag: 'UPDATE' | 'CAMPAIGN' | 'TOURNAMENT' | 'COMMUNITY' | 'NEW'
  date: string // e.g. "22 MAY 2026"
  headline: string
  body: string
  link?: string
  /** Epoch ms before which this item stays hidden everywhere. Omit to show immediately. */
  publishAt?: number
  /** If true, the nudge modal keeps re-showing on a cooldown instead of once ever. */
  recurring?: boolean
}

// Tournaments go live at 16:00 GMT+1 (== 15:00 UTC). Change this to reschedule.
export const TOURNAMENT_LAUNCH_MS = Date.parse('2026-07-09T16:00:00+01:00')

// ✏️  Edit this array to publish new news items — newest first
export const NEWS_ITEMS: NewsItem[] = [
  {
    id: 'tournaments-live',
    tag: 'TOURNAMENT',
    date: '9 JUL 2026',
    headline: 'Tournaments are LIVE — head to the Tournament section and compete now!',
    body: 'Blokaz tournaments are officially open. Open the Tournament section, join a tournament, and stack your best score to compete for the prize pool. Good luck!',
    publishAt: TOURNAMENT_LAUNCH_MS,
    recurring: true,
  },
]

// Only items whose publish time has passed — use this everywhere news renders.
export function getLiveNewsItems(now: number = Date.now()): NewsItem[] {
  return NEWS_ITEMS.filter((n) => n.publishAt == null || now >= n.publishAt)
}

const TAG_COLORS: Record<NewsItem['tag'], { bg: string; color: string }> = {
  NEW: { bg: '#ffd51f', color: '#0c0c10' },
  UPDATE: { bg: '#b7ff3b', color: '#0c0c10' },
  TOURNAMENT: { bg: '#ff7a1a', color: '#ffffff' },
  CAMPAIGN: { bg: '#8a3dff', color: '#ffffff' },
  COMMUNITY: { bg: '#29e6e6', color: '#0c0c10' },
}

// ─── Marquee ticker — pulls headlines from NEWS_ITEMS ────────────────────────
const Ticker: React.FC = () => {
  const live = getLiveNewsItems()
  if (live.length === 0) return null
  const rawItems = live.map((n, i) => ({
    text: `${n.tag} — ${n.headline}`,
    highlight: i === 0,
  }))
  const items = [...rawItems, ...rawItems] // double for seamless loop
  return (
    <div
      className="overflow-hidden border-y-[3px] border-ink"
      style={{ background: 'var(--ink-fixed)', height: 32 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          width: 'max-content',
          animation: 'lobbyTicker 28s linear infinite',
          willChange: 'transform',
        }}
      >
        {items.map((item, i) => (
          <span
            key={i}
            style={{
              fontFamily: "'Archivo Black', sans-serif",
              fontSize: 9,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: item.highlight ? '#FFE600' : 'rgba(255,255,255,0.65)',
              paddingLeft: 32,
              paddingRight: 4,
              whiteSpace: 'nowrap',
            }}
          >
            {i % rawItems.length === 0 && (
              <span style={{ color: '#ffd51f', marginRight: 10 }}>◆</span>
            )}
            {item.text}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── News card ───────────────────────────────────────────────────────────────
const NewsCard: React.FC = () => {
  const [activeIdx, setActiveIdx] = useState(0)
  const item = NEWS_ITEMS[activeIdx]
  const tc = TAG_COLORS[item.tag]

  return (
    <div
      className="border-[3px] border-ink"
      style={{
        background: 'var(--paper-2)',
        boxShadow: '5px 5px 0 var(--shadow)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b-[3px] border-ink px-4 py-3"
        style={{ background: 'var(--paper)' }}
      >
        <div
          className="font-display text-[10px] tracking-[0.18em]"
          style={{ color: 'var(--label)' }}
        >
          NEWS &amp; UPDATES
        </div>
        {/* Dot nav */}
        <div className="flex items-center gap-[5px]">
          {NEWS_ITEMS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              style={{
                width: i === activeIdx ? 18 : 8,
                height: 8,
                border: '2px solid var(--ink)',
                background:
                  i === activeIdx ? 'var(--accent-yellow)' : 'var(--rule)',
                cursor: 'pointer',
                padding: 0,
                transition: 'width 200ms ease, background 200ms ease',
              }}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Tag + date row */}
        <div className="mb-3 flex items-center gap-2">
          <span
            className="font-display text-[9px] tracking-[0.16em]"
            style={{
              background: tc.bg,
              color: tc.color,
              border: '2px solid var(--ink)',
              padding: '2px 8px',
            }}
          >
            {item.tag}
          </span>
          <span
            className="font-display text-[9px] tracking-[0.12em]"
            style={{ color: 'var(--muted)' }}
          >
            {item.date}
          </span>
        </div>

        {/* Headline */}
        <div
          className="font-display text-[15px] leading-tight tracking-[-0.01em]"
          style={{
            color: 'var(--ink)',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          {item.headline}
        </div>

        {/* Body */}
        <p
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--ink-soft)',
            margin: '0 0 14px',
          }}
        >
          {item.body}
        </p>

        {/* Link CTA */}
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between border-[3px] border-ink px-3 py-2 font-display text-[10px] tracking-[0.12em]"
            style={{
              background: tc.bg,
              color: tc.color,
              textDecoration: 'none',
              boxShadow: '3px 3px 0 var(--ink)',
              textTransform: 'uppercase',
            }}
          >
            <span>READ MORE</span>
            <span>→</span>
          </a>
        )}

        {/* Prev / next */}
        {NEWS_ITEMS.length > 1 && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() =>
                setActiveIdx(
                  (i) => (i - 1 + NEWS_ITEMS.length) % NEWS_ITEMS.length
                )
              }
              disabled={activeIdx === 0}
              className="flex-1 border-[2px] border-ink py-1 font-display text-[9px] tracking-[0.12em] disabled:opacity-30"
              style={{
                background: 'var(--paper)',
                color: 'var(--ink)',
                cursor: activeIdx === 0 ? 'default' : 'pointer',
              }}
            >
              ← PREV
            </button>
            <button
              onClick={() => setActiveIdx((i) => (i + 1) % NEWS_ITEMS.length)}
              disabled={activeIdx === NEWS_ITEMS.length - 1}
              className="flex-1 border-[2px] border-ink py-1 font-display text-[9px] tracking-[0.12em] disabled:opacity-30"
              style={{
                background: 'var(--paper)',
                color: 'var(--ink)',
                cursor:
                  activeIdx === NEWS_ITEMS.length - 1 ? 'default' : 'pointer',
              }}
            >
              NEXT →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Floating Tetris Blocks ──────────────────────────────────────────────────
const TetrisBlocks: React.FC = () => (
  <div style={{ animation: 'lobbyFloat 3.4s ease-in-out infinite' }}>
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="0"
        y="18"
        width="9"
        height="9"
        fill="var(--piece-red)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <rect
        x="9"
        y="18"
        width="9"
        height="9"
        fill="var(--piece-red)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <rect
        x="9"
        y="9"
        width="9"
        height="9"
        fill="var(--piece-red)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <rect
        x="18"
        y="9"
        width="9"
        height="9"
        fill="var(--piece-purple)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <rect
        x="18"
        y="18"
        width="9"
        height="9"
        fill="var(--piece-blue)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <rect
        x="27"
        y="18"
        width="9"
        height="9"
        fill="var(--piece-blue)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <rect
        x="18"
        y="27"
        width="9"
        height="9"
        fill="var(--piece-yellow)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <rect
        x="27"
        y="27"
        width="9"
        height="9"
        fill="var(--piece-lime)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
    </svg>
  </div>
)

// ─── Animated streak bars ────────────────────────────────────────────────────
const StreakBars: React.FC<{
  streak: number
  count?: number
  accent?: string
}> = ({ streak, count = 7, accent }) => {
  const [filled, setFilled] = useState(0)
  useEffect(() => {
    let i = 0
    const fill = () => {
      if (i <= streak) {
        setFilled(i)
        i++
        setTimeout(fill, 80)
      }
    }
    const t = setTimeout(fill, 400)
    return () => clearTimeout(t)
  }, [streak])
  return (
    <div className="flex items-center gap-[4px]">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-[14px] flex-1 border-[2px] border-ink"
          style={{
            background:
              i < filled ? (accent ?? 'var(--accent)') : 'var(--rule)',
            transition: 'background 120ms ease',
          }}
        />
      ))}
    </div>
  )
}

interface LobbyScreenProps {
  onPlayClassic: () => void
  onPlayTournaments: () => void
  onOpenShop?: () => void
}

const RailShell: React.FC<{
  title: string
  children: React.ReactNode
  accent?: boolean
}> = ({ title, children, accent = false }) => (
  <div
    className="border-[3px] border-ink"
    style={{
      background: 'var(--paper)',
      boxShadow: '5px 5px 0 var(--shadow)',
    }}
  >
    <div
      className="border-b-[3px] border-ink px-4 py-3 font-display text-[10px] tracking-[0.18em]"
      style={{
        background: accent ? 'var(--paper-2)' : 'var(--paper)',
        color: 'var(--label)',
      }}
    >
      {title}
    </div>
    <div className="p-4">{children}</div>
  </div>
)

const MiniMetric: React.FC<{
  label: string
  value: string
  background: string
}> = ({ label, value, background }) => {
  const isColoredSurface =
    background !== 'var(--paper)' && background !== 'var(--paper-2)'
  const textColor = isColoredSurface ? 'var(--ink-fixed)' : 'var(--ink)'
  const labelColor = isColoredSurface ? 'var(--ink-fixed)' : 'var(--ink-soft)'

  return (
    <div
      className="border-[3px] border-ink p-3"
      style={{
        background,
        boxShadow: '3px 3px 0 var(--shadow)',
      }}
    >
      <div
        className="font-display text-[8px] tracking-[0.14em]"
        style={{ color: labelColor }}
      >
        {label}
      </div>
      <div
        className="mt-2 font-display text-[24px]"
        style={{ color: textColor, letterSpacing: '-0.03em', lineHeight: 1 }}
      >
        {value}
      </div>
    </div>
  )
}

const LobbyPlayerName: React.FC<{ address: string }> = ({ address }) => {
  const { username, isLoading } = useUsername(address as `0x${string}`)
  if (isLoading)
    return (
      <span className="inline-block h-3 w-20 animate-pulse rounded-sm bg-current opacity-20" />
    )
  return (
    <span>{username ?? `${address.slice(0, 6)}…${address.slice(-4)}`}</span>
  )
}

const LobbyScreen: React.FC<LobbyScreenProps> = ({
  onPlayClassic,
  onPlayTournaments,
  onOpenShop,
}) => {
  const { address } = useAccount()
  const { effectiveTheme } = useTheme()
  const isDarkTheme = effectiveTheme !== 'light'

  const { leaderboard, currentEpoch } = useLeaderboard()
  const { count: tournamentCount } = useTournamentCount()

  const tournamentContracts = useMemo(
    () =>
      tournamentCount && tournamentCount > 0n
        ? Array.from({ length: Number(tournamentCount) }, (_, i) => ({
            address: TOURNAMENT_ADDRESS,
            abi: BLOKZ_TOURNAMENT_ABI,
            functionName: 'tournaments' as const,
            args: [BigInt(i + 1)] as const,
          }))
        : [],
    [tournamentCount]
  )

  const { data: tournamentRows } = useReadContracts({
    contracts: tournamentContracts,
    query: { enabled: tournamentContracts.length > 0 },
  })

  const { totalPool, activeTournaments } = useMemo(() => {
    const rows = tournamentRows ?? []
    let pool = 0n
    let active = 0
    const now = BigInt(Math.floor(Date.now() / 1000))
    for (const row of rows) {
      if (row.status !== 'success' || !row.result) continue
      const r = row.result as readonly any[]
      const endTime = r[3] as bigint
      const finalized = r[6] as boolean
      if (endTime > now && !finalized) {
        active++
        pool += (r[7] as bigint) ?? 0n
      }
    }
    return { totalPool: pool, activeTournaments: active }
  }, [tournamentRows])

  const formattedPool = useMemo(() => {
    const raw = Number(formatUnits(totalPool, USDC_DECIMALS))
    return raw
      ? raw.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : '0'
  }, [totalPool])

  const playerStats = useMemo(() => {
    if (!leaderboard || !address) return null
    const entries = leaderboard as readonly {
      player: `0x${string}`
      score: number
      gameId: bigint
    }[]
    const sorted = [...entries].sort((a, b) => b.score - a.score)
    const idx = sorted.findIndex(
      (e) => e.player.toLowerCase() === address.toLowerCase()
    )
    if (idx === -1) return null
    return { rank: idx + 1, bestScore: sorted[idx].score }
  }, [leaderboard, address])

  const sortedLeaderboard = useMemo(
    () =>
      leaderboard ? [...leaderboard].sort((a, b) => b.score - a.score) : [],
    [leaderboard]
  )

  const season =
    currentEpoch !== undefined
      ? Math.floor(Number(currentEpoch) / 12) + 1
      : null
  const week =
    currentEpoch !== undefined ? (Number(currentEpoch) % 12) + 1 : null

  const [streak] = useState<number>(() => {
    try {
      const s = localStorage.getItem('blokaz_streak')
      return s ? parseInt(s, 10) : 0
    } catch {
      return 0
    }
  })

  // ─── Username setup prompt ───────────────────────────────────────────────
  const { username, isLoading: isLoadingUsername } = useUsername(
    address as `0x${string}` | undefined
  )
  const [showUsernameModal, setShowUsernameModal] = useState(false)

  useEffect(() => {
    // Wait until username fetch resolves, then show prompt if needed
    if (!address || isLoadingUsername) return
    if (username) return // already has one
    if (hasDismissedUsernamePrompt()) return // dismissed before
    // Small delay so the lobby finishes rendering first
    const t = setTimeout(() => setShowUsernameModal(true), 800)
    return () => clearTimeout(t)
  }, [address, username, isLoadingUsername])

  // Count-up animated stats
  const animatedScore = useCountUp(playerStats?.bestScore ?? 0, 900, 300)
  const animatedRank = useCountUp(playerStats?.rank ?? 0, 700, 420)
  const animatedLive = useCountUp(activeTournaments, 600, 500)
  const liveScore = playerStats?.bestScore ?? sortedLeaderboard[0]?.score ?? 0
  const animatedLiveScore = useCountUp(liveScore, 1000, 200)

  const heroBackground = isDarkTheme ? 'var(--hero)' : 'var(--accent-yellow)'
  const heroCaptionColor = isDarkTheme ? 'var(--label)' : 'var(--ink-fixed)'
  const heroTextColor = isDarkTheme ? '#FFFFFF' : 'var(--ink-fixed)'
  const streakLabelColor = isDarkTheme ? 'var(--label)' : 'var(--ink-fixed)'
  const nextChainWidth = `${Math.min(100, 28 + streak * 10)}%`
  const topThree = sortedLeaderboard.slice(0, 3)
  const currentRank = playerStats?.rank
  const localBest = (() => {
    try {
      return Number(localStorage.getItem('blokaz:best_score') ?? 0) || 0
    } catch {
      return 0
    }
  })()
  const shareScore = Math.max(playerStats?.bestScore ?? 0, localBest)

  const HASHTAGS = `#miniapps #minipay #playblokaz #celo`
  const handleShareBestScore = () => {
    if (shareScore === 0) return
    const leaderboardRank = playerStats?.rank
    const rankLine = leaderboardRank
      ? `\nrank #${leaderboardRank} on the weekly ladder`
      : ''
    const text = `my best score on @playblokaz is ${shareScore.toLocaleString()} 🎮${rankLine}\n\ncan you beat it? blokaz.xyz\n\n${HASHTAGS}`
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  const heroStack = (
    <>
      {/* Hero headline */}
      <FadeUp delay={60}>
        <div
          className="mt-1 border-[3px] border-ink p-4 lg:mt-0 lg:p-6"
          style={{
            background: heroBackground,
            boxShadow: '5px 5px 0 var(--shadow)',
          }}
        >
          <div className="mb-3 flex items-center justify-end">
            <TetrisBlocks />
          </div>

          <div
            className="font-display leading-[0.92]"
            style={{
              fontSize: 'clamp(44px, 7vw, 72px)',
              letterSpacing: '-0.025em',
            }}
          >
            {(['STACK.', 'SMASH.'] as const).map((word, wi) => (
              <div
                key={word}
                style={{
                  color: heroTextColor,
                  animation: `lobbySlideWord 400ms cubic-bezier(0.22,1,0.36,1) both`,
                  animationDelay: `${120 + wi * 90}ms`,
                }}
              >
                {word}
              </div>
            ))}
            <div
              style={{
                color: 'var(--danger)',
                WebkitTextStroke: '2px var(--ink)',
                paintOrder: 'stroke fill',
                animation:
                  'lobbySlideWord 400ms cubic-bezier(0.22,1,0.36,1) both',
                animationDelay: '300ms',
              }}
            >
              STAKE.
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Ticker strip — news headlines (only once an item is live) */}
      {getLiveNewsItems().length > 0 && (
        <FadeUp delay={180}>
          <Ticker />
        </FadeUp>
      )}

      {/* Stats row — only rendered when there's at least one real value */}
      {(shareScore > 0 || playerStats) && (
        <FadeUp delay={260}>
          <div
            className="border-[3px] border-ink"
            style={{
              display: 'grid',
              gridTemplateColumns: [shareScore > 0, !!playerStats]
                .filter(Boolean)
                .map(() => '1fr')
                .join(' '),
              boxShadow: '5px 5px 0 var(--shadow)',
            }}
          >
            {shareScore > 0 && (
              <div
                className="flex flex-col items-center justify-center py-4"
                style={{
                  background: 'var(--paper)',
                  borderRight: playerStats ? '3px solid var(--ink)' : undefined,
                }}
              >
                <span
                  className="mb-1 font-display text-[9px] tracking-[0.16em]"
                  style={{ color: 'var(--ink)' }}
                >
                  BEST
                </span>
                <span
                  className="font-display"
                  style={{
                    letterSpacing: '-0.03em',
                    fontSize: 'clamp(16px,5.5vw,28px)',
                    color: 'var(--ink)',
                  }}
                >
                  {animatedScore > 0 ? animatedScore.toLocaleString() : shareScore.toLocaleString()}
                </span>
              </div>
            )}
            {playerStats && (
              <div
                className="flex flex-col items-center justify-center py-4"
                style={{ background: 'var(--accent-pink)' }}
              >
                <span
                  className="mb-1 font-display text-[9px] tracking-[0.16em]"
                  style={{ color: 'var(--ink-fixed)' }}
                >
                  RANK
                </span>
                <span
                  className="font-display"
                  style={{
                    letterSpacing: '-0.03em',
                    fontSize: 'clamp(16px,5.5vw,28px)',
                    color: 'var(--ink-fixed)',
                  }}
                >
                  #{animatedRank}
                </span>
              </div>
            )}
          </div>
        </FadeUp>
      )}

      {/* Play Classic */}
      <FadeUp delay={340}>
        <div className="relative">
          {isWebBrowser() && !isWebWhitelisted(address) && (
            <div
              style={{
                position: 'absolute',
                top: -10,
                left: 12,
                zIndex: 10,
                fontFamily: '"Archivo Black", sans-serif',
                fontSize: 9,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                background: '#ffd51f',
                color: '#0c0c10',
                border: '2px solid #0c0c10',
                padding: '2px 10px',
                animation: 'lobbyBadgePop 0.6s cubic-bezier(0.34,1.56,0.64,1) both',
                animationDelay: '500ms',
              }}
            >
              1 FREE TRIAL — MINIPAY TO COMPETE
            </div>
          )}
          <button
            onClick={onPlayClassic}
            className="brutal-btn flex w-full items-stretch overflow-hidden border-[3px] border-ink text-left"
            style={{
              background: 'var(--danger)',
              boxShadow: '5px 5px 0 var(--shadow)',
            }}
          >
            <div
              className="flex w-16 flex-shrink-0 items-center justify-center border-r-[3px] border-ink"
              style={{ background: 'var(--ink-fixed)' }}
            >
              <span
                className="font-display text-2xl"
                style={{
                  color: 'var(--accent-yellow)',
                  animation: 'lobbyPulsePlay 2.4s ease-in-out infinite',
                }}
              >
                ▶
              </span>
            </div>
            <div className="flex-1 px-4 py-4">
              <div className="flex items-center justify-between font-display text-xl tracking-[0.04em] text-white">
                PLAY CLASSIC <span className="text-2xl leading-none">→</span>
              </div>
              <div className="mt-1 font-display text-[10px] tracking-[0.1em]" style={{ color: '#FFFFFF' }}>
                {isWebBrowser() && !isWebWhitelisted(address) ? 'Web trial · MiniPay required to compete' : 'Weekly leaderboard · Free'}
              </div>
            </div>
          </button>
        </div>
      </FadeUp>

      {/* Tournaments */}
      <FadeUp delay={420}>
        <div className="relative">
          {totalPool > 0n && (
            <div
              className="absolute right-3 top-[-10px] z-10 border-[2px] border-ink px-2 py-[2px] font-display text-[9px] tracking-[0.12em]"
              style={{
                background: 'var(--accent-lime)',
                color: 'var(--ink-fixed)',
                animation:
                  'lobbyBadgePop 0.6s cubic-bezier(0.34,1.56,0.64,1) both',
                animationDelay: '600ms',
              }}
            >
              +${formattedPool} POOL
            </div>
          )}
          <button
            onClick={onPlayTournaments}
            className="brutal-btn flex w-full items-stretch overflow-hidden border-[3px] border-ink text-left"
            style={{
              background: 'var(--piece-blue)',
              boxShadow: '5px 5px 0 var(--shadow)',
            }}
          >
            <div
              className="flex w-16 flex-shrink-0 items-center justify-center border-r-[3px] border-ink"
              style={{ background: 'var(--ink-fixed)' }}
            >
              <BrutalIcon
                name="trophy"
                size={22}
                strokeWidth={2.5}
                className="text-white"
              />
            </div>
            <div className="flex-1 px-4 py-4">
              <div className="flex items-center justify-between font-display text-xl tracking-[0.04em] text-white">
                TOURNAMENTS <span className="text-2xl leading-none">→</span>
              </div>
              <div
                className="mt-1 font-display text-[10px] tracking-[0.1em]"
                style={{ color: '#FFFFFF' }}
              >
                {activeTournaments > 0 ? (
                  <>
                    <span
                      style={{
                        animation: 'loaderPulse 1.4s ease-in-out infinite',
                      }}
                    >
                      ●
                    </span>{' '}
                    {animatedLive} open · $1–$10 entry
                  </>
                ) : (
                  'View all brackets'
                )}
              </div>
            </div>
          </button>
        </div>
      </FadeUp>

      {/* Level, XP and today's missions — the reason to come back today */}
      <FadeUp delay={460}>
        <MetaPanel />
      </FadeUp>

      {/* Shop — whitelisted addresses only */}
      {onOpenShop && (
        <FadeUp delay={500}>
          <div className="relative">
            {/* NEW badge */}
            <div
              className="absolute right-[-8px] top-[-10px] z-10 border-[2px] border-ink px-2 py-[2px] font-display text-[9px] tracking-[0.12em]"
              style={{
                background: 'var(--danger)',
                color: '#fff',
                transform: 'rotate(6deg)',
                boxShadow: '2px 2px 0 var(--shadow)',
              }}
            >
              NEW
            </div>
            <button
              onClick={onOpenShop}
              className="brutal-btn flex w-full items-stretch overflow-hidden border-[3px] border-ink text-left"
              style={{
                background: 'var(--accent-lime)',
                boxShadow: '5px 5px 0 var(--shadow)',
              }}
            >
              <div
                className="flex w-16 flex-shrink-0 items-center justify-center border-r-[3px] border-ink"
                style={{ background: 'var(--ink-fixed)' }}
              >
                <span style={{ color: 'var(--accent-lime)' }}>
                  <BrutalIcon name="shop" size={24} strokeWidth={2} />
                </span>
              </div>
              <div className="flex-1 px-4 py-4">
                <div
                  className="flex items-center justify-between font-display text-xl tracking-[0.04em]"
                  style={{ color: 'var(--ink-fixed)' }}
                >
                  SHOP <span className="text-2xl leading-none">→</span>
                </div>
                <div
                  className="mt-1 font-display text-[10px] tracking-[0.1em]"
                  style={{ color: 'var(--ink-fixed)', opacity: 0.7 }}
                >
                  Power-ups · cosmetics · season pass
                </div>
              </div>
            </button>
          </div>
        </FadeUp>
      )}

      {/* Daily streak */}
      <FadeUp delay={500}>
        <div
          className="flex flex-col gap-2 border-[3px] border-ink px-4 py-3"
          style={{
            background: 'var(--paper-2)',
            boxShadow: '5px 5px 0 var(--shadow)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrutalIcon
                name="flame"
                size={16}
                strokeWidth={2.5}
                className="text-ink"
                style={
                  {
                    animation:
                      streak > 0
                        ? 'lobbyFlame 1.8s ease-in-out infinite'
                        : undefined,
                  } as any
                }
              />
              <div>
                <div
                  className="font-display text-[9px] tracking-[0.16em]"
                  style={{ color: streakLabelColor }}
                >
                  DAILY STREAK
                </div>
                <div
                  className="font-display text-[11px] tracking-[0.04em]"
                  style={{ color: 'var(--ink)' }}
                >
                  {streak > 0
                    ? `DAY ${streak} · ${streak >= 7 ? '2X' : `${streak}X`} BONUS`
                    : 'START YOUR STREAK'}
                </div>
              </div>
            </div>
          </div>
          <StreakBars streak={streak} />
        </div>
      </FadeUp>
    </>
  )

  // Web users who have used their trial — show gate (whitelisted address bypasses)
  if (isWebBrowser() && isWebTrialGated() && !isWebWhitelisted(address)) {
    return <MiniPayGateModal />
  }

  return (
    <>
      {/* Keyframes injected once */}
      <style>{`
        @keyframes lobbyTicker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes lobbyFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-5px); }
        }
        @keyframes lobbySlideWord {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes lobbyPulsePlay {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.15); }
        }
        @keyframes lobbyFlame {
          0%, 100% { transform: scale(1) rotate(0deg); }
          35%       { transform: scale(1.18) rotate(-8deg); }
          65%       { transform: scale(1.1) rotate(6deg); }
        }
        @keyframes lobbyBadgePop {
          from { opacity: 0; transform: scale(0.7) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes loaderPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes lobbyCountPop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
      `}</style>

      <div className="w-full px-3 pb-6 sm:px-4 lg:px-6">
        {/* ── Desktop three-column layout ── */}
        <div
          className="mx-auto hidden max-w-[1440px] items-start gap-8 lg:grid"
          style={{
            gridTemplateColumns:
              'minmax(250px, 280px) minmax(0, 1fr) minmax(250px, 280px)',
          }}
        >
          {/* Left rail */}
          <div className="flex min-w-0 flex-col gap-5">
            <FadeUp delay={80}>
              <RailShell title="LIVE SCORE" accent>
                <div
                  className="font-display"
                  style={{
                    color: 'var(--ink)',
                    fontSize: 58,
                    letterSpacing: '-0.04em',
                    lineHeight: 0.94,
                  }}
                >
                  {animatedLiveScore.toLocaleString()}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <div
                    className="border-[2px] border-ink px-2 py-1 font-display text-[10px] tracking-[0.12em]"
                    style={{
                      background: 'var(--accent-yellow)',
                      color: 'var(--ink-fixed)',
                    }}
                  >
                    {currentRank ? `RANK #${currentRank}` : 'JOIN THE LADDER'}
                  </div>
                  <div
                    className="flex items-center gap-1 border-[2px] border-ink px-2 py-1 font-display text-[10px] tracking-[0.12em]"
                    style={{
                      background: 'var(--paper-2)',
                      color: 'var(--ink)',
                    }}
                  >
                    <span
                      style={{
                        animation: 'loaderPulse 1.4s ease-in-out infinite',
                        color: 'var(--accent-lime)',
                      }}
                    >
                      ●
                    </span>
                    {animatedLive} LIVE
                  </div>
                </div>
              </RailShell>
            </FadeUp>

            <FadeUp delay={160}>
              <RailShell title="NEXT CLEAR CHAIN">
                <div
                  className="relative overflow-hidden border-[3px] border-ink"
                  style={{ height: 24 }}
                >
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: nextChainWidth,
                      background:
                        'repeating-linear-gradient(135deg, var(--accent) 0 18px, var(--accent-2) 18px 36px)',
                      transition: 'width 800ms cubic-bezier(0.22,1,0.36,1)',
                    }}
                  />
                </div>
                <div
                  className="mt-3 flex items-center justify-between font-display text-[10px] tracking-[0.14em]"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  <span>
                    {streak > 0 ? `DAY ${streak} READY` : 'OPENING LINE'}
                  </span>
                  <span>+{Math.max(80, streak * 40)} BONUS</span>
                </div>
              </RailShell>
            </FadeUp>

            <FadeUp delay={240}>
              <div className="flex gap-3">
                <div className="flex-1">
                  <MiniMetric
                    label="POOL"
                    value={`$${formattedPool}`}
                    background="var(--accent-lime)"
                  />
                </div>
                <div className="flex-1">
                  <MiniMetric
                    label="OPEN"
                    value={String(activeTournaments)}
                    background="var(--accent-cyan)"
                  />
                </div>
              </div>
            </FadeUp>

            <FadeUp delay={320}>
              <RailShell title="DAILY STREAK">
                <div className="flex items-center gap-3">
                  <BrutalIcon
                    name="flame"
                    size={18}
                    strokeWidth={2.5}
                    className="text-ink"
                  />
                  <div>
                    <div
                      className="font-display text-[11px] tracking-[0.12em]"
                      style={{ color: streakLabelColor }}
                    >
                      {streak > 0
                        ? `DAY ${streak} · ${streak >= 7 ? '2X BONUS' : `${streak}X BONUS`}`
                        : 'START YOUR STREAK'}
                    </div>
                    <div
                      className="mt-1 font-display text-[10px] tracking-[0.1em]"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      Fill the week bar to lock your multiplier.
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <StreakBars streak={streak} count={7} />
                </div>
              </RailShell>
            </FadeUp>
          </div>

          {/* Center hero */}
          <div className="flex min-w-0 flex-col gap-4">{heroStack}</div>

          {/* Right rail */}
          <div className="flex min-w-0 flex-col gap-5">
            {address && (
              <FadeUp delay={60}>
                <PlayerRewardsPanel address={address} />
              </FadeUp>
            )}
            <FadeUp delay={100}>
              <RailShell title="WEEKLY LADDER" accent>
                <div className="space-y-2">
                  {topThree.length > 0 ? (
                    topThree.map((entry, index) => {
                      const isCurrentUser =
                        address?.toLowerCase() === entry.player.toLowerCase()
                      return (
                        <div
                          key={entry.player}
                          className="flex items-center gap-3 border-[3px] border-ink px-3 py-3"
                          style={{
                            background:
                              index === 0
                                ? 'var(--accent-yellow)'
                                : isCurrentUser
                                  ? 'var(--accent-cyan)'
                                  : 'var(--paper-2)',
                            color:
                              index === 0 || isCurrentUser
                                ? 'var(--ink-fixed)'
                                : 'var(--ink)',
                            animation: `lobbySlideWord 300ms cubic-bezier(0.22,1,0.36,1) both`,
                            animationDelay: `${200 + index * 80}ms`,
                          }}
                        >
                          <span className="w-6 font-display text-[16px]">
                            #{index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-display text-[11px] tracking-[0.08em]">
                            <LobbyPlayerName address={entry.player} />
                          </span>
                          <span
                            className="font-display text-[12px]"
                            style={{ letterSpacing: '-0.02em' }}
                          >
                            {entry.score.toLocaleString()}
                          </span>
                        </div>
                      )
                    })
                  ) : (
                    <div
                      className="border-[3px] border-ink px-3 py-4 font-display text-[10px] tracking-[0.12em]"
                      style={{
                        background: 'var(--paper-2)',
                        color: 'var(--ink-soft)',
                      }}
                    >
                      Ladder is warming up.
                    </div>
                  )}
                </div>
              </RailShell>
            </FadeUp>

            <FadeUp delay={200}>
              <RailShell title="DANGER WATCH">
                <div className="space-y-2">
                  {[
                    {
                      label: '3×3 SQUARE',
                      state: 'HIGH',
                      bg: 'var(--piece-red)',
                    },
                    {
                      label: '5-LONG LINE',
                      state: 'MED',
                      bg: 'var(--piece-orange)',
                    },
                    {
                      label: 'Z-ZIGZAG',
                      state: 'LOW',
                      bg: 'var(--piece-lime)',
                    },
                  ].map((item, i) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between border-[3px] border-ink px-3 py-3"
                      style={{
                        background: 'var(--paper-2)',
                        animation: 'lobbySlideWord 280ms ease both',
                        animationDelay: `${300 + i * 70}ms`,
                      }}
                    >
                      <span
                        className="font-display text-[11px] tracking-[0.08em]"
                        style={{ color: 'var(--ink)' }}
                      >
                        {item.label}
                      </span>
                      <span
                        className="border-[2px] border-ink px-2 py-0.5 font-display text-[9px] tracking-[0.1em]"
                        style={{
                          background: item.bg,
                          color: 'var(--ink-fixed)',
                        }}
                      >
                        {item.state}
                      </span>
                    </div>
                  ))}
                </div>
              </RailShell>
            </FadeUp>

            <FadeUp delay={300}>
              <button
                onClick={handleShareBestScore}
                className="brutal-btn flex w-full items-center justify-between border-[3px] border-ink px-5 py-5 font-display text-[11px] tracking-[0.18em]"
                style={{
                  background: 'var(--accent-lime)',
                  color: 'var(--ink-fixed)',
                  boxShadow: '5px 5px 0 var(--shadow)',
                }}
              >
                <span className="flex items-center">
                  <BrutalIcon name="rocket" size={16} className="mr-2" />
                  SHARE BEST SCORE
                </span>
                <span className="text-xl leading-none">→</span>
              </button>
            </FadeUp>
          </div>
        </div>

        {/* ── Mobile stack ── */}
        <div className="mx-auto flex max-w-lg flex-col gap-3 pb-4 lg:hidden">
          {address && <PlayerRewardsPanel address={address} />}
          {heroStack}
        </div>
      </div>

      {showUsernameModal && (
        <UsernameSetupModal onDismiss={() => setShowUsernameModal(false)} />
      )}

      <NewsNudge
        newsItems={getLiveNewsItems()}
        onNavigateTournaments={onPlayTournaments}
      />
      <CampaignReminderModal />
      <WinnerClaimModal />
    </>
  )
}

export default LobbyScreen
