import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { GridRenderer } from '../canvas/GridRenderer'
import { PieceRenderer } from '../canvas/PieceRenderer'
import { TouchController } from '../canvas/TouchController'
import { AnimationManager } from '../canvas/AnimationManager'
import { PowerUpHintManager } from '../canvas/PowerUpHintManager'
import type { HintType } from '../canvas/PowerUpHintManager'
import { PowerUpHintOverlay } from './PowerUpHintOverlay'
import { Grid } from '../engine/grid'
import { SHAPES, TOTAL_WEIGHT } from '../engine/shapes'
import type { ShapeDefinition } from '../engine/shapes'
import ScoreBar from './ScoreBar'
import GameOverModal from './GameOverModal'
import NoGasModal from './NoGasModal'
import { ComboOverlay } from './ComboOverlay'
import { BrutalIcon } from './BrutalIcon'
import HowToPlayModal, { hasSeenOnboarding } from './HowToPlayModal'
import FAQSheet from './FAQSheet'
import {
  hapticImpact,
  hapticNotification,
  hapticError,
} from '../miniapp/haptics'
import {
  useStartGame,
  generateGameSeed,
  useActiveGame,
  useLeaderboard,
  useUsername,
} from '../hooks/useBlokzGame'
import { useAccount, useBalance } from 'wagmi'
import { keccak256, encodePacked } from 'viem'
import contractInfo from '../contract.json'
import type { MoveRecord } from '../engine/game'
import {
  CLASSIC_SESSION_STORAGE_KEY,
  isSubmittedSeed,
  readStoredGameSession,
  writeStoredGameSession,
  clearStoredGameSession,
} from '../utils/gameSessionStorage'
import { IS_MINIPAY, isWebBrowser, markTrialUsed, isWebTrialGated } from '../utils/miniPay'
import { isWebWhitelisted } from '../utils/featureFlags'
import { MiniPayGateModal } from './MiniPayGateModal'
import { getScoreTier } from '../engine/scoring'
import type { TierInfo } from '../engine/scoring'
import { SocialNudgeModal, incrementGameCount, shouldShowNudge } from './SocialNudgeModal'
import { LotteryModal } from './LotteryModal'
import {
  checkLotteryTrigger,
  getRandomPrize,
  markLotteryThreshold,
  resetLotterySession,
} from '../utils/lottery'
import type { Prize } from '../utils/lottery'
import { PowerUpBar } from './PowerUpBar'
import { ShopModal } from './ShopModal'
import { usePowerUpStore } from '../stores/powerUpStore'
import { useNotifications, ToastContainer } from './GameNotification'
import { audioEngine } from '../audio/AudioEngine'
import type { MusicIntensity } from '../audio/MusicEngine'

/**
 * Eight score tiers map onto the music engine's four intensities, so the
 * soundtrack gains a layer roughly every other tier rather than lurching.
 */
const musicIntensityForTier = (tierId: number): MusicIntensity =>
  Math.min(3, Math.floor(tierId / 2)) as MusicIntensity
import { useMoveSync, fetchServerSession, markSessionComplete } from '../hooks/useMoveSync'

