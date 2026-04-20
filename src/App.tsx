import React, { useState, useEffect } from 'react'
import GameScreen from './components/GameScreen'
import TournamentGameScreen from './components/TournamentGameScreen'
import Header from './components/Header'
import Leaderboard from './components/Leaderboard'
import TournamentHall from './components/TournamentHall'
import AdminDashboard from './components/AdminDashboard'
import { useGameStore } from './stores/gameStore'

type AppView = 'classic' | 'tournaments' | 'tournament-play' | 'admin'

const getViewFromHash = (hash: string): AppView => {
  if (hash === '#/tournaments') return 'tournaments'
  if (hash === '#/tournaments/play' || hash === '#/tournament-game') return 'tournament-play'
  if (hash === '#/admin') return 'admin'
  return 'classic'
}

const App: React.FC = () => {
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const { setTournamentId, forceReset } = useGameStore()
  const [activeView, setActiveView] = useState<AppView>('classic')

  useEffect(() => {
    const handleHashChange = () => {
      const nextView = getViewFromHash(window.location.hash)
      setActiveView(prev => {
        if (nextView !== prev) {
          setTimeout(() => forceReset(nextView === 'tournament-play'), 0)
        }
        return nextView
      })
      if (nextView !== 'classic') setShowLeaderboard(false)
    }
    window.addEventListener('hashchange', handleHashChange)
    handleHashChange()
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [forceReset])

  const handleNavigate = (view: AppView, clearTournament: boolean = true) => {
    if (view === 'classic') {
      if (clearTournament) setTournamentId(null)
      window.location.hash = '#/classic'
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
      <Header
        onShowLeaderboard={() => setShowLeaderboard(true)}
        showLeaderboardAction={true}
        isLeaderboardOpen={showLeaderboard}
        activeView={activeView}
        onViewChange={handleNavigate}
      />

      <main className={`flex flex-col items-center justify-start min-h-screen ${activeView === 'tournament-play' ? 'pt-0' : 'pt-24 pb-24 lg:pb-12'}`}>
        {activeView === 'classic' ? (
          <GameScreen onOpenLeaderboard={() => setShowLeaderboard(true)} />
        ) : activeView === 'tournaments' ? (
          <TournamentHall
            onBack={() => handleNavigate('classic', true)}
            onEnterMatch={() => handleNavigate('tournament-play', false)}
          />
        ) : activeView === 'tournament-play' ? (
          <TournamentGameScreen
            onBackToHall={() => handleNavigate('tournaments', false)}
          />
        ) : (
          <AdminDashboard />
        )}
      </main>

      <Leaderboard
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
      />
    </div>
  )
}

export default App
