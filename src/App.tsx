import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useAccount } from 'wagmi'
import Header from './components/Header'
import AppFooter from './components/AppFooter'
import SplashScreen from './components/SplashScreen'
import { ShopModal } from './components/ShopModal'
import { isShopLotteryEnabled } from './utils/featureFlags'
import { usePowerUpStore } from './stores/powerUpStore'
import { useMetaStore } from './stores/metaStore'
import { useInventorySync } from './hooks/useInventorySync'

// Lazy-loaded: these are large chunks not needed on initial paint
const GameScreen = lazy(() => import('./components/GameScreen'))
const TournamentGameScreen = lazy(() => import('./components/TournamentGameScreen'))
const Leaderboard = lazy(() => import('./components/Leaderboard'))
const TournamentHall = lazy(() => import('./components/TournamentHall'))
const AdminDashboard = lazy(() => import('./components/AdminDashboard'))
const LobbyScreen = lazy(() => import('./components/LobbyScreen'))
import { BlockField, BlockGrid } from './components/blocks/BlockFX'
import { useGameStore } from './stores/gameStore'
import { useThemeStore, type ThemeMode } from './stores/themeStore'
import { IS_MINIPAY } from './utils/miniPay'
import { isAutoUpdateEnabled } from './utils/featureFlags'

type AppView = 'lobby' | 'classic' | 'tournaments' | 'tournament-play' | 'admin'

// Only tournaments and admin are hash-routed (deep-linkable).
// Lobby and classic are state-only — refresh always returns to lobby.
const getViewFromHash = (hash: string): AppView | null => {
  if (hash === '#/tournaments') return 'tournaments'
  if (hash === '#/tournaments/play' || hash === '#/tournament-game') return 'tournament-play'
  if (hash === '#/admin') return 'admin'
  return null
}

// ─── Auto-update via version polling ─────────────────────────────────────────
// At build time, vite.config.ts writes public/version.json with a timestamp.
// We poll it every 2 minutes. When a new deploy is detected:
//   - In lobby   → reload immediately (player isn't mid-game)
//   - Mid-game   → set a flag; App reloads as soon as they return to lobby
// This ensures players always get the latest bundle without ever losing progress.

const VERSION_CHECK_INTERVAL = 30_000 // 30 seconds
let loadedVersion: number | null = null

async function fetchVersion(): Promise<number | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const { v } = await res.json()
    return typeof v === 'number' ? v : null
  } catch {
    return null
  }
}