const GAME_ADDRESS = contractInfo.game as `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

import { isShopLotteryEnabled } from '../utils/featureFlags'
import { replayMoveHistory } from '../engine/sessionReplay'

interface GameScreenProps {
  onOpenLeaderboard?: () => void
  onBack?: () => void
}

// ─── Desktop sidebar widgets ────────────────────────────────────────────────

// ─── Desktop sidebar widgets ────────────────────────────────────────────────

const DailyStreakPanel: React.FC = () => {
  const today = new Date().getDay()
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <div
      className="border-4 border-ink"
      style={{
        background: 'var(--paper-2)',
        boxShadow: '4px 4px 0 var(--shadow)',
      }}
    >
      <div
        className="flex items-center justify-between border-b-4 border-ink px-4 py-3"
        style={{ background: 'var(--accent-yellow)' }}
      >
        <div
          className="flex items-center font-display text-[10px] tracking-[0.16em]"
          style={{ color: 'var(--ink-fixed)' }}
        >
          <BrutalIcon name="flame" size={12} className="mr-2" /> DAILY STREAK
        </div>
        <div
          className="font-display text-sm"
          style={{ color: 'var(--ink-fixed)' }}
        >
          DAY 7
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="mb-2 flex gap-1.5">
          {days.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full border-2 border-ink"
                style={{
                  height: 18,
                  background: i < today ? 'var(--accent-lime)' : 'var(--rule)',
                }}
              />
              <span
                className="font-display text-[8px]"
                style={{ color: 'var(--ink-soft)' }}
              >
                {d}
              </span>
            </div>
          ))}
        </div>
        <div
          className="font-body text-[10px] uppercase tracking-[0.08em]"
          style={{ color: 'var(--ink-soft)' }}
        >
          2× BONUS ACTIVE ON ALL CLEARS
        </div>
      </div>
    </div>
  )
}

const DANGER_DEFS = [
  {
    name: '3×3 SQUARE',
    risk: 'HIGH',
    color: 'var(--piece-red)',
    weight: SHAPES.find((shape) => shape.id === 'O3')?.spawnWeight ?? 0,
    match: (shape: ShapeDefinition) => shape.id === 'O3',
  },
  {
    name: '5-LONG LINE',
    risk: 'MED',
    color: 'var(--piece-orange)',
    weight: SHAPES.filter(
      (shape) => shape.id === 'I5H' || shape.id === 'I5V'
    ).reduce((sum, shape) => sum + shape.spawnWeight, 0),
    match: (shape: ShapeDefinition) => shape.id === 'I5H' || shape.id === 'I5V',
  },
  {
    name: 'Z-ZIGZAG',
    risk: 'LOW',
    color: 'var(--piece-lime)',
    weight: SHAPES.filter((shape) => shape.family === 'zigzag').reduce(
      (sum, shape) => sum + shape.spawnWeight,
      0
    ),
    match: (shape: ShapeDefinition) => shape.family === 'zigzag',
  },
] as const

const DangerWatch: React.FC<{ currentPieces?: (ShapeDefinition | null)[] }> = ({
  currentPieces = [],
}) => {
  return (
    <div
      className="border-4 border-ink"
      style={{
        background: 'var(--paper-2)',
        boxShadow: '4px 4px 0 var(--shadow)',
      }}
    >
      <div className="border-b-4 border-ink bg-paper px-4 py-3 font-display text-[11px] uppercase tracking-[0.2em]">
        DANGER WATCH
      </div>
      <div className="space-y-1.5 p-3">
        {DANGER_DEFS.map((danger) => {
          const isLive = currentPieces.some(
            (shape) => shape && danger.match(shape)
          )
          return (
            <div
              key={danger.name}
              className="flex items-center justify-between border-[3px] border-ink px-2 py-2 transition-colors"
              style={{
                background: isLive ? 'var(--accent-yellow)' : 'var(--paper-2)',
                boxShadow: isLive ? '3px 3px 0 var(--shadow)' : 'none',
                color: isLive ? 'var(--ink-fixed)' : 'inherit',
              }}
            >
              <div className="font-display text-[11px] uppercase tracking-[0.05em]">
                {danger.name}
              </div>
              <div
                className="flex items-center gap-1.5 border-2 border-ink px-2 py-0.5 font-display text-[9px] tracking-[0.1em]"
                style={{
                  background: isLive ? 'var(--accent-lime)' : 'transparent',
                }}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full border border-ink"
                  style={{
                    background: isLive ? 'white' : 'var(--ink)',
                  }}
                />
                <span
                  style={{ color: isLive ? 'var(--ink-fixed)' : 'var(--ink)' }}
                >
                  {isLive ? 'LIVE' : danger.risk}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const LadderPlayerName: React.FC<{ address: string }> = ({ address }) => {
  const { username, isLoading } = useUsername(address as `0x${string}`)
  if (isLoading) return <span className="inline-block h-3 w-20 animate-pulse rounded-sm bg-current opacity-20" />
  const display = username ?? `${address.slice(0, 6)}…${address.slice(-4)}`
  return <span>{display}</span>
}

const LiveLadder: React.FC<{ currentScore: number }> = ({ currentScore }) => {
  const { leaderboard, isLoading } = useLeaderboard()
  const { address } = useAccount()
  const sorted = leaderboard
    ? [...leaderboard].sort((a, b) => b.score - a.score)
    : []
  const top3 = sorted.slice(0, 3)
  const userIdx = sorted.findIndex(
    (e) => e.player.toLowerCase() === (address?.toLowerCase() ?? '')
  )

  return (
    <div
      className="border-4 border-ink"
      style={{
        background: 'var(--paper-2)',
        boxShadow: '8px 8px 0 var(--shadow)',
      }}
    >
      <div
        className="flex items-center justify-between border-b-4 border-ink px-4 py-3 font-display text-[11px] tracking-[0.14em]"
        style={{ background: 'var(--paper)' }}
      >
        <span className="flex items-center uppercase tracking-[0.2em]">
          <BrutalIcon name="trending" size={12} className="mr-2" /> WEEKLY
          LADDER
        </span>
        <span
          className="font-display text-[9px]"
          style={{ color: 'var(--ink-soft)' }}
        >
          2D 14H
        </span>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse bg-ink/5" />
          ))}
        </div>
      ) : (
        <div>
          {top3.map((entry, i) => {
            const isMe =
              entry.player.toLowerCase() === (address?.toLowerCase() ?? '')
            return (
              <div
                key={entry.player}
                className="flex items-center gap-2 border-b-2 border-ink px-3 py-2.5"
                style={{
                  background: isMe
                    ? 'var(--accent-yellow)'
                    : i === 0
                      ? 'var(--accent-yellow)'
                      : 'var(--paper-2)',
                  color: isMe || i === 0 ? 'var(--ink-fixed)' : 'inherit',
                }}
              >
                <span className="w-6 font-display text-sm">#{i + 1}</span>
                <span className="flex-1 truncate font-display text-xs">
                  <LadderPlayerName address={entry.player} />
                </span>
                <span className="font-display text-xs tabular-nums tracking-tighter">
                  {entry.score.toLocaleString()}
                </span>
              </div>
            )
          })}
          {userIdx > 2 && (
            <div
              className="flex items-center gap-2 border-b-2 border-ink px-3 py-2.5"
              style={{
                background: 'var(--accent-cyan)',
                color: 'var(--ink-fixed)',
              }}
            >
              <span className="w-6 font-display text-sm">#{userIdx + 1}</span>
              <span className="flex-1 font-display text-xs uppercase">YOU</span>
              <span className="ml-1 border border-ink bg-ink px-1 font-display text-[9px] tabular-nums text-white">
                YOU
              </span>
              <span className="font-display text-xs tabular-nums tracking-tighter">
                {sorted[userIdx].score.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ShareCard: React.FC<{ score: number }> = ({ score }) => (
  <div
    className="border-4 border-ink bg-accent-pink p-5"
    style={{ boxShadow: '6px 6px 0 var(--shadow)', color: 'var(--ink-fixed)' }}
  >
    <div className="mb-4 flex items-center justify-between">
      <div className="font-display text-[10px] uppercase tracking-widest opacity-80">
        SHARE CARD
      </div>
      <div className="h-2 w-2 animate-pulse rounded-full bg-ink" />
    </div>

    <div className="relative overflow-hidden border-4 border-ink bg-paper-2 p-5 shadow-[4px_4px_0_var(--shadow)]">
      {/* Decorative dots */}
      <div className="absolute -right-4 -top-4 opacity-10">
        <svg width="60" height="60" viewBox="0 0 60 60">
          <pattern
            id="dots"
            x="0"
            y="0"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="2" fill="var(--ink)" />
          </pattern>
          <rect x="0" y="0" width="60" height="60" fill="url(#dots)" />
        </svg>
      </div>

      <div className="font-display text-3xl tracking-tighter text-ink">
        BLOKAZ.
      </div>
      <div
        className="mt-4 font-display text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--ink-soft)' }}
      >
        CLASSIC RUN SCORE
      </div>
      <div
        className="mt-1 font-display leading-none text-accent-pink"
        style={{
          fontSize: 'clamp(2.5rem, 4vw, 3.5rem)',
          letterSpacing: '-0.04em',
          WebkitTextStroke: '2px var(--ink)',
        }}
      >
        {score.toLocaleString()}
      </div>
    </div>
  </div>
)

// ─── Stat block for desktop left column ─────────────────────────────────────
const StatBlock: React.FC<{ label: string; value: string; bg: string }> = ({
  label,
  value,
  bg,
}) => {
  const isColoredTile = bg !== 'var(--paper)' && bg !== 'var(--paper-2)'
  const labelColor = isColoredTile ? 'var(--ink-fixed)' : 'var(--ink-soft)'
  const valueColor = isColoredTile ? 'var(--ink-fixed)' : 'var(--ink)'

  return (
    <div
      className="flex flex-col justify-between border-4 border-ink p-3"
      style={{
        background: bg,
        boxShadow: '4px 4px 0 var(--shadow)',
        height: 74,
      }}
    >
      <div
        className="font-display text-[9px] uppercase tracking-[0.2em]"
        style={{ color: labelColor, opacity: isColoredTile ? 0.7 : 1 }}
      >
        {label}
      </div>
      <div
        className="font-display text-2xl uppercase"
        style={{ letterSpacing: '-0.02em', lineHeight: 1, color: valueColor }}
      >
        {value}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

const GameScreen: React.FC<GameScreenProps> = ({
  onOpenLeaderboard,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boardContainerRef = useRef<HTMLDivElement>(null)
  const animManagerRef = useRef<AnimationManager>(new AnimationManager())
  const powerUpHintRef = useRef<PowerUpHintManager>(new PowerUpHintManager())
  const lastTimeRef = useRef<number>(0)
  const trayHoverIndexRef = useRef<number | null>(null)
  const cellSizeRef = useRef<number>(0)
  const currentTierRef = useRef<TierInfo>(getScoreTier(0))

  const {
    gameSession,
    score,
    comboStreak,
    isGameOver: isGameOverStore,
    startGame,
    setOnChainData,
    forceReset,
    reviveGame,
    onChainStatus,
    onChainSeed,
    onChainGameId,
    reviveCount,
    lotteryMultiplierMovesLeft,
  } = useGameStore()

  const { toasts, dismissToast, showToast } = useNotifications()

  // Sync every move to the server so the session is recoverable even if
  // localStorage is cleared or the browser crashes.
  useMoveSync()

  // Derive the authoritative game-over flag from BOTH the store field AND the
  // mutable session object. The store field can lag by one React commit cycle
  // in certain iOS/React-18 batching scenarios; reading the session directly
  // ensures the modal is never suppressed when the engine has already ended.
  const isGameOver = (gameSession?.isGameOver ?? false) || isGameOverStore

  const {
    loadForAddress,
    resetActive: resetActivePowerUps,
    active: activePowerUps,
    bombModeActive,
    triggerShield,
    consumeBomb,
    addInventory,
  } = usePowerUpStore()

  const [showShop, setShowShop] = useState(false)
  const [isContinuing, setIsContinuing] = useState(false)

  const { address, isConnected, isReconnecting } = useAccount()
  const isWhitelisted = isShopLotteryEnabled(address)

  // ── No-gas detection ──────────────────────────────────────────────────────
  // Threshold: 0.005 CELO — enough for ~3-5 typical contract writes.
  // Skipped for MiniPay (gas is handled by the dApp) and unconnected wallets.
  const GAS_THRESHOLD = 5_000_000_000_000_000n // 0.005 CELO in wei
  const { data: celoBalance } = useBalance({
    address,
    query: { enabled: isConnected && !IS_MINIPAY, refetchInterval: 15_000 },
  })
  const hasNoGas =
    isConnected && !IS_MINIPAY && celoBalance !== undefined && celoBalance.value < GAS_THRESHOLD

  const [noGasDismissed, setNoGasDismissed] = useState(false)
  // Re-surface the modal whenever the user re-enters the screen with no gas
  useEffect(() => {
    if (!hasNoGas) setNoGasDismissed(false)
  }, [hasNoGas])

  const showNoGasModal = hasNoGas && !noGasDismissed

  // ─── Lottery ────────────────────────────────────────────────────────────
  const [lotteryPrize, setLotteryPrize]       = useState<Prize | null>(null)
  const [lotteryThreshold, setLotteryThreshold] = useState<number>(0)
  const prevScoreRef = useRef<number>(0)

  // ─── Social nudge ───────────────────────────────────────────────────────
  const [showSocialNudge, setShowSocialNudge] = useState(false)

  // ─── Power-up hint overlay (two-phase: DOM hand → canvas effect) ─────────
  const [hintTrigger, setHintTrigger] = useState<{ type: HintType; id: number } | null>(null)

  // Screen flash state for power-up activation (DOM-layer cinematic hit)
  const [screenFlash, setScreenFlash] = useState<{ color: string; key: number } | null>(null)
  const flashKeyRef = useRef(0)

  // Register the auto-trigger callback once so the hint manager can fire the
  // DOM hand animation at psychologically timed moments
  useEffect(() => {
    powerUpHintRef.current.setAutoTriggerCallback((type) => {
      setHintTrigger(prev => ({ type, id: (prev?.id ?? 0) + 1 }))
    })
  }, [])

  // Listen for power-up activations from PowerUpBar — trigger canvas animation + screen flash
  useEffect(() => {
    const FLASH_COLORS: Record<string, string> = {
      scoreBoost: 'rgba(255,213,31,0.18)',
      shield:     'rgba(59,130,246,0.18)',
      bomb:       'rgba(255,87,34,0.22)',
      rotatePass: 'rgba(56,189,248,0.15)',
    }
    const handler = (e: Event) => {
      const type = (e as CustomEvent<{ type: string }>).detail.type
      const cs = cellSizeRef.current
      if (!cs) return
      // Canvas burst animation
      animManagerRef.current.trigger('POWER_UP', { subType: type })
      // Each power-up has its own voice; the engine dispatches on the name.
      try { audioEngine.powerUp(type) } catch {}
      // DOM screen flash
      const color = FLASH_COLORS[type]
      if (color) {
        setScreenFlash({ color, key: ++flashKeyRef.current })
        setTimeout(() => setScreenFlash(null), 350)
      }
    }
    window.addEventListener('pu-activated', handler)
    return () => window.removeEventListener('pu-activated', handler)
  }, [])

  // Load power-up inventory — wallet address when connected, fixed trial key for web visitors
  const WEB_TRIAL_ADDR = 'web-trial'
  useEffect(() => {
    if (address) {
      loadForAddress(address)
    } else if (isWebBrowser()) {
      loadForAddress(WEB_TRIAL_ADDR)
    }
  }, [address, loadForAddress])

  // Sync score-boost flag directly onto the mutable GameSession
  useEffect(() => {
    const session = useGameStore.getState().gameSession
    if (session) session.scoreBoostActive = activePowerUps.scoreBoost
  }, [activePowerUps.scoreBoost])

  // Shield is now intercepted synchronously in gameStore.placePiece —
  // no useEffect needed here. Kept as dead code guard (no-op since
  // triggerShield returns false once the synchronous path consumed it).

  // Count each completed game and show nudge on game-over when threshold is met
  useEffect(() => {
    if (!isGameOver) return
    incrementGameCount()
    if (shouldShowNudge()) {
      // Small delay so game-over modal renders first
      const t = setTimeout(() => setShowSocialNudge(true), 1800)
      return () => clearTimeout(t)
    }
  }, [isGameOver])
  // ─────────────────────────────────────────────────────────────────────────

  const { leaderboard: lbData } = useLeaderboard()

  const BEST_SCORE_KEY = 'blokaz:best_score'
  const getStoredBest = () => {
    try { return Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0) || 0 } catch { return 0 }
  }
  const [localBest, setLocalBest] = React.useState(getStoredBest)

  // Update all-time best whenever a game ends with a new high score
  React.useEffect(() => {
    if (isGameOver && score > 0) {
      const current = getStoredBest()
      if (score > current) {
        try { localStorage.setItem(BEST_SCORE_KEY, String(score)) } catch {}
        setLocalBest(score)
      }
    }
  }, [isGameOver, score])

  // Revert to default tier (PAPER) when game ends so the game-over screen
  // and any subsequent lobby state always show the base cream/yellow look.
  React.useEffect(() => {
    if (isGameOver) {
      currentTierRef.current = getScoreTier(0)
      document.documentElement.setAttribute('data-tier', '0')
      // The sting needs the room, and a game-over screen with a driving loop
      // under it reads as though the run is still going.
      try {
        audioEngine.stopMusic()
        audioEngine.gameOver()
      } catch {}
    }
  }, [isGameOver])

  const bestScore = React.useMemo(() => {
    const entries = (lbData ?? []) as readonly { player: `0x${string}`; score: number; gameId: bigint }[]
    const lbBest = address
      ? Math.max(0, ...entries.filter(e => e.player.toLowerCase() === address.toLowerCase()).map(e => e.score))
      : 0
    const allTimeBest = Math.max(localBest, lbBest, score)
    return allTimeBest > 0 ? allTimeBest : undefined
  }, [lbData, address, localBest, score])

  const {
    gameId: onChainActiveGameId,
    isLoading: isLoadingActiveGame,
    refetch: refetchActiveGame,
  } = useActiveGame(address)
  const {
    startGame: contractStartGame,
    isPending,
    isConfirming,
    isSuccess,
    error: startGameError,
  } = useStartGame()

  const [currentSeed, setCurrentSeed] = useState<{
    seed: `0x${string}`
    hash: `0x${string}`
  } | null>(null)
  const [isSyncingContract, setIsSyncingContract] = useState(true)
  const [sessionConflict, setSessionConflict] = useState(false)
  const [comboTrigger, setComboTrigger] = useState(0)
  const [canvasDims, setCanvasDims] = useState<{
    gridSize: number
    trayY: number
    trayH: number
  } | null>(null)
  const isMobile = useIsMobile()

  // 0. Account Switch Protection
  const lastAddressRef = useRef<`0x${string}` | undefined>(address)
  useEffect(() => {
    if (address !== lastAddressRef.current) {
      forceReset()
      lastAddressRef.current = address
    }
  }, [address, forceReset])

  // 0.5 Hydration & Reconciliation
  useEffect(() => {
    if (!isConnected || !address || isLoadingActiveGame) {
      if (!isConnected) setIsSyncingContract(false)
      return
    }
    // If the RPC call came back undefined (network error / failed fetch), don't
    // treat it as "no active game" — that would wipe out the in-memory gameId and
    // make score submission impossible after a connectivity blip. Wait for a
    // confirmed response before touching any on-chain state.
    if (onChainActiveGameId === undefined) return
    const storedSession = readStoredGameSession(
      CLASSIC_SESSION_STORAGE_KEY,
      address,
      GAME_ADDRESS
    )
    const contractActiveId = (onChainActiveGameId as bigint) || 0n
    if (contractActiveId !== 0n) {
      if (!storedSession) {
        // On-chain game exists but NO local session — new device, fresh social
        // login (Web3Auth), or cleared browser data. Nothing locally to conflict
        // with, so just clear the stale on-chain ref and let the user start fresh.
        // If the contract rejects a new start because of the existing game ID,
        // that error will surface naturally via the tx rejection.
        setOnChainData(0n, null, 'none')
        setSessionConflict(false)
      } else if (
        storedSession.gameId === contractActiveId.toString() ||
        !storedSession.gameId
      ) {
        // Local session matches the on-chain game — resume it.
        setOnChainData(contractActiveId, storedSession.seed, 'none')
        setSessionConflict(false)
      } else {
        // True conflict: a local session exists but its game ID doesn't match
        // the active on-chain game. User must reset.
        setSessionConflict(true)
      }
    } else {
      if (storedSession?.seed && !storedSession.gameId) {
        // storedSession exists with a seed but no confirmed gameId — the tx
        // is still in-flight. Preserve the seed so continueGame/handleStartGame
        // can retry the contract call instead of starting a brand-new game
        // with a different seed (the double-start bug on MiniPay).
        setOnChainData(0n, storedSession.seed as `0x${string}`, 'pending')
      } else if (storedSession && storedSession.gameId) {
        // Had a gameId that is no longer active on-chain (tx failed / game
        // was already submitted). Clear stale local state.
        setOnChainData(0n, null, 'none')
      }
      setSessionConflict(false)
    }
    setIsSyncingContract(false)
  }, [
    isConnected,
    address,
    isLoadingActiveGame,
    onChainActiveGameId,
    setOnChainData,
  ])

  // 1. Handle Start
  const handleStartGame = () => {
    if (isPending || isConfirming) return // already has a tx in flight
    // Mark free web trial as consumed — skip for whitelisted dev address
    if (isWebBrowser() && !isWebWhitelisted(address)) markTrialUsed()
    setSessionConflict(false)
    // Reset tier to T1 (PAPER) on new game
    const freshTier = getScoreTier(0)
    currentTierRef.current = freshTier
    document.documentElement.setAttribute('data-tier', '0')
    // Reset lottery so each new game gets fresh threshold triggers
    resetLotterySession()
    try { audioEngine.startMusic(musicIntensityForTier(freshTier.id)) } catch {}
    prevScoreRef.current = 0
    powerUpHintRef.current.notifyPiecePlaced(performance.now())
    setLotteryPrize(null)
    const freshState = useGameStore.getState()
    const { onChainSeed: latestSeed, onChainGameId: latestGameId } = freshState
    if (
      isConnected &&
      address &&
      latestSeed &&
      latestGameId &&
      latestGameId !== 0n
    ) {
      const localSeed = BigInt(
        keccak256(
          encodePacked(['bytes32', 'address'], [latestSeed, address])
        ).slice(0, 18)
      )
      const stored = readStoredGameSession(CLASSIC_SESSION_STORAGE_KEY, address, GAME_ADDRESS)
      if (stored?.snapshot?.moveHistory?.length) {
        const boost = !!(stored.snapshot as any).scoreBoostActive
        const restoredSession = replayMoveHistory(
          localSeed,
          stored.snapshot.moveHistory,
          boost,
          stored.rulesVersion
        )
        // Restore the original moveHistory so marker records (revive, bomb, lottery)
        // are preserved. replayMoveHistory processes them without pushing them to
        // the session's own moveHistory, which would corrupt future snapshots.
        restoredSession.moveHistory = [...(stored.snapshot.moveHistory as MoveRecord[])]
        ;(window as any).currentPieces = restoredSession.currentPieces
        currentTierRef.current = getScoreTier(restoredSession.score)
        document.documentElement.setAttribute('data-tier', String(currentTierRef.current.id))
        useGameStore.setState({
          gameSession: restoredSession,
          score: restoredSession.score,
          comboStreak: restoredSession.comboStreak,
          currentPieces: [...restoredSession.currentPieces],
          isGameOver: restoredSession.isGameOver,
          lotteryMultiplierMovesLeft: restoredSession.lotteryMultiplierMovesLeft,
          reviveCount: (stored.snapshot.moveHistory as MoveRecord[]).filter(m => m.revive).length,
        })
      } else {
        resetActivePowerUps()
        startGame(localSeed, true)
      }
      return
    }
    const dummyAddr = address || ZERO_ADDRESS
    const { seed, hash } = generateGameSeed(dummyAddr)
    const localSeed = BigInt(hash.slice(0, 18))
    startGame(localSeed)
    if (isConnected && address) {
      setCurrentSeed({ seed, hash })
      setOnChainData(0n, seed, 'pending')
      writeStoredGameSession(CLASSIC_SESSION_STORAGE_KEY, {
        address,
        seed,
        hash,
        gameId: null,
        contractAddress: GAME_ADDRESS,
      })
      contractStartGame(hash)
    } else {
      setOnChainData(0n, seed, 'none')
    }
  }

  // 2. Background Sync
  useEffect(() => {
    if (isSuccess && currentSeed && address) {
      setOnChainData(0n, currentSeed.seed, 'syncing')
      const timer = setInterval(async () => {
        const res = await refetchActiveGame()
        const newGameId = res.data as bigint
        if (newGameId && newGameId !== 0n) {
          setOnChainData(newGameId, currentSeed.seed, 'registered')
          // Preserve the in-progress snapshot so the player can resume after
          // the WebView is recreated (MiniPay pause / background).
          const existingRaw = localStorage.getItem(CLASSIC_SESSION_STORAGE_KEY)
          const newEntry: any = {
            address,
            seed: currentSeed.seed,
            hash: currentSeed.hash,
            gameId: newGameId.toString(),
            contractAddress: GAME_ADDRESS,
          }
          if (existingRaw) {
            try {
              const existing = JSON.parse(existingRaw)
              if (existing.snapshot) newEntry.snapshot = existing.snapshot
            } catch {}
          }
          writeStoredGameSession(CLASSIC_SESSION_STORAGE_KEY, newEntry)
          clearInterval(timer)
        }
      }, 2000)
      return () => clearInterval(timer)
    }
  }, [address, currentSeed, isSuccess, refetchActiveGame, setOnChainData])

  // 3. Practice Mode Fallback
  // Skip in MiniPay: isConnected is always false on first render because
  // MiniPayAutoConnect hasn't resolved yet. Without this guard the game
  // silently starts in practice mode and contractStartGame is never called.
  // Skip if reconnecting (wagmi transiently clears isConnected on page reload)
  // or if the web trial is gated and the address isn't whitelisted.
  useEffect(() => {
    const gated = isWebTrialGated() && !isWebWhitelisted(address)
    if (!isConnected && !isReconnecting && !gameSession && !IS_MINIPAY && !gated) handleStartGame()
  }, [isConnected, isReconnecting, gameSession, address])

  // 4. Start tx rejection → abandon session and go back to lobby
  useEffect(() => {
    if (!startGameError) return
    const msg = (startGameError as any)?.message?.toLowerCase() ?? ''
    const isRejection =
      msg.includes('rejected') ||
      msg.includes('denied') ||
      msg.includes('cancelled') ||
      (startGameError as any)?.code === 4001
    if (isRejection) {
      forceReset()
      onBack?.()
    }
  }, [startGameError])

  // Persist the move history immediately after every revival so the revive
  // record is durable even if the app is killed before the next piece is placed.
  // reviveCount increments on both manual revivals and shield auto-revivals.
  useEffect(() => {
    if (reviveCount === 0) return
    const session = useGameStore.getState().gameSession
    if (!session?.moveHistory.length) return
    const raw = localStorage.getItem(CLASSIC_SESSION_STORAGE_KEY)
    if (!raw) return
    try {
      const entry = JSON.parse(raw)
      entry.snapshot = {
        moveHistory: session.moveHistory,
        scoreBoostActive: session.scoreBoostActive,
      }
      localStorage.setItem(CLASSIC_SESSION_STORAGE_KEY, JSON.stringify(entry))
    } catch {}
  }, [reviveCount])

  // Save snapshot when app is hidden (MiniPay pause / system multitask switch)
  useEffect(() => {
    const saveOnHide = () => {
      if (!document.hidden) return
      const session = useGameStore.getState().gameSession
      if (!session?.moveHistory.length) return
      const raw = localStorage.getItem(CLASSIC_SESSION_STORAGE_KEY)
      if (!raw) return
      try {
        const entry = JSON.parse(raw)
        entry.snapshot = { moveHistory: session.moveHistory, scoreBoostActive: session.scoreBoostActive }
        localStorage.setItem(CLASSIC_SESSION_STORAGE_KEY, JSON.stringify(entry))
      } catch {}
    }
    document.addEventListener('visibilitychange', saveOnHide)
    return () => document.removeEventListener('visibilitychange', saveOnHide)
  }, [])

  // Save snapshot on every score change — including the game-over move.
  // Without saving on game-over, a single move that jumps score AND ends the
  // game (e.g. 218 → 5k via a big combo clear) leaves localStorage at the
  // pre-combo score; the player loses the session on navigation.
  useEffect(() => {
    if (!score) return
    const session = useGameStore.getState().gameSession
    if (!session || !session.moveHistory.length) return
    const raw = localStorage.getItem(CLASSIC_SESSION_STORAGE_KEY)
    if (!raw) return
    try {
      const entry = JSON.parse(raw)
      entry.snapshot = { moveHistory: session.moveHistory, scoreBoostActive: session.scoreBoostActive }
      localStorage.setItem(CLASSIC_SESSION_STORAGE_KEY, JSON.stringify(entry))
    } catch {}
  }, [score])

  // Canvas init
  useEffect(() => {
    if (!canvasRef.current || !gameSession) return

    const canvas = canvasRef.current

    // Fallback used only when the container hasn't been measured yet.
    // On mobile the board fills full width; subtract nothing for margins.
    // Height fraction ≈ dvh minus header(64) + scorebar(~48) + bottomnav(64)
    // expressed as a ratio so it works across screen sizes.
    const vpFallback = Math.min(
      window.innerWidth,
      Math.round(window.innerHeight * 0.58)
    )

    const computeDims = (containerW: number, containerH: number) => {
      const w = containerW > 0 ? containerW : vpFallback

      // PieceRenderer draws each tray slot as (canvasWidth/3) × (canvasWidth/3).
      // So trayHeight must equal gridSize/3. With no trayGap:
      //   totalH = gridSize + gridSize/3 = gridSize * 4/3
      //   → gridSize = containerH * 3/4  (to fit exactly)
      let gridSize = w
      if (containerH > 0) {
        const maxByHeight = Math.floor(containerH * 3 / 4)
        if (maxByHeight < gridSize) gridSize = maxByHeight
      }

      const trayHeight = Math.round(gridSize / 3)
      return { gridSize, cellSize: gridSize / 9, trayGap: 0, trayHeight, trayY: gridSize }
    }

    const initialW = boardContainerRef.current?.clientWidth  || 0
    const initialH = boardContainerRef.current?.clientHeight || 0
    const init     = computeDims(initialW, initialH)
    const initTotalH = init.gridSize + init.trayHeight

    canvas.width  = init.gridSize
    canvas.height = initTotalH
    canvas.style.width  = '100%'
    canvas.style.height = `${initTotalH}px`
    canvas.style.background = 'transparent'

    setCanvasDims({
      gridSize: init.gridSize,
      trayY: init.trayY,
      trayH: init.trayHeight,
    })
    cellSizeRef.current = init.cellSize

    const gridRenderer = new GridRenderer(canvas, init.gridSize)
    const pieceRenderer = new PieceRenderer(canvas, init.trayY, init.cellSize)
    const animManager = animManagerRef.current

    // Apply initial tier
    const initialTier = getScoreTier(useGameStore.getState().score ?? 0)
    currentTierRef.current = initialTier
    gridRenderer.setTier(initialTier)
    pieceRenderer.setTier(initialTier)
    document.documentElement.setAttribute('data-tier', String(initialTier.id))

    // ResizeObserver keeps canvas sized to container
    let ro: ResizeObserver | null = null
    if (boardContainerRef.current) {
      ro = new ResizeObserver(([entry]) => {
        const w = entry.contentRect.width
        const h = entry.contentRect.height
        if (w <= 0) return
        const d      = computeDims(w, h)
        const totalH = d.gridSize + d.trayHeight
        canvas.width  = d.gridSize
        canvas.height = totalH
        canvas.style.width  = '100%'
        canvas.style.height = `${totalH}px`
        gridRenderer.resize(d.gridSize)
        pieceRenderer.resize(d.trayY, d.cellSize, d.gridSize)
        cellSizeRef.current = d.cellSize
        setCanvasDims({
          gridSize: d.gridSize,
          trayY: d.trayY,
          trayH: d.trayHeight,
        })
      })
      ro.observe(boardContainerRef.current)
    }

    const touchController = new TouchController(
      canvas,
      gridRenderer,
      pieceRenderer,
      (pieceIndex: number, row: number, col: number) => {
        // Capture shape before state mutation so we know which cells were placed
        const preShape = useGameStore.getState().gameSession?.currentPieces[pieceIndex]
        const result = useGameStore.getState().placePiece(pieceIndex, row, col)
        if (!result?.success) {
          hapticError()
          try { audioEngine.uiError() } catch {}
          return
        }
        hapticImpact()
        try { audioEngine.piecePlaced() } catch {}
        powerUpHintRef.current.notifyPiecePlaced(performance.now())
        // Brief drop-flash on placed cells
        if (preShape) {
          const placedCells = (preShape.cells as [number, number][])
            .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
            .filter((c) => c.row >= 0 && c.row < 9 && c.col >= 0 && c.col < 9)
          animManager.trigger('DROP_FLASH', { cells: placedCells })
        }
        const linesCleared = result.linesCleared
        if (
          linesCleared &&
          (linesCleared.rows.length > 0 || linesCleared.cols.length > 0)
        ) {
          hapticNotification()
          try {
            audioEngine.lineClear(linesCleared.rows.length + linesCleared.cols.length)
          } catch {}
          powerUpHintRef.current.notifyLineClear(performance.now())
          animManager.trigger('LINE_CLEAR', {
            rows: linesCleared.rows,
            cols: linesCleared.cols,
            accent: currentTierRef.current.accent,
          })

          // Per-row/col floating score pops — positioned at the cleared line
          if (result.scoreEvent && result.scoreEvent.linePoints > 0) {
            const gs = gridRenderer.currentGridSize
            const cs = gs / 9
            const totalLines = linesCleared.rows.length + linesCleared.cols.length
            const perLine = Math.round(result.scoreEvent.linePoints / totalLines)
            linesCleared.rows.forEach((r) => {
              animManager.trigger('SCORE', {
                x: gs * 0.5, y: (r + 0.5) * cs,
                score: perLine, small: true,
              })
            })
            linesCleared.cols.forEach((c) => {
              animManager.trigger('SCORE', {
                x: (c + 0.5) * cs, y: gs * 0.5,
                score: perLine, small: true,
              })
            })
            // Multi-clear sticker for 2+ simultaneous lines
            if (totalLines >= 2) {
              animManager.trigger('MULTI_CLEAR', {
                count: totalLines,
                linePoints: result.scoreEvent.linePoints,
              })
            }
          }

          if (result.scoreEvent && result.scoreEvent.newComboStreak > 0) {
            animManager.trigger('COMBO', {
              streak: result.scoreEvent.newComboStreak,
            })
            // combo() indexes a scale from streak 2 — a "1x combo" is just a clear.
            if (result.scoreEvent.newComboStreak >= 2) {
              try { audioEngine.combo(result.scoreEvent.newComboStreak) } catch {}
            }
            setComboTrigger((t) => t + 1)
          }
        }
        if (result.scoreEvent && result.scoreEvent.totalPoints > 0) {
          animManager.trigger('SCORE', {
            x: gridRenderer.currentGridSize * 0.5,
            y: gridRenderer.currentGridSize * 0.45,
            score: result.scoreEvent.totalPoints,
          })
        }
        // Persist move history so browser refresh can replay and restore progress
        const updatedSession = useGameStore.getState().gameSession
        if (updatedSession) {
          const raw = localStorage.getItem(CLASSIC_SESSION_STORAGE_KEY)
          if (raw) {
            try {
              const entry = JSON.parse(raw)
              entry.snapshot = {
                moveHistory: updatedSession.moveHistory,
                scoreBoostActive: updatedSession.scoreBoostActive,
              }
              localStorage.setItem(CLASSIC_SESSION_STORAGE_KEY, JSON.stringify(entry))
            } catch {}
          }
        }
      },
      (shape: ShapeDefinition, row: number, col: number) => {
        if (!shape) return false
        const session = useGameStore.getState().gameSession
        return session ? Grid.canPlace(session.grid, shape, row, col) : false
      },
      (index) => {
        trayHoverIndexRef.current = index
      }
    )

    let rafHandle: number
    lastTimeRef.current = 0

    const render = (timestamp: number) => {
      const delta = lastTimeRef.current ? timestamp - lastTimeRef.current : 16
      lastTimeRef.current = timestamp
      animManager.update(delta)

      // Update time for animated tier effects (seconds, not ms)
      const tSec = timestamp / 1000
      gridRenderer.setTime(tSec)
      pieceRenderer.setTime(tSec)

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const currentSession = useGameStore.getState().gameSession
      if (!currentSession) return

      // Safety net: if the engine marks the game over but the store hasn't
      // been updated yet (React-18 batching / iOS event-loop edge cases),
      // force-sync so the modal is never permanently suppressed.
      if (currentSession.isGameOver && !useGameStore.getState().isGameOver) {
        useGameStore.setState({ isGameOver: true })
      }

      // Tier sync — use session.score, NOT store.score.
      // store.score lags on game reset (still holds the previous game's value
      // when a new session starts at 0), which caused the old tier to
      // immediately re-apply at the start of every new game.
      if (!currentSession.isGameOver) {
        const newTier = getScoreTier(currentSession.score)
        if (newTier.id !== currentTierRef.current.id) {
          const prevTier = currentTierRef.current
          currentTierRef.current = newTier
          document.documentElement.setAttribute('data-tier', String(newTier.id))
          // Only trigger TIER_UP banner when score genuinely increased
          if (newTier.id > prevTier.id) {
            animManager.trigger('TIER_UP', {
              tierName: newTier.name,
              accent: newTier.accent,
            })
            try { audioEngine.tierUp() } catch {}
          }
          // Eight score tiers, four musical intensities.
          try { audioEngine.setMusicIntensity(musicIntensityForTier(newTier.id)) } catch {}
        }

        // ── Lottery threshold check (whitelisted addresses only) ────────
        if (isWhitelisted) {
          const currentScore = currentSession.score
          const prevScore    = prevScoreRef.current
          if (currentScore !== prevScore) {
            const threshold = checkLotteryTrigger(currentScore, prevScore)
            if (threshold !== null) {
              markLotteryThreshold(threshold)
              const prize = getRandomPrize()
              setLotteryThreshold(threshold)
              setLotteryPrize(prize)
            }
            prevScoreRef.current = currentScore
          }
        }
      }
      // Always push the current tier into renderers every frame so a reset
      // (currentTierRef snapped to PAPER in handleStartGame / isGameOver effect)
      // is reflected immediately without waiting for a score-change event.
      gridRenderer.setTier(currentTierRef.current)
      pieceRenderer.setTier(currentTierRef.current)

      const ghost = (window as any).activeGhost as {
        row: number
        col: number
        valid: boolean
      } | null
      const dragState = touchController.getDragState()
      const activeIdx = dragState.isDragging && dragState.dragIndex !== null ? dragState.dragIndex : null
      const selectedIdx = dragState.selectedIndex ?? null
      let ghostCells: { row: number; col: number; valid: boolean }[] | undefined

      if (ghost && (activeIdx !== null || selectedIdx !== null)) {
        const idx = activeIdx ?? selectedIdx!
        const shape = currentSession.currentPieces[idx]
        if (shape) {
          // At LIQUID/GLITCH tiers the piece can change shape or slide a row as
          // it lands, so preview the real landing cells rather than the raw
          // outline. Returns null for an illegal drop — fall back to the
          // outline so the player still sees the invalid-placement feedback.
          const landing = ghost.valid
            ? currentSession.previewPlacement(idx, ghost.row, ghost.col)
            : null

          ghostCells = (
            landing ??
            (shape.cells as [number, number][]).map(
              ([dr, dc]) => [ghost.row + dr, ghost.col + dc] as [number, number]
            )
          )
            .map(([row, col]) => ({ row, col, valid: ghost.valid }))
            .filter(
              (cell) =>
                cell.row >= 0 && cell.row < 9 && cell.col >= 0 && cell.col < 9
            )
        }
      }

      gridRenderer.draw(currentSession.grid, ghostCells, false)

      // Power-up ghost hint — overlaid after board, before score popups
      const isInteracting = dragState.isDragging || !!ghost
      powerUpHintRef.current.update(
        timestamp, delta, currentSession.grid,
        !isInteracting && !currentSession.isGameOver,
      )
      powerUpHintRef.current.draw(ctx, cellSizeRef.current)

      pieceRenderer.drawTray(
        currentSession.currentPieces,
        activeIdx ?? undefined,
        false,
        activeIdx !== null ? undefined : (trayHoverIndexRef.current ?? undefined),
        selectedIdx ?? undefined
      )

      if (dragState.isDragging && dragState.dragIndex !== null) {
        const shape = currentSession.currentPieces[dragState.dragIndex]
        if (shape) {
          const cs = cellSizeRef.current
          // Ghost is positioned above the finger (touch) or at the cursor (mouse).
          // Draw the floating piece exactly at the ghost bounding-box center so
          // the piece and the board shadow always align.
          // Without a ghost, centre the piece at the raw position; on touch lift
          // it above the finger so the user can see what's being dragged.
          const drawX = ghost
            ? ghost.col * cs + (shape.width  * cs) / 2
            : dragState.dragPos.x
          const drawY = ghost
            ? ghost.row * cs + (shape.height * cs) / 2
            : dragState.isTouch
              ? dragState.dragPos.y - cs * (shape.height * 0.5 + 1)
              : dragState.dragPos.y
          pieceRenderer.drawDragging(shape, drawX, drawY, cs, false)
        }
      }

      animManager.draw(ctx, cellSizeRef.current, false)
      rafHandle = requestAnimationFrame(render)
    }

    rafHandle = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafHandle)
      touchController.destroy()
      ro?.disconnect()
      trayHoverIndexRef.current = null
    }
  }, [!!gameSession])

  const handlePlayAgain = () => handleStartGame()

  // Detect a saved game the user can resume — either moves in snapshot OR a
  // stored seed (game was registered on-chain but player closed before playing).
  const hasLocalStoredGame = !gameSession && !!address && (() => {
    const stored = readStoredGameSession(CLASSIC_SESSION_STORAGE_KEY, address, GAME_ADDRESS)
    return !!(stored?.snapshot?.moveHistory?.length || stored?.seed)
  })()

  // localStorage is not the source of truth — it's wiped by SKIP & PLAY AGAIN,
  // browser data clears, and MiniPay WebView eviction, while the server session
  // survives all of those. Without this probe a finished-but-unsubmitted run
  // (e.g. a score whose submission failed) becomes unreachable: the CONTINUE
  // button never shows and the player is only offered a brand-new game.
  const [serverGameAvailable, setServerGameAvailable] = useState(false)
  useEffect(() => {
    if (!address || gameSession || hasLocalStoredGame) {
      setServerGameAvailable(false)
      return
    }
    let cancelled = false
    fetchServerSession(address).then((session) => {
      if (cancelled) return
      // A run this device has already submitted is finished, whatever the
      // server still says. Offering it back showed the player a score they had
      // banked and let them register and submit it a second time.
      const alreadySubmitted =
        !!session && isSubmittedSeed(address, session.seed, session.onChainSeed)
      setServerGameAvailable(!!session?.moveHistory?.length && !alreadySubmitted)
    })
    return () => {
      cancelled = true
    }
  }, [address, !!gameSession, hasLocalStoredGame])

  const hasStoredGame = hasLocalStoredGame || (!gameSession && !!address && serverGameAvailable)

  const continueGame = async () => {
    if (!address || isContinuing) return
    setIsContinuing(true)
    try {

    // Prefer the server session — it's always at least as fresh as localStorage
    // and survives browser cache clears, crashes, and privacy-mode wipes.
    const serverSession = await fetchServerSession(address)

    // Fall back to localStorage if the server is unreachable or has no session
    const stored = readStoredGameSession(CLASSIC_SESSION_STORAGE_KEY, address, GAME_ADDRESS)

    // Pick the source with the most moves (server wins ties)
    const serverMoves: MoveRecord[] = serverSession?.moveHistory ?? []
    const localMoves: MoveRecord[] = (stored?.snapshot?.moveHistory as MoveRecord[]) ?? []
    const moves = serverMoves.length >= localMoves.length ? serverMoves : localMoves

    if (!moves.length) {
      handleStartGame()
      return
    }

    // Seed: server stores it directly; localStorage stores it inside hash
    const seedStr = serverMoves.length >= localMoves.length
      ? serverSession!.seed
      : stored?.hash ?? serverSession?.seed
    if (!seedStr) return

    // The server stores the seed as a plain decimal string (bigint.toString()),
    // e.g. "1587430469997234145" (can be 19–20 digits).
    // localStorage stores the keccak256 hash as "0x…" (66 chars); the local
    // seed is always the first 8 bytes → "0x" + 16 hex chars = exactly 18 chars.
    // Applying slice(0,18) to a decimal string silently truncates it when it
    // has more than 18 digits, producing a completely wrong seed and a broken
    // replay — which is why the score would collapse to 99 after a lobby visit.
    const localSeed = seedStr.startsWith('0x')
      ? BigInt(seedStr.slice(0, 18))   // hex hash: take first 8 bytes
      : BigInt(seedStr)                // decimal: use the exact value
    const boost = serverMoves.length >= localMoves.length
      ? !!serverSession!.scoreBoostActive
      : !!(stored?.snapshot as any)?.scoreBoostActive

    const restoredSession = replayMoveHistory(localSeed, moves, boost, stored?.rulesVersion)
    // Replace the replayed moveHistory with the original snapshot moveHistory.
    // replayMoveHistory processes marker records (revive, bomb, lottery) without
    // pushing them to the session's moveHistory, so the replayed history is
    // missing those markers. If the restored session later saves its moveHistory
    // to localStorage, those markers would be lost and the next restore would
    // replay incorrectly (post-revival moves silently fail at game-over state).
    restoredSession.moveHistory = [...moves]
    ;(window as any).currentPieces = restoredSession.currentPieces

    // Snap tier to the restored score so the first score-change after restore
    // doesn't spuriously fire a TIER_UP animation from PAPER.
    currentTierRef.current = getScoreTier(restoredSession.score)
    document.documentElement.setAttribute('data-tier', String(currentTierRef.current.id))

    const onChainSeedVal = serverSession?.onChainSeed ?? stored?.seed ?? null
    const onChainGameIdRaw = serverSession?.onChainGameId ?? stored?.gameId ?? null

    useGameStore.setState({
      gameSession: restoredSession,
      score: restoredSession.score,
      comboStreak: restoredSession.comboStreak,
      currentPieces: [...restoredSession.currentPieces],
      isGameOver: restoredSession.isGameOver,
      lotteryMultiplierMovesLeft: restoredSession.lotteryMultiplierMovesLeft,
      reviveCount: moves.filter(m => m.revive).length,
      // Restore on-chain refs so the game-over modal can submit the score
      // when the player continues into a finished-game state.
      onChainSeed: onChainSeedVal,
      onChainGameId: (onChainGameIdRaw && onChainGameIdRaw !== '0') ? BigInt(onChainGameIdRaw) : null,
      onChainStatus: (onChainGameIdRaw && onChainGameIdRaw !== '0') ? 'registered' as const : 'none' as const,
    })

    // If the game was never registered on-chain (user ignored/dismissed the
    // wallet prompt at game start), re-trigger the contract call now so the
    // score can be submitted when the game ends. The background sync effect
    // already polls for the new game ID and updates localStorage once confirmed.
    // Note: treat "0" (string) the same as null/missing — the DB stores "0"
    // when the on-chain game ID was never confirmed.
    const gameIdMissing = !onChainGameIdRaw || onChainGameIdRaw === '0'
    if (gameIdMissing && onChainSeedVal && isConnected && address) {
      // stored.hash is already the seedHash; a raw seed (stored.seed or the
      // server's onChainSeed) must be hashed with the player address exactly the
      // way startGame → submitScore expects. Committing the raw seed verbatim as
      // the seedHash makes keccak256(seed ++ player) never match at submit time,
      // permanently stranding the score.
      const hash = (stored?.hash as `0x${string}` | undefined)
        ?? keccak256(
          encodePacked(['bytes32', 'address'], [onChainSeedVal as `0x${string}`, address])
        )
      setCurrentSeed({ seed: onChainSeedVal as `0x${string}`, hash })
      contractStartGame(hash)
    }

    } finally {
      setIsContinuing(false)
    }
  }

  const startNewGame = () => {
    clearStoredGameSession(CLASSIC_SESSION_STORAGE_KEY)
    resetActivePowerUps()
    forceReset()
    handleStartGame()
  }

  // Bomb: fire bombZone on the session, update score + combo, consume the charge
  const handleBombTap = (row: number, col: number) => {
    const session = useGameStore.getState().gameSession
    if (!session) return
    const bombEvent = session.bombZone(row, col)
    session.moveHistory.push({
      pieceIndex: -1,
      shapeId: '',
      row: 0,
      col: 0,
      bomb: { row, col },
      scoreEvent: bombEvent,
    })
    consumeBomb()
    useGameStore.setState({ score: session.score, comboStreak: bombEvent.newComboStreak })
    prevScoreRef.current = session.score
    if (bombEvent.totalPoints > 0) {
      animManagerRef.current.trigger('SCORE', {
        x: (canvasDims?.gridSize ?? 200) * 0.5,
        y: (canvasDims?.gridSize ?? 200) * 0.45,
        score: bombEvent.totalPoints,
        label: bombEvent.newComboStreak >= 2
          ? `BOMB ×${bombEvent.comboMultiplier}!`
          : undefined,
      })
      // Explosion burst from the tapped cell
      animManagerRef.current.trigger('POWER_UP', { subType: 'bomb', row, col })
      setScreenFlash({ color: 'rgba(255,87,34,0.30)', key: ++flashKeyRef.current })
      setTimeout(() => setScreenFlash(null), 280)
      hapticNotification()
      try { audioEngine.bombBlast() } catch {}
    } else {
      hapticError()
      try { audioEngine.uiError() } catch {}
    }
  }

  // Apply a lottery prize once the player dismisses the modal.
  // Each case records a marker in moveHistory where needed so the effect
  // is faithfully reproduced when the session is replayed from localStorage.
  const handleLotteryPrize = (prize: Prize | null) => {
    setLotteryPrize(null)
    if (!prize) return

    const session = useGameStore.getState().gameSession

    const minimalEvent = {
      basePoints: 0, linePoints: 0, comboBonus: 0, totalPoints: 0,
      linesCleared: 0, newComboStreak: session?.comboStreak ?? 0,
      comboMultiplier: 1.0 as const, isMilestone: false, multiLineFactor: 1.0 as const,
    }

    // Helper: persist the updated snapshot immediately so the prize survives
    // an app kill before the next piece is placed.
    const persistNow = (s: typeof session) => {
      if (!s) return
      const raw = localStorage.getItem(CLASSIC_SESSION_STORAGE_KEY)
      if (!raw) return
      try {
        const entry = JSON.parse(raw)
        entry.snapshot = { moveHistory: s.moveHistory, scoreBoostActive: s.scoreBoostActive }
        localStorage.setItem(CLASSIC_SESSION_STORAGE_KEY, JSON.stringify(entry))
      } catch {}
    }

    switch (prize.id) {
      case 'multi': {
        // Activate ×2 multiplier on the engine for the next 3 piece placements.
        // Record a marker in moveHistory so replay restores the multiplier at
        // the exact same position in the move sequence.
        if (session) {
          session.moveHistory.push({ pieceIndex: -1, shapeId: '', row: 0, col: 0, lotteryMultiplierStart: true, scoreEvent: minimalEvent })
          session.lotteryMultiplierMovesLeft = 3
          // Mirror into the store so the in-game badge renders immediately
          useGameStore.setState({ lotteryMultiplierMovesLeft: 3 })
          persistNow(session)
        }
        showToast({
          variant: 'toast', tone: 'reward', icon: '×2',
          title: '×2 MULTIPLIER ON!',
          body: 'Next 3 placements score double.',
          autoDismissMs: 5000,
        })
        break
      }
      case 'revival': {
        // Credit one free revival to the player's inventory.
        if (address) addInventory('revivalBundle', 1)
        showToast({
          variant: 'toast', tone: 'success', icon: '↻',
          title: 'FREE SPIN ADDED',
          body: '+1 extra life stored in your inventory.',
          autoDismissMs: 4000,
        })
        break
      }
      case 'bonus': {
        // Drop +500 pts onto the score right now. Record in moveHistory so a
        // session restore adds the same bonus at the same point in the replay.
        if (session) {
          const pts = 500
          session.score += pts
          useGameStore.setState({ score: session.score })
          prevScoreRef.current = session.score
          session.moveHistory.push({
            pieceIndex: -1, shapeId: '', row: 0, col: 0,
            lotteryBonus: pts,
            scoreEvent: { ...minimalEvent, basePoints: pts, totalPoints: pts },
          })
          persistNow(session)
          // Show the floating score animation over the board
          animManagerRef.current?.trigger('SCORE', {
            x: (canvasDims?.gridSize ?? 200) * 0.5,
            y: (canvasDims?.gridSize ?? 200) * 0.45,
            score: pts,
          })
          hapticNotification()
        }
        showToast({
          variant: 'toast', tone: 'reward', icon: '+',
          title: '+500 PTS ADDED',
          body: 'Score boosted right now.',
          autoDismissMs: 3500,
        })
        break
      }
      case 'nothing':
      default:
        break
    }
  }

  // Rotate: consume 1 charge, rotate the piece, close picker when charges run out
  const handleRotatePiece = (pieceIndex: number) => {
    const session = useGameStore.getState().gameSession
    if (!session) return
    const { consumeCharge, getCharges, exitRotateMode } = usePowerUpStore.getState()
    if (!consumeCharge('rotatePass')) {
      exitRotateMode()
      return
    }
    const ok = session.rotatePiece(pieceIndex)
    if (ok) {
      useGameStore.setState({ currentPieces: [...session.currentPieces] })
      ;(window as any).currentPieces = session.currentPieces
      hapticImpact()
    }
    if (getCharges('rotatePass') <= 0) exitRotateMode()
  }

  const isMiniPayConnecting = IS_MINIPAY && !isConnected

  const commonCanvasProps = {
    canvasRef,
    boardContainerRef,
    canvasDims,
    gameSession,
    isConnected,
    onChainStatus,
    isPending,
    isConfirming,
    comboStreak,
    comboTrigger,
    isGameOver,
    score,
    address,
    handleStartGame,
    isSyncingContract,
    isMiniPayConnecting,
    sessionConflict,
    forceReset,
    setSessionConflict,
    onOpenLeaderboard,
    startGameError,
    hasStoredGame,
    continueGame,
    isContinuing,
    startNewGame,
    bombModeActive,
    onBombTap: handleBombTap,
    onGoBack: () => forceReset(),
  }

  const canvasArea = (
    // Wrapper must forward flex-1 / min-h-0 so CanvasArea's ResizeObserver
    // measures a non-zero height. position:relative is needed for the badge.
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        width: '100%',
      }}
    >
      <CanvasArea {...commonCanvasProps} />
      {lotteryMultiplierMovesLeft > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#FFD51F',
            color: '#0C0C10',
            border: '3px solid #0C0C10',
            boxShadow: '4px 4px 0 #0C0C10',
            padding: '5px 14px',
            fontFamily: '"Archivo Black", sans-serif',
            fontSize: 13,
            letterSpacing: '0.06em',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <span>×2</span>
          <span style={{
            background: '#0C0C10', color: '#FFD51F',
            padding: '1px 6px', fontSize: 10, letterSpacing: '0.16em',
          }}>
            ACTIVE
          </span>
          <span>{lotteryMultiplierMovesLeft} LEFT</span>
        </div>
      )}
    </div>
  )

  // Show lobby gate immediately for web visitors who have used their trial
  // (and aren't currently in a game-over state, which has its own gate via CanvasArea)
  if (isWebBrowser() && isWebTrialGated() && !isWebWhitelisted(address) && !gameSession) {
    return <MiniPayGateModal />
  }

  if (isMobile) {
    return (
      <>
        <MobileLayout
          score={score}
          comboStreak={comboStreak}
          bestScore={bestScore}
          gameSession={gameSession}
          isGameOver={isGameOver}
          onOpenLeaderboard={onOpenLeaderboard}
          onBack={onBack}
          canvasArea={canvasArea}
          onOpenShop={isWhitelisted ? () => setShowShop(true) : undefined}
          onRotatePiece={handleRotatePiece}
          activePieceIndex={trayHoverIndexRef.current}
        />
        <PowerUpHintOverlay
          hintTrigger={hintTrigger}
          onBoardEffect={(type) => {
            const grid = useGameStore.getState().gameSession?.grid
            powerUpHintRef.current.commitCanvasHint(type, grid)
          }}
        />
        {/* Screen flash — DOM-layer cinematic hit for power-up activations */}
        {screenFlash && (
          <div
            key={screenFlash.key}
            aria-hidden
            style={{
              position: 'fixed', inset: 0, zIndex: 8999,
              background: screenFlash.color,
              pointerEvents: 'none',
              animation: 'pu-screen-flash 0.32s ease-out forwards',
            }}
          />
        )}
        {showNoGasModal && <NoGasModal address={address} onDismiss={() => setNoGasDismissed(true)} />}
        {showSocialNudge && <SocialNudgeModal onDismiss={() => setShowSocialNudge(false)} />}
        {isWhitelisted && lotteryPrize && !isGameOver && (
          <LotteryModal
            prize={lotteryPrize}
            threshold={lotteryThreshold}
            onContinue={() => handleLotteryPrize(lotteryPrize)}
          />
        )}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} position="bottom-center" />
        {isWhitelisted && <ShopModal isOpen={showShop} onClose={() => setShowShop(false)} />}
      </>
    )
  }

  return (
    <>
      <DesktopLayout
        score={score}
        comboStreak={comboStreak}
        gameSession={gameSession}
        bestScore={bestScore}
        onOpenLeaderboard={onOpenLeaderboard}
        canvasArea={canvasArea}
      />
      {showNoGasModal && <NoGasModal address={address} onDismiss={() => setNoGasDismissed(true)} />}
      {showSocialNudge && <SocialNudgeModal onDismiss={() => setShowSocialNudge(false)} />}
      {isWhitelisted && lotteryPrize && !isGameOver && (
        <LotteryModal
          prize={lotteryPrize}
          threshold={lotteryThreshold}
          onContinue={() => handleLotteryPrize(lotteryPrize)}
        />
      )}
      {isWhitelisted && <ShopModal isOpen={showShop} onClose={() => setShowShop(false)} />}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} position="bottom-center" />
    </>
  )
}

// ─── Sub-components moved outside to avoid unmounting canvas ────────────────

interface SyncChipProps {
  gameSession: any
  isConnected: boolean
  onChainStatus: string
  isPending: boolean
  isConfirming: boolean
}

const SyncStatusChip: React.FC<SyncChipProps> = ({
  gameSession,
  isConnected,
  onChainStatus,
  isPending,
  isConfirming,
}) => {
  if (!gameSession || !isConnected) return null
  if (onChainStatus === 'pending' || isPending || isConfirming) {
    return (
      <div
        className="flex items-center gap-2 border-2 border-ink px-2 py-1 font-display text-[10px] tracking-[0.12em]"
        style={{
          background: 'var(--accent-yellow)',
          color: 'var(--ink-fixed)',
          boxShadow: '2px 2px 0 var(--shadow)',
        }}
      >
        <div className="h-2 w-2 animate-pulse bg-ink" />
        SYNCING
      </div>
    )
  }
  if (onChainStatus === 'syncing') {
    return (
      <div
        className="flex items-center gap-2 border-2 border-ink px-2 py-1 font-display text-[10px] tracking-[0.12em]"
        style={{
          background: 'var(--accent-cyan)',
          color: 'var(--ink-fixed)',
          boxShadow: '2px 2px 0 var(--shadow)',
        }}
      >
        <div className="brutal-loader" />
        FINALIZING
      </div>
    )
  }
  if (onChainStatus === 'registered') {
    return (
      <div
        className="flex items-center gap-2 border-2 border-ink px-2 py-1 font-display text-[10px] tracking-[0.12em]"
        style={{
          background: 'var(--accent-lime)',
          color: 'var(--ink-fixed)',
          boxShadow: '2px 2px 0 var(--shadow)',
        }}
      >
        <div className="h-2 w-2" style={{ background: 'var(--ink)' }} />
        VERIFIED
      </div>
    )
  }
  return null
}

interface CanvasAreaProps {
  canvasRef: React.RefObject<HTMLCanvasElement>
  boardContainerRef: React.RefObject<HTMLDivElement>
  canvasDims: { gridSize: number; trayY: number; trayH: number } | null
  gameSession: any
  isConnected: boolean
  onChainStatus: string
  isPending: boolean
  isConfirming: boolean
  comboStreak: number
  comboTrigger: number
  isGameOver: boolean
  score: number
  handleStartGame: () => void
  isSyncingContract: boolean
  isMiniPayConnecting: boolean
  sessionConflict: boolean
  forceReset: () => void
  setSessionConflict: (v: boolean) => void
  onOpenLeaderboard?: () => void
  startGameError?: Error | null
  hasStoredGame: boolean
  continueGame: () => void
  isContinuing: boolean
  startNewGame: () => void
  bombModeActive?: boolean
  onBombTap?: (row: number, col: number) => void
  onGoBack?: () => void
}

const ClassicStartCard: React.FC<{
  isConnected: boolean
  handleStartGame: () => void
  isPending: boolean
  isConfirming: boolean
  isSyncingContract: boolean
  isMiniPayConnecting: boolean
  sessionConflict: boolean
  forceReset: () => void
  setSessionConflict: (v: boolean) => void
  startGameError?: Error | null
  hasStoredGame: boolean
  continueGame: () => void
  isContinuing: boolean
  startNewGame: () => void
}> = ({
  isConnected,
  handleStartGame,
  isPending,
  isConfirming,
  isSyncingContract,
  isMiniPayConnecting,
  sessionConflict,
  forceReset,
  setSessionConflict,
  startGameError,
  hasStoredGame,
  continueGame,
  isContinuing,
  startNewGame,
}) => {
  const [showHowToPlay, setShowHowToPlay] = useState(!hasSeenOnboarding())

  return (
  <>
  {showHowToPlay && (
    <HowToPlayModal onDone={() => setShowHowToPlay(false)} />
  )}
  <div
    className="relative z-10 flex w-full flex-col gap-4 rounded-[6px] border-4 border-ink bg-paper px-4 py-5 sm:gap-5 sm:px-7 sm:py-8"
    style={{ boxShadow: '6px 6px 0 var(--accent-yellow)' }}
  >
    <div
      className="w-fit border-4 border-ink bg-accent-yellow px-6 py-2 font-display text-sm tracking-[0.15em]"
      style={{ boxShadow: '4px 4px 0 var(--shadow)', color: 'var(--ink-fixed)' }}
    >
      CLASSIC MODE
    </div>

    {/* Hero Image */}
    <div className="relative overflow-hidden border-4 border-ink bg-paper-2 shadow-[6px_6px_0_var(--shadow)]">
      <img
        src="/hero.webp"
        alt="Blokaz Game Preview"
        className="block h-auto w-full"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/20 to-transparent" />
    </div>

    <div
      className="text-center font-display uppercase"
      style={{
        fontSize: 'clamp(1.4rem, 7.5vw, 2rem)',
        letterSpacing: '-0.03em',
        lineHeight: 1.1,
      }}
    >
      READY FOR A{' '}
      <span
        className="bg-accent-pink px-2 text-white"
        style={{
          display: 'inline-block',
          transform: 'rotate(-2deg)',
          border: '3px solid var(--ink)',
          boxShadow: '3px 3px 0 var(--shadow)',
        }}
      >
        CLASSIC
      </span>{' '}
      RUN?
    </div>
    {/* CONTINUE GAME — shown when a saved snapshot exists */}
    {hasStoredGame && (
      <button
        onClick={continueGame}
        disabled={isPending || isConfirming || isSyncingContract || isMiniPayConnecting || isContinuing}
        className="brutal-btn flex w-full items-center justify-center gap-3 border-4 border-ink bg-accent-lime py-5 font-display text-sm uppercase tracking-[0.15em] shadow-[6px_6px_0_var(--shadow)] disabled:opacity-70"
        style={{ color: 'var(--ink-fixed)' }}
      >
        {isContinuing ? (
          <><div className="brutal-loader" /> LOADING...</>
        ) : (
          <>▶ CONTINUE GAME</>
        )}
      </button>
    )}

    <button
      onClick={hasStoredGame ? startNewGame : handleStartGame}
      disabled={
        isPending ||
        isConfirming ||
        isSyncingContract ||
        isMiniPayConnecting ||
        sessionConflict
      }
      className={`brutal-btn flex w-full items-center justify-center gap-3 border-4 border-ink py-5 font-display text-sm uppercase tracking-[0.15em] shadow-[6px_6px_0_var(--shadow)] disabled:opacity-70 ${
        hasStoredGame ? 'bg-paper-2' : 'bg-accent-lime'
      }`}
      style={{ color: 'var(--ink-fixed)' }}
    >
      {isMiniPayConnecting ? (
        <>
          <div className="brutal-loader" />
          CONNECTING...
        </>
      ) : isSyncingContract ? (
        <>
          <div className="brutal-loader" />
          SYNCING...
        </>
      ) : sessionConflict ? (
        'SESSION CONFLICT'
      ) : hasStoredGame ? (
        'START NEW GAME'
      ) : (
        'START CLASSIC GAME'
      )}
    </button>

    {sessionConflict && (
      <div className="fixed inset-0 z-[500] flex items-center justify-center px-5">
        {/* Backdrop */}
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }} />
        {/* Modal */}
        <div
          className="relative w-full max-w-sm border-4 border-ink"
          style={{ background: 'var(--paper)', boxShadow: '8px 8px 0 var(--danger)' }}
        >
          {/* Header strip */}
          <div
            className="flex items-center gap-3 border-b-4 border-ink px-5 py-4"
            style={{ background: 'var(--danger)' }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center border-[3px] border-white">
              <BrutalIcon name="alert" size={18} strokeWidth={3} className="text-white" />
            </div>
            <div>
              <div className="font-display text-[13px] uppercase tracking-[0.14em] text-white">SESSION CONFLICT</div>
              <div className="font-body text-[10px] text-white opacity-75">Action required</div>
            </div>
          </div>
          {/* Body */}
          <div className="px-5 py-5">
            <p className="mb-5 font-body text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Your app has a saved game that doesn't match your active session. You need to reset before starting a new game.
            </p>
            <button
              onClick={() => { forceReset(); setSessionConflict(false) }}
              className="brutal-btn flex w-full items-center justify-center gap-2 border-[3px] border-ink py-3.5 font-display text-[12px] uppercase tracking-widest text-white"
              style={{ background: 'var(--danger)', boxShadow: '4px 4px 0 rgba(0,0,0,0.3)' }}
            >
              <BrutalIcon name="alert" size={14} strokeWidth={2.5} />
              RESET &amp; START FRESH
            </button>
          </div>
        </div>
      </div>
    )}
    <div
      className="flex items-center justify-center gap-2 text-center font-display text-[10px] uppercase tracking-widest"
      style={{ color: 'var(--ink-soft)' }}
    >
      {isConnected ? (
        <>
          <BrutalIcon name="zap" size={10} strokeWidth={2} /> Score flows into
          the leaderboard automatically
        </>
      ) : isMiniPayConnecting ? (
        <>
          <BrutalIcon name="zap" size={10} strokeWidth={2} /> Connecting MiniPay
          wallet...
        </>
      ) : (
        <>
          <BrutalIcon name="alert" size={10} strokeWidth={2} /> PRACTICE MODE —
          connect wallet for rewards
        </>
      )}
    </div>

    {startGameError && (
      <div className="border-4 border-danger bg-paper-2 p-4" style={{ boxShadow: '4px 4px 0 var(--shadow)' }}>
        <div className="mb-1.5 flex items-center gap-2 font-display text-[11px] uppercase tracking-[0.12em] text-danger">
          <BrutalIcon name="alert" size={12} strokeWidth={2.5} />
          COULDN'T START YOUR GAME
        </div>
        <p className="mb-3 font-body text-[11px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          The approval was cancelled or failed. Tap below to try again — your game won't start until it goes through.
        </p>
        <button
          onClick={handleStartGame}
          disabled={isPending || isConfirming}
          className="brutal-btn flex w-full items-center justify-center gap-2 border-[3px] border-ink py-2.5 font-display text-[11px] uppercase tracking-widest disabled:opacity-50"
          style={{ background: 'var(--accent-yellow)', color: 'var(--ink-fixed)', boxShadow: '3px 3px 0 var(--shadow)' }}
        >
          {isPending || isConfirming ? <div className="brutal-loader" /> : <BrutalIcon name="play" size={13} strokeWidth={2.5} />}
          TRY AGAIN
        </button>
      </div>
    )}

    {/* How to play link — re-opens tutorial after first time */}
    <button
      onClick={() => setShowHowToPlay(true)}
      className="flex items-center justify-center gap-1.5 font-display text-[10px] uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
      style={{ color: 'var(--ink)' }}
    >
      <BrutalIcon name="alert" size={10} strokeWidth={2} />
      HOW TO PLAY
    </button>
  </div>
  </>
  )
}

const CanvasArea: React.FC<CanvasAreaProps> = ({
  canvasRef,
  boardContainerRef,
  canvasDims,
  gameSession,
  isConnected,
  onChainStatus,
  isPending,
  isConfirming,
  comboStreak,
  comboTrigger,
  isGameOver,
  score,
  address,
  handleStartGame,
  isSyncingContract,
  isMiniPayConnecting,
  sessionConflict,
  forceReset,
  setSessionConflict,
  onOpenLeaderboard,
  startGameError,
  hasStoredGame,
  continueGame,
  isContinuing,
  startNewGame,
  bombModeActive,
  onBombTap,
  onGoBack,
}) => {
  if (!gameSession) {
    return (
      <ClassicStartCard
        isConnected={isConnected}
        handleStartGame={handleStartGame}
        isPending={isPending}
        isConfirming={isConfirming}
        isSyncingContract={isSyncingContract}
        isMiniPayConnecting={isMiniPayConnecting}
        sessionConflict={sessionConflict}
        forceReset={forceReset}
        setSessionConflict={setSessionConflict}
        startGameError={startGameError}
        hasStoredGame={hasStoredGame}
        continueGame={continueGame}
        isContinuing={isContinuing}
        startNewGame={startNewGame}
      />
    )
  }

  return (
    <div
      ref={boardContainerRef}
      className="w-full flex-1 min-h-0 select-none overflow-hidden px-1.5"
    >
      <div className="relative w-full">
        {canvasDims && (
          <>
            <div
              className="pointer-events-none absolute left-0 top-0 border-[3px] border-ink bg-paper-2"
              style={{ width: '100%', height: canvasDims.gridSize }}
            />
            <div
              className="pointer-events-none absolute left-0 z-[1] grid grid-cols-3 border-[3px] border-ink p-3 sm:p-5"
              style={{
                background: 'var(--piece-tray-bg)',
                top: canvasDims.trayY,
                width: '100%',
                height: canvasDims.trayH,
              }}
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-center border-r-[3px] border-ink last:border-r-0"
                />
              ))}
            </div>
          </>
        )}

        <div className="relative z-[2] w-full">
          <canvas
            ref={canvasRef}
            style={{ touchAction: 'none', display: 'block' }}
          />

          {/* Bomb targeting overlay — intercepts grid taps when bomb mode active */}
          {bombModeActive && canvasDims && (
            <div
              onClick={e => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const x = e.clientX - rect.left
                const y = e.clientY - rect.top
                const cellSize = canvasDims.gridSize / 9
                const col = Math.floor(x / cellSize)
                const row = Math.floor(y / cellSize)
                if (row >= 0 && row < 9 && col >= 0 && col < 9) {
                  onBombTap?.(row, col)
                }
              }}
              style={{
                position: 'absolute', top: 0, left: 0, zIndex: 40,
                width: canvasDims.gridSize, height: canvasDims.gridSize,
                cursor: 'crosshair',
                background: 'rgba(229,62,62,0.08)',
                border: '3px solid rgba(229,62,62,0.6)',
                boxSizing: 'border-box',
              }}
            >
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                fontFamily: '"Archivo Black", sans-serif',
                fontSize: 11, letterSpacing: '0.16em',
                color: 'rgba(229,62,62,0.8)',
                textAlign: 'center', pointerEvents: 'none',
              }}>
                💣 TAP A ZONE
              </div>
            </div>
          )}

          {/* Sync chip */}
          <div className="pointer-events-none absolute right-2 top-2 z-30">
            <SyncStatusChip
              gameSession={gameSession}
              isConnected={isConnected}
              onChainStatus={onChainStatus}
              isPending={isPending}
              isConfirming={isConfirming}
            />
          </div>

          {/* ComboOverlay */}
          <ComboOverlay streak={comboStreak} trigger={comboTrigger} />

          {isGameOver && (
            (isWebBrowser() && !isWebWhitelisted(address))
              ? <MiniPayGateModal score={score} />
              : (
                <GameOverModal
                  score={score}
                  onPlayAgain={handleStartGame}
                  onBack={onGoBack}
                  onOpenLeaderboard={onOpenLeaderboard}
                  mode="classic"
                />
              )
          )}
        </div>
      </div>
    </div>
  )
}

interface MobileLayoutProps {
  score: number
  comboStreak: number
  bestScore?: number
  gameSession: any
  isGameOver?: boolean
  onOpenLeaderboard?: () => void
  onBack?: () => void
  canvasArea: React.ReactNode
  onOpenShop?: () => void
  onRotatePiece?: (index: number) => void
  activePieceIndex?: number | null
}

const ClassicTabStrip: React.FC<{
  onOpenLeaderboard?: () => void
  mobile?: boolean
}> = ({ onOpenLeaderboard, mobile = false }) => (
  <div
    className={`flex w-full flex-wrap items-center gap-4 border-b-2 border-ink ${
      mobile ? 'mb-4 min-h-12 pb-3' : 'mb-8 h-12 pb-4'
    }`}
  >
    <div
      className="border-4 border-ink px-4 py-2 font-display text-sm tracking-[0.1em]"
      style={{
        background: 'var(--accent-yellow)',
        boxShadow: '4px 4px 0 var(--shadow)',
      }}
    >
      CLASSIC MODE
    </div>
    <span
      className="font-display text-[10px] uppercase tracking-[0.2em]"
      style={{ color: 'var(--ink-soft)' }}
    >
      WEEKLY LEADERBOARD RUN
    </span>
    {onOpenLeaderboard && (
      <button
        onClick={onOpenLeaderboard}
        className="brutal-btn ml-auto border-4 border-ink px-4 py-2 font-display text-[10px] tracking-[0.1em]"
        style={{
          background: 'var(--paper-2)',
          boxShadow: '4px 4px 0 var(--shadow)',
        }}
      >
        RANKINGS
      </button>
    )}
  </div>
)

const LeftRail: React.FC<{
  score: number
  comboStreak: number
  gameSession: any
}> = ({ score, comboStreak, gameSession }) => (
  <div className="flex w-full flex-col gap-5">
    <div
      className="border-4 border-ink p-5"
      style={{ background: 'var(--ink-fixed)', boxShadow: '6px 6px 0 var(--shadow)' }}
    >
      <div
        className="brutal-label mb-2 opacity-100"
      >
        LIVE SCORE
      </div>
      <div
        className="font-display tabular-nums"
        style={{ fontSize: 64, letterSpacing: '-0.04em', lineHeight: 0.95, color: '#ffffff' }}
      >
        {score.toLocaleString()}
      </div>
      {comboStreak > 0 && (
        <div className="mt-4 flex gap-2">
          <div className="brutal-sticker text-[14px]">COMBO ×{comboStreak}</div>
          <div
            className="border-2 border-ink bg-accent-yellow px-2 py-1 font-display text-[11px] tracking-widest"
            style={{ color: 'var(--ink-fixed)' }}
          >
            +{Math.floor(score * 0.05)}
          </div>
        </div>
      )}
    </div>

    <div
      className="border-4 border-ink p-4"
      style={{
        background: 'var(--paper-2)',
        boxShadow: '5px 5px 0 var(--shadow)',
      }}
    >
      <div className="brutal-label-soft mb-3">
        NEXT CLEAR CHAIN
      </div>
      <div
        className="relative overflow-hidden border-[4px] border-ink"
        style={{ height: 24 }}
      >
        <div
          className={`tension-fill absolute inset-y-0 left-0 ${
            comboStreak >= 4 ? 'tension-fill-strobe' : ''
          }`}
          style={{
            width: `${Math.min(100, comboStreak * 20 + 28)}%`,
            transition: 'width 200ms cubic-bezier(0.17, 0.67, 0.83, 0.67)',
          }}
        />
      </div>
      <div
        className="mt-3 flex justify-between font-display text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--ink-soft)' }}
      >
        <span>×{comboStreak + 1} NEXT</span>
        <span>+220 BONUS</span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <StatBlock
        label="PIECES"
        value={gameSession ? String(gameSession.moveHistory.length) : '0'}
        bg="var(--paper-2)"
      />
      <StatBlock
        label="CLEARS"
        value={
          gameSession
            ? String(
                gameSession.moveHistory.reduce(
                  (sum: number, m: any) =>
                    sum + (m.scoreEvent?.linesCleared || 0),
                  0
                )
              )
            : '0'
        }
        bg="var(--accent-lime)"
      />
      <StatBlock
        label="MAX CHAIN"
        value={comboStreak > 0 ? `×${comboStreak}` : '—'}
        bg="var(--accent-pink)"
      />
      <StatBlock label="TIME" value="2:18" bg="var(--accent-cyan)" />
    </div>

    <DailyStreakPanel />
  </div>
)

const RightRail: React.FC<{
  score: number
  gameSession: any
  bestScore?: number
}> = ({ score, gameSession, bestScore }) => {
  const { leaderboard } = useLeaderboard()
  const [showShare, setShowShare] = React.useState(false)

  const shareScore = bestScore ?? score

  const rankData = React.useMemo(() => {
    const scores = (leaderboard ?? []).map((e) => e.score).sort((a, b) => b - a)
    const rank =
      scores.findIndex((v) => shareScore >= v) + 1 || scores.length + 1
    return rank
  }, [leaderboard, shareScore])

  const HASHTAGS = `#miniapps #minipay #playblokaz #celo`

  const handleShareTwitter = () => {
    const text = `my best score on @playblokaz is ${shareScore.toLocaleString()} 🎮\nrank #${rankData} on the weekly ladder\n\ncan you beat it? blokaz.xyz\n\n${HASHTAGS}`
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <LiveLadder currentScore={score} />
      <DangerWatch currentPieces={gameSession?.currentPieces} />

      {showShare ? (
        <div
          className="border-4 border-ink"
          style={{
            background: 'var(--paper-2)',
            boxShadow: '5px 5px 0 var(--shadow)',
          }}
        >
          <div
            className="flex items-center justify-between border-b-4 border-ink px-3 py-2"
            style={{ background: 'var(--paper)' }}
          >
            <span className="font-display text-[10px] uppercase tracking-[0.18em]">
              SHARE BEST SCORE
            </span>
            <button
              onClick={() => setShowShare(false)}
              className="brutal-btn flex h-7 w-7 items-center justify-center border-2 border-ink text-ink"
              style={{
                background: 'var(--paper-2)',
                boxShadow: '2px 2px 0 var(--shadow)',
              }}
            >
              <BrutalIcon name="back" size={12} strokeWidth={3} />
            </button>
          </div>
          <div className="flex flex-col gap-2 p-3">
            <div
              className="mb-1 border-[3px] border-ink p-2 font-display text-2xl tabular-nums"
              style={{ background: 'var(--paper)', letterSpacing: '-0.03em' }}
            >
              {shareScore.toLocaleString()}
            </div>
            <button
              onClick={handleShareTwitter}
              className="brutal-btn flex w-full items-center justify-between border-4 border-ink px-4 py-3 font-display text-[11px] uppercase tracking-wider shadow-[4px_4px_0_var(--shadow)]"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              <span className="flex items-center gap-2">
                <span
                  className="flex h-5 w-5 items-center justify-center border-2 border-paper text-[9px] font-bold"
                  style={{ background: 'var(--paper)', color: 'var(--ink)' }}
                >
                  X
                </span>
                POST ON X / TWITTER
              </span>
              <span>→</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowShare(true)}
          className="brutal-btn flex w-full items-center justify-between border-4 border-ink bg-accent-lime p-5 font-display text-xs uppercase tracking-[0.2em] shadow-[5px_5px_0_var(--shadow)]"
          style={{ color: 'var(--ink-fixed)' }}
        >
          <span className="flex items-center">
            <BrutalIcon name="rocket" size={16} className="mr-2" /> SHARE BEST
            SCORE
          </span>
          <span className="text-xl">→</span>
        </button>
      )}
    </div>
  )
}

