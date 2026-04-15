import React from 'react'
import { useLeaderboard } from '../hooks/useBlokzGame'
import { useAccount } from 'wagmi'
import contractInfo from '../contract.json'

interface LeaderboardProps {
  isOpen: boolean
  onClose: () => void
}

const Leaderboard: React.FC<LeaderboardProps> = ({ isOpen, onClose }) => {
  const { address } = useAccount()
  const { leaderboard, isLoading, currentEpoch } = useLeaderboard()

  const truncatedAddress = (addr: string) => 
    `${addr.slice(0, 6)}...${addr.slice(-4)}`

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-[#0a0a0c]/90 backdrop-blur-2xl border-l border-white/10 z-[70] transform transition-transform duration-500 ease-out shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
            <div>
              <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                RANKINGS
              </h2>
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1">
                Epoch #{currentEpoch?.toString() || '0'}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors group"
            >
              <svg className="w-6 h-6 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
            {isLoading ? (
              // Loading State
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
              ))
            ) : leaderboard && leaderboard.length > 0 ? (
              leaderboard
                .sort((a, b) => b.score - a.score)
                .map((entry, index) => {
                  const isCurrentUser = address?.toLowerCase() === entry.player.toLowerCase()
                  const rank = index + 1
                  
                  return (
                    <div 
                      key={entry.gameId.toString()}
                      className={`group flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
                        isCurrentUser 
                          ? 'bg-blue-500/10 border-blue-500/30' 
                          : 'bg-white/5 border-transparent hover:border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {/* Rank Indicator */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg ${
                        rank === 1 ? 'bg-yellow-500/20 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]' :
                        rank === 2 ? 'bg-gray-400/20 text-gray-400' :
                        rank === 3 ? 'bg-orange-600/20 text-orange-600' :
                        'bg-white/5 text-gray-500'
                      }`}>
                        {rank}
                      </div>

                      {/* Player Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-sm ${isCurrentUser ? 'text-white font-bold' : 'text-gray-300'}`}>
                            {truncatedAddress(entry.player)}
                          </span>
                          {isCurrentUser && (
                            <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">
                              You
                            </span>
                          )}
                        </div>
                        <a 
                          href={`${contractInfo.explorer}/${entry.player}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors inline-flex items-center gap-1"
                        >
                          View Profile
                          <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>

                      {/* Score */}
                      <div className="text-right">
                        <div className="text-xl font-black text-white tabular-nums">
                          {entry.score.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                          Points
                        </div>
                      </div>
                    </div>
                  )
                })
            ) : (
              // Empty State
              <div className="flex flex-col items-center justify-center h-64 text-center opacity-40">
                <div className="w-16 h-16 border-2 border-dashed border-white/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium">No records yet this epoch</p>
                <p className="text-[10px] uppercase tracking-widest mt-1">Be the first to submit!</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-white/5 bg-black/40 text-center">
            <p className="text-[9px] text-gray-600 uppercase tracking-[0.2em] leading-relaxed">
              Epochs end every 7 days. <br />
              Top players share the native reward pool.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export default Leaderboard
