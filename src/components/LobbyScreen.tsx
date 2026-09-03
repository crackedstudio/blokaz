/**
 * THE LOBBY — six compartments, nothing else.
 *
 * Earlier passes kept adding surface: a hero banner, a ticker, nine tiles, and
 * a progression panel carrying two ladders, four meters and three mission rows
 * all at once. It read as noise. The rule now is one card, one number — PLAY,
 * TOURNAMENTS, YOU, PROGRESS, LADDER, and a strip for shop/streak/news. Every
 * card is a button, and the detail it summarises opens in a sheet.
 *
 * Data lives here; the cards are dumb. In particular the single usePlayerLevel
 * subscription belongs at this level — the ladder refresh is a POST, so
 * mounting the hook inside a card would multiply every player's calls.
 */

import React, { useMemo, useState, useEffect } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import {
  useLeaderboard,
  useTournamentCount,
  USDC_DECIMALS,
  useUsername,
} from '../hooks/useBlokzGame'
import { BLOKZ_TOURNAMENT_ABI } from '../constants/abi'
import contractInfo from '../contract.json'
import { isWebBrowser, isWebTrialGated } from '../utils/miniPay'
import { isWebWhitelisted } from '../utils/featureFlags'
import { MiniPayGateModal } from './MiniPayGateModal'
import UsernameSetupModal, {
  hasDismissedUsernamePrompt,
} from './UsernameSetupModal'
import { NewsNudge } from './GameNotification'
import WinnerClaimModal from './WinnerClaimModal'
import PlayerRewardsPanel from './PlayerRewardsPanel'
import LevelUpModal from './LevelUpModal'
import StatsModal from './StatsModal'
import { usePlayerLevel } from '../hooks/usePlayerLevel'
import { useMetaStore } from '../stores/metaStore'
import { isMissionComplete } from '../engine/meta'
import { getLiveNewsItems } from './lobby/news'
import { audioEngine } from '../audio/AudioEngine'
import { isSovereign } from '../utils/silverGod'
import { useThemeStore } from '../stores/themeStore'
import { Card } from './lobby/Card'
import { BlockRain, BlockRule } from './blocks/BlockFX'
import ProgressSheet from './lobby/ProgressSheet'
import NewsSheet from './lobby/NewsSheet'
import ModePicker from './lobby/ModePicker'

// The news copy lives in ./lobby/news so the sheets can read it without
// importing this screen. Re-exported so existing import paths keep working.
export {
  NEWS_ITEMS,
  TOURNAMENT_LAUNCH_MS,
  TAG_COLORS,
  getLiveNewsItems,
} from './lobby/news'
export type { NewsItem } from './lobby/news'

const TOURNAMENT_ADDRESS = contractInfo.tournament as `0x${string}`

// ─── Decoration ─────────────────────────────────────────────────────────────
// Atmosphere only — no information, hidden from assistive tech. The block
// motif itself lives in components/blocks/BlockFX so every screen shares one
// implementation.

interface LobbyScreenProps {
  onPlayClassic: () => void
  onPlayTournaments: () => void
  onOpenShop?: () => void
  onOpenLeaderboard?: () => void
}

