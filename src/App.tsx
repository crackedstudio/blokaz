import React, { useState, useEffect } from 'react'
import GameScreen from './components/GameScreen'
import Header from './components/Header'
import Leaderboard from './components/Leaderboard'
import TournamentHall from './components/TournamentHall'
import AdminDashboard from './components/AdminDashboard'
import { useGameStore } from './stores/gameStore'

const App: React.FC = () => {
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [activeView, setActiveView] = useState<'game' | 'tournaments' | 'admin'>('game')
  const { setTournamentId } = useGameStore()

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      console.log('Hash changed:', hash)
      if (hash === '#/tournaments') setActiveView('tournaments')
      else if (hash === '#/admin') setActiveView('admin')
      else setActiveView('game')
    }

    window.addEventListener('hashchange', handleHashChange)
    handleHashChange() 
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleNavigate = (view: 'game' | 'tournaments' | 'admin') => {
    if (view === 'game') {
      setTournamentId(null) // Explicitly clear tournament context when entering classic
      window.location.hash = '#/'
    } else if (view === 'tournaments') {
      window.location.hash = '#/tournaments'
    } else if (view === 'admin') {
      window.location.hash = '#/admin'
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white">
      <Header 
        onShowLeaderboard={() => setShowLeaderboard(true)} 
        activeView={activeView}
        onViewChange={handleNavigate}
      />
      
      <main className="pt-24 pb-12 flex flex-col items-center justify-center">
        {activeView === 'game' ? (
          <GameScreen />
        ) : activeView === 'tournaments' ? (
          <TournamentHall 
            onBack={() => handleNavigate('game')} 
            onEnterMatch={() => handleNavigate('game')} 
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
