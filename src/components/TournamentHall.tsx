import React from 'react'
import TournamentSection from './TournamentSection'
import { useTournamentCount } from '../hooks/useBlokzGame'

interface TournamentHallProps {
  onBack: () => void
  onEnterMatch: () => void
}

const TournamentHall: React.FC<TournamentHallProps> = ({ onBack, onEnterMatch }) => {
  const { count } = useTournamentCount()

  return (
    <div className="w-full max-w-6xl mx-auto px-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero Section */}
      <div className="relative mb-12 p-12 rounded-[2.5rem] bg-gradient-to-br from-blue-600/20 via-indigo-600/20 to-purple-600/20 border border-white/5 overflow-hidden">
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-96 h-96 bg-blue-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-96 h-96 bg-purple-500/10 blur-[120px] rounded-full" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-2xl">
            🏆
          </div>
          <h1 className="text-5xl font-black tracking-tight mb-4 bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
            TOURNAMENT HALL
          </h1>
          <p className="text-gray-400 max-w-lg leading-relaxed text-sm uppercase tracking-widest font-bold opacity-80">
            Compete for native tokens in global skill-based contests. <br />
            Join a lobby to start your climb to the top.
          </p>
          
          <div className="mt-8 flex gap-4">
            <div className="px-6 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-blue-400">
              {count?.toString() || '0'} ACTIVE LOBBIES
            </div>
            <div className="px-6 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-purple-400">
              USDC PRIZES
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-[#1a1b24]/40 backdrop-blur-2xl border border-white/5 rounded-[2rem] p-8 min-h-[500px]">
        <TournamentSection />
      </div>

      {/* Footer / Navigation */}
      <div className="mt-12 flex justify-center pb-20">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-black uppercase tracking-widest group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Classic Mode
        </button>
      </div>
    </div>
  )
}

export default TournamentHall
