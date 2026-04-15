import React from 'react'
import GameScreen from './components/GameScreen'
import { Header } from './components/Header'
import Leaderboard from './components/Leaderboard'

const App: React.FC = () => {
  const [showLeaderboard, setShowLeaderboard] = React.useState(false)

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white">
      <Header onShowLeaderboard={() => setShowLeaderboard(true)} />
      
      <main className="pt-24 pb-12 flex flex-col items-center justify-center">
        <GameScreen />
      </main>

      <Leaderboard 
        isOpen={showLeaderboard} 
        onClose={() => setShowLeaderboard(false)} 
      />
    </div>
  )
}

export default App
