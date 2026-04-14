import React from 'react'
import GameScreen from './components/GameScreen'
import { Header } from './components/Header'
import { useAccount } from 'wagmi'

const App: React.FC = () => {
  const { isConnected } = useAccount()

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white">
      <Header />
      <main className="pt-24 pb-12 flex flex-col items-center justify-center">
        <GameScreen />
      </main>
    </div>
  )
}

export default App