const LobbyScreen: React.FC<LobbyScreenProps> = ({
  onPlayClassic,
  onPlayTournaments,
  onOpenShop,
  onOpenLeaderboard,
}) => {
  const { address } = useAccount()
  const { leaderboard } = useLeaderboard()
  const { count: tournamentCount } = useTournamentCount()
  const { state: levelState } = usePlayerLevel(address)
  const { level, progress, address: metaAddress } = useMetaStore()

  type Sheet = 'modes' | 'progress' | 'news' | 'stats'
  const [sheet, setSheet] = useState<Sheet | null>(null)

  // One place for the open/close pair, so every sheet in the lobby sounds the
  // same way round whichever card opened it.
  const openSheet = (next: Sheet) => {
    try { audioEngine.uiOpen() } catch {}
    setSheet(next)
  }
  const closeSheet = () => {
    try { audioEngine.uiClose() } catch {}
    setSheet(null)
  }

  /**
   * The lobby's bed: intensity 0, which is bass and hats only. It is a request
   * rather than a command — browsers block audio until a gesture, so the engine
   * holds it and starts on the first tap.
   */
  useEffect(() => {
    try { audioEngine.startMusic(0) } catch {}
  }, [])

  /**
   * SilverGod gate.
   *
   * Reports the server's answer straight through — nothing is cached, so there
   * is no local flag to set and the theme cannot be granted from a console.
   * The cost is that silver is unavailable while the ladder API is down.
   */
  useEffect(() => {
    useThemeStore.getState().setSovereign(isSovereign(levelState))
  }, [levelState])

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
    return raw ? raw.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'
  }, [totalPool])

  const sortedLeaderboard = useMemo(
    () => (leaderboard ? [...leaderboard].sort((a, b) => b.score - a.score) : []),
    [leaderboard]
  )

  const playerStats = useMemo(() => {
    if (!sortedLeaderboard.length || !address) return null
    const idx = sortedLeaderboard.findIndex(
      (e) => e.player.toLowerCase() === address.toLowerCase()
    )
    if (idx === -1) return null
    return { rank: idx + 1, bestScore: sortedLeaderboard[idx].score }
  }, [sortedLeaderboard, address])

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
    if (!address || isLoadingUsername) return
    if (username) return // already has one
    if (hasDismissedUsernamePrompt()) return // dismissed before
    const t = setTimeout(() => setShowUsernameModal(true), 800)
    return () => clearTimeout(t)
  }, [address, username, isLoadingUsername])

  const localBest = (() => {
    try {
      return Number(localStorage.getItem('blokaz:best_score') ?? 0) || 0
    } catch {
      return 0
    }
  })()
  const bestScore = Math.max(playerStats?.bestScore ?? 0, localBest)

  // Web users who have used their trial — show gate (whitelisted bypasses)
  if (isWebBrowser() && isWebTrialGated() && !isWebWhitelisted(address)) {
    return <MiniPayGateModal />
  }

  const newsCount = getLiveNewsItems().length
  const missionsDone = progress.missions.filter(isMissionComplete).length
  const hasProgress = Boolean(metaAddress || levelState)

  return (
    <>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: none; }
        }
        /* Hard shadows want a physical press: lift toward the light on hover,
           slam flat on click. This is most of what makes the board feel like a
           game rather than a list of links. */
        .lobby-card {
          transition: transform 90ms ease-out, box-shadow 90ms ease-out;
        }
        @media (hover: hover) {
          .lobby-card:hover {
            transform: translate(-2px, -2px);
            box-shadow: 10px 10px 0 var(--shadow) !important;
          }
        }
        .lobby-card:active {
          transform: translate(4px, 4px);
          box-shadow: 1px 1px 0 var(--shadow) !important;
        }
        .lobby-card:focus-visible {
          outline: 3px solid var(--accent-yellow);
          outline-offset: 3px;
        }

        /* Absolute pixels, not percentages: a percentage translate is relative
           to the block's own size, which left them hovering near the top edge
           instead of falling the height of the card. */
        @keyframes playPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.12); }
        }
        .lobby-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr 1fr;
          grid-template-areas:
            "play play"
            "you  prog"
            "ladd ladd"
            "rule rule"
            "strip strip";
        }
        @media (min-width: 900px) {
          .lobby-grid {
            gap: 14px;
            grid-template-columns: repeat(6, minmax(0, 1fr));
            grid-template-areas:
              "play play play play play play"
              "you  you  prog prog ladd ladd"
              "rule rule rule rule rule rule"
              "strip strip strip strip strip strip";
          }
        }
        /* The strip is the page's low shelf: shop, streak and news, one line each. */
        .lobby-strip {
          display: grid;
          gap: 12px;
          grid-area: strip;
          grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        }

        @media (prefers-reduced-motion: reduce) {
          .lobby-card, .lobby-card * { animation: none !important; }
          .lobby-card:hover { transform: none; }
        }
      `}</style>

      {/* App shell reserves 64px for the header, but the desktop header is
          taller than that — pad past it so the first card is not clipped. */}
      <div className="w-full px-3 pb-10 pt-4 sm:px-4 lg:px-6 lg:pt-9">
        <div className="mx-auto w-full max-w-[900px]">
          {address && (
            <div className="mb-3">
              <PlayerRewardsPanel address={address} />
            </div>
          )}

          <div className="lobby-grid">
            <div style={{ gridArea: 'play' }} className="min-w-0">
              <Card
                icon="play"
                label={
                  activeTournaments > 0
                    ? `Classic · ${activeTournaments} tournament${activeTournaments === 1 ? '' : 's'} open`
                    : 'Classic · tournaments'
                }
                value="PLAY"
                tone="red"
                hero
                delay={0}
                decoration={<BlockRain count={5} distance={250} seed={11} />}
                onClick={() => openSheet('modes')}
              />
            </div>

            <div style={{ gridArea: 'you' }} className="min-w-0">
              <Card
                icon="star"
                label="Best score"
                value={bestScore > 0 ? bestScore.toLocaleString() : '—'}
                tone="ink"
                delay={110}
                onClick={() => openSheet('stats')}
              />
            </div>

            <div style={{ gridArea: 'prog' }} className="min-w-0">
              <Card
                icon="trending"
                label={
                  hasProgress
                    ? `${missionsDone}/${progress.missions.length} missions today`
                    : 'Progress'
                }
                value={hasProgress ? `LVL ${levelState?.level ?? level}` : '—'}
                tone="purple"
                delay={150}
                onClick={() => openSheet('progress')}
              />
            </div>

            <div style={{ gridArea: 'ladd' }} className="min-w-0">
              <Card
                icon="crown"
                label="Weekly ladder"
                value={playerStats?.rank ? `#${playerStats.rank}` : '—'}
                tone="yellow"
                delay={190}
                onClick={onOpenLeaderboard}
              />
            </div>

            <div
              className="flex items-center justify-center py-1"
              style={{ gridArea: 'rule' }}
            >
              <BlockRule cells={14} filled={[3, 4, 5, 9, 12]} cell={9} />
            </div>

            <div className="lobby-strip">
              {onOpenShop && (
                <Card
                  icon="shop"
                  label="Shop"
                  tone="lime"
                  mini
                  delay={230}
                  onClick={onOpenShop}
                />
              )}
              <Card
                icon="flame"
                label={streak > 0 ? `${streak}-day streak` : 'No streak'}
                tone="orange"
                mini
                delay={260}
              />
              {newsCount > 0 && (
                <Card
                  icon="history"
                  label={newsCount > 1 ? `${newsCount} updates` : 'Update'}
                  tone="cyan"
                  mini
                  delay={290}
                  onClick={() => openSheet('news')}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {sheet === 'modes' && (
        <ModePicker
          onClassic={onPlayClassic}
          onTournaments={onPlayTournaments}
          pool={formattedPool}
          openCount={activeTournaments}
          trialGated={isWebBrowser() && !isWebWhitelisted(address)}
          onClose={closeSheet}
        />
      )}
      {sheet === 'progress' && (
        <ProgressSheet
          levelState={levelState}
          onClose={closeSheet}
          address={address}
        />
      )}
      {sheet === 'news' && <NewsSheet onClose={closeSheet} />}
      {sheet === 'stats' && <StatsModal onClose={closeSheet} />}

      {showUsernameModal && (
        <UsernameSetupModal onDismiss={() => setShowUsernameModal(false)} />
      )}

      {address && levelState && levelState.advanced.length > 0 && (
        <LevelUpModal
          address={address}
          advances={levelState.advanced}
          accent={levelState.accent}
        />
      )}

      <NewsNudge
        newsItems={getLiveNewsItems()}
        onNavigateTournaments={onPlayTournaments}
      />
      <WinnerClaimModal />
    </>
  )
}

export default LobbyScreen