function useAutoUpdate(isInLobby: boolean) {
  const [updateReady, setUpdateReady] = useState(false)

  // Capture the version the page loaded with on first mount
  useEffect(() => {
    fetchVersion().then(v => { if (v !== null) loadedVersion = v })
  }, [])

  useEffect(() => {
    const check = async () => {
      if (loadedVersion === null) return
      const latest = await fetchVersion()
      if (latest !== null && latest !== loadedVersion) {
        setUpdateReady(true)
      }
    }
    const interval = setInterval(check, VERSION_CHECK_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  // Reload as soon as the player is in the lobby
  useEffect(() => {
    if (updateReady && isInLobby) window.location.reload()
  }, [updateReady, isInLobby])

  return updateReady
}
// ─────────────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  // If the static HTML splash in index.html is still present when React mounts,
  // that means it already served as the splash screen while JS was loading —
  // skip the React SplashScreen so users don't see it twice.
  const [showSplash, setShowSplash] = useState(
    () => !document.getElementById('static-splash')
  )
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showLobbyShop, setShowLobbyShop] = useState(false)
  const { address } = useAccount()
  const isWhitelisted = isShopLotteryEnabled(address)

  // Ensure powerUpStore always has currentAddress set as soon as wallet connects,
  // so lobby purchases (addInventory) save to localStorage correctly.
  // metaStore is address-keyed too — loading it here also rolls today's missions
  // if the local day changed since the last visit.
  useEffect(() => {
    if (address) {
      usePowerUpStore.getState().loadForAddress(address)
      useMetaStore.getState().loadForAddress(address)
    }
  }, [address])

  // Sync inventory to/from server whenever wallet is connected
  useInventorySync()
  const { setTournamentId, forceReset, gameSession } = useGameStore()
  const [activeView, setActiveView] = useState<AppView>('lobby')
  // Hide the header bar while actively playing — the game chrome has its own back/pause
  const isPlayingGame = !!gameSession && (activeView === 'classic' || activeView === 'tournament-play')
  const setThemeMode = useThemeStore((state) => state.setMode)

  const handleSplashDone = useCallback(() => setShowSplash(false), [])

  const isInLobby = activeView === 'lobby' && !gameSession
  /**
   * The block motif is wallpaper for the browsing screens only. During a run
   * the board is what should be moving, and a page-sized decoration competes
   * with it for both attention and paint budget.
   */
  const showBlockBackdrop =
    !isPlayingGame && activeView !== 'classic' && activeView !== 'tournament-play'
  const updateReady = useAutoUpdate(isInLobby && isAutoUpdateEnabled(address))

  useEffect(() => {
    const handleHashChange = () => {
      const nextView = getViewFromHash(window.location.hash)
      if (nextView === null) return // lobby/classic managed via direct state
      setActiveView(prev => {
        if (nextView !== prev) {
          setTimeout(() => forceReset(nextView === 'tournament-play'), 0)
        }
        return nextView
      })
      setShowLeaderboard(false)
    }
    window.addEventListener('hashchange', handleHashChange)
    // On initial load only honour tournament/admin deep links
    handleHashChange()
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [forceReset])

  useEffect(() => {
    const nextMode: ThemeMode = showLeaderboard
      ? 'leaderboard'
      : activeView === 'classic'
        ? 'classic'
        : activeView === 'tournaments'
          ? 'tournaments'
          : activeView === 'tournament-play'
            ? 'tournament-play'
            : activeView === 'admin'
              ? 'admin'
              : 'lobby'
    setThemeMode(nextMode)
  }, [activeView, setThemeMode, showLeaderboard])

  const handleNavigate = (view: AppView, clearTournament: boolean = true) => {
    if (view === 'lobby') {
      // Clear any leftover hash then update state directly
      if (window.location.hash) history.replaceState(null, '', window.location.pathname)
      forceReset()
      setActiveView('lobby')
    } else if (view === 'classic') {
      if (clearTournament) setTournamentId(null)
      forceReset()
      setActiveView('classic')
      // No hash change — refresh always returns to lobby
    } else if (view === 'tournaments') {
      window.location.hash = '#/tournaments'
    } else if (view === 'tournament-play') {
      window.location.hash = '#/tournaments/play'
    } else if (view === 'admin') {
      window.location.hash = '#/admin'
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {showSplash && <SplashScreen onDone={handleSplashDone} />}

      {/* Header: hidden during active gameplay — game chrome has its own back/pause */}
      {!isPlayingGame && (
        <Header
          onShowLeaderboard={() => setShowLeaderboard(true)}
          onHideLeaderboard={() => setShowLeaderboard(false)}
          showLeaderboardAction={true}
          isLeaderboardOpen={showLeaderboard}
          activeView={activeView}
          onViewChange={handleNavigate}
        />
      )}

      {/* Update-ready banner — shown mid-game so player knows an update is waiting */}
      {updateReady && !isInLobby && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--ink)',
            color: 'var(--paper)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: '"Archivo Black", sans-serif',
            fontSize: 11,
            letterSpacing: '0.12em',
            borderTop: '3px solid var(--accent-yellow)',
          }}
        >
          <span>A new version of Blokaz is available</span>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'var(--accent-yellow)',
              color: 'var(--ink)',
              border: '2px solid var(--ink)',
              padding: '4px 12px',
              fontFamily: 'inherit',
              fontSize: 10,
              letterSpacing: '0.1em',
              cursor: 'pointer',
            }}
          >
            CLICK HERE TO UPDATE
          </button>
        </div>
      )}

      {/* Board wallpaper. Fixed and pointer-transparent; the shell below sits
          on z-1 so nothing here can cover or intercept content. */}
      {showBlockBackdrop && (
        <>
          <BlockGrid />
          <BlockField count={16} seed={31} opacity={0.13} />
        </>
      )}

      <div className={`relative z-[1] flex flex-col ${
        activeView === 'lobby' ? 'min-h-screen pt-[64px] pb-20'
        : activeView === 'classic'
          ? isPlayingGame
            ? 'h-dvh overflow-hidden pt-0 pb-[env(safe-area-inset-bottom)] lg:min-h-screen lg:h-auto lg:overflow-visible lg:pt-0 lg:pb-20'
            : 'h-dvh overflow-hidden pt-16 pb-16 lg:min-h-screen lg:h-auto lg:overflow-visible lg:pt-[64px] lg:pb-20'
        : activeView === 'tournament-play' ? 'pt-0 min-h-screen'
        : 'min-h-screen pt-[64px] pb-20 lg:items-center lg:pb-12'
      }`}>
        <Suspense fallback={null}>
          {activeView === 'lobby' ? (
            <LobbyScreen
              onPlayClassic={() => handleNavigate('classic')}
              onPlayTournaments={() => handleNavigate('tournaments')}
              onOpenShop={isWhitelisted ? () => setShowLobbyShop(true) : undefined}
              onOpenLeaderboard={() => setShowLeaderboard(true)}
            />
          ) : activeView === 'classic' ? (
            <GameScreen
              onOpenLeaderboard={() => setShowLeaderboard(true)}
              onBack={() => handleNavigate('lobby')}
            />
          ) : activeView === 'tournaments' ? (
            <TournamentHall
              onBack={() => handleNavigate('lobby')}
              onEnterMatch={() => handleNavigate('tournament-play', false)}
            />
          ) : activeView === 'tournament-play' ? (
            <TournamentGameScreen
              onBackToHall={() => handleNavigate('tournaments', false)}
            />
          ) : (
            <AdminDashboard />
          )}
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <Leaderboard
          isOpen={showLeaderboard}
          onClose={() => setShowLeaderboard(false)}
        />
      </Suspense>

      {/* Footer — always visible; provides ToS, Privacy, Support links (MiniPay requirement) */}
      {activeView !== 'classic' && activeView !== 'tournament-play' && (
        <AppFooter />
      )}

      {/* Lobby shop modal — whitelisted addresses only */}
      {isWhitelisted && (
        <ShopModal isOpen={showLobbyShop} onClose={() => setShowLobbyShop(false)} />
      )}
    </div>
  )
}

export default App