const MobileLayout: React.FC<MobileLayoutProps> = ({
  score,
  comboStreak,
  bestScore,
  gameSession,
  isGameOver = false,
  onOpenLeaderboard,
  onBack,
  canvasArea,
  onOpenShop,
  onRotatePiece,
  activePieceIndex,
}) => {
  const [isPaused, setIsPaused] = useState(false)
  const [showFAQ, setShowFAQ] = useState(false)
  const [showHowToPlay, setShowHowToPlay] = useState(false)

  return (
    <div className="flex w-full flex-col flex-1 min-h-0 overflow-hidden">
      {/* ── FAQ sheet ─────────────────────────────────────────────── */}
      {showFAQ && <FAQSheet onClose={() => setShowFAQ(false)} />}

      {/* ── How to play (re-opened from pause) ────────────────────── */}
      {showHowToPlay && (
        <HowToPlayModal onDone={() => setShowHowToPlay(false)} />
      )}

      {gameSession && (
        <>
          {/* ── Game chrome: back / status / pause ──────────────────── */}
          <div className="flex shrink-0 items-center justify-between border-b-4 border-ink bg-paper px-3 py-1.5">
            <button
              className="brutal-btn border-[3px] border-ink bg-paper p-1.5 text-ink"
              style={{ boxShadow: '2px 2px 0 var(--shadow)' }}
              onClick={onBack ?? (() => window.history.back())}
            >
              <BrutalIcon name="back" size={16} strokeWidth={3} />
            </button>

            {/* centre — intentionally empty */}
            <div />

            <button
              className="brutal-btn border-[3px] border-ink bg-paper p-1.5 text-ink"
              style={{ boxShadow: '2px 2px 0 var(--shadow)' }}
              onClick={() => setIsPaused(true)}
            >
              <BrutalIcon name="pause" size={16} strokeWidth={3} />
            </button>
          </div>

          {/* ── Compact score + tension bar ──────────────────────────── */}
          <div className="shrink-0">
            <ScoreBar
              score={score}
              comboStreak={comboStreak}
              bestScore={bestScore}
              compact
            />
          </div>

          {/* ── Power-up bar — whitelisted addresses only ───────────── */}
          {!isGameOver && !!onOpenShop && (
            <div className="shrink-0">
              <PowerUpBar
                onOpenShop={onOpenShop}
                onRotatePiece={onRotatePiece ?? (() => {})}
                activePieceIndex={activePieceIndex ?? null}
              />
            </div>
          )}
        </>
      )}

      {/* ── Canvas fills all remaining vertical space ────────────────── */}
      <div className={`relative flex flex-col min-h-0 flex-1 ${gameSession ? 'overflow-hidden' : 'overflow-auto'}`}>
        {canvasArea}

        {/* ── Pause overlay — sits above canvas, blocks all touch ──── */}
        {isPaused && gameSession && (
          <div
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-0"
            style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}
          >
            {/* Header strip */}
            <div
              className="w-full border-b-4 border-ink px-6 py-4 text-center"
              style={{ background: 'var(--ink)' }}
            >
              <div className="flex items-center justify-center gap-3">
                <BrutalIcon name="pause" size={16} strokeWidth={3} className="text-paper" />
                <span className="font-display text-[14px] uppercase tracking-[0.24em] text-paper">
                  PAUSED
                </span>
              </div>
            </div>

            {/* Score snapshot */}
            <div
              className="w-full border-b-4 border-ink px-6 py-3 text-center"
              style={{ background: 'var(--paper-2)' }}
            >
              <div className="font-display text-[10px] uppercase tracking-widest" style={{ color: 'var(--ink-soft)' }}>
                CURRENT SCORE
              </div>
              <div className="font-display text-[2rem] leading-tight tabular-nums" style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}>
                {score.toLocaleString()}
              </div>
            </div>

            {/* Menu buttons */}
            <div className="flex w-full flex-col" style={{ background: 'var(--paper)' }}>
              {/* Resume */}
              <button
                onClick={() => setIsPaused(false)}
                className="brutal-btn flex items-center justify-between border-b-4 border-ink px-6 py-4 font-display text-[12px] uppercase tracking-[0.14em]"
                style={{ background: 'var(--accent-lime)', color: 'var(--ink-fixed)' }}
              >
                <span className="flex items-center gap-3">
                  <BrutalIcon name="play" size={16} strokeWidth={2.5} />
                  RESUME GAME
                </span>
                <span>→</span>
              </button>

              {/* How to play */}
              <button
                onClick={() => { setIsPaused(false); setShowHowToPlay(true) }}
                className="brutal-btn flex items-center justify-between border-b-4 border-ink px-6 py-4 font-display text-[12px] uppercase tracking-[0.14em]"
                style={{ background: 'var(--paper)', color: 'var(--ink)' }}
              >
                <span className="flex items-center gap-3">
                  <BrutalIcon name="star" size={16} strokeWidth={2.5} />
                  HOW TO PLAY
                </span>
                <span style={{ color: 'var(--ink-soft)' }}>→</span>
              </button>

              {/* Help / FAQ */}
              <button
                onClick={() => { setIsPaused(false); setShowFAQ(true) }}
                className="brutal-btn flex items-center justify-between border-b-4 border-ink px-6 py-4 font-display text-[12px] uppercase tracking-[0.14em]"
                style={{ background: 'var(--paper)', color: 'var(--ink)' }}
              >
                <span className="flex items-center gap-3">
                  <BrutalIcon name="alert" size={16} strokeWidth={2.5} />
                  HELP & FAQ
                </span>
                <span style={{ color: 'var(--ink-soft)' }}>→</span>
              </button>

              {/* Shop */}
              <button
                onClick={() => { setIsPaused(false); onOpenShop?.() }}
                className="brutal-btn flex items-center justify-between border-b-4 border-ink px-6 py-4 font-display text-[12px] uppercase tracking-[0.14em]"
                style={{ background: 'var(--accent-yellow)', color: 'var(--ink-fixed)' }}
              >
                <span className="flex items-center gap-3">
                  🛒 BLOKAZ SHOP
                </span>
                <span>→</span>
              </button>

              {/* Quit */}
              <button
                onClick={onBack ?? (() => window.history.back())}
                className="brutal-btn flex items-center justify-between px-6 py-4 font-display text-[12px] uppercase tracking-[0.14em]"
                style={{ background: 'var(--paper)', color: 'var(--piece-red)' }}
              >
                <span className="flex items-center gap-3">
                  <BrutalIcon name="close" size={16} strokeWidth={2.5} />
                  QUIT GAME
                </span>
                <span style={{ color: 'var(--piece-red)', opacity: 0.5 }}>→</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface DesktopLayoutProps {
  score: number
  comboStreak: number
  gameSession: any
  bestScore?: number
  onOpenLeaderboard?: () => void
  canvasArea: React.ReactNode
}

const DesktopLayout: React.FC<DesktopLayoutProps> = ({
  score,
  comboStreak,
  gameSession,
  bestScore,
  onOpenLeaderboard,
  canvasArea,
}) => (
  <div className="w-full min-h-screen" style={{ background: 'var(--page)' }}>
    <div
      className="mx-auto grid w-full max-w-[1600px] items-start px-10 py-6"
      style={{
        gridTemplateColumns:
          'minmax(250px, 280px) minmax(520px, 1fr) minmax(250px, 280px)',
        gap: 40,
        paddingTop: 124,
      }}
    >
      <div className="col-[1/-1]">
        <ClassicTabStrip onOpenLeaderboard={onOpenLeaderboard} />
      </div>

      <div className="flex min-w-0 flex-col">
        <LeftRail
          score={score}
          comboStreak={comboStreak}
          gameSession={gameSession}
        />
      </div>

      <div
        className="flex flex-col w-full min-w-0"
        style={
          gameSession
            ? { height: 'calc(100vh - 240px)', minHeight: 520 }
            : undefined
        }
      >
        {canvasArea}
      </div>

      <div className="flex min-w-0 flex-col">
        <RightRail
          score={score}
          gameSession={gameSession}
          bestScore={bestScore}
        />
      </div>
    </div>
  </div>
)

export default GameScreen
