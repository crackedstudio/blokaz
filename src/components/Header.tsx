import React from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { useOwner } from '../hooks/useBlokzGame'

interface HeaderProps {
  onShowLeaderboard: () => void
  onViewChange: (view: 'game' | 'tournaments' | 'admin') => void
  activeView: 'game' | 'tournaments' | 'admin'
}

export const Header: React.FC<HeaderProps> = ({ 
  onShowLeaderboard, 
  onViewChange, 
  activeView 
}) => {
  const { address } = useAccount()
  const { owner } = useOwner()

  const isOwner = address && owner && address.toLowerCase() === owner.toLowerCase()

  const safeNavigate = (view: 'game' | 'tournaments' | 'admin') => {
    console.log('Header: attempting to navigate to', view)
    if (typeof onViewChange === 'function') {
      onViewChange(view)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-black/20 backdrop-blur-md border-b border-white/10">
      <div 
        className="flex items-center gap-2 cursor-pointer group"
        onClick={() => safeNavigate('game')}
      >
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
          B
        </div>
        <h1 className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent tracking-tight">
          BLOKAZ
        </h1>
      </div>
      
      <div className="flex items-center gap-4">
        <button 
          onClick={() => safeNavigate('game')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-medium group ${
            activeView === 'game' 
              ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400' 
              : 'bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white'
          }`}
        >
          <span className="text-base group-hover:scale-110 transition-transform">🎮</span>
          Classic
        </button>

        <button 
          onClick={() => safeNavigate('tournaments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-medium group ${
            activeView === 'tournaments' 
              ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400' 
              : 'bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white'
          }`}
        >
          <span className="text-base group-hover:scale-110 transition-transform">🏆</span>
          Tournaments
        </button>

        {isOwner && (
          <button 
            onClick={() => safeNavigate('admin')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-medium group ${
              activeView === 'admin' 
                ? 'bg-purple-500/20 border border-purple-500/40 text-purple-400' 
                : 'bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white'
            }`}
          >
            <span className="text-base group-hover:scale-110 transition-transform">🛠️</span>
            Admin
          </button>
        )}

        <button 
          onClick={onShowLeaderboard}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium group text-gray-400 hover:text-white"
        >
          Rankings
        </button>

        <ConnectButton 
          accountStatus="avatar" 
          chainStatus="icon" 
          showBalance={false}
        />
      </div>
    </header>
  )
}

export default Header
